"""Embedding service using Ollama for local embeddings."""
from langchain_ollama import OllamaEmbeddings

from app.config import settings


# Ollama embedding model is configurable via SIGNALFORGE_OLLAMA_EMBEDDING_MODEL
OLLAMA_EMBEDDING_MODEL = "nomic-embed-text"


def get_embeddings() -> OllamaEmbeddings:
    """Create Ollama embeddings instance."""
    return OllamaEmbeddings(
        base_url=settings.ollama_base_url,
        model=settings.ollama_embedding_model,
        client_kwargs={"timeout": settings.ollama_timeout},
    )
