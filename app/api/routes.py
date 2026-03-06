"""API routes for upload, ask, and documents."""
import asyncio
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.config import settings
from app.db.vector_store import add_documents
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
    """Response for /ask."""

    answer: str


@router.post("/upload")
async def upload_documents(files: list[UploadFile] = File(...)):
    """Upload one or more documents (PDF, TXT, MD). Extract text, chunk, and store in Chroma."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    uploads_dir = _ensure_uploads_dir()
    saved_paths: list[str] = []
    for f in files:
        suffix = Path(f.filename or "").suffix.lower()
        if suffix not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File {f.filename}: unsupported type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
            )
        path = uploads_dir / f"{uuid.uuid4().hex}_{f.filename}"
        content = await f.read()
        path.write_bytes(content)
        try:
            docs = load_document(path)
            if not docs:
                path.unlink(missing_ok=True)
                raise HTTPException(status_code=400, detail=f"Could not extract text from {f.filename}")
            chunks = split_documents(docs)
            for d in chunks:
                d.metadata["source"] = f.filename or path.name
            await asyncio.to_thread(add_documents, chunks)
        except Exception as e:
            path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=f"Processing failed: {e!s}")
        saved_paths.append(f.filename or path.name)
    return {"uploaded": saved_paths}


@router.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest):
    """Ask a question; context is retrieved from the vector store and sent to the LLM."""
    question = (req.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    try:
        answer = await ask_question(question)
        return AskResponse(answer=answer)
    except Exception as e:
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
