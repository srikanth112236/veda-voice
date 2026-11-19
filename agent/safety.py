"""Silence and maximum call duration safety monitor.

Monitors session inactivity (prompt at 10s, prompt at 20s, hangup at 30s)
and max duration limits (warn near 9 mins, hangup at 10 mins).
Timers do not advance or prompt while the agent is speaking, thinking, or running tools.
"""

import asyncio
from collections.abc import Awaitable, Callable
from typing import Protocol


class Clock(Protocol):
    """Abstract clock for real or simulated test time."""

    def now(self) -> float:
        """Return current timestamp in seconds."""
        ...


class SystemClock:
    """Standard monotonic wall-clock."""

    def __init__(self, loop: asyncio.AbstractEventLoop | None = None) -> None:
        self.loop = loop or asyncio.get_event_loop()

    def now(self) -> float:
        return self.loop.time()


class SimulatedClock:
    """Simulated clock for deterministic offline testing."""

    def __init__(self, start_time: float = 0.0) -> None:
        self.current_time = start_time

    def now(self) -> float:
        return self.current_time

    def advance(self, seconds: float) -> None:
        self.current_time += seconds


class SafetyMonitor:
    """Tracks silence stages and call duration limits.

    Inactivity prompts:
      - 10s idle: Prompt 1 ("Are you still there? I'm here to help.")
      - 20s idle: Prompt 2 ("I haven't heard anything from you. Are you still on the line?")
      - 30s idle: Hangup ("I haven't heard anything from you, so I'll end the call now. Goodbye.")

    Duration limits:
      - Warning threshold (default 9 min / 540s): Warn caller.
      - Max limit (default 10 min / 600s): End call politely.
    """

    def __init__(
        self,
        clock: Clock,
        max_duration_seconds: float = 600.0,
        warn_duration_seconds: float = 540.0,
        say_callback: Callable[[str], Awaitable[None]] | None = None,
        end_call_callback: Callable[[str], Awaitable[None]] | None = None,
    ) -> None:
        self.clock = clock
        self.max_duration_seconds = max_duration_seconds
        self.warn_duration_seconds = warn_duration_seconds
        self.say_callback = say_callback
        self.end_call_callback = end_call_callback

        self.call_start_time = clock.now()
        self.last_activity_time = clock.now()
        self.silence_prompts_sent = 0
        self.duration_warned = False
        self.is_agent_busy = False  # True when speaking, thinking, or executing tools
        self.call_transferred = False  # True when call is bridged or on transfer hold
        self.ended = False
        self.end_reason: str | None = None

    def set_agent_busy(self, busy: bool) -> None:
        """Set whether agent is currently busy speaking, thinking, or running tools."""
        self.is_agent_busy = busy
        # While agent is busy or transitioning, reset silence timer base
        self.last_activity_time = self.clock.now()

    def on_user_activity(self) -> None:
        """User spoke or interacted; reset silence counters."""
        self.last_activity_time = self.clock.now()
        self.silence_prompts_sent = 0

    async def check_step(self) -> str | None:
        """Perform a tick check. Returns action taken if any."""
        if self.ended:
            return None

        current = self.clock.now()
        elapsed = current - self.call_start_time

        # 1. Check max duration limits first
        if elapsed >= self.max_duration_seconds:
            self.ended = True
            self.end_reason = "max_duration_exceeded"
            if self.say_callback:
                await self.say_callback(
                    "We have reached our maximum call length. I will end the call now. Goodbye."
                )
            if self.end_call_callback:
                await self.end_call_callback("max_duration_exceeded")
            return "hung_up_max_duration"

        if (
            not self.duration_warned
            and elapsed >= self.warn_duration_seconds
            and not self.is_agent_busy
        ):
            self.duration_warned = True
            if self.say_callback:
                await self.say_callback(
                    "Just so you know, our call will reach the maximum allowed time in about one minute."
                )
            return "warned_duration"

        # 2. Check silence only when agent is not busy and call is not transferred
        if not self.is_agent_busy and not self.call_transferred:
            idle_seconds = current - self.last_activity_time
            if idle_seconds >= 30.0:
                self.ended = True
                self.end_reason = "silence_timeout"
                if self.say_callback:
                    await self.say_callback(
                        "I haven't heard anything from you, so I'll end the call now. Goodbye."
                    )
                if self.end_call_callback:
                    await self.end_call_callback("silence_timeout")
                return "hung_up_silence"
            elif idle_seconds >= 20.0 and self.silence_prompts_sent < 2:
                self.silence_prompts_sent = 2
                if self.say_callback:
                    await self.say_callback(
                        "I haven't heard anything from you. Are you still on the line?"
                    )
                return "prompted_silence_2"
            elif idle_seconds >= 10.0 and self.silence_prompts_sent < 1:
                self.silence_prompts_sent = 1
                if self.say_callback:
                    await self.say_callback("Are you still there? I'm here to help.")
                return "prompted_silence_1"

        return None
