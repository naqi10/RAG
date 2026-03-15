import json
import re
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import PromptTemplate

from ..services.intent import detect_intent
from ..services.llm import get_llm
from ..services.vectordb import vectorstore
from ..services.memory import memory
from ..services.reranker import rerank_documents
from ..services import profile as profile_svc
from ..services.prompt import (
    build_qa_prompt,
    build_summarize_prompt,
    build_json_prompt,
    build_exam_prompt,
    build_flashcard_prompt,
    SYSTEM_INSTRUCTIONS,
)
from ..utils.logger import logger

# ── Reranker config ──
RETRIEVER_K = 10   # fetch this many from FAISS
RERANK_TOP_N = 3   # keep this many after cross-encoder reranking
FALLBACK_DOC_POOL = 40  # metadata-only fallback pool size (strictly selected PDFs/workspace)
from ..database import get_db
from ..models import User, Conversation, Message, WorkspacePDF
from ..auth import get_current_user

router = APIRouter()


# ── Request models ──
class QueryRequest(BaseModel):
    query: str
    k: Optional[int] = 4
    conversation_id: Optional[str] = None
    workspace_id: Optional[str] = None
    active_pdf_ids: Optional[List[str]] = None


class FlashcardRequest(BaseModel):
    query: str
    k: Optional[int] = 4
    conversation_id: Optional[str] = None
    workspace_id: Optional[str] = None
    active_pdf_ids: Optional[List[str]] = None
    n_cards: Optional[int] = 10


# ── Helpers ──
def _verify_conversation(convo_id: str, user: User, db: Session) -> Conversation:
    convo = db.query(Conversation).filter(
        Conversation.id == convo_id, Conversation.user_id == user.id
    ).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return convo


def _generate_title(query: str) -> str:
    """
    Generate a short, meaningful chat title from the user's first message.
    Strips common question openers, takes the core topic, and title-cases it.
    Examples:
      "what is regression analysis?" → "Regression Analysis"
      "explain binary search trees"  → "Binary Search Trees"
      "how does gradient descent work" → "Gradient Descent"
    """
    q = query.strip()
    # Remove filler openers (longest first to avoid partial matches)
    openers = [
        "can you please explain", "can you explain", "please explain",
        "can you tell me about", "tell me about", "tell me",
        "i want to know about", "i want to understand",
        "give me a summary of", "give me an overview of",
        "summarize", "summary of", "describe", "define",
        "what is the difference between", "what is the definition of",
        "what are the types of", "what are the main",
        "what is", "what are", "what does", "what do", "what was", "what were",
        "how does", "how do", "how is", "how are", "how can", "how to",
        "why does", "why do", "why is", "why are",
        "explain the concept of", "explain the", "explain",
        "who is", "who are", "when is", "where is",
    ]
    ql = q.lower()
    for opener in openers:
        if ql.startswith(opener):
            q = q[len(opener):].strip()
            ql = q.lower()
            break

    # Strip trailing punctuation
    q = re.sub(r"[?.!,;:]+$", "", q).strip()

    # Take first 5 meaningful words
    words = q.split()[:5]
    title = " ".join(words).title() if words else query[:40].title()

    # Cap length
    return title[:60] or "New Chat"


def _is_casual_message(query: str) -> bool:
    """Return True if the message is small-talk / greeting with no study intent.
    Covers English, Roman Urdu, and common mixed-language phrases.
    """
    import unicodedata
    q = query.lower().strip().rstrip("!?.,:; ")

    # ── Exact match pool (English + Roman Urdu) ──────────────────────────────
    exact = {
        # English greetings
        "hi", "hey", "hello", "hii", "hiii", "heya", "howdy", "yo", "sup",
        "good morning", "good afternoon", "good evening", "good night",
        "how are you", "how r u", "how are u", "how r you",
        "how's it going", "how is it going", "what's up", "whats up",
        "how do you do", "nice to meet you", "greetings",
        "thank you", "thanks", "thx", "ty", "thank u", "thankyou",
        "ok", "okay", "cool", "great", "awesome", "nice", "perfect", "got it",
        "bye", "goodbye", "see you", "see ya", "take care", "later",
        "who are you", "what are you", "what can you do",
        # Roman Urdu greetings & small talk
        "assalam o alaikum", "assalam alaikum", "aoa", "salam",
        "kya haal hai", "kya haal ha", "kyaa haal hai", "kyaa haal ha",
        "kia haal hai", "kia haal ha", "kya hal hai", "kya hal ha",
        "kaisay ho", "kaisy ho", "kaisa ho", "kaise ho", "kaisy hain", "kaise hain",
        "theek ho", "theek hain", "thik ho", "thik hain",
        "kya chal raha hai", "kya chal rha hai", "kya ho raha hai",
        "aur sunao", "or sunao", "kya sunao", "kia sunao",
        "kya baat hai", "kia baat hai", "kya scene hai",
        "shukriya", "shukria", "mehrbani", "bohat shukriya",
        "khuda hafiz", "allah hafiz", "phir milenge",
        "achi baat", "theek hai", "thik hai", "bilkul", "zaroor",
        "kya naam hai tera", "tera naam kya hai", "aap ka naam",
        "kya kar rahy ho", "kya kar rhy ho", "kya kar rahe ho",
    }
    if q in exact:
        return True

    # ── Starts-with greeting patterns — no word-count limit ──────────────────
    # Catches "hi bro how are you how's the day going on" etc.
    casual_starts = (
        # English
        "hi ", "hi,", "hey ", "hey,", "hello ", "hello,",
        "good morning", "good afternoon", "good evening", "good night",
        "how are you", "how are u", "how r you", "how r u",
        "how's your", "how is your", "how's it", "how is it",
        "what's up", "whats up", "sup,", "sup ",
        "thanks ", "thank you", "thank u", "thankyou",
        "who are you", "what are you", "what can you do",
        "heyy", "heyyy", "hiii",
        # Roman Urdu
        "kya haal", "kyaa haal", "kia haal", "kya hal",
        "kaisay ho", "kaisy ho", "kaisa ho", "kaise ho",
        "aur sunao", "or sunao", "kya chal", "kia chal",
        "salam ", "assalam", "theek ho", "thik ho",
        "aap kaisy", "aap kaise", "tum kaisy", "tum kaise",
        "kya kar rahy", "kya kar rhy", "kya kar rahe",
        "bohat shukriya", "shukriya", "shukria",
    )
    if any(q.startswith(p) for p in casual_starts):
        return True

    # ── No-PDF-needed short messages: contains only small-talk words ──────────
    # e.g. "bro how are you", "yaar kya haal hai"
    words = set(q.split())
    greeting_tokens = {"hi", "hey", "hello", "bro", "yaar", "yar", "dost", "buddy",
                       "man", "mate", "dude", "sis", "sir", "madam"}
    small_talk_tokens = {"how", "are", "you", "doing", "going", "day", "night",
                         "morning", "evening", "life", "things", "sup", "what",
                         "hows", "ur", "r", "ok", "okay", "fine", "good", "great",
                         "kaisa", "kaisay", "kaisy", "kya", "kyaa", "chal", "raha",
                         "haal", "hal", "theek", "thik", "yaar", "bhai", "bro"}
    # Casual if: short-ish message AND starts with a greeting token AND all words are small-talk
    if len(q.split()) <= 15 and (words & greeting_tokens) and words.issubset(small_talk_tokens | greeting_tokens):
        return True

    # ── Single casual words ───────────────────────────────────────────────────
    if q in {"salam", "aoa", "hlo", "helo", "hii", "heyyy", "heyy",
             "theek", "thik", "bilkul", "zaroor", "achha", "acha"}:
        return True

    return False


def _get_active_pdf_ids(workspace_id: str, explicit_ids: Optional[List[str]], db: Session) -> List[str]:
    """Get active PDF IDs for a workspace. If explicit_ids given, use those; otherwise use DB is_active flag."""
    if explicit_ids:
        return explicit_ids
    if not workspace_id:
        return []
    active_pdfs = db.query(WorkspacePDF).filter(
        WorkspacePDF.workspace_id == workspace_id,
        WorkspacePDF.is_active.is_(True),
    ).all()
    return [p.id for p in active_pdfs]


def _load_history_from_db(convo_id: str, db: Session) -> List[Message]:
    """Load all messages for a conversation from DB."""
    return (
        db.query(Message)
        .filter(Message.conversation_id == convo_id)
        .order_by(Message.created_at)
        .all()
    )


def _format_db_history(db_messages: List[Message], recent: int = 30) -> str:
    """Format DB messages into a text string for LLM prompts.
    Always sends the last `recent` messages verbatim; older ones are
    noted so the LLM knows they exist and are retrieved via semantic search.
    """
    if not db_messages:
        return ""
    tail = db_messages[-recent:]
    older_count = len(db_messages) - len(tail)
    lines = []
    if older_count > 0:
        lines.append(
            f"[Note: This conversation has {older_count} older message(s). "
            "The most relevant ones are included above via semantic search.]"
        )
    for m in tail:
        role_label = "User" if m.role == "user" else "Assistant"
        # Truncate very long assistant messages to keep token count manageable
        text = m.text if m.role == "user" else m.text[:600] + ("..." if len(m.text) > 600 else "")
        lines.append(f"{role_label}: {text}")
    return "\n".join(lines)


def _save_message(db: Session, convo_id: str, role: str, text: str, meta: dict = None):
    """Save a message to the database."""
    msg = Message(
        conversation_id=convo_id,
        role=role,
        text=text,
        metadata_json=json.dumps(meta) if meta else None,
    )
    db.add(msg)
    db.commit()


def _resolve_page(metadata: Dict[str, Any]) -> Optional[int]:
    for candidate in [metadata.get("page"), metadata.get("page_number"), metadata.get("page_index")]:
        if candidate is None:
            continue
        try:
            v = int(candidate)
        except (TypeError, ValueError):
            continue
        if v < 0:
            return None
        return v + 1 if v == 0 else v
    return None


def _prepare_flashcard_prompt_template() -> PromptTemplate:
    template_body = """
{system_instructions}

You are assisting a student by turning retrieved document excerpts into flashcards.

Chat History:
{chat_history}

User Query:
{input}

Context:
{context}

Task:
Create {n_cards} concise flashcards. Each flashcard must include:
- question: a single sentence question or prompt
- answer: a concise answer grounded strictly in the context
- source: the supporting document name and, if available, the page number

Return strictly as a JSON array of objects using the keys 'question', 'answer', and 'source'.
Do not include any commentary outside the JSON array.
"""
    base_prompt = PromptTemplate(
        input_variables=["context", "input", "chat_history", "n_cards", "system_instructions"],
        template=template_body,
    )
    return base_prompt.partial(system_instructions=SYSTEM_INSTRUCTIONS)


def _deduplicate_sources(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set[Tuple[str, Optional[int]]] = set()
    unique: List[Dict[str, Any]] = []
    for c in chunks:
        key = (c.get("source") or "unknown", c.get("page"))
        if key not in seen:
            seen.add(key)
            unique.append({"source": key[0], "page": key[1]})
    return unique


def _parse_flashcards_output(raw_text: str) -> List[Dict[str, Any]]:
    if not raw_text:
        return []
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\[[\s\S]*\]", cleaned)
        if not match:
            raise
        payload = json.loads(match.group(0))
    if isinstance(payload, dict):
        payload = payload.get("flashcards") or payload.get("cards") or payload.get("data")
    if not isinstance(payload, list):
        raise ValueError("Flashcard payload is not a list.")
    normalized: List[Dict[str, Any]] = []
    for card in payload:
        if not isinstance(card, dict):
            continue
        question = card.get("question") or card.get("front") or card.get("prompt") or ""
        answer = card.get("answer") or card.get("back") or card.get("response") or ""
        source_info = card.get("source") or card.get("reference") or {}
        if isinstance(source_info, str):
            source_info = {"source": source_info, "page": None}
        elif not isinstance(source_info, dict):
            source_info = {"source": "unknown", "page": None}
        normalized.append({
            "question": question.strip(),
            "answer": answer.strip(),
            "source": {"source": source_info.get("source", "unknown"), "page": source_info.get("page")},
        })
    return [c for c in normalized if c["question"] and c["answer"]]


def _tokenize_text(text: str) -> set:
    return set(re.findall(r"\w+", text.lower()))


def _score_chunk_for_flashcard(card_text: str, chunk_text: str) -> float:
    if not card_text or not chunk_text:
        return 0.0
    card_tokens = _tokenize_text(card_text)
    if not card_tokens:
        return 0.0
    chunk_tokens = _tokenize_text(chunk_text)
    overlap = card_tokens.intersection(chunk_tokens)
    return len(overlap) / len(card_tokens) if overlap else 0.0


def _assign_sources_to_flashcards(flashcards: list, chunks: list) -> list:
    if not flashcards or not chunks:
        return flashcards
    for card in flashcards:
        best_chunk = None
        best_score = 0.0
        combined = f"{card.get('question', '')} {card.get('answer', '')}".strip()
        for chunk in chunks:
            score = _score_chunk_for_flashcard(combined, chunk.get("text", ""))
            if score > best_score:
                best_score = score
                best_chunk = chunk
        if best_chunk is None and chunks:
            best_chunk = chunks[0]
        chapter = best_chunk.get("chapter") if best_chunk else None
        source_name = chapter or (best_chunk.get("source") if best_chunk else "unknown")
        page_number = best_chunk.get("page") if best_chunk else None
        existing_source = card.get("source") if isinstance(card.get("source"), dict) else {}
        card["source"] = {
            "source": source_name or existing_source.get("source", "unknown"),
            "page": page_number if page_number is not None else existing_source.get("page"),
        }
    return flashcards




def _clean_llm_answer(answer: str) -> str:
    """
    Minimal post-processing: strip any Sources/Confidence tail the LLM wrote
    (the UI renders sources separately from metadata). Leave the natural answer intact.
    """
    out = answer.strip()
    # Strip Sources Referenced block
    out = re.sub(r"\n+\*{0,2}Sources\s+Referenced:?\*{0,2}[\s\S]*?(?=\n\n|\Z)", "", out, flags=re.IGNORECASE).strip()
    # Strip Confidence line
    out = re.sub(r"\n*\*{0,2}Confidence:?\*{0,2}\s*(High|Medium|Low)[^\n]*", "", out, flags=re.IGNORECASE).strip()
    # Strip any stray Windows file paths
    out = re.sub(r"\n?[A-Za-z]:\\[^\n]+", "", out).strip()
    # Strip 📄 source lines
    out = re.sub(r"\n?📄[^\n]+", "", out).strip()
    return out or "No answer generated."


# ═══════════════════════════════════════════
#  FLASHCARDS ENDPOINT
# ═══════════════════════════════════════════
@router.post("/flashcards")
def generate_flashcards_endpoint(
    req: FlashcardRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    convo_id = req.conversation_id
    if convo_id:
        _verify_conversation(convo_id, user, db)

    n_cards = req.n_cards if req.n_cards and req.n_cards > 0 else 10
    llm = get_llm()

    # Load history from DB
    chat_history_text = "No prior chat history."
    if convo_id:
        db_messages = _load_history_from_db(convo_id, db)
        memory.load_from_db(convo_id, db_messages)
        db_history = _format_db_history(db_messages)
        if db_history:
            chat_history_text = db_history
        similar_past = memory.search_semantic_memory(convo_id, req.query)
        if similar_past:
            chat_history_text += "\n\n[Related Past Conversations]\n" + "\n".join(similar_past)

    # Get active PDFs for workspace-scoped filtering
    active_pdf_ids = _get_active_pdf_ids(req.workspace_id, req.active_pdf_ids, db) if req.workspace_id else []

    # Strict filtered retrieval:
    # 1) active pdf_ids (preferred)  2) workspace_id fallback
    docs = []
    if active_pdf_ids:
        docs = vectorstore.search_with_filter(req.query, k=RETRIEVER_K, filter_dict={"pdf_id": active_pdf_ids})
        if not docs:
            # Generic prompts may fail semantic filter; fallback to selected PDFs only.
            docs = vectorstore.get_docs_by_metadata({"pdf_id": active_pdf_ids}, k=FALLBACK_DOC_POOL)
    elif req.workspace_id:
        docs = vectorstore.search_with_filter(req.query, k=RETRIEVER_K, filter_dict={"workspace_id": req.workspace_id})
        if not docs:
            docs = vectorstore.get_docs_by_metadata({"workspace_id": req.workspace_id}, k=FALLBACK_DOC_POOL)
    if not docs:
        raise HTTPException(status_code=404, detail="No relevant content found in your active documents.")

    # Cross-encoder reranking: pick the most relevant chunks
    used_docs = rerank_documents(req.query, docs, top_n=RERANK_TOP_N)

    chunks: list[dict] = []
    for doc in used_docs:
        md = getattr(doc, "metadata", {}) or {}
        chunks.append({
            "text": getattr(doc, "page_content", ""),
            "source": md.get("source", "unknown"),
            "chapter": md.get("chapter") or md.get("section"),
            "page": _resolve_page(md),
        })
    if not chunks:
        raise HTTPException(status_code=500, detail="Unable to prepare document chunks.")

    flashcard_prompt = _prepare_flashcard_prompt_template()
    try:
        combine_docs_chain = create_stuff_documents_chain(llm=llm, prompt=flashcard_prompt, document_variable_name="context")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to build flashcard chain: {exc}")

    invoke_payload = {
        "input": req.query,
        "chat_history": chat_history_text,
        "n_cards": str(n_cards),
        "context": used_docs,  # pass strictly filtered+reranked docs
        "system_instructions": SYSTEM_INSTRUCTIONS,
    }

    try:
        result = combine_docs_chain.invoke(invoke_payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Flashcard generation failed: {exc}")

    raw_answer = result if isinstance(result, str) else str(result)

    try:
        flashcards = _parse_flashcards_output(raw_answer)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to parse flashcards: {exc}")
    if not flashcards:
        raise HTTPException(status_code=502, detail="Model did not return any flashcards.")

    flashcards = flashcards[:n_cards]
    flashcards = _assign_sources_to_flashcards(flashcards, chunks)
    sources = _deduplicate_sources(chunks)

    try:
        summary_prompt = PromptTemplate.from_template(
            "You are a summarization assistant.\nSummarize the following content in 3-5 clear sentences.\n\nContent:\n{context}"
        )
        summary_chain = summary_prompt | llm
        summary_result = summary_chain.invoke({"context": "\n".join([c["text"] for c in chunks])})
        summary_text = summary_result.strip() if isinstance(summary_result, str) else str(summary_result)
    except Exception:
        summary_text = "Summary unavailable."

    # Save to DB and memory
    if convo_id:
        try:
            _save_message(db, convo_id, "user", req.query)
            _save_message(db, convo_id, "assistant", json.dumps({"flashcards": len(flashcards), "summary": summary_text}))
            memory.append(convo_id, "user", req.query)
            memory.append(convo_id, "assistant", f"Generated {len(flashcards)} flashcards")
        except Exception:
            logger.exception("Failed to save flashcard interaction")

    return {
        "task_type": "flashcards",
        "summary": summary_text,
        "flashcards": flashcards,
        "sources": sources,
        "context_count": len(chunks),
        "confidence": "Medium",
    }


# ═══════════════════════════════════════════
#  ASK (CHAT) ENDPOINT
# ═══════════════════════════════════════════
@router.post("/ask")
def ask(
    req: QueryRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    convo_id = req.conversation_id
    if convo_id:
        _verify_conversation(convo_id, user, db)

    llm = get_llm()
    max_lines = 0

    # ── Load / touch user profile ─────────────────────────────────────────────
    profile_svc.get_or_create(user.id, db)
    profile_context = profile_svc.build_profile_context(user, db)

    # Load history from DB
    formatted_history = ""
    if convo_id:
        db_messages = _load_history_from_db(convo_id, db)
        memory.load_from_db(convo_id, db_messages)
        formatted_history = _format_db_history(db_messages)
        similar_past = memory.search_semantic_memory(convo_id, req.query)
        if similar_past:
            formatted_history = (formatted_history + "\n\n[Related Past Conversations]\n" + "\n".join(similar_past)).strip()

    logger.info(f"Conversation {convo_id}: history lines={len(formatted_history.splitlines())}")

    # ── Casual / greeting short-circuit ──────────────────────────────────────
    if _is_casual_message(req.query):
        casual_system = profile_svc.build_casual_system_prompt(user, db)
        try:
            from langchain_core.messages import HumanMessage, SystemMessage
            casual_result = llm.invoke([SystemMessage(content=casual_system), HumanMessage(content=req.query)])
            casual_answer = casual_result.content if hasattr(casual_result, "content") else str(casual_result)
        except Exception:
            name = user.display_name or user.email.split("@")[0]
            casual_answer = f"Hey {name}! How are you doing? I'm here to help you study. What would you like to explore today? 😊"

        if convo_id:
            try:
                _save_message(db, convo_id, "user", req.query)
                _save_message(db, convo_id, "assistant", casual_answer)
                memory.append(convo_id, "user", req.query)
                memory.append(convo_id, "assistant", casual_answer)
                convo = db.query(Conversation).filter(Conversation.id == convo_id).first()
                if convo:
                    convo.updated_at = datetime.utcnow()
                    db.commit()
            except Exception:
                logger.exception("Failed to save casual message")

        return {"task_type": "casual", "answer": casual_answer, "sources": [], "confidence": "High", "context_count": 0}
    # ─────────────────────────────────────────────────────────────────────────

    # Get active PDFs for workspace-scoped filtering
    active_pdf_ids = _get_active_pdf_ids(req.workspace_id, req.active_pdf_ids, db) if req.workspace_id else []

    # Strict filtered retrieval:
    # 1) active pdf_ids (preferred)  2) workspace_id fallback
    docs = []
    if active_pdf_ids:
        docs = vectorstore.search_with_filter(req.query, k=RETRIEVER_K, filter_dict={"pdf_id": active_pdf_ids})
        if not docs:
            # Generic prompts (e.g., "key concepts") can miss in semantic stage.
            # Pull only selected-PDF chunks, then rerank.
            docs = vectorstore.get_docs_by_metadata({"pdf_id": active_pdf_ids}, k=FALLBACK_DOC_POOL)
    elif req.workspace_id:
        docs = vectorstore.search_with_filter(req.query, k=RETRIEVER_K, filter_dict={"workspace_id": req.workspace_id})
        if not docs:
            docs = vectorstore.get_docs_by_metadata({"workspace_id": req.workspace_id}, k=FALLBACK_DOC_POOL)
    if not docs:
        return {"answer": "No relevant content found in your active documents. Make sure PDFs are uploaded and active in the sidebar.", "sources": []}

    # Cross-encoder reranking: pick the most relevant chunks
    used_docs = rerank_documents(req.query, docs, top_n=RERANK_TOP_N)

    chunks = []
    for d in used_docs:
        md = getattr(d, "metadata", {}) or {}
        chunks.append({
            "text": d.page_content if hasattr(d, "page_content") else str(d),
            "source": md.get("source", "unknown"),
            "page": _resolve_page(md),
        })

    try:
        task_type = detect_intent(req.query)
        if task_type == "summary":
            prompt = build_summarize_prompt(chunks, formatted_history, style="friendly, simple, and clear")
        elif task_type == "flashcards":
            prompt = build_flashcard_prompt(chunks, formatted_history, n_cards=10)
        elif task_type == "exam":
            prompt = build_exam_prompt(chunks, formatted_history, n_questions=10, difficulty="mixed", format="MARKDOWN")
        elif task_type == "json":
            prompt = build_json_prompt(req.query, chunks, formatted_history)
        else:
            match = re.search(r"in (\d+)\s*lines", req.query.lower())
            max_lines = int(match.group(1)) if match else 0
            prompt = build_qa_prompt(req.query, chunks, formatted_history, style="friendly, simple, and clear", max_lines=max_lines)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prompt generation failed: {e}")

    # Personalized instructions (prepend user profile context)
    personalized_instructions = (
        f"{profile_context}\n\n---\n\n{SYSTEM_INSTRUCTIONS}" if profile_context else SYSTEM_INSTRUCTIONS
    )

    # ── Non-QA tasks (exam / summary / flashcards / json) ────────────────────
    # These prompts pre-format context as text via inline_context_chunks.
    # Invoking via create_stuff_documents_chain causes variable mismatch errors
    # because it re-parses the original template and finds task-specific vars
    # ({n_questions}, {difficulty}, {format}, etc.) that we never pass.
    # Fix: invoke the LLM directly with the fully-formatted prompt string.
    if task_type in ("exam", "summary", "flashcards", "json"):
        try:
            prompt_str = prompt.format()
            result = llm.invoke(prompt_str)
            answer = result.content if hasattr(result, "content") else str(result)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Chain invocation failed: {e}")

    # ── QA ────────────────────────────────────────────────────────────────────
    else:
        try:
            if hasattr(prompt, "input_variables") and "context" not in prompt.input_variables:
                prompt = PromptTemplate(
                    input_variables=list(prompt.input_variables) + ["context"],
                    template=(prompt.template if hasattr(prompt, "template") else str(prompt)) + "\n\n{context}",
                )
        except Exception:
            prompt = PromptTemplate(
                input_variables=["system_instructions", "context", "chat_history", "input", "style", "max_lines"],
                template="{system_instructions}\n\nChat History:\n{chat_history}\n\nContext:\n{context}\n\nQuestion:\n{input}\n\nStyle: {style}\nAnswer in {max_lines} lines (if specified).\n",
            )

        try:
            combine_docs_chain = create_stuff_documents_chain(llm=llm, prompt=prompt, document_variable_name="context")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to build retrieval chain: {e}")

        invoke_inputs: Dict[str, Any] = {
            "input": req.query,
            "chat_history": formatted_history,
            "max_lines": max_lines,
            "system_instructions": personalized_instructions,
            "style": "friendly, simple, and clear",
            "context": used_docs,
        }

        try:
            result = combine_docs_chain.invoke(invoke_inputs)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Chain invocation failed: {e}")

        answer = result.strip() if isinstance(result, str) else str(result)

    if not answer:
        answer = "No answer generated."

    # Sources now come directly from the filtered docs we passed into LLM
    source_docs = []
    for d in used_docs:
        md = getattr(d, "metadata", {}) or {}
        source_docs.append({"source": md.get("source", "unknown"), "page": _resolve_page(md)})

    # Post-process sources & confidence
    def _fmt_sources(sl):
        s, seen = [], set()
        for sd in sl:
            src, page = sd.get("source", "unknown"), sd.get("page")
            key = f"{src}|{page}"
            if key in seen:
                continue
            seen.add(key)
            s.append(f"{src} (page {page})" if page else src)
            if len(s) >= 3:
                break
        return s

    text_sources = _fmt_sources(source_docs)
    m = re.search(r"Confidence:\s*(High|Medium|Low)", answer, re.IGNORECASE)
    confidence = m.group(1).capitalize() if m else "Medium"
    answer = _clean_llm_answer(answer)
    if not answer.strip():
        answer = "I couldn't generate an answer from the document context. Try rephrasing your question."

    # Save to DB and memory
    if convo_id:
        try:
            meta = {"sources": source_docs[:3], "confidence": confidence, "task_type": task_type}
            _save_message(db, convo_id, "user", req.query)
            _save_message(db, convo_id, "assistant", answer, meta)
            memory.append(convo_id, "user", req.query)
            memory.append(convo_id, "assistant", answer)
            # Touch conversation updated_at
            convo = db.query(Conversation).filter(Conversation.id == convo_id).first()
            if convo:
                convo.updated_at = datetime.utcnow()
                db.commit()
        except Exception:
            logger.exception("Failed to save to memory/DB")

    # ── Update user profile with topics from this message ────────────────────
    try:
        profile_svc.update_from_message(user.id, req.query, db)
        short_summary = f"Asked about: {req.query[:120]}"
        profile_svc.update_last_topic_summary(user.id, short_summary, db)
    except Exception:
        pass  # profile update is best-effort

    # ── Auto-rename conversation on first real message (like ChatGPT) ─────────
    if convo_id:
        try:
            convo = db.query(Conversation).filter(Conversation.id == convo_id).first()
            if convo and convo.title in ("New Chat", "new chat", ""):
                convo.title = _generate_title(req.query)
                db.commit()
        except Exception:
            pass

    return {
        "task_type": task_type,
        "answer": answer.strip(),
        "sources": source_docs,
        "confidence": confidence,
        "context_count": len(chunks),
        "history_length": len(formatted_history.splitlines()),
    }
