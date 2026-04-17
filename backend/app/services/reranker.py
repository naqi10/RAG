"""
Cross-Encoder Reranker for RAG pipeline.

Pipeline: Retriever (k=10) → Reranker (cross-encoder) → Top N → LLM

Models (in order of preference):
  1. BAAI/bge-reranker-large    — highest accuracy, ~1.3 GB
  2. cross-encoder/ms-marco-MiniLM-L-6-v2 — fast fallback, ~80 MB
"""

import os
from typing import List, Tuple, Any, Optional
from ..utils.logger import logger

_reranker = None
_RERANKER_MODEL = os.getenv(
    "RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2"
)
_FALLBACK_MODEL = "BAAI/bge-reranker-large"


def _load_reranker():
    """Lazy-load the cross-encoder model on first use."""
    global _reranker
    if _reranker is not None:
        return _reranker

    from sentence_transformers import CrossEncoder

    for model_name in [_RERANKER_MODEL, _FALLBACK_MODEL]:
        try:
            logger.info(f"Loading reranker model: {model_name} ...")
            _reranker = CrossEncoder(model_name, max_length=512)
            logger.info(f"Reranker ready: {model_name}")
            return _reranker
        except Exception as e:
            logger.warning(f"Failed to load {model_name}: {e}")

    logger.error("No reranker model could be loaded. Reranking disabled.")
    return None


def rerank_documents(
    query: str,
    documents: List[Any],
    top_n: int = 3,
) -> List[Any]:
    """
    Rerank retrieved documents using a cross-encoder.

    Args:
        query: The user's question.
        documents: LangChain Document objects from the retriever.
        top_n: How many top docs to return after reranking.

    Returns:
        Top-N documents sorted by relevance (highest first).
        Falls back to original order (truncated) if reranker unavailable.
    """
    if not documents:
        return documents

    model = _load_reranker()
    if model is None:
        logger.warning("Reranker unavailable — returning first %d docs as-is.", top_n)
        return documents[:top_n]

    # Build query-document pairs
    pairs: List[Tuple[str, str]] = []
    for doc in documents:
        text = getattr(doc, "page_content", None) or str(doc)
        pairs.append((query, text))

    try:
        scores = model.predict(pairs)
    except Exception as e:
        logger.error(f"Reranker prediction failed: {e}")
        return documents[:top_n]

    # Pair scores with original documents, sort descending
    scored = sorted(zip(scores, documents), key=lambda x: x[0], reverse=True)

    top_docs = [doc for _, doc in scored[:top_n]]

    if logger.isEnabledFor(10):  # DEBUG level
        for rank, (score, doc) in enumerate(scored[:top_n]):
            snippet = (getattr(doc, "page_content", "") or "")[:80]
            logger.debug(f"  Rerank #{rank+1} score={score:.4f} | {snippet}...")

    logger.info(
        f"Reranked {len(documents)} docs → top {len(top_docs)} "
        f"(best={scored[0][0]:.4f}, worst kept={scored[min(top_n-1, len(scored)-1)][0]:.4f})"
    )

    return top_docs


def rerank_documents_with_scores(
    query: str,
    documents: List[Any],
    top_n: int = 3,
) -> Tuple[List[Any], float]:
    """
    Rerank and also return the top (best) rerank score.

    Returns:
        (top_docs, best_score) — best_score is the highest cross-encoder
        score among all candidates. Returns -1.0 if reranker unavailable.
    """
    if not documents:
        return documents, -1.0

    model = _load_reranker()
    if model is None:
        logger.warning("Reranker unavailable — returning first %d docs as-is.", top_n)
        return documents[:top_n], -1.0

    pairs: List[Tuple[str, str]] = []
    for doc in documents:
        text = getattr(doc, "page_content", None) or str(doc)
        pairs.append((query, text))

    try:
        scores = model.predict(pairs)
    except Exception as e:
        logger.error(f"Reranker prediction failed: {e}")
        return documents[:top_n], -1.0

    scored = sorted(zip(scores, documents), key=lambda x: x[0], reverse=True)
    top_docs = [doc for _, doc in scored[:top_n]]
    best_score = float(scored[0][0])

    if logger.isEnabledFor(10):
        for rank, (score, doc) in enumerate(scored[:top_n]):
            snippet = (getattr(doc, "page_content", "") or "")[:80]
            logger.debug(f"  Rerank #{rank+1} score={score:.4f} | {snippet}...")

    logger.info(
        f"Reranked {len(documents)} docs → top {len(top_docs)} "
        f"(best={best_score:.4f}, worst kept={scored[min(top_n-1, len(scored)-1)][0]:.4f})"
    )

    return top_docs, best_score
