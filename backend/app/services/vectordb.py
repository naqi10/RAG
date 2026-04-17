import os
from typing import List, Dict, Any, Optional
from ..services.embeddings import get_embedder
from langchain_community.vectorstores import FAISS
from ..utils.config import VECTORSTORE_DIR
from ..utils.logger import logger

# ── Hybrid search weights (must sum to 1.0) ──
VECTOR_WEIGHT = 0.6
BM25_WEIGHT = 0.4


class VectorStoreManager:
    def __init__(self, persist_directory: str = VECTORSTORE_DIR):
        self.persist_directory = persist_directory
        os.makedirs(self.persist_directory, exist_ok=True)
        self.store = None
        self._loaded = False

    def _ensure_loaded(self):
        if self._loaded:
            return
        self._loaded = True
        try:
            self.store = FAISS.load_local(
                self.persist_directory,
                get_embedder(),
                allow_dangerous_deserialization=True,
            )
            logger.info("Vector store loaded from disk.")
        except Exception:
            # Expected when store does not exist yet.
            self.store = None

    def add_documents(self, docs):
        if not docs:
            return
        self._ensure_loaded()
        if self.store is None:
            self.store = FAISS.from_documents(docs, get_embedder())
        else:
            self.store.add_documents(docs)
        self.store.save_local(self.persist_directory)

    def as_retriever(self, k: int = 4):
        self._ensure_loaded()
        if self.store is None:
            raise ValueError("Vector store is empty. Upload and index some docs first.")
        return self.store.as_retriever(search_kwargs={"k": k})

    def get_docs_by_metadata(self, filter_dict: dict, k: int = 6):
        """Return docs matching metadata filter without semantic search (for meta questions)."""
        self._ensure_loaded()
        if self.store is None or not filter_dict:
            return []
        matched = []
        for doc_id in self.store.docstore._dict:
            doc = self.store.docstore._dict[doc_id]
            md = doc.metadata or {}
            match = True
            for key, val in filter_dict.items():
                doc_val = md.get(key)
                if isinstance(val, list):
                    if doc_val not in val:
                        match = False
                        break
                else:
                    if doc_val != val:
                        match = False
                        break
            if match:
                matched.append(doc)
                if len(matched) >= k:
                    break
        return matched

    def delete_by_metadata(self, filter_dict: dict) -> int:
        """Delete all documents matching metadata filter. Returns count of deleted docs."""
        self._ensure_loaded()
        if self.store is None or not filter_dict:
            return 0
        ids_to_delete = []
        for doc_id, doc in list(self.store.docstore._dict.items()):
            md = doc.metadata or {}
            match = True
            for key, val in filter_dict.items():
                doc_val = md.get(key)
                if isinstance(val, list):
                    if doc_val not in val:
                        match = False
                        break
                else:
                    if doc_val != val:
                        match = False
                        break
            if match:
                ids_to_delete.append(doc_id)
        if not ids_to_delete:
            return 0
        deleted = self.store.delete(ids_to_delete)
        self.store.save_local(self.persist_directory)
        return len(ids_to_delete) if deleted else 0

    def search_with_filter(self, query: str, k: int = 6, filter_dict: dict = None):
        """
        Filtered similarity search. When filter_dict is provided, only returns
        documents whose metadata matches ALL filter key-value pairs.
        For list values, matches if the metadata value is IN the list.
        Fetches a large candidate pool to handle cases where matching docs are sparse.
        """
        self._ensure_loaded()
        if self.store is None:
            return []
        if filter_dict:
            # Fetch a large candidate pool since matching docs may be sparse
            total = len(self.store.docstore._dict) if hasattr(self.store, 'docstore') else 500
            fetch_count = min(max(k * 50, 200), total)
            results = self.store.similarity_search(query, k=fetch_count)
            filtered = []
            for doc in results:
                md = doc.metadata or {}
                match = True
                for key, val in filter_dict.items():
                    doc_val = md.get(key)
                    if isinstance(val, list):
                        if doc_val not in val:
                            match = False
                            break
                    else:
                        if doc_val != val:
                            match = False
                            break
                if match:
                    filtered.append(doc)
                if len(filtered) >= k:
                    break
            return filtered
        return self.store.similarity_search(query, k=k)

    def hybrid_search_with_filter(
        self, query: str, k: int = 10, filter_dict: dict = None
    ) -> List[Any]:
        """
        Hybrid search: combines FAISS vector similarity with BM25 keyword matching.

        1. Run vector search → get top candidates (up to 50)
        2. Run BM25 over those same candidates (avoids loading entire store)
        3. Normalize both score ranges to [0, 1]
        4. Merge with weighted average: VECTOR_WEIGHT * vec + BM25_WEIGHT * bm25
        5. Return top-k by hybrid score
        """
        self._ensure_loaded()
        if self.store is None:
            return []

        try:
            from rank_bm25 import BM25Okapi
        except ImportError:
            logger.warning("rank-bm25 not installed — falling back to vector-only search")
            return self.search_with_filter(query, k=k, filter_dict=filter_dict)

        # Step 1: Get a large pool of vector search results (up to 50 filtered)
        vector_pool_size = max(k * 5, 50)
        vector_candidates = self.search_with_filter(query, k=vector_pool_size, filter_dict=filter_dict)

        if not vector_candidates:
            return []

        if len(vector_candidates) <= k:
            # Not enough candidates to benefit from hybrid — return as-is
            return vector_candidates

        # Step 2: Run BM25 over the vector candidate pool
        corpus = []
        for doc in vector_candidates:
            text = getattr(doc, "page_content", "") or ""
            corpus.append(text.lower().split())

        query_tokens = query.lower().split()

        try:
            bm25 = BM25Okapi(corpus)
            bm25_scores = bm25.get_scores(query_tokens)
        except Exception as e:
            logger.warning(f"BM25 scoring failed: {e} — falling back to vector-only")
            return vector_candidates[:k]

        # Step 3: Normalize scores to [0, 1]
        # Vector scores: use position-based scoring (rank 0 = highest similarity)
        n = len(vector_candidates)
        raw_vec_scores = [(n - i) / n for i in range(n)]

        # Normalize vector scores
        vec_min = min(raw_vec_scores)
        vec_max = max(raw_vec_scores)
        vec_range = vec_max - vec_min
        if vec_range == 0:
            norm_vec = [1.0] * n
        else:
            norm_vec = [(s - vec_min) / vec_range for s in raw_vec_scores]

        # Normalize BM25 scores
        bm25_min = min(bm25_scores)
        bm25_max = max(bm25_scores)
        bm25_range = bm25_max - bm25_min
        if bm25_range == 0:
            norm_bm25 = [1.0] * n
        else:
            norm_bm25 = [(s - bm25_min) / bm25_range for s in bm25_scores]

        # Step 4: Compute hybrid scores
        hybrid_scored = []
        for i, doc in enumerate(vector_candidates):
            hybrid = VECTOR_WEIGHT * norm_vec[i] + BM25_WEIGHT * norm_bm25[i]
            hybrid_scored.append((hybrid, doc))

        # Step 5: Sort by hybrid score descending, return top-k
        hybrid_scored.sort(key=lambda x: x[0], reverse=True)

        top_docs = [doc for _, doc in hybrid_scored[:k]]

        logger.info(
            f"Hybrid search: {n} candidates → top {k} "
            f"(vec_weight={VECTOR_WEIGHT}, bm25_weight={BM25_WEIGHT}, "
            f"best_hybrid={hybrid_scored[0][0]:.4f})"
        )

        return top_docs


# single instance to import anywhere
vectorstore = VectorStoreManager()
