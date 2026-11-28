# Production Dockerfile for VedaVoice Voice Agent Worker
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY agent/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Security: Non-root user execution
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/bash -m appuser

COPY agent /app/agent
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

USER appuser

# Pre-download Silero VAD and LiveKit semantic turn-detector model weights
RUN python -m agent.main download-files || true

CMD ["python", "-m", "agent.main", "start"]
