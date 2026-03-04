import pytest
from fastapi.testclient import TestClient
import json

from app.main import app
from app.routes import rag


client = TestClient(app)


@pytest.mark.parametrize(
    "payload",
    [
        {
            "query": "Create flashcards on transformers",
            "k": 4,
            "session_id": "test-session",
            "include_summary": True,
        },
        {
            "query": "flashcards please",
            "k": 2,
            "session_id": None,
            "n_cards": 5,
            "include_summary": False,
        },
    ],
)
def test_flashcards_requires_index(payload):
    response = client.post("/rag/flashcards", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"].startswith("No documents indexed")


def test_assign_sources_to_flashcards_prefers_overlap():
    flashcards = [
        {"question": "What is regularization?", "answer": "Regularization prevents overfitting.", "source": {}},
        {"question": "Define gradient descent", "answer": "Gradient descent optimizes loss.", "source": {}},
    ]
    chunks = [
        {
            "text": "Regularization prevents overfitting by adding a penalty.",
            "source": "ml.pdf",
            "chapter": "Chapter 3",
            "page": 5,
        },
        {
            "text": "Gradient descent updates weights to minimize loss.",
            "source": "ml.pdf",
            "chapter": "Chapter 2",
            "page": 2,
        },
    ]

    assigned = rag._assign_sources_to_flashcards(flashcards, chunks)

    assert assigned[0]["source"] == {"source": "Chapter 3", "page": 5}
    assert assigned[1]["source"] == {"source": "Chapter 2", "page": 2}


def test_parse_flashcards_output_handles_summary():
    raw = json.dumps(
        {
            "flashcards": [
                {
                    "question": "What is overfitting?",
                    "answer": "When a model memorises training data.",
                    "difficulty": "Easy",
                    "topic": "Model Basics",
                    "confidence": "High",
                    "source": {"source": "Intro.pdf", "page": 3},
                }
            ],
            "summary": "Models can overfit when they memorise training data.",
        }
    )

    cards, summary = rag._parse_flashcards_output(raw)

    assert summary == "Models can overfit when they memorise training data."
    assert cards[0]["difficulty"] == "Easy"
    assert cards[0]["confidence"] == "High"
    assert cards[0]["source"] == {"source": "Intro.pdf", "page": 3}

