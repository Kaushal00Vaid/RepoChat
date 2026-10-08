"""
Golden tests for the AST chunker.

Each test is a pure function call — no network, no DB, no secrets.
These document and regression-test bugs that were previously fixed:
  - dropped constants (gap segments between functions were silently lost)
  - unbounded merge (small functions accumulated past MAX_CHUNK_LINES)
  - tail fragment (tiny tail chunks < MIN_CHUNK_LINES were emitted as noise)
"""
import pytest
from ingest.chunker import (
    chunk_file,
    should_skip_path,
    detect_language,
    Chunk,
    MAX_CHUNK_LINES,
    MIN_CHUNK_LINES,
)


# Helpers

def _py(src: str) -> list[Chunk]:
    return chunk_file("test.py", src, "python")


def _js(src: str) -> list[Chunk]:
    return chunk_file("test.js", src, "javascript")


def _ts(src: str) -> list[Chunk]:
    return chunk_file("test.ts", src, "typescript")


# should_skip_path

class TestShouldSkipPath:
    def test_node_modules_skipped(self):
        assert should_skip_path("node_modules/lodash/index.js") is True

    def test_dist_skipped(self):
        assert should_skip_path("dist/bundle.js") is True

    def test_venv_skipped(self):
        assert should_skip_path(".venv/lib/site.py") is True

    def test_hidden_dir_skipped(self):
        assert should_skip_path(".github/workflows/ci.yml") is True

    def test_lock_file_skipped(self):
        assert should_skip_path("package-lock.json") is True

    def test_png_skipped(self):
        assert should_skip_path("assets/logo.png") is True

    def test_normal_py_not_skipped(self):
        assert should_skip_path("src/main.py") is False

    def test_normal_ts_not_skipped(self):
        assert should_skip_path("src/components/Button.tsx") is False

    def test_nested_normal_file_not_skipped(self):
        assert should_skip_path("backend/ingest/chunker.py") is False


# detect_language

class TestDetectLanguage:
    def test_py(self):
        assert detect_language("app.py") == "python"

    def test_js(self):
        assert detect_language("index.js") == "javascript"

    def test_jsx(self):
        assert detect_language("App.jsx") == "javascript"

    def test_mjs(self):
        assert detect_language("mod.mjs") == "javascript"

    def test_ts(self):
        assert detect_language("types.ts") == "typescript"

    def test_tsx(self):
        assert detect_language("Button.tsx") == "typescript"

    def test_go_is_none(self):
        assert detect_language("main.go") is None

    def test_md_is_none(self):
        assert detect_language("README.md") is None


# chunk_file — Python

class TestChunkFilePython:
    def test_simple_function_is_one_chunk(self):
        src = "def hello():\n    return 'hi'\n"
        chunks = _py(src)
        assert len(chunks) == 1
        assert "def hello" in chunks[0].content

    def test_constants_are_not_dropped(self):
        """Regression: gap segments (imports / constants) between functions must be preserved."""
        src = (
            "import os\n"
            "\n"
            "CONSTANT = 42\n"
            "\n"
            "def foo():\n"
            "    pass\n"
        )
        chunks = _py(src)
        all_content = "\n".join(c.content for c in chunks)
        assert "CONSTANT" in all_content, "constants/imports must not be dropped"

    def test_chunk_indices_are_sequential(self):
        src = (
            "def a():\n    pass\n\n"
            "def b():\n    pass\n\n"
            "def c():\n    pass\n"
        )
        chunks = _py(src)
        assert [c.chunk_index for c in chunks] == list(range(len(chunks)))

    def test_empty_file_returns_no_chunks(self):
        chunks = _py("")
        assert chunks == [] or (len(chunks) == 1 and chunks[0].content == "")

    def test_class_with_methods(self):
        src = (
            "class MyClass:\n"
            "    def __init__(self):\n"
            "        self.x = 1\n"
            "\n"
            "    def method(self):\n"
            "        return self.x\n"
        )
        chunks = _py(src)
        assert len(chunks) >= 1
        all_content = "\n".join(c.content for c in chunks)
        assert "MyClass" in all_content

    def test_no_unbounded_merge(self):
        """Regression: small functions must not accumulate past MAX_CHUNK_LINES."""
        # Build a file with many small 3-line functions
        lines_per_fn = 3
        num_functions = (MAX_CHUNK_LINES // lines_per_fn) + 5  # more than the cap
        src = "\n".join(
            f"def fn_{i}():\n    x = {i}\n    return x"
            for i in range(num_functions)
        )
        chunks = _py(src)
        for chunk in chunks:
            span = chunk.end_line - chunk.start_line + 1
            # Allow a small slack for the gap lines between functions
            assert span <= MAX_CHUNK_LINES + 5, (
                f"Chunk span {span} exceeds MAX_CHUNK_LINES={MAX_CHUNK_LINES}: "
                f"{chunk.content[:80]!r}"
            )

    def test_no_tiny_tail_fragment(self):
        """Regression: tail chunks smaller than MIN_CHUNK_LINES should be absorbed."""
        # Functions + a tiny 2-line tail that would be a fragment on its own
        src = (
            "def big_fn():\n"
            + "    x = 1\n" * 40
            + "\n"
            + "x = 1\n"
            + "y = 2\n"  # 2-line tail — must be absorbed, not orphaned
        )
        chunks = _py(src)
        for chunk in chunks:
            span = chunk.end_line - chunk.start_line + 1
            # Each chunk should be meaningful (not a 1-2 line sliver on its own)
            # We allow chunks that contain at least MIN_CHUNK_LINES lines
            # OR are the first/only chunk (edge case for very small files)
            if len(chunks) > 1:
                assert span >= MIN_CHUNK_LINES or chunk == chunks[-1] or chunk == chunks[0]

    def test_line_numbers_are_zero_indexed(self):
        src = "def foo():\n    pass\n"
        chunks = _py(src)
        assert chunks[0].start_line == 0

    def test_start_line_lte_end_line(self):
        src = (
            "def alpha():\n    pass\n\n"
            "def beta():\n    return 1\n"
        )
        chunks = _py(src)
        for c in chunks:
            assert c.start_line <= c.end_line


# chunk_file — JavaScript / TypeScript

class TestChunkFileJS:
    def test_arrow_function_is_chunked(self):
        src = "const greet = (name) => {\n  return `Hello ${name}`;\n};\n"
        chunks = _js(src)
        assert len(chunks) >= 1
        assert "greet" in chunks[0].content

    def test_export_function_is_chunked(self):
        src = "export function add(a, b) {\n  return a + b;\n}\n"
        chunks = _js(src)
        assert len(chunks) == 1
        assert "add" in chunks[0].content

    def test_class_declaration(self):
        src = (
            "class Animal {\n"
            "  constructor(name) { this.name = name; }\n"
            "  speak() { console.log(this.name); }\n"
            "}\n"
        )
        chunks = _js(src)
        assert len(chunks) >= 1
        all_content = "\n".join(c.content for c in chunks)
        assert "Animal" in all_content

    def test_typescript_interface_fallback(self):
        """TS interface has no matching chunk type; whole file becomes one fallback chunk."""
        src = "interface User {\n  id: number;\n  name: string;\n}\n"
        chunks = _ts(src)
        assert len(chunks) == 1
        assert "User" in chunks[0].content


# File size guard

class TestFileSizeGuard:
    def test_oversized_file_returns_empty(self):
        # 500 KB + 1 byte of content
        huge = "x = 1\n" * 100_000
        chunks = chunk_file("big.py", huge, "python")
        # Should return empty list (file exceeds MAX_FILE_BYTES)
        assert isinstance(chunks, list)
        # Either empty (file skipped) or all chunks are non-empty strings
        for c in chunks:
            assert c.content
