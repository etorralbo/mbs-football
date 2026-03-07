"""
Architecture guard tests — enforce the layer boundaries described in ADR-001.

These tests inspect the source code statically (no runtime imports) to catch
violations early.  They run as part of the regular test suite.

Rules enforced:
1. Legacy endpoint layer is frozen — no new modules beyond the known set.
2. Domain use cases must not import FastAPI or HTTPException.
3. Transport modules must not import ORM table models directly
   (enum imports from model files are allowed; me.py and invites.py are
   acknowledged exceptions because they use direct queries — see ADR-001).
"""

import ast
from pathlib import Path

import pytest

# Skip the session-scoped DB setup — these tests are pure static analysis.
pytestmark = pytest.mark.no_db

BACKEND_ROOT = Path(__file__).resolve().parent.parent
APP_ROOT = BACKEND_ROOT / "app"

# ── Rule 1: Legacy endpoint layer is frozen ──────────────────────────

ALLOWED_LEGACY_MODULES = frozenset(
    {"__init__.py", "exercises.py", "workout_templates.py", "workout_builder.py", "ai.py"}
)


def test_no_new_legacy_endpoint_modules():
    """No new Python modules may be added to app/api/v1/endpoints/."""
    endpoints_dir = APP_ROOT / "api" / "v1" / "endpoints"
    actual = {
        f.name
        for f in endpoints_dir.iterdir()
        if f.suffix == ".py" and not f.name.startswith("__pycache__")
    }
    extra = actual - ALLOWED_LEGACY_MODULES
    assert extra == set(), (
        f"Legacy endpoint layer is frozen (ADR-001). "
        f"Remove or relocate these modules to app/transport/http/v1/: {extra}"
    )


# ── Rule 2: Use cases must not import FastAPI/HTTP concerns ──────────

FORBIDDEN_USE_CASE_IMPORTS = {"fastapi", "starlette", "HTTPException"}


def _collect_imports(filepath: Path) -> set[str]:
    """Return all top-level imported module names from a Python file."""
    source = filepath.read_text()
    tree = ast.parse(source, filename=str(filepath))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                names.add(node.module.split(".")[0])
                # Also capture full dotted path for specific checks
                names.add(node.module)
    return names


def _collect_imported_names(filepath: Path) -> set[str]:
    """Return all imported *names* (the 'X' in 'from foo import X')."""
    source = filepath.read_text()
    tree = ast.parse(source, filename=str(filepath))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                names.add(alias.name)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                names.add(alias.name.split(".")[-1])
    return names


def _use_case_files() -> list[Path]:
    use_cases_dir = APP_ROOT / "domain" / "use_cases"
    return [
        f
        for f in use_cases_dir.rglob("*.py")
        if f.name != "__init__.py" and "__pycache__" not in str(f)
    ]


@pytest.mark.parametrize("filepath", _use_case_files(), ids=lambda p: p.name)
def test_use_cases_do_not_import_http_framework(filepath: Path):
    """Domain use cases must be framework-independent (ADR-001, layer rule)."""
    imports = _collect_imports(filepath)
    imported_names = _collect_imported_names(filepath)
    violations = (imports | imported_names) & FORBIDDEN_USE_CASE_IMPORTS
    assert violations == set(), (
        f"{filepath.name} imports HTTP concerns: {violations}. "
        f"Use cases must not depend on FastAPI/Starlette."
    )


# ── Rule 3: Transport must not import ORM table models directly ──────

# me.py and invites.py contain direct-query endpoints (preview, profile lookup)
# that access ORM models without a dedicated use case — see ADR-001.
TRANSPORT_ORM_EXCEPTIONS = frozenset({"me.py", "invites.py"})

# Enum/constant modules that live under app.models but aren't table classes
ALLOWED_MODEL_IMPORTS = frozenset({"Role"})


def _transport_files() -> list[Path]:
    transport_dir = APP_ROOT / "transport" / "http" / "v1"
    return [
        f
        for f in transport_dir.rglob("*.py")
        if f.name != "__init__.py"
        and "__pycache__" not in str(f)
        and f.name not in TRANSPORT_ORM_EXCEPTIONS
    ]


def _find_orm_model_imports(filepath: Path) -> list[str]:
    """Find 'from app.models.X import Y' where Y is not an allowed constant."""
    source = filepath.read_text()
    tree = ast.parse(source, filename=str(filepath))
    violations = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("app.models"):
            for alias in node.names:
                if alias.name not in ALLOWED_MODEL_IMPORTS:
                    violations.append(f"from {node.module} import {alias.name}")
    return violations


@pytest.mark.parametrize("filepath", _transport_files(), ids=lambda p: p.name)
def test_transport_does_not_import_orm_models(filepath: Path):
    """Transport layer should not import ORM table models (ADR-001, layer rule).

    Enums like Role are allowed.  me.py is exempt (direct query pattern).
    """
    violations = _find_orm_model_imports(filepath)
    assert violations == [], (
        f"{filepath.name} imports ORM models directly: {violations}. "
        f"Move data access to a repository or add the import to ALLOWED_MODEL_IMPORTS "
        f"if it is a shared enum/constant."
    )
