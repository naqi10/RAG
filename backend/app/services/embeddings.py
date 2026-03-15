from langchain_huggingface import HuggingFaceEmbeddings

_embedder = None


def get_embedder():
    global _embedder
    if _embedder is None:
        # Load once, then reuse to avoid repeated model init delays.
        _embedder = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    return _embedder
