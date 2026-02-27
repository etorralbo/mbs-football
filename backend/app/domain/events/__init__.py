"""
Product analytics events domain module.

Exposes FunnelEvent enum and ProductEvent model for use across the application.
No PII is stored here — only opaque IDs and structured metadata.
"""
from app.domain.events.models import FunnelEvent, ProductEvent
from app.domain.events.service import AuthContext, ProductEventService

__all__ = ["AuthContext", "FunnelEvent", "ProductEvent", "ProductEventService"]
