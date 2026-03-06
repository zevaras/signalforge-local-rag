"""Document loading and text extraction for PDF, TXT, and Markdown."""
from pathlib import Path
from typing import Optional

from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings


ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".markdown"}


def get_loader_for_path(file_path: Path):
    """Return the appropriate loader for the file type."""
    suffix = file_path.suffix.lower()
    path_str = str(file_path)
    if suffix == ".pdf":
        return PyPDFLoader(path_str)
    if suffix in (".txt", ".md", ".markdown"):
        return TextLoader(path_str, encoding="utf-8", autodetect_encoding=True)
    raise ValueError(f"Unsupported file type: {suffix}")


def load_document(file_path: Path) -> list[Document]:
    """Load a single document and return list of LangChain Documents."""
    if file_path.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file type. Allowed: {ALLOWED_EXTENSIONS}")
    loader = get_loader_for_path(file_path)
    return loader.load()


def split_documents(documents: list[Document]) -> list[Document]:
    """Split documents into chunks."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    return splitter.split_documents(documents)
