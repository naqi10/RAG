from typing import Dict, List, Optional, Tuple
from threading import Lock
import time
import hashlib
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity


class ConversationMemory:
    """
    Hybrid memory system: semantic vector cache + summary.
    Messages persist in the database; this class provides fast
    in-memory semantic search over conversation history.
    """

    def __init__(
        self,
        max_messages: int = 50,
        summary_trigger: int = 20,
        max_vector_memory: int = 500,
    ):
        self._store: Dict[str, Dict] = {}
        self._lock = Lock()
        self.max_messages = max_messages
        self.summary_trigger = summary_trigger
        self.max_vector_memory = max_vector_memory
        self.embedder = None

    def _get_embedder(self):
        if self.embedder is None:
            self.embedder = SentenceTransformer("all-MiniLM-L6-v2")
        return self.embedder

    def _key(self, session_id: str) -> str:
        return hashlib.sha256(session_id.encode()).hexdigest()

    def _ensure_session(self, key: str) -> Dict:
        return self._store.setdefault(
            key,
            {
                "messages": [],
                "summary": "",
                "last_active": time.time(),
                "vectors": [],
                "loaded": False,
            },
        )

    def _summarize_conversation(self, messages: List[dict]) -> str:
        lines = []
        for msg in messages[-self.summary_trigger:]:
            role = msg["role"].capitalize()
            text = msg["text"].strip().replace("\n", " ")
            lines.append(f"{role}: {text[:120]}{'...' if len(text) > 120 else ''}")
        return "\n".join(lines)

    # ── Load from DB (called once per session on first access) ──
    def load_from_db(self, session_id: str, db_messages: list) -> None:
        """Load DB messages into semantic memory. Only runs once per session."""
        with self._lock:
            key = self._key(session_id)
            session = self._ensure_session(key)
            if session["loaded"]:
                return
            texts = []
            for m in db_messages:
                role = m.role if hasattr(m, "role") else m.get("role", "user")
                text = m.text if hasattr(m, "text") else m.get("text", "")
                session["messages"].append({"role": role, "text": text, "ts": time.time()})
                texts.append(text)
            # Batch encode all messages at once (much faster than one-by-one)
            if texts:
                try:
                    embeddings = self._get_embedder().encode(texts, batch_size=64, show_progress_bar=False)
                    for emb, text in zip(embeddings, texts):
                        session["vectors"].append((emb, text))
                except Exception:
                    pass
            if len(session["vectors"]) > self.max_vector_memory:
                session["vectors"] = session["vectors"][-self.max_vector_memory:]
            session["loaded"] = True
            session["last_active"] = time.time()

    # ── Append (in-memory only, DB save is done by routes) ──
    def append(self, session_id: str, role: str, text: str) -> None:
        with self._lock:
            key = self._key(session_id)
            session = self._ensure_session(key)
            session["messages"].append({"role": role, "text": text, "ts": time.time()})
            session["last_active"] = time.time()

            if len(session["messages"]) > self.summary_trigger:
                summary = self._summarize_conversation(session["messages"])
                session["summary"] += "\n" + summary
                session["messages"] = session["messages"][-self.max_messages:]

            try:
                emb = self._get_embedder().encode([text])[0]
                session["vectors"].append((emb, text))
                if len(session["vectors"]) > self.max_vector_memory:
                    session["vectors"].pop(0)
            except Exception:
                pass

    # ── Read history (from in-memory cache) ──
    def get(self, session_id: str) -> List[Tuple[str, str]]:
        with self._lock:
            key = self._key(session_id)
            session = self._store.get(key)
            if not session:
                return []
            history = []
            if session.get("summary"):
                history.append(("system", f"[Summary of past chats]\n{session['summary']}"))
            for msg in session["messages"]:
                history.append((msg["role"], msg["text"]))
            return history

    def get_formatted_history(self, session_id: str) -> str:
        history = self.get(session_id)
        return "\n".join([f"{role}: {text}" for role, text in history])

    # ── Semantic search ──
    def search_semantic_memory(
        self, session_id: str, query: str, top_k: int = 3
    ) -> List[str]:
        with self._lock:
            key = self._key(session_id)
            session = self._store.get(key)
            if not session or not session.get("vectors"):
                return []
            query_vec = self._get_embedder().encode([query])[0]
            embeddings = np.array([v[0] for v in session["vectors"]])
            texts = [v[1] for v in session["vectors"]]
            sims = cosine_similarity([query_vec], embeddings)[0]
            top_idx = np.argsort(sims)[::-1][:top_k]
            return [texts[i] for i in top_idx]

    # ── Cleanup ──
    def clear(self, session_id: str) -> None:
        with self._lock:
            key = self._key(session_id)
            if key in self._store:
                del self._store[key]

    def cleanup_inactive(self, ttl_hours: int = 24) -> None:
        now = time.time()
        ttl = ttl_hours * 3600
        with self._lock:
            inactive = [
                sid for sid, s in self._store.items()
                if now - s["last_active"] > ttl
            ]
            for sid in inactive:
                del self._store[sid]


# Global singleton
memory = ConversationMemory()
