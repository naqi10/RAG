import os
from ..services.embeddings import get_embedder
from langchain_community.vectorstores import FAISS
from ..utils.config import VECTORSTORE_DIR
from ..utils.logger import logger

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

# single instance to import anywhere
vectorstore = VectorStoreManager()
