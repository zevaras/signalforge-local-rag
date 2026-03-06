"""Vector store for document embeddings. Uses ChromaDB on Python < 3.14, FAISS on 3.14+."""
import sys
from pathlib import Path
from typing import Optional, Union, TYPE_CHECKING

from langchain_core.documents import Document

from app.config import settings
from app.services.embedding_service import get_embeddings

if TYPE_CHECKING:
    from langchain_chroma import Chroma
    from langchain_community.vectorstores import FAISS

_USE_FAISS = sys.version_info >= (3, 14)


def _get_chroma_store() -> "Chroma":
    from langchain_chroma import Chroma
    persist_dir = Path(settings.chroma_persist_dir)
    persist_dir.mkdir(parents=True, exist_ok=True)
    return Chroma(
        collection_name=settings.chroma_collection_name,
        embedding_function=get_embeddings(),
        persist_directory=str(persist_dir),
    )


def _get_faiss_store() -> "FAISS":
    from langchain_community.vectorstores import FAISS
    persist_dir = Path(settings.faiss_persist_dir)
    persist_dir.mkdir(parents=True, exist_ok=True)
    path_str = str(persist_dir)
    embeddings = get_embeddings()
    if (persist_dir / "index.faiss").exists():
        return FAISS.load_local(path_str, embeddings, allow_dangerous_deserialization=True)
    # No index yet: create minimal store so we have a valid object (one placeholder doc)
    store = FAISS.from_texts(
        ["__placeholder__"],
        embeddings,
        metadatas=[{"source": "__placeholder__"}],
    )
    store.save_local(path_str)
    return store


def get_vector_store() -> Union["Chroma", "FAISS"]:
    """Get or create the vector store (Chroma on Python < 3.14, FAISS on 3.14+)."""
    if _USE_FAISS:
        return _get_faiss_store()
    return _get_chroma_store()


def add_documents(
    documents: list[Document],
    ids: Optional[list[str]] = None,
) -> None:
    """Add documents to the vector store (sync). Run via asyncio.to_thread from API."""
    if _USE_FAISS:
        persist_dir = Path(settings.faiss_persist_dir)
        persist_dir.mkdir(parents=True, exist_ok=True)
        path_str = str(persist_dir)
        embeddings = get_embeddings()
        from langchain_community.vectorstores import FAISS
        if (persist_dir / "index.faiss").exists():
            store = FAISS.load_local(path_str, embeddings, allow_dangerous_deserialization=True)
            store.add_documents(documents, ids=ids)
        else:
            store = FAISS.from_documents(documents, embeddings)
        store.save_local(path_str)
        return
    store = _get_chroma_store()
    store.add_documents(documents, ids=ids)


def similarity_search(query: str, k: int = 4) -> list[Document]:
    """Search for similar document chunks."""
    store = get_vector_store()
    # Prefer Max Marginal Relevance (MMR) to get diverse chunks across documents,
    # so comparison-style questions see context from multiple files.
    try:
        docs = store.max_marginal_relevance_search(
            query,
            k=k,
            fetch_k=max(k * 3, k + 4),
        )
    except AttributeError:
        docs = store.similarity_search(query, k=k)
    if _USE_FAISS:
        docs = [d for d in docs if d.metadata.get("source") != "__placeholder__"]
    return docs


def get_collection_count() -> int:
    """Return number of documents in the collection."""
    store = get_vector_store()
    if _USE_FAISS:
        return len(store.docstore._dict) if hasattr(store, "docstore") else 0
    return store._collection.count()
