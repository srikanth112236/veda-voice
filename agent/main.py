"""LiveKit Voice Agent entrypoint for Milestone M1a."""

import logging
import os
from typing import Annotated

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
    function_tool,
)
from livekit.plugins import silero

from agent.config import get_agent_settings, load_business_config
from agent.prompts import build_system_prompt

# Load local environment overrides first, then default environment file
load_dotenv(".env.local")
load_dotenv(".env")
logger = logging.getLogger("receptionist")

AGENT_NAME = "receptionist"


def get_agent_info() -> dict[str, str]:
    """Return basic agent metadata for verification."""
    config = load_business_config("default")
    return {
        "name": AGENT_NAME,
        "business": config.business,
        "status": "ready",
        "livekit_url": os.getenv("LIVEKIT_URL", "wss://<project>.livekit.cloud"),
    }


@function_tool(
    description="End the phone call cleanly when conversation is complete, caller says goodbye, or caller hangs up."
)
async def end_call(
    reason: Annotated[
        str, "Reason the call is ending (e.g. 'completed', 'caller_goodbye', 'spam')"
    ] = "completed",
) -> str:
    """End the call cleanly."""
    logger.info("end_call tool invoked: reason=%s", reason)
    return f"Call ended: {reason}"


async def entrypoint(ctx: JobContext) -> None:
    """Main worker entrypoint for LiveKit Agent session."""
    logger.info("Starting receptionist agent in room %s", ctx.room.name)
    config = load_business_config("default")
    settings = get_agent_settings()
    prompt = build_system_prompt(config)

    # Initialize AgentSession with VAD and LiveKit Inference model strings
    session: AgentSession = AgentSession(
        stt=settings.stt_model,
        llm=settings.llm_model,
        tts=settings.tts_model,
        vad=silero.VAD.load(),
    )

    agent = Agent(
        instructions=prompt,
        tools=[end_call],
    )

    await ctx.connect()
    await session.start(agent, room=ctx.room)
    await session.say(config.greeting, allow_interruptions=True)


def main() -> None:
    """Run the LiveKit agent worker."""
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="receptionist",
        )
    )


if __name__ == "__main__":
    main()
