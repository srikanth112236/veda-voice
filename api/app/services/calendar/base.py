"""Calendar Provider interface abstraction."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol

from pydantic import BaseModel, Field


class Interval(BaseModel):
    """Time interval representing busy or reserved blocks."""

    start: datetime
    end: datetime


class ExternalEvent(BaseModel):
    """Normalized external calendar event model."""

    id: str | None = None
    title: str
    start: datetime
    end: datetime
    meet_link: str | None = None
    description: str = ""
    attendee_emails: list[str] = Field(default_factory=list)


class CalendarProvider(Protocol):
    """Interface for calendar services (Google Calendar, Cal.com, Internal)."""

    def free_busy(self, calendar_id: str, start: datetime, end: datetime) -> list[Interval]:
        """Fetch busy intervals within time range."""
        ...

    def create_event(self, calendar_id: str, event: ExternalEvent) -> ExternalEvent:
        """Create external event with optional Google Meet video conference link."""
        ...

    def update_event(
        self, calendar_id: str, event_id: str, changes: dict[str, Any]
    ) -> ExternalEvent:
        """Update existing external event."""
        ...

    def delete_event(self, calendar_id: str, event_id: str) -> bool:
        """Delete external calendar event."""
        ...
