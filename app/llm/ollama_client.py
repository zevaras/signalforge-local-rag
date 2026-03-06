"""Ollama LLM client for local inference."""
from langchain_ollama import ChatOllama

from app.config import settings


def get_llm() -> ChatOllama:
    """Create ChatOllama instance for the configured model."""
    return ChatOllama(
        base_url=settings.ollama_base_url,
        model=settings.ollama_model,
        temperature=0.2,
        client_kwargs={"timeout": settings.ollama_timeout},
    )
