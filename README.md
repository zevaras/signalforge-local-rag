# SignalForge – Local AI Document Q&A

A simple local AI application that runs an open-source LLM (Ollama) and answers questions from uploaded documents using a RAG pipeline and ChromaDB.

## Architecture

```
User Interface (HTML/JS + Bulma)
        │
        │ REST API
        ▼
FastAPI Server
        │
Document Processing (PDF, TXT, MD → chunks)
        │
        ▼
Vector Database (ChromaDB)
        │
        ▼
Local LLM (Ollama)
        │
        ▼
Answer Generation
```

## Prerequisites

- **Python 3.11+** (including 3.14). On **Python 3.14**, the app uses **FAISS** for the vector store instead of ChromaDB (ChromaDB has a Pydantic compatibility issue on 3.14). On Python 3.11/3.12, ChromaDB is used.
- **Ollama** installed and running ([ollama.ai](https://ollama.ai))
  - Pull a model: `ollama pull llama3` or `ollama pull mistral`
  - Pull embedding model: `ollama pull nomic-embed-text`
  - Ollama API: `http://localhost:11434`

## Setup

```bash
cd signalforge
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run

1. Start Ollama (if not already running): `ollama serve` or run the Ollama app.
2. Start the app:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

3. Open **http://localhost:8000** in your browser.

## Usage

1. **Upload** – Choose PDF, TXT, or Markdown files and click **Upload**. Text is extracted, chunked, and embedded into ChromaDB.
2. **Ask** – Type a question (e.g. “What does the document say about MQTT?”). The app retrieves relevant chunks and generates an answer with the local LLM.
3. **Documents** – Use “Refresh list” to see uploaded files.

## API Endpoints

| Method | Endpoint      | Description        |
|--------|---------------|--------------------|
| POST   | `/api/upload` | Upload documents   |
| POST   | `/api/ask`    | Ask a question     |
| GET    | `/api/documents` | List uploaded docs |
| GET    | `/health`     | Health check       |

## Troubleshooting

- **"coroutine was never awaited"** – Fixed by making `add_documents` synchronous and calling it via `asyncio.to_thread` in the upload route.
- **"unable to infer type for attribute chroma_server_nofile"** – You are on **Python 3.14** and ChromaDB was loaded. The app automatically uses **FAISS** on Python 3.14 (no ChromaDB). Ensure you didn’t force Chroma; if the error persists, reinstall deps and restart. On 3.11/3.12, ChromaDB is used; if you see this there, try `rm -rf data/chroma_db` and re-upload.
- **LangChainDeprecationWarning for Chroma** – On Python &lt; 3.14 the app uses `langchain-chroma`. On 3.14 it uses FAISS (langchain_community.vectorstores.FAISS).

## Configuration

Environment variables (optional, with defaults):

- `SIGNALFORGE_OLLAMA_BASE_URL` – Ollama API URL (default: `http://127.0.0.1:11434`). If you get "Failed to connect to Ollama", try `http://localhost:11434` or ensure Ollama is running (`ollama serve`).
- `SIGNALFORGE_OLLAMA_MODEL` – Chat model (default: `llama3`)
- `SIGNALFORGE_OLLAMA_EMBEDDING_MODEL` – Embedding model (default: `nomic-embed-text`)
- `SIGNALFORGE_OLLAMA_TIMEOUT` – Request timeout in seconds (default: `120`). Increase if the first request times out while the model loads.
- `SIGNALFORGE_CHROMA_PERSIST_DIR` – ChromaDB path when using Python &lt; 3.14 (default: `data/chroma_db`)
- `SIGNALFORGE_FAISS_PERSIST_DIR` – FAISS index path when using Python 3.14+ (default: `data/faiss_db`)
- `SIGNALFORGE_UPLOADS_DIR` – Uploaded files path (default: `data/uploads`)

Embedding model is set in `app/services/embedding_service.py` (default: `nomic-embed-text`). Ensure it is pulled in Ollama: `ollama pull nomic-embed-text`.

## Project Structure

```
project/
  app/
    main.py
    config.py
    api/routes.py
    services/
      rag_service.py
      embedding_service.py
      document_loader.py
    llm/ollama_client.py
    db/vector_store.py
  frontend/
    index.html
    app.js
  data/
    uploads/
  requirements.txt
```

## License

MIT
