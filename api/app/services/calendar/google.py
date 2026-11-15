"""Google Calendar API integration supporting OAuth refresh, FreeBusy query, and Google Meet link generation."""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from api.app.core.config import settings
from api.app.services.calendar.base import ExternalEvent, Interval

logger = logging.getLogger("vedavoice.calendar.google")


class GoogleCalendarProvider:
    """Production Google Calendar API v3 provider."""

    def __init__(
        self,
        refresh_token: str,
        client_id: str | None = None,
        client_secret: str | None = None,
        access_token: str | None = None,
        token_expiry: datetime | None = None,
    ) -> None:
        self.refresh_token = refresh_token
        self.client_id = client_id or settings.GOOGLE_CLIENT_ID
        self.client_secret = client_secret or settings.GOOGLE_CLIENT_SECRET
        self.access_token = access_token
        self.token_expiry = token_expiry

    def _ensure_access_token(self) -> str:
        """Refresh OAuth access token if expired or missing."""
        now = datetime.now(UTC)
        if (
            self.access_token
            and self.token_expiry
            and self.token_expiry > (now + timedelta(seconds=60))
        ):
            return self.access_token

        if not self.refresh_token:
            raise ValueError("Google refresh_token is required to obtain an access token")

        token_url = "https://oauth2.googleapis.com/token"
        data = urllib.parse.urlencode(
            {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": self.refresh_token,
                "grant_type": "refresh_token",
            }
        ).encode("utf-8")

        req = urllib.request.Request(
            token_url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                token_val = str(res_data["access_token"])
                self.access_token = token_val
                expires_in = int(res_data["expires_in"]) if "expires_in" in res_data else 3600
                self.token_expiry = now + timedelta(seconds=expires_in)
                return token_val
        except Exception as e:
            logger.error("Failed to refresh Google OAuth access token: %s", e)
            raise

    def free_busy(self, calendar_id: str, start: datetime, end: datetime) -> list[Interval]:
        """Query Google Calendar FreeBusy API for busy intervals."""
        token = self._ensure_access_token()
        url = "https://www.googleapis.com/calendar/v3/freeBusy"

        body = {
            "timeMin": start.isoformat(),
            "timeMax": end.isoformat(),
            "items": [{"id": calendar_id}],
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                cal_data = data.get("calendars", {}).get(calendar_id, {})
                busy_list = cal_data.get("busy", [])

                intervals: list[Interval] = []
                for b in busy_list:
                    b_start = datetime.fromisoformat(b["start"].replace("Z", "+00:00"))
                    b_end = datetime.fromisoformat(b["end"].replace("Z", "+00:00"))
                    intervals.append(Interval(start=b_start, end=b_end))
                return intervals
        except Exception as e:
            logger.error("Error querying Google Calendar freeBusy: %s", e)
            raise

    def create_event(self, calendar_id: str, event: ExternalEvent) -> ExternalEvent:
        """Insert event into Google Calendar with Google Meet video link."""
        token = self._ensure_access_token()
        encoded_cal = urllib.parse.quote(calendar_id)
        url = f"https://www.googleapis.com/calendar/v3/calendars/{encoded_cal}/events?conferenceDataVersion=1"

        payload = {
            "summary": event.title,
            "description": event.description,
            "start": {"dateTime": event.start.isoformat()},
            "end": {"dateTime": event.end.isoformat()},
            "attendees": [{"email": email} for email in event.attendee_emails if email],
            "conferenceData": {
                "createRequest": {
                    "requestId": f"gmeet-{uuid.uuid4().hex[:12]}",
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            },
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=12.0) as resp:
                res_data = json.loads(resp.read().decode("utf-8"))
                event_id = res_data.get("id")
                meet_link = res_data.get("hangoutLink")

                return ExternalEvent(
                    id=event_id,
                    title=event.title,
                    start=event.start,
                    end=event.end,
                    meet_link=meet_link,
                    description=event.description,
                    attendee_emails=event.attendee_emails,
                )
        except Exception as e:
            logger.error("Error creating Google Calendar event: %s", e)
            raise

    def update_event(
        self, calendar_id: str, event_id: str, changes: dict[str, Any]
    ) -> ExternalEvent:
        """Patch existing Google Calendar event."""
        token = self._ensure_access_token()
        encoded_cal = urllib.parse.quote(calendar_id)
        encoded_event = urllib.parse.quote(event_id)
        url = (
            f"https://www.googleapis.com/calendar/v3/calendars/{encoded_cal}/events/{encoded_event}"
        )

        req = urllib.request.Request(
            url,
            data=json.dumps(changes).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="PATCH",
        )

        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                s_dt = datetime.fromisoformat(data["start"]["dateTime"].replace("Z", "+00:00"))
                e_dt = datetime.fromisoformat(data["end"]["dateTime"].replace("Z", "+00:00"))
                return ExternalEvent(
                    id=data.get("id"),
                    title=data.get("summary", ""),
                    start=s_dt,
                    end=e_dt,
                    meet_link=data.get("hangoutLink"),
                    description=data.get("description", ""),
                )
        except Exception as e:
            logger.error("Error updating Google Calendar event %s: %s", event_id, e)
            raise

    def delete_event(self, calendar_id: str, event_id: str) -> bool:
        """Delete an event from Google Calendar."""
        token = self._ensure_access_token()
        encoded_cal = urllib.parse.quote(calendar_id)
        encoded_event = urllib.parse.quote(event_id)
        url = (
            f"https://www.googleapis.com/calendar/v3/calendars/{encoded_cal}/events/{encoded_event}"
        )

        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {token}"},
            method="DELETE",
        )

        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                return bool(200 <= resp.status < 300)
        except Exception as e:
            logger.error("Error deleting Google Calendar event %s: %s", event_id, e)
            return False


class MockSandboxCalendarProvider:
    """In-memory calendar provider for testing and sandbox simulation without live Google credentials."""

    def __init__(self) -> None:
        self.busy_blocks: list[Interval] = []
        self.events: dict[str, ExternalEvent] = {}

    def free_busy(self, calendar_id: str, start: datetime, end: datetime) -> list[Interval]:
        return [b for b in self.busy_blocks if (b.start < end and b.end > start)]

    def create_event(self, calendar_id: str, event: ExternalEvent) -> ExternalEvent:
        event_id = event.id or f"mock-cal-{uuid.uuid4().hex[:8]}"
        meet_link = event.meet_link or f"https://meet.google.com/xyz-{uuid.uuid4().hex[:4]}-abc"
        created = ExternalEvent(
            id=event_id,
            title=event.title,
            start=event.start,
            end=event.end,
            meet_link=meet_link,
            description=event.description,
            attendee_emails=event.attendee_emails,
        )
        self.events[event_id] = created
        self.busy_blocks.append(Interval(start=event.start, end=event.end))
        return created

    def update_event(
        self, calendar_id: str, event_id: str, changes: dict[str, Any]
    ) -> ExternalEvent:
        if event_id not in self.events:
            raise KeyError(f"Event {event_id} not found")
        ev = self.events[event_id]
        if "summary" in changes:
            ev.title = changes["summary"]
        return ev

    def delete_event(self, calendar_id: str, event_id: str) -> bool:
        if event_id in self.events:
            ev = self.events.pop(event_id)
            self.busy_blocks = [
                b for b in self.busy_blocks if not (b.start == ev.start and b.end == ev.end)
            ]
            return True
        return False
