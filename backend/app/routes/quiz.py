import json
import re
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..services.llm import get_llm
from ..services.vectordb import vectorstore
from ..services.reranker import rerank_documents
from ..services.prompt import (
    build_mcq_prompt, build_short_answer_prompt, build_grading_prompt,
    build_true_false_prompt, build_fill_blank_prompt,
    SYSTEM_INSTRUCTIONS,
)
from ..utils.logger import logger
from ..database import get_db
from ..models import User, Quiz, StudySession, WorkspacePDF
from ..auth import get_current_user

router = APIRouter()

RETRIEVER_K = 6
RERANK_TOP_N = 3


class QuizGenerateRequest(BaseModel):
    query: str
    workspace_id: str
    active_pdf_ids: Optional[List[str]] = None
    quiz_type: Optional[str] = "mcq"  # mcq, short_answer, true_false, fill_blank, mixed
    difficulty: Optional[str] = "mixed"
    n_questions: Optional[int] = 10


class QuizSubmitRequest(BaseModel):
    answers: List[dict]  # [{question_index: 0, answer: "A"}, ...]
    time_taken_seconds: Optional[int] = None


def _resolve_page(metadata):
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


def _get_active_pdf_ids(workspace_id, explicit_ids, db):
    if explicit_ids:
        return explicit_ids
    if not workspace_id:
        return []
    active_pdfs = db.query(WorkspacePDF).filter(
        WorkspacePDF.workspace_id == workspace_id,
        WorkspacePDF.is_active.is_(True),
    ).all()
    return [p.id for p in active_pdfs]


def _get_active_pdf_filenames(workspace_id, explicit_ids, db):
    if explicit_ids:
        pdfs = db.query(WorkspacePDF).filter(WorkspacePDF.id.in_(explicit_ids)).all()
    elif workspace_id:
        pdfs = db.query(WorkspacePDF).filter(
            WorkspacePDF.workspace_id == workspace_id,
            WorkspacePDF.is_active.is_(True),
        ).all()
    else:
        return []
    return [p.filename for p in pdfs if p.filename]


def _filter_docs_by_active_pdfs(docs, active_pdf_ids):
    if not active_pdf_ids:
        return docs
    filtered = []
    for d in docs:
        md = getattr(d, "metadata", {}) or {}
        if md.get("pdf_id") in active_pdf_ids:
            filtered.append(d)
    return filtered


def _parse_json_output(raw_text):
    """Parse JSON from LLM output, handling markdown code blocks."""
    if not raw_text:
        return {}
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            return json.loads(match.group(0))
        raise


@router.post("/generate")
def generate_quiz(
    req: QuizGenerateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if vectorstore.store is None:
        raise HTTPException(status_code=400, detail="No documents indexed. Upload PDFs first.")

    llm = get_llm()
    active_pdf_ids = _get_active_pdf_ids(req.workspace_id, req.active_pdf_ids, db)

    # Filtered retrieval with fallback chain:
    # 1. pdf_id → 2. workspace_id → 3. filename (legacy uploads)
    docs = []
    if active_pdf_ids:
        docs = vectorstore.search_with_filter(req.query, k=RETRIEVER_K, filter_dict={"pdf_id": active_pdf_ids})
    if not docs and req.workspace_id:
        docs = vectorstore.search_with_filter(req.query, k=RETRIEVER_K, filter_dict={"workspace_id": req.workspace_id})
    if not docs:
        filenames = _get_active_pdf_filenames(req.workspace_id, req.active_pdf_ids, db)
        if filenames:
            docs = vectorstore.search_with_filter(req.query, k=RETRIEVER_K, filter_dict={"filename": filenames})
    if not docs:
        raise HTTPException(status_code=404, detail="No relevant content found in your active documents.")

    used_docs = rerank_documents(req.query, docs, top_n=RERANK_TOP_N)

    chunks = []
    for d in used_docs:
        md = getattr(d, "metadata", {}) or {}
        chunks.append({
            "text": d.page_content if hasattr(d, "page_content") else str(d),
            "source": md.get("source", "unknown"),
            "page": _resolve_page(md),
        })
    if not chunks:
        raise HTTPException(status_code=500, detail="Unable to prepare document chunks.")

    n_questions = min(req.n_questions or 10, 20)
    quiz_type = req.quiz_type or "mcq"
    difficulty = req.difficulty or "mixed"

    # Build prompt based on quiz type
    if quiz_type == "short_answer":
        prompt = build_short_answer_prompt(chunks, "", n_questions=n_questions, difficulty=difficulty)
    elif quiz_type == "true_false":
        prompt = build_true_false_prompt(chunks, "", n_questions=n_questions, difficulty=difficulty)
    elif quiz_type == "fill_blank":
        prompt = build_fill_blank_prompt(chunks, "", n_questions=n_questions, difficulty=difficulty)
    elif quiz_type == "mixed":
        prompt = build_mcq_prompt(chunks, "", n_questions=n_questions, difficulty=difficulty)
    else:
        prompt = build_mcq_prompt(chunks, "", n_questions=n_questions, difficulty=difficulty)

    try:
        chain = prompt | llm
        result = chain.invoke({})
        raw_text = result.content if hasattr(result, "content") else str(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Quiz generation failed: {exc}")

    try:
        parsed = _parse_json_output(raw_text)
        questions = parsed.get("questions", [])
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to parse quiz output from LLM.")

    if not questions:
        raise HTTPException(status_code=502, detail="Model did not return any questions.")

    questions = questions[:n_questions]

    quiz = Quiz(
        workspace_id=req.workspace_id,
        user_id=user.id,
        title=f"Quiz: {req.query[:50]}",
        quiz_type=quiz_type,
        difficulty=difficulty,
        total_questions=len(questions),
        status="generated",
        questions_json=json.dumps(questions),
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "quiz_type": quiz_type,
        "difficulty": difficulty,
        "total_questions": len(questions),
        "questions": questions,
    }


@router.post("/{quiz_id}/submit")
def submit_quiz(
    quiz_id: str,
    req: QuizSubmitRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found.")

    questions = json.loads(quiz.questions_json)
    results = []
    correct_count = 0

    for ans in req.answers:
        idx = ans.get("question_index", 0)
        user_answer = ans.get("answer", "")
        if idx >= len(questions):
            continue

        q = questions[idx]
        q_type = q.get("_type", quiz.quiz_type or "mcq")

        # True/False grading (exact match)
        if q_type == "true_false" or (q_type not in ("fill_blank", "short_answer") and "correct_answer" in q and q.get("correct_answer", "").strip() in ("True", "False")):
            is_correct = user_answer.strip().lower() == q["correct_answer"].strip().lower()
            if is_correct:
                correct_count += 1
            results.append({
                "question_index": idx,
                "correct": is_correct,
                "user_answer": user_answer,
                "correct_answer": q["correct_answer"],
                "explanation": q.get("explanation", ""),
                "text_excerpt": q.get("text_excerpt", ""),
                "source": q.get("source", {}),
                "score": 100 if is_correct else 0,
            })

        # Fill-in-the-blank grading (case-insensitive + alternatives)
        elif q_type == "fill_blank" or "accept_alternatives" in q:
            correct_ans = q.get("correct_answer", "").strip().lower()
            alternatives = [a.strip().lower() for a in q.get("accept_alternatives", [])]
            all_accepted = [correct_ans] + alternatives
            user_clean = user_answer.strip().lower()
            is_correct = user_clean in all_accepted
            if is_correct:
                correct_count += 1
            results.append({
                "question_index": idx,
                "correct": is_correct,
                "user_answer": user_answer,
                "correct_answer": q["correct_answer"],
                "explanation": q.get("explanation", ""),
                "hint": q.get("hint", ""),
                "text_excerpt": q.get("text_excerpt", ""),
                "source": q.get("source", {}),
                "score": 100 if is_correct else 0,
            })

        # MCQ grading (direct comparison)
        elif "correct_answer" in q and "options" in q:
            is_correct = user_answer.strip().upper()[:1] == q["correct_answer"].strip().upper()[:1]
            if is_correct:
                correct_count += 1
            results.append({
                "question_index": idx,
                "correct": is_correct,
                "user_answer": user_answer,
                "correct_answer": q["correct_answer"],
                "explanation": q.get("explanation", ""),
                "text_excerpt": q.get("text_excerpt", ""),
                "source": q.get("source", {}),
                "score": 100 if is_correct else 0,
            })

        # Short-answer grading (LLM-based)
        elif "expected_answer" in q:
            try:
                grading_prompt = build_grading_prompt(
                    q["question"],
                    q["expected_answer"],
                    user_answer,
                    q.get("key_points", []),
                )
                llm = get_llm()
                chain = grading_prompt | llm
                grade_result = chain.invoke({})
                raw = grade_result.content if hasattr(grade_result, "content") else str(grade_result)
                grade = _parse_json_output(raw)
                score = int(grade.get("score", 0))
                if score >= 70:
                    correct_count += 1
                results.append({
                    "question_index": idx,
                    "correct": score >= 70,
                    "user_answer": user_answer,
                    "score": score,
                    "feedback": grade.get("feedback", ""),
                    "key_points_covered": grade.get("key_points_covered", []),
                    "key_points_missed": grade.get("key_points_missed", []),
                    "text_excerpt": q.get("text_excerpt", ""),
                    "source": q.get("source", {}),
                })
            except Exception:
                results.append({
                    "question_index": idx,
                    "correct": False,
                    "user_answer": user_answer,
                    "score": 0,
                    "feedback": "Grading failed. Please review manually.",
                })

    total = len(results)
    score_pct = round((correct_count / total) * 100) if total > 0 else 0

    quiz.score = score_pct
    quiz.max_score = 100
    quiz.status = "completed"
    quiz.completed_at = datetime.utcnow()
    quiz.answers_json = json.dumps(results)
    quiz.time_taken_seconds = req.time_taken_seconds
    db.commit()

    # Create study session record
    session = StudySession(
        user_id=user.id,
        workspace_id=quiz.workspace_id,
        session_type="quiz",
        duration_seconds=req.time_taken_seconds or 0,
        metadata_json=json.dumps({"quiz_id": quiz.id, "score": score_pct, "total": total}),
    )
    db.add(session)
    db.commit()

    return {
        "quiz_id": quiz.id,
        "score": score_pct,
        "correct": correct_count,
        "total": total,
        "results": results,
        "time_taken_seconds": req.time_taken_seconds,
    }


@router.get("/{quiz_id}")
def get_quiz(
    quiz_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found.")

    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "quiz_type": quiz.quiz_type,
        "difficulty": quiz.difficulty,
        "total_questions": quiz.total_questions,
        "score": quiz.score,
        "status": quiz.status,
        "questions": json.loads(quiz.questions_json),
        "answers": json.loads(quiz.answers_json) if quiz.answers_json else None,
        "time_taken_seconds": quiz.time_taken_seconds,
        "created_at": quiz.created_at.isoformat() if quiz.created_at else None,
        "completed_at": quiz.completed_at.isoformat() if quiz.completed_at else None,
    }


@router.get("/history")
def quiz_history(
    workspace_id: str = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    quizzes = (
        db.query(Quiz)
        .filter(Quiz.user_id == user.id, Quiz.workspace_id == workspace_id)
        .order_by(Quiz.created_at.desc())
        .limit(50)
        .all()
    )
    return {
        "quizzes": [
            {
                "quiz_id": q.id,
                "title": q.title,
                "quiz_type": q.quiz_type,
                "difficulty": q.difficulty,
                "total_questions": q.total_questions,
                "score": q.score,
                "status": q.status,
                "created_at": q.created_at.isoformat() if q.created_at else None,
            }
            for q in quizzes
        ]
    }


@router.post("/{quiz_id}/retry-wrong")
def retry_wrong_questions(
    quiz_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new quiz containing only the questions the user got wrong."""
    original = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == user.id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Quiz not found.")
    if original.status != "completed" or not original.answers_json:
        raise HTTPException(status_code=400, detail="Quiz has not been completed yet.")

    questions = json.loads(original.questions_json)
    answers = json.loads(original.answers_json)

    wrong_indices = {a["question_index"] for a in answers if not a.get("correct", False)}
    if not wrong_indices:
        raise HTTPException(status_code=400, detail="No wrong answers to retry. You got them all correct!")

    wrong_questions = [q for i, q in enumerate(questions) if i in wrong_indices]

    retry_quiz = Quiz(
        workspace_id=original.workspace_id,
        user_id=user.id,
        title=f"Retry: {original.title}",
        quiz_type=original.quiz_type,
        difficulty=original.difficulty,
        total_questions=len(wrong_questions),
        status="generated",
        questions_json=json.dumps(wrong_questions),
    )
    db.add(retry_quiz)
    db.commit()
    db.refresh(retry_quiz)

    return {
        "quiz_id": retry_quiz.id,
        "title": retry_quiz.title,
        "quiz_type": retry_quiz.quiz_type,
        "difficulty": retry_quiz.difficulty,
        "total_questions": len(wrong_questions),
        "questions": wrong_questions,
        "original_quiz_id": original.id,
    }


@router.delete("/{quiz_id}")
def delete_quiz(
    quiz_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found.")
    db.delete(quiz)
    db.commit()
    return {"detail": "Quiz deleted."}
