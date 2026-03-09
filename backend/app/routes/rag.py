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


def _format_db_history(db_messages: List[Message]) -> str:
    """Format DB messages into a text string for LLM prompts."""
    if not db_messages:
        return ""
    lines = []
    for m in db_messages:
        lines.append(f"{m.role}: {m.text}")
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


def _strip_tail_sections(text: str) -> str:
    cleaned = re.sub(r"(?is)\n+sources\s+referenced:.*$", "", text).strip()
    cleaned = re.sub(r"(?is)\n+confidence:\s*(high|medium|low).*$", "", cleaned).strip()
    return cleaned


def _is_process_question(query: str) -> bool:
    q = query.lower()
    process_keywords = ("how to", "steps", "process", "procedure", "workflow", "implement", "configure")
    return any(k in q for k in process_keywords)


def _extract_sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip(" -\n\t") for p in parts if p and p.strip()]


def _looks_structured(text: str) -> bool:
    has_heading = bool(re.search(r"(?m)^##\s+", text))
    has_bullets = bool(re.search(r"(?m)^-\s+", text))
    has_numbers = bool(re.search(r"(?m)^\d+\.\s+", text))
    return has_heading and (has_bullets or has_numbers)


def _to_structured_answer(
    answer: str,
    query: str,
    text_sources: List[str],
    confidence: str,
) -> str:
    raw = _strip_tail_sections(answer)
    sentences = _extract_sentences(raw)
    short_answer = sentences[0] if sentences else (raw or "No answer generated.")

    key_points = sentences[:7] if sentences else [short_answer]
    if len(key_points) < 3 and len(sentences) >= 1:
        key_points = (sentences + [short_answer])[:3]

    lines = [
        "## Short Answer",
        short_answer,
        "",
        "## Key Points",
    ]
    for kp in key_points[:7]:
        lines.append(f"- {kp}")

    if _is_process_question(query):
        lines.extend(["", "## Steps / Numbered Explanation"])
        for idx, step in enumerate(key_points[:5], start=1):
            lines.append(f"{idx}. {step}")

    lines.extend(["", "## Sources"])
    if text_sources:
        for src in text_sources:
            lines.append(f"- {src}")
    else:
        lines.append("- None")

    lines.extend(["", f"Confidence: {confidence}"])
    return "\n".join(lines).strip()


# ═══════════════════════════════════════════
#  FLASHCARDS ENDPOINT
# ═══════════════════════════════════════════
@router.post("/flashcards")
def generate_flashcards_endpoint(
    req: FlashcardRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if vectorstore.store is None:
        raise HTTPException(status_code=400, detail="No documents indexed. Upload PDFs first.")

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
    if vectorstore.store is None:
        raise HTTPException(status_code=400, detail="No documents indexed. Upload PDFs first.")

    convo_id = req.conversation_id
    if convo_id:
        _verify_conversation(convo_id, user, db)

    llm = get_llm()
    max_lines = 0

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
        "system_instructions": SYSTEM_INSTRUCTIONS,
        "style": "friendly, simple, and clear",
        "context": used_docs,  # pass strictly filtered+reranked docs
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
    answer = _to_structured_answer(answer, req.query, text_sources, confidence)
    # Enforce contract strictly. If model returned plain paragraph, formatter guarantees headings/bullets.
    if not _looks_structured(answer):
        answer = _to_structured_answer("No answer generated.", req.query, text_sources, confidence)

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

    return {
        "task_type": task_type,
        "answer": answer.strip(),
        "sources": source_docs,
        "confidence": confidence,
        "context_count": len(chunks),
        "history_length": len(formatted_history.splitlines()),
    }
