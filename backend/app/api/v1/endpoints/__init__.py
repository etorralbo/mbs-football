"""
API v1 endpoints package — FROZEN.

This package contains legacy endpoint handlers that predate the clean
architecture transition (see ADR-001).  These modules are fully
operational but **no new endpoints or modules may be added here**.

All new features MUST be implemented in:
    app/transport/http/v1/   (transport)
    app/domain/use_cases/    (business logic)
    app/persistence/repositories/  (data access)
"""
