# Using SignalForge

This guide walks you through configuring and using SignalForge locally.

## 1. Clone and install

```bash
git clone https://github.com/<your-org-or-user>/signalforge.git
cd signalforge
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## 2. Configure models via `.env`

Copy the example file and adjust it for your machine:

```bash
cp .env.example .env
```

Edit `.env` and set:

- `SIGNALFORGE_OLLAMA_BASE_URL` – where your Ollama server runs.
- `SIGNALFORGE_OLLAMA_MODEL` – chat model, e.g. `llama3`, `mistral`, etc.
- `SIGNALFORGE_OLLAMA_EMBEDDING_MODEL` – embedding model, e.g. `nomic-embed-text`.
- `SIGNALFORGE_OLLAMA_TIMEOUT` – increase if the first request times out while the model loads.

Pull the models in Ollama:

```bash
ollama pull "$SIGNALFORGE_OLLAMA_MODEL"
ollama pull "$SIGNALFORGE_OLLAMA_EMBEDDING_MODEL"
```

## 3. Run the app

Start Ollama if it is not already running (Ollama desktop app or `ollama serve`).
Then start SignalForge:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000` in your browser.

## 4. Using the dashboard

- **Upload documents** – Select one or more PDF/TXT/Markdown files and click **Upload**.
- **Inspect uploaded docs** – The right sidebar shows the list of uploaded files.
- **Ask questions** – Use natural language questions. The system retrieves relevant chunks
  from **all** uploaded documents and passes them to the local LLM via a RAG pipeline.
  Comparison questions ("compare contract A vs contract B") are supported.

## 5. Production notes

- **Server**: For production, prefer running with multiple workers and without `--reload`, e.g.:

  ```bash
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
  ```

- **Security**: This demo exposes the API without authentication and is intended for
  trusted environments. If you expose it on a network, add authentication, rate limiting,
  and TLS termination at a reverse proxy (e.g. Nginx, Caddy, Traefik).

- **Persistence**:
  - On Python 3.11/3.12, embeddings are stored in ChromaDB under `data/chroma_db`.
  - On Python 3.14+, embeddings are stored in FAISS under `data/faiss_db`.

- **Backups**: To "reset" the knowledge base, stop the app and delete the vector store
  and uploads:

  ```bash
  rm -rf data/chroma_db data/faiss_db data/uploads/*
  ```

## 6. Project structure (high level)

- `app/` – FastAPI + RAG pipeline (document loading, embeddings, vector store, LLM client).
- `frontend/` – Single-page HTML/JS Bulma dashboard.
- `data/` – Uploaded files and vector store persistence.

For more detail, see `README.md`.
