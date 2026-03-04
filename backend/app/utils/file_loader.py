from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from ..utils.config import CHUNK_SIZE, CHUNK_OVERLAP

def load_pdf_chunks(file_path: str):
    """
    Return list[Document] that are chunked for embeddings & indexing.
    """
    loader = PyPDFLoader(file_path)
    docs = loader.load()  # list of Documents
    splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
    chunks = splitter.split_documents(docs)
    return chunks
