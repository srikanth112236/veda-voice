from fastapi import FastAPI
from fastapi.responses import JSONResponse

from api.app.core.config import settings

app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
)


@app.get("/health", tags=["system"])
async def health_check() -> JSONResponse:
    """System health check endpoint."""
    return JSONResponse(
        status_code=200,
        content={
            "status": "ok",
            "service": "api",
            "version": settings.API_VERSION,
        },
    )
