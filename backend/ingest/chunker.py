"""
AST-based code chunker for Python and JavaScript/TypeScript.

Supported languages: Python, JavaScript, TypeScript
No fallback — unsupported repos are rejected at the router level.

Each file is chunked at function/class boundaries using tree-sitter.
Chunks include surrounding context (leading comments/decorators).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import PurePosixPath

import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
from tree_sitter import Language, Parser, Node


# Language setup

PY_LANGUAGE = Language(tspython.language())
JS_LANGUAGE = Language(tsjavascript.language())  # handles JS and TS (same grammar)

_py_parser = Parser(PY_LANGUAGE)
_js_parser = Parser(JS_LANGUAGE)

# Files to skip — junk that clutters any Python / JS / TS repo
SKIP_DIRS: frozenset[str] = frozenset(
    {
        "node_modules",
        ".git",
        "__pycache__",
        "dist",
        "build",
        ".next",
        ".nuxt",
        ".venv",
        "venv",
        "env",
        ".env",
        "coverage",
        ".coverage",
        "vendor",
        ".mypy_cache",
        ".pytest_cache",
        ".ruff_cache",
        ".tox",
        "site-packages",
        "eggs",
        "htmlcov",
        "storybook-static",
        "out",
        ".turbo",
    }
)

SKIP_EXTENSIONS: frozenset[str] = frozenset(
    {
        # Locks / generated
        ".lock", ".sum",
        # Assets / media
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
        ".woff", ".woff2", ".ttf", ".eot", ".otf",
        ".mp4", ".mp3", ".wav", ".ogg",
        ".pdf", ".zip", ".tar", ".gz", ".rar",
        # Compiled / binary
        ".pyc", ".pyo", ".so", ".dll", ".dylib", ".exe",
        ".wasm",
        # Logs / data dumps
        ".log", ".csv", ".sqlite", ".db",
        # Minified / sourcemaps
        ".min.js", ".min.css", ".map",
        # Docs / config noise
        ".md", ".rst", ".txt", ".yml", ".yaml", ".toml", ".ini",
        ".cfg", ".env",
        ".html", ".css",  # markup — not code we chunk
    }
)

SKIP_FILENAMES: frozenset[str] = frozenset(
    {
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "poetry.lock",
        "Pipfile.lock",
        "composer.lock",
        "Gemfile.lock",
        ".DS_Store",
        "Thumbs.db",
        ".gitignore",
        ".gitattributes",
        ".eslintignore",
        ".prettierignore",
        ".editorconfig",
        "LICENSE",
        "LICENCE",
        "CHANGELOG",
        "CHANGELOG.md",
    }
)

MAX_FILE_BYTES = 500_000  # 500 KB

# Data types
@dataclass
class Chunk:
    file_path: str
    language: str
    start_line: int  # 0-indexed
    end_line: int    # 0-indexed, inclusive
    content: str
    chunk_index: int = 0


# Public helpers
def should_skip_path(github_path: str) -> bool:
    """Return True if this GitHub file path should be ignored."""
    parts = PurePosixPath(github_path).parts
    # Skip if any directory component is in SKIP_DIRS
    for part in parts[:-1]:
        if part in SKIP_DIRS or part.startswith("."):
            return True

    filename = parts[-1] if parts else ""
    if filename in SKIP_FILENAMES:
        return True

    suffix = PurePosixPath(filename).suffix.lower()
    if suffix in SKIP_EXTENSIONS:
        return True

    return False


def detect_language(github_path: str) -> str | None:
    """Return 'python', 'javascript', or None."""
    ext = PurePosixPath(github_path).suffix.lower()
    if ext == ".py":
        return "python"
    if ext in (".js", ".jsx", ".mjs", ".cjs"):
        return "javascript"
    if ext in (".ts", ".tsx", ".mts"):
        return "typescript"
    return None


def chunk_file(file_path: str, content: str, language: str) -> list[Chunk]:
    """
    Parse `content` with tree-sitter and split at top-level
    function/class/method boundaries.

    Returns a list of Chunk objects. If parsing produces zero chunks
    (e.g. only imports) the whole file is returned as a single chunk.
    """
    if len(content.encode()) > MAX_FILE_BYTES:
        return []

    if language == "python":
        return _chunk_python(file_path, content)
    else:
        # Both JS and TS use the JavaScript grammar
        return _chunk_js(file_path, content, language)


# Internal parsing helpers
_PY_CHUNK_TYPES = {
    "function_definition",
    "async_function_definition",
    "class_definition",
    "decorated_definition",
}

_JS_CHUNK_TYPES = {
    "function_declaration",
    "function_expression",
    "arrow_function",
    "generator_function_declaration",
    "generator_function",
    "class_declaration",
    "class_expression",
    "method_definition",
    "export_statement",         # catches `export function foo(){}`
    "lexical_declaration",      # catches `const foo = () => {}`
    "variable_declaration",     # catches `var foo = function(){}`
}

SMALL_NODE_LINES = 30   # code nodes > this are "large" and always get their own chunk
LARGE_GAP_LINES  = 30   # non-code gaps >= this are "content" and get their own chunk(s)
MAX_CHUNK_LINES  = 60   # hard cap on the line-span of an accumulated small-code group
MIN_CHUNK_LINES  = 5    # minimum viable chunk size; tiny tails are folded into the prior sub-chunk


def _lines(content: str) -> list[str]:
    return content.splitlines(keepends=True)


def _build_segments(
    children: list[Node],
    matched_types: set[str],
) -> list[tuple[str, int, int]]:
    """
    Walk *direct* children of a root node and produce a flat list of
    ``(kind, start_line, end_line)`` tuples.

    ``kind`` is `"code"` for matched AST node types (functions / classes)
    and ``"gap"`` for everything else: imports, constants, comments, blank
    lines.  Adjacent gap entries are merged into a single contiguous segment
    so that nothing between top-level nodes is ever lost.
    """
    segments: list[tuple[str, int, int]] = []
    prev_end = -1

    def _push_gap(start: int, end: int) -> None:
        """Append a gap segment, extending the previous gap if adjacent."""
        if start > end:
            return
        if segments and segments[-1][0] == "gap":
            # Extend the existing trailing gap rather than creating a new entry
            segments[-1] = ("gap", segments[-1][1], end)
        else:
            segments.append(("gap", start, end))

    for child in children:
        # Skip zero-width sentinel nodes (e.g. tree-sitter's end_of_file marker)
        if child.start_point == child.end_point and child.type in ("end_of_file", "EOF"):
            continue

        c_start = child.start_point[0]
        c_end = child.end_point[0]

        # Cover any blank-line gap between the previous child and this one
        if c_start > prev_end + 1:
            _push_gap(prev_end + 1, c_start - 1)

        if child.type in matched_types:
            segments.append(("code", c_start, c_end))
        else:
            _push_gap(c_start, c_end)

        prev_end = c_end

    return segments


def _merge_segments(
    segments: list[tuple[str, int, int]],
    all_lines: list[str],
    file_path: str,
    language: str,
) -> list[Chunk]:
    """
    Collapse the flat segment list into Chunk objects.

    Small code nodes (span ≤ SMALL_NODE_LINES) accumulate with each other and
    adjacent glue gaps, capped at MAX_CHUNK_LINES total span.  When adding the
    next small node would exceed the cap the current group is flushed first
    (always at a node boundary — a node is never split in half).

    Large code nodes (span > SMALL_NODE_LINES) are always isolated.

    All merges preserve original source order.
    """
    groups: list[list[tuple[str, int, int]]] = []
    current: list[tuple[str, int, int]] = []

    def _has_code(lst: list) -> bool:
        return any(s[0] == "code" for s in lst)

    def _flush() -> None:
        """Flush current into groups (or absorb into previous if gap-only)."""
        nonlocal current
        if not current:
            return
        if _has_code(current):
            groups.append(current)
        elif groups:
            groups[-1].extend(current)   # trailing glue attaches to last group
        current = []

    def _emit_content_gap(start: int, end: int, glue_prefix: list) -> None:
        """Split a content-sized gap into MAX_CHUNK_LINES sub-chunks.

        Look-ahead: if emitting the standard-sized chunk would leave a tail
        smaller than MIN_CHUNK_LINES, extend this chunk to absorb the tail
        rather than emitting a near-noise fragment on the next iteration.
        """
        gap_pos = start
        first = True
        while gap_pos <= end:
            natural_end = gap_pos + MAX_CHUNK_LINES - 1
            # Would a standard split leave a tiny leftover tail?
            if natural_end < end and (end - natural_end) < MIN_CHUNK_LINES:
                gap_end = end   # absorb the tail into this sub-chunk
            else:
                gap_end = min(natural_end, end)
            if first and glue_prefix:
                groups.append(glue_prefix + [("gap", gap_pos, gap_end)])
            else:
                groups.append([("gap", gap_pos, gap_end)])
            gap_pos = gap_end + 1
            first = False

    for seg in segments:
        kind, start, end = seg
        node_lines = end - start + 1

        if kind == "gap":
            if node_lines >= LARGE_GAP_LINES:
                # Content gap — flush preceding code, then emit as own chunk(s)
                if _has_code(current):
                    groups.append(current)
                    glue_prefix: list = []
                else:
                    glue_prefix = current   # gap-only glue becomes prefix of 1st sub-chunk
                current = []
                _emit_content_gap(start, end, glue_prefix)
            else:
                # Glue gap — absorb into current
                current.append(seg)

        else:  # "code"
            is_large = node_lines > SMALL_NODE_LINES
            if is_large:
                if _has_code(current):
                    groups.append(current)
                    groups.append([seg])
                    current = []
                else:
                    # Only glue pending — absorb into this large node's chunk
                    current.append(seg)
                    groups.append(current)
                    current = []
            else:
                # Small code node: enforce MAX_CHUNK_LINES cap
                if _has_code(current):
                    projected_span = end - current[0][1] + 1
                    if projected_span > MAX_CHUNK_LINES:
                        # Flush first, then start fresh with this node
                        groups.append(current)
                        current = [seg]
                    else:
                        current.append(seg)
                else:
                    # No code yet (only glue glue, or empty) — just accumulate
                    current.append(seg)

    # Final flush
    _flush()

    # Build Chunk objects
    chunks: list[Chunk] = []
    for group in groups:
        if not group:
            continue
        g_start = group[0][1]
        g_end = group[-1][2]
        text = "".join(all_lines[g_start : g_end + 1]).strip()
        if not text:
            continue
        chunks.append(
            Chunk(
                file_path=file_path,
                language=language,
                start_line=g_start,
                end_line=g_end,
                content=text,
                chunk_index=0,  # re-indexed below
            )
        )

    for i, chunk in enumerate(chunks):
        chunk.chunk_index = i

    return chunks


def _fallback_chunk(file_path: str, content: str, language: str) -> list[Chunk]:
    """Whole-file single chunk (used when AST finds no top-level nodes)."""
    lines = _lines(content)
    return [
        Chunk(
            file_path=file_path,
            language=language,
            start_line=0,
            end_line=max(0, len(lines) - 1),
            content=content.strip(),
            chunk_index=0,
        )
    ]


def _chunk_python(file_path: str, content: str) -> list[Chunk]:
    tree = _py_parser.parse(content.encode())
    all_lines = _lines(content)
    segments = _build_segments(tree.root_node.children, _PY_CHUNK_TYPES)

    if not any(kind == "code" for kind, _, _ in segments):
        return _fallback_chunk(file_path, content, "python")

    return _merge_segments(segments, all_lines, file_path, "python")


def _chunk_js(file_path: str, content: str, language: str) -> list[Chunk]:
    tree = _js_parser.parse(content.encode())
    all_lines = _lines(content)
    # Use direct children only (no recursive walk) so gaps between top-level
    # nodes are correctly detected and absorbed into adjacent chunks.
    segments = _build_segments(tree.root_node.children, _JS_CHUNK_TYPES)

    if not any(kind == "code" for kind, _, _ in segments):
        return _fallback_chunk(file_path, content, language)

    return _merge_segments(segments, all_lines, file_path, language)
