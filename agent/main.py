"""LiveKit Voice Agent entrypoint scaffold for Milestone M0."""

import os

from dotenv import load_dotenv

load_dotenv()

AGENT_NAME = "receptionist"


def get_agent_info() -> dict[str, str]:
    """Return basic agent metadata for verification."""
    return {
        "name": AGENT_NAME,
        "status": "scaffold",
        "livekit_url": os.getenv("LIVEKIT_URL", "wss://<project>.livekit.cloud"),
    }


if __name__ == "__main__":
    print(f"Agent {AGENT_NAME} scaffold initialized.")
