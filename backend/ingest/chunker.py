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


def _lines(content: str) -> list[str]:
    return content.splitlines(keepends=True)


def _extract_chunks_from_nodes(
    nodes: list[Node],
    all_lines: list[str],
    file_path: str,
    language: str,
) -> list[Chunk]:
    """Convert a flat list of tree-sitter nodes into Chunk objects."""
    chunks: list[Chunk] = []
    for idx, node in enumerate(nodes):
        start = node.start_point[0]
        end = node.end_point[0]
        text = "".join(all_lines[start : end + 1])
        chunks.append(
            Chunk(
                file_path=file_path,
                language=language,
                start_line=start,
                end_line=end,
                content=text.strip(),
                chunk_index=idx,
            )
        )
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
    top_level: list[Node] = []
    for child in tree.root_node.children:
        if child.type in _PY_CHUNK_TYPES:
            top_level.append(child)

    if not top_level:
        return _fallback_chunk(file_path, content, "python")

    return _extract_chunks_from_nodes(top_level, _lines(content), file_path, "python")


def _chunk_js(file_path: str, content: str, language: str) -> list[Chunk]:
    tree = _js_parser.parse(content.encode())
    top_level: list[Node] = []

    def _walk(node: Node) -> None:
        if node.type in _JS_CHUNK_TYPES:
            top_level.append(node)
            return  # don't recurse into matched nodes
        for child in node.children:
            _walk(child)

    _walk(tree.root_node)

    if not top_level:
        return _fallback_chunk(file_path, content, language)

    return _extract_chunks_from_nodes(top_level, _lines(content), file_path, language)
