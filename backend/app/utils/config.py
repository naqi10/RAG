import os
from pathlib import Path
from dotenv import load_dotenv

# ROOT = backend/app/ (for data directories)
ROOT = Path(__file__).resolve().parents[1]
# .env is at backend/.env (one level above ROOT)
BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_ROOT / ".env")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# LLM Provider (ollama | groq | openai)
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")

PDF_DIR = os.getenv("PDF_DIR", str(ROOT / "data" / "pdfs"))
VECTORSTORE_DIR = os.getenv("VECTORSTORE_DIR", str(ROOT / "data" / "vector_store"))
DATA_DIR = str(ROOT / "data")
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", 1000))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", 100))

# Database (SQLite by default, set DATABASE_URL for PostgreSQL)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{ROOT / 'data' / 'app.db'}")

# Auth
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = int(os.getenv("JWT_EXPIRY_DAYS", "7"))
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@pdfchat.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
MAX_USERS = int(os.getenv("MAX_USERS", "5"))
SESSION_TTL_HOURS = int(os.getenv("SESSION_TTL_HOURS", "72"))

# ensure directories exist
os.makedirs(PDF_DIR, exist_ok=True)
os.makedirs(VECTORSTORE_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
