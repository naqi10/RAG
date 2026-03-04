# RAG PDF Workspace Assistant

A production-style, full-stack RAG application that lets users upload PDFs, organize them into workspaces, chat with document context, generate flashcards, and manage multi-user access with admin controls.

Built with:
- **Frontend:** React + Vite + Tailwind + Axios
- **Backend:** FastAPI + SQLAlchemy + JWT auth
- **RAG stack:** LangChain + FAISS + Cross-Encoder reranking

---

## What This Project Solves

Most PDF chat apps are single-threaded and lose context quickly.  
This project adds:
- Workspace-based document organization
- Multi-PDF retrieval control (toggle active PDFs)
- Persistent chat history in database
- Authenticated multi-user system (admin-managed users)
- Better answer quality via reranking pipeline:
  - `Retriever (k=10) -> Cross-Encoder Reranker (top 3) -> LLM`

---

## Core Features

- **Workspaces**
  - Create, rename, delete workspaces
  - Attach multiple PDFs to each workspace
  - Set tags per PDF
  - Toggle which PDFs are active for retrieval

- **Chat + RAG**
  - Context-aware Q&A with source references
  - Conversation history persistence
  - Workspace/PDF-scoped retrieval
  - Human-friendly response style (tone-aware)

- **Flashcards**
  - Generate flashcards from selected document context
  - Source attribution for cards
  - Export support

- **Auth + Admin**
  - JWT login/session flow
  - Admin seeding from environment
  - Admin can manage users (invite/activate/deactivate)

- **Export**
  - Export conversation history as JSON/TXT

---

## Repository Structure

```text
Sheeeen/
├─ backend/
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ models.py
│  │  ├─ database.py
│  │  ├─ auth.py
│  │  ├─ routes/
│  │  │  ├─ auth_routes.py
│  │  │  ├─ admin.py
│  │  │  ├─ workspaces.py
│  │  │  ├─ conversations.py
│  │  │  ├─ rag.py
│  │  │  └─ pdf.py
│  │  ├─ services/
│  │  │  ├─ vectordb.py
│  │  │  ├─ loader.py
│  │  │  ├─ memory.py
│  │  │  ├─ prompt.py
│  │  │  └─ reranker.py
│  │  └─ utils/
│  ├─ requirements.txt
│  └─ .env.example
├─ frontend/
│  ├─ src/
│  │  ├─ App.jsx
│  │  ├─ api/client.js
│  │  ├─ context/AuthContext.jsx
│  │  └─ components/
│  └─ package.json
└─ README.md
```

---


## RAG Retrieval Quality Pipeline

Current quality stack:
1. Retrieve top `k=10` semantic matches from FAISS
2. Rerank with Cross-Encoder (`BAAI/bge-reranker-large`, fallback to MS MARCO)
3. Keep top `3` chunks for final LLM answer generation

This improves answer correctness and reduces noisy context.

---

## Environment Variables

Create `backend/.env` (or copy from `backend/.env.example`):

```env
GROQ_API_KEY=...
OPENAI_API_KEY=...

LLM_PROVIDER=groq
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

JWT_SECRET=change-this-to-a-long-random-secret
ADMIN_EMAIL=admin@pdfchat.com
ADMIN_PASSWORD=change-this-password
MAX_USERS=5
SESSION_TTL_HOURS=72

# Optional PostgreSQL
# DATABASE_URL=postgresql://user:password@localhost:5432/pdfchat
```

> If `DATABASE_URL` is not set, SQLite is used by default.

---

## Local Setup

## 1) Backend

```bash
cd backend
python -m venv ..\.venv
..\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: `http://localhost:3000`

---


