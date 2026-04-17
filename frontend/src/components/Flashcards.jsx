import { useState } from "react";
import {
  FiSend, FiChevronLeft, FiChevronRight, FiRotateCw, FiDownload,
  FiShuffle, FiBookOpen, FiLayers, FiZap, FiTarget, FiAward, FiTrendingUp,
} from "react-icons/fi";
import { generateFlashcards } from "../api/client";

/* ── Suggested topics for quick generation ── */
const QUICK_TOPICS = [
  { label: "Key Definitions", icon: FiBookOpen, query: "Generate flashcards for all key definitions" },
  { label: "Important Concepts", icon: FiLayers, query: "Generate flashcards for important concepts" },
  { label: "Formulas & Equations", icon: FiTarget, query: "Generate flashcards for formulas and equations" },
  { label: "Chapter Summary", icon: FiZap, query: "Generate flashcards summarizing the main chapters" },
];

/* ── Demo flashcards shown before user generates ── */
const DEMO_CARDS = [
  { question: "What is Retrieval-Augmented Generation (RAG)?", answer: "RAG is a technique that combines document retrieval with AI text generation, allowing the model to answer questions based on specific documents rather than general knowledge.", source: { source: "AI Fundamentals.pdf", page: 12 } },
  { question: "What is the purpose of vector embeddings?", answer: "Vector embeddings convert text into numerical representations that capture semantic meaning, enabling similarity search and document retrieval.", source: { source: "ML Concepts.pdf", page: 34 } },
  { question: "Explain the concept of cosine similarity.", answer: "Cosine similarity measures the angle between two vectors in high-dimensional space. Values range from -1 to 1, where 1 means identical direction (most similar).", source: { source: "Mathematics.pdf", page: 8 } },
  { question: "What is a transformer architecture?", answer: "Transformers use self-attention mechanisms to process input sequences in parallel, making them highly efficient for NLP tasks like translation, summarization, and question answering.", source: { source: "Deep Learning.pdf", page: 56 } },
  { question: "Define tokenization in NLP.", answer: "Tokenization is the process of breaking text into smaller units (tokens) such as words, subwords, or characters for processing by language models.", source: { source: "NLP Basics.pdf", page: 3 } },
];

export default function Flashcards({ conversationId, workspaceId, activePdfIds }) {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [showScore, setShowScore] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [totalGenerated, setTotalGenerated] = useState(0);

  const generate = async (overrideQuery) => {
    const q = (overrideQuery || query).trim();
    if (!q || loading) return;
    setLoading(true);
    setError("");
    setCards([]);
    setSummary("");
    setScore({ correct: 0, wrong: 0 });
    setShowScore(false);
    setIsDemo(false);
    try {
      const data = await generateFlashcards(q, conversationId, workspaceId, activePdfIds);
      const newCards = data.flashcards || [];
      setCards(newCards);
      setSummary(data.summary || "");
      setIdx(0);
      setFlipped(false);
      setTotalGenerated((t) => t + newCards.length);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const startDemo = () => {
    setCards(DEMO_CARDS);
    setSummary("These are example flashcards to demonstrate the study experience. Generate your own from your PDFs!");
    setIdx(0);
    setFlipped(false);
    setScore({ correct: 0, wrong: 0 });
    setShowScore(false);
    setIsDemo(true);
    setError("");
  };

  const prev = () => { setFlipped(false); setIdx((i) => Math.max(0, i - 1)); };
  const next = () => { setFlipped(false); setIdx((i) => Math.min(cards.length - 1, i + 1)); };
  const card = cards[idx];

  const shuffle = () => {
    setCards([...cards].sort(() => Math.random() - 0.5));
    setIdx(0);
    setFlipped(false);
  };

  const markCorrect = () => {
    setScore((s) => ({ ...s, correct: s.correct + 1 }));
    idx < cards.length - 1 ? next() : setShowScore(true);
  };

  const markWrong = () => {
    setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
    idx < cards.length - 1 ? next() : setShowScore(true);
  };

  const exportCards = () => {
    const blob = new Blob([JSON.stringify({ flashcards: cards, summary }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flashcards-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#6b4a63] mb-1">Flashcards</h1>
            <p className="text-sm text-gray-500">Generate AI-powered flashcards from your PDFs and test your knowledge</p>
          </div>
          {/* Stats badges */}
          <div className="flex items-center gap-3">
            <div className="dreamy-glass-card rounded-xl px-4 py-2 flex items-center gap-2">
              <FiLayers size={14} className="text-pink-500" />
              <span className="text-sm font-semibold text-gray-700">{cards.length || totalGenerated}</span>
              <span className="text-xs text-gray-400">cards</span>
            </div>
            <div className="dreamy-glass-card rounded-xl px-4 py-2 flex items-center gap-2">
              <FiAward size={14} className="text-purple-500" />
              <span className="text-sm font-semibold text-gray-700">{score.correct}</span>
              <span className="text-xs text-gray-400">correct</span>
            </div>
            <div className="dreamy-glass-card rounded-xl px-4 py-2 flex items-center gap-2">
              <FiTrendingUp size={14} className="text-emerald-500" />
              <span className="text-sm font-semibold text-gray-700">
                {score.correct + score.wrong > 0 ? Math.round((score.correct / (score.correct + score.wrong)) * 100) : 0}%
              </span>
              <span className="text-xs text-gray-400">accuracy</span>
            </div>
          </div>
        </div>

        {/* Input bar */}
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder='e.g. "Generate flashcards for chapter 3" or "Key concepts in neural networks"'
            className="flex-1 rounded-xl border border-[#E0BBE4]/50 px-4 py-2.5 text-sm outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 bg-white/70 backdrop-blur-sm transition"
          />
          <button onClick={() => generate()} disabled={loading || !query.trim()}
            className="p-2.5 rounded-xl bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-40 transition cursor-pointer">
            <FiSend size={18} />
          </button>
          {cards.length > 0 && !loading && (
            <>
              <button onClick={shuffle} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 transition cursor-pointer">
                <FiShuffle size={14} /> Shuffle
              </button>
              <button onClick={exportCards} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs text-pink-600 border border-pink-200 hover:bg-pink-50 transition cursor-pointer">
                <FiDownload size={14} /> Export
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="px-6 mt-2 text-xs text-red-500">{error}</p>}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-10 h-10 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
            <p className="mt-4 text-sm text-gray-400">Generating flashcards from your documents...</p>
          </div>
        )}

        {/* ── Empty State: Rich & Full ── */}
        {!loading && cards.length === 0 && (
          <div className="max-w-3xl mx-auto">
            {/* Quick topic suggestions */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-600 mb-3">Quick Generate</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {QUICK_TOPICS.map((topic) => (
                  <button
                    key={topic.label}
                    onClick={() => { setQuery(topic.query); generate(topic.query); }}
                    className="dreamy-glass-card rounded-xl p-4 text-left hover:shadow-md transition-all border border-white/80 group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-pink-50 flex items-center justify-center mb-2 group-hover:bg-pink-100 transition">
                      <topic.icon size={16} className="text-pink-500" />
                    </div>
                    <p className="text-xs font-medium text-gray-700">{topic.label}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Demo / Try it out section */}
            <div className="dreamy-glass-card rounded-2xl p-6 border border-white/80 mb-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-2xl"
                  style={{ background: "linear-gradient(145deg, #FEC8D8, #E0BBE4)" }}>
                  🃏
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800 mb-1">Try the Flashcard Experience</h3>
                  <p className="text-sm text-gray-500 mb-3">
                    See how flashcards work with sample cards, or generate your own from uploaded PDFs.
                  </p>
                  <button
                    onClick={startDemo}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-white transition cursor-pointer hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #FF9AA2, #E0BBE4)" }}
                  >
                    Try Demo Cards
                  </button>
                </div>
              </div>
            </div>

            {/* How it works */}
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-3">How It Works</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { step: "1", title: "Enter a Topic", desc: "Type what you want to study or pick a quick topic above" },
                  { step: "2", title: "AI Generates Cards", desc: "Our AI reads your PDFs and creates Q&A flashcards" },
                  { step: "3", title: "Study & Score", desc: "Flip cards, mark correct/wrong, track your progress" },
                ].map((s) => (
                  <div key={s.step} className="dreamy-glass-card rounded-xl p-4 border border-white/80 text-center">
                    <div className="w-8 h-8 rounded-full bg-pink-100 text-pink-600 font-bold text-sm flex items-center justify-center mx-auto mb-2">
                      {s.step}
                    </div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">{s.title}</p>
                    <p className="text-[11px] text-gray-400 leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Score screen ── */}
        {!loading && showScore && (
          <div className="flex flex-col items-center gap-4 max-w-lg mx-auto mb-6">
            <div className="w-full dreamy-glass-card border border-white/80 rounded-2xl px-8 py-6 text-center">
              <p className="text-2xl mb-2">🏆</p>
              <h3 className="text-lg font-semibold text-gray-700 mb-3">
                {isDemo ? "Demo Complete!" : "Study Session Complete!"}
              </h3>
              <div className="flex justify-center gap-8">
                <div><p className="text-2xl font-bold text-pink-600">{score.correct}</p><p className="text-xs text-gray-400">Correct</p></div>
                <div><p className="text-2xl font-bold text-red-500">{score.wrong}</p><p className="text-xs text-gray-400">Needs Review</p></div>
                <div><p className="text-2xl font-bold text-gray-600">{cards.length}</p><p className="text-xs text-gray-400">Total</p></div>
              </div>
              <div className="mt-4 w-full bg-gray-100 rounded-full h-2">
                <div className="bg-pink-500 h-2 rounded-full transition-all" style={{ width: `${(score.correct / cards.length) * 100}%` }} />
              </div>
              <p className="mt-2 text-xs text-gray-400">{Math.round((score.correct / cards.length) * 100)}% accuracy</p>
              <div className="flex items-center justify-center gap-3 mt-4">
                <button onClick={() => { setShowScore(false); setIdx(0); setFlipped(false); setScore({ correct: 0, wrong: 0 }); }}
                  className="px-4 py-2 text-sm rounded-lg bg-pink-600 text-white hover:bg-pink-700 transition cursor-pointer">
                  Study Again
                </button>
                {isDemo && (
                  <button onClick={() => { setCards([]); setIsDemo(false); setShowScore(false); }}
                    className="px-4 py-2 text-sm rounded-lg border border-pink-200 text-pink-600 hover:bg-pink-50 transition cursor-pointer">
                    Generate My Own
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Active flashcard study ── */}
        {!loading && cards.length > 0 && !showScore && (
          <div className="flex flex-col items-center gap-6 max-w-lg mx-auto">
            {isDemo && (
              <div className="w-full bg-purple-50 border border-purple-200 rounded-xl px-4 py-2.5 text-xs text-purple-700 text-center">
                Demo mode — generate your own flashcards from your PDFs for the real experience!
              </div>
            )}
            {summary && (
              <div className="w-full bg-pink-50 border border-pink-100 rounded-xl px-4 py-3 text-sm text-pink-800 leading-relaxed">
                <span className="font-semibold">Summary: </span>{summary}
              </div>
            )}
            <div className="w-full flex items-center gap-3">
              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                <div className="bg-pink-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${((idx + 1) / cards.length) * 100}%` }} />
              </div>
              <span className="text-[11px] text-gray-400 whitespace-nowrap">{idx + 1} / {cards.length}</span>
            </div>
            <div onClick={() => setFlipped((f) => !f)}
              className="w-full min-h-[220px] dreamy-glass-card border border-white/80 rounded-2xl flex flex-col items-center justify-center px-8 py-8 cursor-pointer select-none hover:shadow-lg transition-shadow">
              <span className="text-[10px] uppercase tracking-widest text-gray-300 mb-3">
                {flipped ? "Answer" : "Question"} &middot; {idx + 1}/{cards.length}
              </span>
              <p className="text-center text-gray-700 text-base leading-relaxed">
                {flipped ? card.answer : card.question}
              </p>
              {!flipped && <p className="mt-4 text-[11px] text-gray-300 flex items-center gap-1"><FiRotateCw size={12} /> Click to reveal</p>}
              {flipped && card.source && (
                <p className="mt-4 text-[11px] text-gray-300">Source: {card.source.source}{card.source.page ? ` (p.${card.source.page})` : ""}</p>
              )}
            </div>
            {flipped && (
              <div className="flex items-center gap-3">
                <button onClick={markWrong} className="px-4 py-2 rounded-lg text-sm border border-red-200 text-red-500 hover:bg-red-50 transition cursor-pointer">Needs Review</button>
                <button onClick={markCorrect} className="px-4 py-2 rounded-lg text-sm border border-pink-200 text-pink-600 hover:bg-pink-50 transition cursor-pointer">Got It!</button>
              </div>
            )}
            <div className="flex items-center gap-4">
              <button onClick={prev} disabled={idx === 0} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition cursor-pointer"><FiChevronLeft size={20} /></button>
              <span className="text-sm text-gray-400">{idx + 1} / {cards.length}</span>
              <button onClick={next} disabled={idx === cards.length - 1} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition cursor-pointer"><FiChevronRight size={20} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
