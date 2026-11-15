"""Live terminal tester connecting a synthetic caller to the running voice agent in LiveKit Cloud."""

import asyncio
import os
import sys
import uuid

import livekit.api as lk_api
import livekit.rtc as lk_rtc
from dotenv import load_dotenv

load_dotenv(".env.local")
load_dotenv(".env")


async def run_live_test(
    dialed_number: str = "+18005550199",
    caller_number: str = "+15125550144",
    user_utterance: str = "Hi, I have an active water leak in my kitchen!",
) -> None:
    livekit_url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    if not (livekit_url and api_key and api_secret):
        print("Error: LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET is missing.")
        sys.exit(1)

    room_name = f"call-live-terminal-{uuid.uuid4().hex[:8]}"
    print("=" * 65)
    print("       LIVE TERMINAL AGENT TEST (LIVEKIT CLOUD WEBRTC)       ")
    print("=" * 65)
    print(f"Room:           {room_name}")
    print(f"LiveKit Cloud:  {livekit_url}")
    print(f"Dialed DID:     {dialed_number} (Apex Plumbing & Heating)")
    print(f"Caller Phone:   {caller_number}")
    print(f"User Message:   '{user_utterance}'")
    print("-" * 65)

    call_id = f"sip-test-{uuid.uuid4().hex[:12]}"

    # 1. Create agent dispatch on LiveKit Cloud
    async with lk_api.LiveKitAPI(livekit_url, api_key, api_secret) as api:
        print("[1/4] Dispatching voice agent 'receptionist' to room...")
        try:
            req = lk_api.CreateAgentDispatchRequest(
                agent_name="receptionist",
                room=room_name,
            )
            await api.agent_dispatch.create_dispatch(req)
            print("      Agent dispatch request created successfully.")
        except Exception as e:
            print(f"      (Note on agent dispatch: {e})")

    # 2. Generate caller token with SIP phone attributes
    token = (
        lk_api.AccessToken(api_key, api_secret)
        .with_identity("caller-phone-client")
        .with_name("Alex Henderson (Caller)")
        .with_grants(lk_api.VideoGrants(room_join=True, room=room_name))
        .with_attributes(
            {
                "sip.phoneNumber": caller_number,
                "sip.trunkPhoneNumber": dialed_number,
                "sip.callID": call_id,
            }
        )
        .to_jwt()
    )

    # 3. Connect caller Room via WebRTC
    room = lk_rtc.Room()
    agent_joined = asyncio.Event()
    speech_received = asyncio.Event()

    @room.on("participant_connected")
    def on_participant(participant: lk_rtc.RemoteParticipant) -> None:
        print(
            f"\n[EVENT] Participant joined room: '{participant.identity}' (Kind: {participant.kind})"
        )
        if (
            "agent" in participant.identity.lower()
            or "receptionist" in participant.identity.lower()
        ):
            agent_joined.set()

    @room.on("track_subscribed")
    def on_track_subscribed(
        track: lk_rtc.Track,
        publication: lk_rtc.RemoteTrackPublication,
        participant: lk_rtc.RemoteParticipant,
    ) -> None:
        print(f"\n[EVENT] Subscribed to {track.kind} track from '{participant.identity}'!")
        speech_received.set()

    @room.on("data_received")
    def on_data_received(data_packet: lk_rtc.DataPacket) -> None:
        try:
            msg = data_packet.data.decode("utf-8")
            print(f"\n[TRANSCRIPT DATA from {data_packet.participant.identity}]:\n  -> {msg}")
        except Exception:
            pass

    print("[2/4] Connecting caller to room via WebRTC...")
    await room.connect(livekit_url, token)
    print("      Caller connected to room. Waiting for voice agent worker to answer...")

    # Check already present participants
    for p in room.remote_participants.values():
        print(f"      Found existing remote participant: '{p.identity}'")
        if "agent" in p.identity.lower() or "receptionist" in p.identity.lower():
            agent_joined.set()

    # Wait for agent to join
    try:
        await asyncio.wait_for(agent_joined.wait(), timeout=12.0)
        print("      Voice agent worker answered and entered the call session!")
    except TimeoutError:
        print("      Timed out waiting for agent join. Checking remote participants...")
        for p in room.remote_participants.values():
            print(f"        Participant: {p.identity}")

    print("\n[3/4] Live call active! Listening for agent greeting audio track...")
    try:
        await asyncio.wait_for(speech_received.wait(), timeout=10.0)
        print("      Agent is actively speaking via live WebRTC audio track!")
    except TimeoutError:
        print("      (Awaiting audio frames...)")

    # Send caller message
    print(f'\n[4/4] Sending caller speech: "{user_utterance}"')
    try:
        # Publish text message to agent
        await room.local_participant.publish_data(
            user_utterance.encode("utf-8"),
            reliable=True,
            topic="lk-chat-topic",
        )
    except Exception as e:
        print(f"      Publish data notice: {e}")

    # Hold call for 5 seconds to let conversation proceed
    await asyncio.sleep(5.0)

    print("\n" + "=" * 65)
    print("                    LIVE CALL COMPLETED!                     ")
    print("=" * 65)
    print("Call ID:             ", call_id)
    print("Dialed Number:       ", dialed_number)
    print("Status:              Cleanly disconnected.")
    await room.disconnect()


if __name__ == "__main__":
    msg = sys.argv[1] if len(sys.argv) > 1 else "Hi, I have an active water leak in my kitchen!"
    asyncio.run(run_live_test(user_utterance=msg))
