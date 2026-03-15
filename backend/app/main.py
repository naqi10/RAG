import threading  # prompt v3 + llama-3.3-70b
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .routes import pdf, rag, settings, quiz, notes, analytics, mindmap
from .routes import auth_routes, admin, conversations, workspaces, library
from .database import engine, SessionLocal, Base
from .models import User
from .auth import hash_password
from .services.memory import memory
from .utils.config import ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_TTL_HOURS, DEV_SYNC_ADMIN
from .utils.logger import logger

load_dotenv()
logger.info("Environment variables loaded.")

# Create tables (won't touch existing ones)
Base.metadata.create_all(bind=engine)
logger.info("Database tables verified.")

app = FastAPI(title="RAG PDF Chatbot")

# ── Routes ──
app.include_router(auth_routes.router, prefix="/auth", tags=["auth"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"])
app.include_router(library.router, prefix="/library", tags=["library"])
app.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
app.include_router(pdf.router, prefix="/pdf", tags=["pdf"])
app.include_router(rag.router, prefix="/rag", tags=["rag"])
app.include_router(settings.router, prefix="/settings", tags=["settings"])
app.include_router(quiz.router, prefix="/quiz", tags=["quiz"])
app.include_router(notes.router, prefix="/notes", tags=["notes"])
app.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
app.include_router(mindmap.router, prefix="/mindmap", tags=["mindmap"])

# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Seed admin user on startup ──
@app.on_event("startup")
def seed_admin():
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if not admin_user:
            admin_user = User(
                email=ADMIN_EMAIL,
                password_hash=hash_password(ADMIN_PASSWORD),
                display_name="Admin",
                role="admin",
            )
            db.add(admin_user)
            db.commit()
            logger.info(f"Admin user created: {ADMIN_EMAIL}")
        elif DEV_SYNC_ADMIN:
            # Keep local/dev auth deterministic only when explicitly enabled.
            admin_user.password_hash = hash_password(ADMIN_PASSWORD)
            admin_user.role = "admin"
            if not admin_user.display_name:
                admin_user.display_name = "Admin"
            db.commit()
            logger.info(f"Admin user synced from .env: {ADMIN_EMAIL}")
        else:
            logger.info("Admin user exists. Skipping password sync (DEV_SYNC_ADMIN=false).")
    finally:
        db.close()


# ── Background TTL cleanup (runs every hour) ──
def _schedule_cleanup():
    def cleanup():
        try:
            memory.cleanup_inactive(ttl_hours=SESSION_TTL_HOURS)
            logger.info("Memory cleanup completed.")
        except Exception as e:
            logger.warning(f"Memory cleanup error: {e}")
        _schedule_cleanup()

    timer = threading.Timer(3600, cleanup)
    timer.daemon = True
    timer.start()


@app.on_event("startup")
def start_cleanup_scheduler():
    _schedule_cleanup()
    logger.info(f"Background cleanup scheduled (TTL={SESSION_TTL_HOURS}h).")
