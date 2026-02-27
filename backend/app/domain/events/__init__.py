"""
Product analytics events domain module.

Exposes FunnelEvent enum and ProductEvent model for use across the application.
No PII is stored here — only opaque IDs and structured metadata.
"""
from app.domain.events.models import FunnelEvent, ProductEvent

__all__ = ["FunnelEvent", "ProductEvent"]
