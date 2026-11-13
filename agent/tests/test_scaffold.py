from agent.main import AGENT_NAME, get_agent_info


def test_agent_scaffold_metadata() -> None:
    """Verify scaffold runs with no network access and no API keys required."""
    info = get_agent_info()
    assert info["name"] == "receptionist"
    assert info["status"] == "scaffold"
    assert AGENT_NAME == "receptionist"


def test_agent_environment_defaults() -> None:
    """Verify agent default configuration does not fail when env vars are absent."""
    info = get_agent_info()
    assert "livekit_url" in info
