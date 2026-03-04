# app/services/intent.py
from typing import Dict, List
from sentence_transformers import SentenceTransformer, util

# Load a lightweight, fast model for semantic intent scoring
# all-MiniLM-L6-v2 is a good balance of speed/quality; change if you want larger models.
_MODEL_NAME = "all-MiniLM-L6-v2"
_model = SentenceTransformer(_MODEL_NAME)

# Expanded intent phrases tuned for academic use-cases
INTENTS: Dict[str, List[str]] = {
    "summary": [
        "summarize", "summary", "brief overview", "outline", "key points",
        "short version", "main ideas", "in short", "give overview", "summarise",
        "overview", "concise summary", "summarize the document"
    ],
    "flashcards": [
        "flashcard", "study cards", "remember", "revise", "revision cards",
        "practice recall", "memorize", "learning cards", "make flashcards",
        "create flashcards", "study questions", "quick questions"
    ],
    "exam": [
        "exam", "test", "prepare questions", "practice questions",
        "mcq", "quiz", "mock test", "generate exam", "multiple choice questions",
        "generate questions", "practice test"
    ],
    "json": [
        "json", "structured data", "convert to json", "data format",
        "machine readable", "key value pairs", "return json", "output json"
    ],
    "quiz": [
        "quiz", "quiz me", "test me", "quick quiz", "practice quiz",
        "test my knowledge", "generate quiz", "quiz questions",
        "multiple choice quiz", "short answer quiz"
    ],
    "mindmap": [
        "mind map", "mindmap", "concept map", "visual summary",
        "topic map", "knowledge graph", "diagram the topics",
        "show relationships", "concept diagram", "map out"
    ],
    "qa": [
        "question", "answer", "explain", "describe", "what is", "why does",
        "compare", "analyze", "analyse", "define", "differentiate", "discuss",
        "explain the", "what are", "how does", "demonstrate", "give an example"
    ],
}

# Precompute embeddings for intent examples to speed up runtime detection
# Each entry is a tensor of embeddings for that intent's example phrases.
INTENT_EMBS = {
    intent: _model.encode(examples, convert_to_tensor=True)
    for intent, examples in INTENTS.items()
}


def detect_intent(query: str, debug: bool = False, threshold: float = 0.45) -> str:
    """
    Detects the user's intent using semantic similarity to a small set of example phrases.

    Returns one of: "summary", "flashcards", "exam", "json", or "qa".
    If the best similarity score is below `threshold`, returns "qa" (safe default).

    Args:
        query: user query string
        debug: if True, prints per-intent similarity scores for debugging
        threshold: minimum mean similarity to accept a non-qa label

    Example:
        >>> detect_intent("Generate 10 flashcards for chapter 3", debug=True)
    """
    if not query or not isinstance(query, str):
        return "qa"

    q_emb = _model.encode(query, convert_to_tensor=True)

    scores = {}
    for intent, emb in INTENT_EMBS.items():
        # compute mean cosine similarity with the intent examples
        sim = util.cos_sim(q_emb, emb).mean().item()
        scores[intent] = float(sim)

    # choose best intent and its score
    best_intent = max(scores, key=scores.get)
    best_score = scores[best_intent]

    if debug:
        # nice formatted debug output
        debug_str = " | ".join([f"{k}:{scores[k]:.3f}" for k in sorted(scores, key=scores.get, reverse=True)])
        print(f"[detect_intent debug] query='{query}' -> {best_intent} ({best_score:.3f})  scores: {debug_str}")

    # if the best score is weak, default to QA to avoid misclassification
    if best_score < threshold:
        return "qa"

    return best_intent
