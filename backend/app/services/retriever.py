from app.services.vectordb import vectorstore

def get_retriever(k: int = 4):
    return vectorstore.as_retriever(k=k)
