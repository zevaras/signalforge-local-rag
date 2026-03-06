"""RAG service: vector search + LLM answer generation."""
import asyncio

from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

from app.db.vector_store import similarity_search
from app.llm.ollama_client import get_llm


SYSTEM_PROMPT = """You are a helpful assistant that answers questions based only on the provided context from uploaded documents.
If the context does not contain relevant information, say so. Do not make up information.
Answer concisely and clearly."""

USER_PROMPT = """Context from documents:
{context}

Question: {question}

Answer:"""


def _format_docs(docs: list[Document]) -> str:
    formatted_chunks: list[str] = []
    for doc in docs:
        source = doc.metadata.get("source") or "Unknown source"
        formatted_chunks.append(f"[Source: {source}]\n{doc.page_content}")
    return "\n\n---\n\n".join(formatted_chunks)


def build_rag_chain():
    """Build the RAG chain: retriever -> prompt -> LLM -> parser."""
    # Use a slightly larger k so questions that implicitly involve multiple
    # documents are more likely to see context from each.
    retriever = lambda q: similarity_search(q, k=8)
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", USER_PROMPT),
    ])
    llm = get_llm()
    chain = (
        {"context": lambda x: _format_docs(retriever(x["question"])), "question": lambda x: x["question"]}
        | prompt
        | llm
        | StrOutputParser()
    )
    return chain


def ask_question_sync(question: str) -> str:
    """Run RAG synchronously (for use in thread)."""
    chain = build_rag_chain()
    return chain.invoke({"question": question})


async def ask_question(question: str) -> str:
    """Run RAG: retrieve context and generate answer."""
    return await asyncio.to_thread(ask_question_sync, question)
