"""FastAPI application entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.api.routes import router

app = FastAPI(
    title="SignalForge",
    description="Local AI document Q&A with Ollama and ChromaDB",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api", tags=["api"])

# Serve frontend (index.html and app.js) from frontend/
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")


@app.get("/")
async def root():
    """Redirect or serve the main UI."""
    from fastapi.responses import FileResponse
    index_path = frontend_dir / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "SignalForge API. Open /static/index.html for the UI."}


@app.get("/favicon.ico")
async def favicon():
    """Avoid 404 for browser favicon requests."""
    from fastapi.responses import Response
    return Response(status_code=204)


@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok"}
