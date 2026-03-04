"""
Advanced prompt library for a professional academic RAG chatbot.

Features:
- System-level guardrails to avoid hallucination and insist on context.
- Multiple task prompts: QA, Summarize, Summarize with exact lines,
  Generate Exam Q/A, Generate Flashcards, JSON-structured responses.
- Helpers to build prompts dynamically with chat history and metadata.
- Citation format: [source_name | page: X] embedded in context (recommended).
"""

from typing import List, Dict
from langchain_core.prompts import PromptTemplate
import json

# ---------------------------
# 🔷 System / Global Instructions
# ---------------------------
SYSTEM_INSTRUCTIONS = """
You are StudyAI — an intelligent, highly conversational AI assistant built for deep PDF analysis.
You have ALREADY READ and INDEXED the user's uploaded PDF document. The Context section
below contains the most relevant excerpts retrieved from THEIR document using semantic search.

CORE BEHAVIOR:
- You behave like ChatGPT — natural, intelligent, human-like, and context-aware.
- Talk like a real person. Be warm, friendly, and genuinely helpful — not robotic.
- Maintain conversation memory. Understand follow-up questions like "explain more", "why?", "what about...".
- If the user references something from earlier in the chat, recall it and build on it.
- Always prioritize information from the provided PDF context.

CRITICAL — YOU HAVE THE DOCUMENT:
- The Context below IS from the user's uploaded PDF. You HAVE read it.
- If someone asks "did you read my PDF?", "can you see my document?", or similar:
  ALWAYS confirm YES, and briefly describe what you found in the context.
  Example: "Yes, I've read your document! It covers [topic]. What would you like to know?"
- NEVER say "I don't see a PDF" or "Could you attach a document?" — the document is
  already loaded and the Context comes directly from it.

WHEN THE ANSWER IS NOT IN THE PDF (CRITICAL BEHAVIOR):
- If the user asks something and the answer is NOT found in the PDF context, respond exactly like this:
  "I could not find this information in the uploaded PDF."
  Then IMMEDIATELY ask: "Would you still like me to explain this topic for you?"
- If the user then says "yes", "explain", "sure", "tell me", or gives a short topic/keyword
  (even 1-2 words like "machine learning" or "photosynthesis"), then:
  Explain the topic clearly and thoroughly using your own knowledge. Make it educational,
  easy to understand, and well-structured. BUT clearly mark it:
  "**Note:** This explanation is from my general knowledge, not from your PDF."
- If the Context partially covers the question, say: "Your document touches on this but
  doesn't fully cover it. Here's what I found:" then give the PDF-based answer, and ask
  if they'd like a broader explanation.

ACCURACY RULES (non-negotiable):
1. Answer STRICTLY from the provided Context when the information IS available. Never hallucinate PDF content.
2. Cite sources inline naturally: (Source: filename, page X) — keep it clean.
3. Be precise. If the document says something specific, quote or paraphrase accurately.
4. Explain step-by-step when the topic is complex.
5. Always end with: Sources Referenced (bullet list) and Confidence: High/Medium/Low.

TONE & STYLE:
- Be natural and conversational — like a knowledgeable friend helping with studies, not a robot.
- Use a human-like vibe: "Great question!", "Ah, that's interesting!", "Let me break this down for you..."
- Match the user's energy: casual question = casual answer, academic = academic.
- Explain clearly. Use analogies for complex concepts. Break things into bullet points.
- Keep answers focused and useful — thorough but not padded.
- Use markdown: **bold** for key terms, bullet lists, numbered steps when appropriate.
- If the user asks for a specific format ("in 5 lines", "as bullets"), follow it exactly.
- If the user seems confused, proactively simplify and offer examples.
"""

# ---------------------------
# 🔷 Helpers for formatting chat history & context
# ---------------------------
def format_chat_history(chat_history) -> str:
    """
    Accepts chat_history as either:
      - a list of dicts: [{'role': 'user'|'assistant', 'text': '...'}, ...]
      - a pre-formatted string (returned by memory.get_formatted_history)
    Returns a compact, prefixed text block suitable for prompts.
    """
    if not chat_history:
        return "No prior chat history."
    if isinstance(chat_history, str):
        return chat_history
    lines = []
    for turn in chat_history[-12:]:  # keep last 12 turns to reduce token usage
        role = turn.get("role", "user").upper()
        text = turn.get("text", "").strip()
        lines.append(f"{role}: {text}")
    return "\n".join(lines)


def inline_context_chunks(chunks: List[Dict]) -> str:
    """
    Compose context from a list of chunks with metadata:
    [{'text': '...', 'source': 'doc.pdf', 'page': 12}, ...]
    Returns formatted string with citations embedded so the model can cite easily.
    """
    lines = []
    for c in chunks:
        src = c.get("source", "unknown_source")
        page = c.get("page")
        page_part = f" | page: {page}" if page is not None else ""
        text = c.get("text", "").strip()
        lines.append(f"[SOURCE: {src}{page_part}] {text}")
    return "\n\n".join(lines)


# ---------------------------
# 🔷 Core Prompt Templates
# ---------------------------

# 1) Standard Retrieval QA (detailed, cites sources)
QA_PROMPT = PromptTemplate(
    input_variables=["system_instructions", "context", "input", "chat_history", "style", "max_lines"],
    template="""
{system_instructions}

Chat History:
{chat_history}

=== THE USER'S UPLOADED DOCUMENTS (retrieved via semantic search) ===
The text below was extracted from the user's uploaded PDF files. This IS their document.
DO NOT say "I don't see a PDF" or "no document attached" — the text below IS the PDF content.

{context}

=== END OF DOCUMENT EXCERPTS ===

User's Question:
{input}

Style: {style}
Line limit: {max_lines} (if "no limit", answer naturally; if a number, use exactly that many lines)

IMPORTANT RULES:
1. The text between "=== THE USER'S UPLOADED DOCUMENTS ===" and "=== END ===" is FROM the user's PDF files. You HAVE read their documents.
2. If the user asks "did you read my PDF/document?" — answer YES and describe what topics the excerpts above cover.
3. NEVER claim you cannot see, access, or read the user's document. The excerpts above ARE their document.
4. Answer using ONLY the document excerpts above. Do not make up information.
5. Cite sources: (Source: filename, page X).
6. End with: Sources Referenced (bullet list) and Confidence: High/Medium/Low.

Your response:
"""
)

# 2) Summarize prompt — with optional exact line limit
SUMMARIZE_PROMPT = PromptTemplate(
    input_variables=["system_instructions", "context", "chat_history", "style", "max_lines"],
    template="""
{system_instructions}

Chat History:
{chat_history}

Context (from the user's uploaded documents):
{context}

Task:
Summarize this content clearly and accurately.
- If max_lines > 0: use exactly {max_lines} lines.
- Otherwise: a clear paragraph followed by key takeaways.

Include:
- **Key Takeaways:** (3 insightful bullets)
- **Sources Referenced:** (up to 3, format: filename page X)
- **Confidence:** High/Medium/Low

Rules: Only use the Context. Do not invent facts.

Summary:
"""
)
# 3) JSON-structured answer (for UI or further processing)
JSON_PROMPT = PromptTemplate(
    input_variables=["context", "question", "chat_history", "style"],
    template="""
{system_instructions}

Chat History:
{chat_history}

Context:
{context}

User Question:
{question}

TASK:
Return a JSON object only (no extra commentary) with the following fields:
{
  "answer": "string (final answer, use markdown where helpful)",
  "sources": [{"source": "<source>", "page": <page_or_null>, "excerpt": "<short excerpt>"}],
  "summary": "2-line summary",
  "confidence": "High|Medium|Low",
  "follow_up": "A suggested clarifying follow-up question or null"
}

Rules:
- Populate "sources" with 0..3 items referenced in the answer.
- Do not include any explanations outside the JSON object.
"""
)

# 4) Exam Q/A generator: produce n QA pairs with difficulty tags
EXAM_PROMPT = PromptTemplate(
    input_variables=["context", "chat_history", "n_questions", "difficulty", "format"],
    template="""
{system_instructions}

Chat History:
{chat_history}

Context (source material to craft exam questions from):
{context}

Task:
Generate {n_questions} exam-style question-answer pairs pulled strictly from the Context.
Each item must contain:
- question_text
- answer_text (concise, correct)
- difficulty (one of: easy, medium, hard; default based on requested difficulty: {difficulty})
- source citation (SOURCE tag with page if available)

Return the results in the requested format: {format} (choices: "JSON" or "MARKDOWN").
If the Context lacks enough distinct facts, generate as many as possible and explicitly state the shortfall.
"""
)

# 5) Flashcard generator
FLASHCARD_PROMPT = PromptTemplate(
    input_variables=["system_instructions", "context", "chat_history", "n_cards", "summary_directive"],
    template="""
{system_instructions}

Chat History:
{chat_history}

Context:
{context}

Task:
You are an academic assistant generating {n_cards} concise flashcards that rely solely on the provided context.

Output requirements:
- Return a single JSON object with the keys:
  - "flashcards": an array of flashcard objects.
  - "summary": either a concise paragraph synthesizing the context or null. {summary_directive}
- Do not include any commentary or text outside the JSON object.

Each flashcard object must contain the keys:
- "question": one clear question or prompt grounded in the context.
- "answer": one or two factual sentences drawn only from the context.
- "difficulty": one of "Easy", "Medium", or "Hard" (choose what fits best for the card).
- "topic": a short topic label that groups related cards.
- "confidence": one of "High", "Medium", or "Low" based on the strength of the supporting evidence.
- "source": an object with:
  - "source": the document or chapter name.
  - "page": the page number (integer) or null if unavailable.

Quality rules:
- Use only information contained in the provided context.
- Ensure answers are accurate and cite the most relevant chunk.
- Distribute difficulty levels realistically across the flashcards.
""",
)
# 6) MCQ Quiz generator
MCQ_PROMPT = PromptTemplate(
    input_variables=["system_instructions", "context", "chat_history", "n_questions", "difficulty"],
    template="""
{system_instructions}

Chat History:
{chat_history}

Context (source material):
{context}

Task:
Generate {n_questions} multiple-choice questions from the Context.
Difficulty level: {difficulty}

Each question MUST have exactly this JSON structure:
{{
  "question": "The question text",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correct_answer": "A",
  "explanation": "Brief explanation of why this is correct",
  "text_excerpt": "The exact sentence or phrase from the context that the question is based on",
  "difficulty": "easy|medium|hard",
  "source": {{"source": "document name", "page": null}}
}}

Return a JSON object: {{"questions": [...]}}
Do not include any text outside the JSON.
"""
)

# 7) Short-answer quiz generator
SHORT_ANSWER_PROMPT = PromptTemplate(
    input_variables=["system_instructions", "context", "chat_history", "n_questions", "difficulty"],
    template="""
{system_instructions}

Chat History:
{chat_history}

Context:
{context}

Task:
Generate {n_questions} short-answer questions from the Context.
Difficulty: {difficulty}

Each question MUST have this JSON structure:
{{
  "question": "The question text",
  "expected_answer": "The ideal answer (2-3 sentences)",
  "key_points": ["point1", "point2"],
  "text_excerpt": "The exact sentence or phrase from the context that the question is based on",
  "difficulty": "easy|medium|hard",
  "source": {{"source": "document name", "page": null}}
}}

Return a JSON object: {{"questions": [...]}}
Do not include any text outside the JSON.
"""
)

# 8) True/False quiz generator
TRUE_FALSE_PROMPT = PromptTemplate(
    input_variables=["system_instructions", "context", "chat_history", "n_questions", "difficulty"],
    template="""
{system_instructions}

Chat History:
{chat_history}

Context (source material):
{context}

Task:
Generate {n_questions} true/false questions from the Context.
Difficulty level: {difficulty}

Each question MUST have exactly this JSON structure:
{{
  "question": "A clear statement that is either true or false",
  "correct_answer": "True" or "False",
  "explanation": "Brief explanation of why the statement is true or false, citing specific information from the context",
  "text_excerpt": "The exact sentence or phrase from the context that supports the answer",
  "difficulty": "easy|medium|hard",
  "source": {{"source": "document name", "page": null}}
}}

Guidelines:
- Make statements specific and unambiguous
- Mix true and false answers roughly equally
- For "hard" questions, use subtle distinctions or combine multiple facts
- For "easy" questions, use straightforward facts directly from the text
- The text_excerpt MUST be a real quote from the context, not invented

Return a JSON object: {{"questions": [...]}}
Do not include any text outside the JSON.
"""
)

# 9) Fill-in-the-blank quiz generator
FILL_BLANK_PROMPT = PromptTemplate(
    input_variables=["system_instructions", "context", "chat_history", "n_questions", "difficulty"],
    template="""
{system_instructions}

Chat History:
{chat_history}

Context (source material):
{context}

Task:
Generate {n_questions} fill-in-the-blank questions from the Context.
Difficulty level: {difficulty}

Each question MUST have exactly this JSON structure:
{{
  "question": "The sentence with _____ replacing the key term (use exactly 5 underscores: _____)",
  "correct_answer": "the exact word or short phrase that fills the blank",
  "accept_alternatives": ["alternative1", "alternative2"],
  "hint": "A brief hint to help the student (optional but recommended)",
  "explanation": "Brief explanation of why this is the correct answer",
  "text_excerpt": "The original complete sentence from the context before the blank was created",
  "difficulty": "easy|medium|hard",
  "source": {{"source": "document name", "page": null}}
}}

Guidelines:
- Remove a KEY term, concept, name, or number — not generic words
- The blank should test understanding, not just memory of random words
- accept_alternatives should include valid synonyms or abbreviations
- For "easy": blank out obvious key terms; for "hard": blank out specific details
- The text_excerpt MUST be the real original sentence from the context

Return a JSON object: {{"questions": [...]}}
Do not include any text outside the JSON.
"""
)

# 10) Answer grading prompt
ANSWER_GRADING_PROMPT = PromptTemplate(
    input_variables=["question", "expected_answer", "user_answer", "key_points"],
    template="""
You are grading a student's answer. Be fair but thorough.

Question: {question}
Expected Answer: {expected_answer}
Key Points to Cover: {key_points}
Student's Answer: {user_answer}

Grade the answer and return JSON only:
{{
  "score": 0,
  "feedback": "Specific feedback on what was correct or missing",
  "key_points_covered": [],
  "key_points_missed": []
}}

The score must be an integer from 0 to 100.
Do not include any text outside the JSON.
"""
)

# 9) Mind map prompt
MINDMAP_PROMPT = PromptTemplate(
    input_variables=["system_instructions", "context", "chat_history", "detail_level"],
    template="""
{system_instructions}

Chat History:
{chat_history}

Context:
{context}

Task:
Analyze the context and create a structured mind map representation.
Detail level: {detail_level} (overview, detailed, exhaustive)

Return a JSON object with this exact structure:
{{
  "title": "Central topic",
  "children": [
    {{
      "title": "Main Branch 1",
      "description": "Brief description",
      "children": [
        {{"title": "Sub-topic 1.1", "description": "...", "children": []}},
        {{"title": "Sub-topic 1.2", "description": "...", "children": []}}
      ]
    }}
  ],
  "summary": "2-3 sentence overview of the entire map"
}}

Rules:
- Create 3-6 main branches
- Each branch can have 2-5 sub-topics
- Sub-topics can have up to 3 further children
- Use only information from the Context
- Do not include any text outside the JSON
"""
)

# 10) Structured summary prompt
STRUCTURED_SUMMARY_PROMPT = PromptTemplate(
    input_variables=["system_instructions", "context", "chat_history", "format_type"],
    template="""
{system_instructions}

Chat History:
{chat_history}

Context:
{context}

Task:
Create a structured summary in {format_type} format. Return JSON only.

If format_type is "outline":
Return: {{"type": "outline", "title": "...", "sections": [{{"heading": "1. ...", "points": ["...", "..."], "subsections": []}}]}}

If format_type is "cornell":
Return: {{"type": "cornell", "cue_column": [{{"keyword": "...", "questions": ["..."]}}], "notes_column": [{{"topic": "...", "details": ["...", "..."]}}], "summary": "Bottom summary paragraph"}}

If format_type is "key_concepts":
Return: {{"type": "key_concepts", "concepts": [{{"name": "...", "definition": "...", "related": ["..."], "importance": 1}}]}}

Use only information from the Context. Do not include any text outside the JSON.
"""
)


# ---------------------------
# 🔷 Builder utilities
# ---------------------------
def build_qa_prompt(
    question: str,
    chunks: List[Dict],
    chat_history: List[Dict],
    style: str = "academic",
    max_lines: int = 0
) -> PromptTemplate:
    """
    Build a QA PromptTemplate instance ready to pass to the LLM.
    - max_lines: if 0 -> no line restriction; if >0 -> exact line requirement.
    """
    context_text = inline_context_chunks(chunks)
    chat_text = format_chat_history(chat_history)
    max_lines_val = max_lines if max_lines and isinstance(max_lines, int) and max_lines > 0 else "no limit"
    # Fill system instructions into the template variables
    filled = QA_PROMPT.partial(
        system_instructions=SYSTEM_INSTRUCTIONS,
        context=context_text,
        input=question,
        chat_history=chat_text,
        style=style,
        max_lines=max_lines_val,
    )
    return filled


def build_summarize_prompt(
    chunks: List[Dict],
    chat_history: List[Dict],
    style: str = "academic",
    max_lines: int = 0
) -> PromptTemplate:
    context_text = inline_context_chunks(chunks)
    chat_text = format_chat_history(chat_history)
    max_lines_val = max_lines if max_lines and isinstance(max_lines, int) and max_lines > 0 else "no limit"
    return SUMMARIZE_PROMPT.partial(
        system_instructions=SYSTEM_INSTRUCTIONS,
        context=context_text,
        chat_history=chat_text,
        style=style,
        max_lines=max_lines_val,
    )


def build_json_prompt(question: str, chunks: List[Dict], chat_history: List[Dict], style: str = "academic") -> PromptTemplate:
    context_text = inline_context_chunks(chunks)
    chat_text = format_chat_history(chat_history)
    return JSON_PROMPT.partial(
        system_instructions=SYSTEM_INSTRUCTIONS,
        context=context_text,
        question=question,
        chat_history=chat_text,
        style=style,
    )


def build_exam_prompt(chunks: List[Dict], chat_history: List[Dict], n_questions: int = 10, difficulty: str = "mixed", format: str = "JSON") -> PromptTemplate:
    context_text = inline_context_chunks(chunks)
    chat_text = format_chat_history(chat_history)
    return EXAM_PROMPT.partial(
        system_instructions=SYSTEM_INSTRUCTIONS,
        context=context_text,
        chat_history=chat_text,
        n_questions=str(n_questions),
        difficulty=difficulty,
        format=format,
    )


def build_flashcard_prompt(chunks: List[Dict], chat_history: List[Dict], n_cards: int = 10, include_summary: bool = False) -> PromptTemplate:
    context_text = inline_context_chunks(chunks)
    chat_text = format_chat_history(chat_history)
    summary_directive = "Include a brief summary." if include_summary else "If a summary would add no value, set it to null."
    return FLASHCARD_PROMPT.partial(
        system_instructions=SYSTEM_INSTRUCTIONS,
        context=context_text,
        chat_history=chat_text,
        n_cards=str(n_cards),
        summary_directive=summary_directive,
    )


def build_mcq_prompt(chunks: List[Dict], chat_history, n_questions: int = 10, difficulty: str = "mixed") -> PromptTemplate:
    context_text = inline_context_chunks(chunks)
    chat_text = format_chat_history(chat_history)
    return MCQ_PROMPT.partial(
        system_instructions=SYSTEM_INSTRUCTIONS,
        context=context_text,
        chat_history=chat_text,
        n_questions=str(n_questions),
        difficulty=difficulty,
    )


def build_short_answer_prompt(chunks: List[Dict], chat_history, n_questions: int = 5, difficulty: str = "mixed") -> PromptTemplate:
    context_text = inline_context_chunks(chunks)
    chat_text = format_chat_history(chat_history)
    return SHORT_ANSWER_PROMPT.partial(
        system_instructions=SYSTEM_INSTRUCTIONS,
        context=context_text,
        chat_history=chat_text,
        n_questions=str(n_questions),
        difficulty=difficulty,
    )


def build_true_false_prompt(chunks: List[Dict], chat_history, n_questions: int = 10, difficulty: str = "mixed") -> PromptTemplate:
    context_text = inline_context_chunks(chunks)
    chat_text = format_chat_history(chat_history)
    return TRUE_FALSE_PROMPT.partial(
        system_instructions=SYSTEM_INSTRUCTIONS,
        context=context_text,
        chat_history=chat_text,
        n_questions=str(n_questions),
        difficulty=difficulty,
    )


def build_fill_blank_prompt(chunks: List[Dict], chat_history, n_questions: int = 10, difficulty: str = "mixed") -> PromptTemplate:
    context_text = inline_context_chunks(chunks)
    chat_text = format_chat_history(chat_history)
    return FILL_BLANK_PROMPT.partial(
        system_instructions=SYSTEM_INSTRUCTIONS,
        context=context_text,
        chat_history=chat_text,
        n_questions=str(n_questions),
        difficulty=difficulty,
    )


def build_grading_prompt(question: str, expected_answer: str, user_answer: str, key_points: List[str]) -> PromptTemplate:
    return ANSWER_GRADING_PROMPT.partial(
        question=question,
        expected_answer=expected_answer,
        user_answer=user_answer,
        key_points=", ".join(key_points) if key_points else "N/A",
    )


def build_mindmap_prompt(chunks: List[Dict], chat_history, detail_level: str = "detailed") -> PromptTemplate:
    context_text = inline_context_chunks(chunks)
    chat_text = format_chat_history(chat_history)
    return MINDMAP_PROMPT.partial(
        system_instructions=SYSTEM_INSTRUCTIONS,
        context=context_text,
        chat_history=chat_text,
        detail_level=detail_level,
    )


def build_structured_summary_prompt(chunks: List[Dict], chat_history, format_type: str = "outline") -> PromptTemplate:
    context_text = inline_context_chunks(chunks)
    chat_text = format_chat_history(chat_history)
    return STRUCTURED_SUMMARY_PROMPT.partial(
        system_instructions=SYSTEM_INSTRUCTIONS,
        context=context_text,
        chat_history=chat_text,
        format_type=format_type,
    )


# ---------------------------
# 🔷 Minimal usage examples (pseudo-code)
# ---------------------------
USAGE_SNIPPET = """
# PSEUDO-CODE (example)
# from langchain import OpenAI  # or your LLM wrapper
# from app.services.prompt import build_qa_prompt, build_json_prompt

# chunks = [{'text': 'Important fact ...', 'source': 'paper.pdf', 'page': 4}, ...]
# chat_history = [{'role': 'user', 'text': 'Read the pdf and summarize.'}, ...]

# 1) Normal QA
prompt = build_qa_prompt(question="What are the key findings?", chunks=chunks, chat_history=chat_history, style="academic", max_lines=0)
# llm = OpenAI(temperature=0.0)  # prefer low temp for factual answers
# answer = llm(prompt)   # depending on your LLM wrapper, pass prompt.to_string() or .format()

# 2) Exactly 10 lines
prompt_10 = build_qa_prompt(question="Explain in 10 lines", chunks=chunks, chat_history=chat_history, style="concise", max_lines=10)
# answer_10 = llm(prompt_10)

# 3) JSON output for frontend
json_prompt = build_json_prompt(question="Summarize the methodology", chunks=chunks, chat_history=chat_history)
# json_answer = llm(json_prompt)
# parse json string to object for UI
"""

import re
# ✅ Updated to match rag.py
def build_dynamic_prompt(question: str, chunks: List[Dict], chat_history: List[Dict]):
    """
    Automatically detects task intent and returns (PromptTemplate, task_type)
    Fully compatible with LangChain 0.3+ (requires explicit input variables).
    """
    q_lower = question.lower()

    # Detect query intent
    if "summarize" in q_lower or "summary" in q_lower:
        prompt = build_summarize_prompt(chunks, chat_history, style="academic")
        task_type = "summary"
    elif "flashcard" in q_lower:
        prompt = build_flashcard_prompt(chunks, chat_history, n_cards=10)
        task_type = "flashcards"
    elif "exam" in q_lower or "question answer" in q_lower or "prepare" in q_lower:
        prompt = build_exam_prompt(chunks, chat_history, n_questions=10, difficulty="mixed", format="MARKDOWN")
        task_type = "exam"
    elif any(x in q_lower for x in ["json", "structured", "data format"]):
        prompt = build_json_prompt(question, chunks, chat_history)
        task_type = "json"
    else:
        match = re.search(r"in (\d+)\s*lines", q_lower)
        max_lines = int(match.group(1)) if match else 0
        prompt = build_qa_prompt(question, chunks, chat_history, style="academic", max_lines=max_lines)
        task_type = "qa"

    # ✅ Explicitly wrap prompt in a PromptTemplate (important for LangChain)
    final_prompt = PromptTemplate(
        input_variables=["context", "question"],
        template=prompt.template if hasattr(prompt, "template") else str(prompt)
    )

    return final_prompt, task_type
