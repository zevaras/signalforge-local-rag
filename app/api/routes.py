"""API routes for upload, ask, and documents."""
import asyncio
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.config import settings
from app.db.vector_store import add_documents
from app.metrics import get_metrics, record_ask_error, record_ask_success, record_upload_batch
from app.services.document_loader import (
    ALLOWED_EXTENSIONS,
    load_document,
    split_documents,
)
from app.services.rag_service import ask_question


router = APIRouter()


def _ensure_uploads_dir() -> Path:
    path = Path(settings.uploads_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


class AskRequest(BaseModel):
    """Request body for /ask."""

    question: str


class AskResponse(BaseModel):
    """Response for /ask, including simple usage and model metadata."""

    answer: str
    # Character counts
    question_chars: int
    answer_chars: int
    # Rough token estimates
    question_tokens: int
    answer_tokens: int
    estimated_total_tokens: int
    # LLM / model metadata
    model_name: str
    model_base_url: str
    model_timeout: float
    status: str
    # Performance
    response_latency_ms: float | None = None


def _process_one_file(path: Path, display_name: str) -> None:
    """Load, split, and add one document to the vector store (runs in thread)."""
    docs = load_document(path)
    if not docs:
        path.unlink(missing_ok=True)
        raise ValueError(f"Could not extract text from {display_name}")
    chunks = split_documents(docs)
    for d in chunks:
        d.metadata["source"] = display_name
    add_documents(chunks)


@router.post("/upload")
async def upload_documents(files: list[UploadFile] = File(...)):
    """Upload one or more documents (PDF, TXT, MD). Extract text, chunk, and store in Chroma."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    max_files = max(1, settings.max_upload_files)
    if len(files) > max_files:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files. Maximum per upload: {max_files}.",
        )
    max_bytes = int(settings.max_upload_file_size_mb * 1024 * 1024)
    uploads_dir = _ensure_uploads_dir()
    # Phase 1: validate and write all files to disk
    written: list[tuple[Path, str]] = []
    for f in files:
        suffix = Path(f.filename or "").suffix.lower()
        if suffix not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File {f.filename}: unsupported type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
            )
        content = await f.read()
        if len(content) > max_bytes:
            raise HTTPException(
                status_code=400,
                detail=f"File {f.filename} exceeds max size ({settings.max_upload_file_size_mb} MB).",
            )
        path = uploads_dir / f"{uuid.uuid4().hex}_{f.filename}"
        path.write_bytes(content)
        written.append((path, f.filename or path.name))
    # Phase 2: process with limited concurrency
    sem = asyncio.Semaphore(settings.max_concurrent_upload_tasks)
    saved_paths: list[str] = []
    start = time.perf_counter()

    async def process_one(path: Path, display_name: str) -> str:
        async with sem:
            await asyncio.to_thread(_process_one_file, path, display_name)
        return display_name

    try:
        tasks = [process_one(p, name) for p, name in written]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                written[i][0].unlink(missing_ok=True)
                raise HTTPException(status_code=400, detail=f"Processing failed: {r!s}")
            saved_paths.append(r)
    except HTTPException:
        for p, _ in written:
            p.unlink(missing_ok=True)
        raise
    duration_ms = (time.perf_counter() - start) * 1000
    record_upload_batch(len(saved_paths), duration_ms)
    return {"uploaded": saved_paths, "processed_count": len(saved_paths), "processing_time_ms": round(duration_ms, 2)}


@router.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest):
    """Ask a question; context is retrieved from the vector store and sent to the LLM."""
    question = (req.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    start = time.perf_counter()
    try:
        answer = await ask_question(question)
        latency_ms = (time.perf_counter() - start) * 1000
        record_ask_success(latency_ms)
        question_chars = len(question)
        answer_chars = len(answer)
        question_tokens = max(1, int(question_chars / 4)) if question_chars else 0
        answer_tokens = max(1, int(answer_chars / 4)) if answer_chars else 0
        estimated_total_tokens = max(1, question_tokens + answer_tokens)
        return AskResponse(
            answer=answer,
            question_chars=question_chars,
            answer_chars=answer_chars,
            question_tokens=question_tokens,
            answer_tokens=answer_tokens,
            estimated_total_tokens=estimated_total_tokens,
            model_name=settings.ollama_model,
            model_base_url=settings.ollama_base_url,
            model_timeout=settings.ollama_timeout,
            status="ok",
            response_latency_ms=round(latency_ms, 2),
        )
    except Exception as e:
        record_ask_error()
        raise HTTPException(status_code=500, detail=f"Failed to generate answer: {e!s}")


def _display_name(path: Path) -> str:
    """Return display name (strip UUID prefix if present)."""
    name = path.name
    if len(name) > 33 and name[32] == "_" and all(c in "0123456789abcdef" for c in name[:32]):
        return name[33:]
    return name


@router.get("/documents")
async def list_documents():
    """List names of uploaded documents (files in uploads directory)."""
    uploads_dir = Path(settings.uploads_dir)
    if not uploads_dir.exists():
        return {"documents": []}
    names = [
        _display_name(f)
        for f in uploads_dir.iterdir()
        if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS
    ]
    return {"documents": sorted(names)}


@router.get("/dashboard")
async def get_dashboard():
    """Dashboard data: capacity limits, upload stats, model performance metrics."""
    metrics = get_metrics()
    return {
        "capacity": {
            "max_upload_files": settings.max_upload_files,
            "max_upload_file_size_mb": settings.max_upload_file_size_mb,
            "max_concurrent_upload_tasks": settings.max_concurrent_upload_tasks,
        },
        "upload": {
            "last_batch_count": metrics["last_upload_count"],
            "last_batch_duration_ms": metrics["last_upload_duration_ms"],
        },
        "model": {
            "success_count": metrics["ask_success_count"],
            "error_count": metrics["ask_error_count"],
            "last_latency_ms": metrics["last_ask_latency_ms"],
            "avg_latency_ms": metrics["avg_ask_latency_ms"],
        },
    }
