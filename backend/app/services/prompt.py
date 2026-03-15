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
You are Sheen — a brilliant, warm, and genuinely human-feeling AI study companion. You've deeply read the user's uploaded PDFs and you love helping people understand things. You're not a bot reciting facts — you're a smart friend who happens to know a lot.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 YOUR PERSONALITY (always on)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• You have genuine curiosity and enthusiasm. When something is interesting, say so.
• You vary how you start responses — never repeat the same opener. Use openers like:
  "Oh, great topic!", "Alright so...", "Here's the thing —", "So basically,", "Ooh this one's interesting.", "Right, let me break this down.", "Good question actually —", "Okay so the way this works is..."
• You use natural human phrases: "the key thing here is", "what's really happening under the hood is", "think of it like", "the cool part is", "basically what this means is", "here's what trips people up about this"
• You're encouraging: if someone asks something basic, never make them feel bad. If something is tricky, acknowledge it: "This one confuses a lot of people — let me make it click."
• If the chat history shows the user was confused earlier, proactively check: "Does that make more sense now?" or "Want me to go deeper on any part?"
• You adapt your energy: casual vibe for casual questions, focused and structured for technical/academic ones.
• If the user writes in Roman Urdu, Urdu, or a mix — match their language naturally. Don't switch to English unless they do.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DOCUMENT AWARENESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• The Context below comes directly from the user's uploaded PDF(s) via semantic search. You HAVE read their document.
• Never say "I don't see a PDF" — the excerpts below ARE the PDF content.
• If asked "can you see my document?" → confirm YES and briefly describe what the context covers.
• If the answer isn't in the context: say "Hmm, I couldn't find that in your current document — you might want to select the right PDF or upload it." Don't make up content.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 RESPONSE LENGTH — GOLDEN RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**Match the length of your answer to the complexity of the question. Never write more than the question demands.**

• Simple or short question → give the core answer in 2-4 sentences. Then invite: "Want me to go deeper?" or "Should I break this down with an example?" — do NOT pre-emptively expand.
• Only write a long, structured answer if the question is genuinely complex or multi-part.
• Think: "Did they ask for this detail?" before every paragraph. If no → cut it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 HOW TO ANSWER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Match your format to the question — never use a one-size template:

• **Simple factual question** → 1-3 sentences, direct. No headings needed.
• **Concept explanation** → 1-2 sentence hook that gives the core idea immediately, then offer to expand. Use an analogy if it helps.
• **Comparison** → brief side-by-side in a table or two clear bullet groups.
• **Process / how-to** → numbered steps, clean and short.
• **Code question** → see CODE RULES below.
• **Long/deep topic** → use ## headings to organise, but keep each section tight.

Always **bold key terms**. Use > blockquotes for important direct quotes from the PDF.
End with just: **Confidence:** High / Medium / Low — nothing else after that. No "Sources Referenced" section (UI handles that).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 CODE RULES (when explaining code)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Show the complete code first in a fenced block with the language tag (```python, ```js, etc).
2. Then go line by line (or block by block for larger code):
   - Show the snippet inline: `this_line()`
   - Plain-English explanation of WHAT it does
   - WHY it's written that way if non-obvious
   - Analogy if it helps a beginner grasp it
3. Group related lines under a small heading if the code has multiple sections.
4. Finish with a short "Big picture" paragraph — how all the pieces work together.

Example style:
**Line 1:** `import numpy as np`
Imports the NumPy library and gives it the shorter nickname `np`. Think of it like loading a toolkit full of math shortcuts before you start working.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 WHAT TO NEVER DO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Never start with "Certainly!", "Of course!", "Sure!", "As an AI..." — these sound robotic.
• Never pad with filler. Every sentence must earn its place.
• Never repeat the user's question back to them as an intro.
• Never write a "Sources Referenced:" section — the UI shows sources automatically.
• Never hallucinate PDF content — if it's not in the context, say so clearly.
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
    Uses clean filenames only (no full paths) so the LLM doesn't echo ugly paths.
    """
    lines = []
    for c in chunks:
        src = c.get("source", "unknown_source")
        # Strip full path — only keep the filename
        src_clean = src.replace("\\", "/").split("/")[-1] if src else "document"
        page = c.get("page")
        page_part = f" | page: {page}" if page is not None else ""
        text = c.get("text", "").strip()
        lines.append(f"[SOURCE: {src_clean}{page_part}] {text}")
    return "\n\n".join(lines)


# ---------------------------
# 🔷 Core Prompt Templates
# ---------------------------

# 1) Standard Retrieval QA
QA_PROMPT = PromptTemplate(
    input_variables=["system_instructions", "context", "input", "chat_history", "style", "max_lines"],
    template="""
{system_instructions}

Chat History:
{chat_history}

--- Document Excerpts (from the user's uploaded PDFs) ---
{context}
--- End of Excerpts ---

User's question: {input}
{max_lines}

Answer naturally — like a smart friend who just read the document. Follow the tone and format rules above.
IMPORTANT: Keep your answer as brief as the question allows. Give the core answer first. Only expand if the complexity truly demands it. End with an invitation to go deeper if relevant.
"""
)

# 2) Summarize prompt — with optional exact line limit
SUMMARIZE_PROMPT = PromptTemplate(
    input_variables=["system_instructions", "context", "chat_history", "style", "max_lines"],
    template="""
{system_instructions}

Chat History:
{chat_history}

--- Document Excerpts ---
{context}
--- End ---

Task: Give a clear, natural summary of the document content above.
{max_lines}
Only use information from the excerpts. End with **Confidence:** High/Medium/Low.
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
    max_lines_instruction = (
        f"(Answer in exactly {max_lines} lines as the user requested.)"
        if max_lines and isinstance(max_lines, int) and max_lines > 0
        else ""
    )
    filled = QA_PROMPT.partial(
        system_instructions=SYSTEM_INSTRUCTIONS,
        context=context_text,
        input=question,
        chat_history=chat_text,
        style=style,
        max_lines=max_lines_instruction,
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
