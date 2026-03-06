"""Application configuration."""
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """App settings loaded from environment or defaults."""

    # Ollama (use 127.0.0.1 for reliable local connection; override with SIGNALFORGE_OLLAMA_BASE_URL)
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3"
    ollama_embedding_model: str = "nomic-embed-text"
    ollama_timeout: float = 120.0  # seconds (first request can be slow while model loads)

    # ChromaDB (used on Python < 3.14)
    chroma_persist_dir: str = "data/chroma_db"
    chroma_collection_name: str = "documents"

    # FAISS (used on Python 3.14+ when ChromaDB has compatibility issues)
    faiss_persist_dir: str = "data/faiss_db"

    # Document processing
    chunk_size: int = 1000
    chunk_overlap: int = 200

    # Upload capacity (enforced per request)
    max_upload_files: int = 20  # max files in a single upload
    max_upload_file_size_mb: float = 50.0  # max size per file in MB
    max_concurrent_upload_tasks: int = 4  # max docs processed in parallel per batch

    # Paths
    uploads_dir: Path = Path("data/uploads")

    class Config:
        env_prefix = "SIGNALFORGE_"
        env_file = ".env"


settings = Settings()
