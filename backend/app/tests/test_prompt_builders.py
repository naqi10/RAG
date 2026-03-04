from app.services import prompt as prompt_module
from app.services import loader as loader_module
from langchain_core.documents import Document


def test_build_qa_prompt_renders_without_missing_variables():
    rendered = prompt_module.build_qa_prompt("Explain gravity", [], []).format()
    assert "Explain gravity" in rendered


def test_build_summarize_prompt_renders_without_missing_variables():
    rendered = prompt_module.build_summarize_prompt([], []).format()
    assert "Key Takeaways" in rendered


def test_process_and_index_converts_page_numbers_to_human_readable(monkeypatch):
    calls = {}

    def fake_add_documents(docs):
        calls["docs"] = docs

    monkeypatch.setattr(loader_module.vectorstore, "add_documents", fake_add_documents)

    documents = [
        Document(page_content="content", metadata={"page": 0}),
        Document(page_content="content2", metadata={"page_number": 1}),
    ]

    chunks_added = loader_module.process_and_index("/tmp/sample.pdf", documents)

    assert chunks_added == len(calls["docs"])
    pages = {doc.metadata.get("page") for doc in calls["docs"]}
    assert pages == {1, 2}

