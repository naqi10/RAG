from langchain_huggingface import HuggingFaceEmbeddings

def get_embedder():
    # small, fast embedding model
    return HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
