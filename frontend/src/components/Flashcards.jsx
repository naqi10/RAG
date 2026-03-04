import { useState } from "react";
import { FiSend, FiChevronLeft, FiChevronRight, FiRotateCw, FiDownload, FiShuffle } from "react-icons/fi";
import { generateFlashcards } from "../api/client";

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

  const generate = async () => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError("");
    setCards([]);
    setSummary("");
    setScore({ correct: 0, wrong: 0 });
    setShowScore(false);
    try {
      const data = await generateFlashcards(q, conversationId, workspaceId, activePdfIds);
      setCards(data.flashcards || []);
      setSummary(data.summary || "");
      setIdx(0);
      setFlipped(false);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
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
      <div className="flex items-center justify-between px-6 pt-6 pb-3">
        <div className="flex items-center gap-3 flex-1 max-w-xl">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder='e.g. "Generate flashcards for chapter 3"'
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
          />
          <button onClick={generate} disabled={loading || !query.trim()}
            className="p-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition cursor-pointer">
            <FiSend size={18} />
          </button>
        </div>
        {cards.length > 0 && !loading && (
          <div className="flex items-center gap-2 ml-4">
            <button onClick={shuffle} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 transition cursor-pointer">
              <FiShuffle size={14} /> Shuffle
            </button>
            <button onClick={exportCards} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-emerald-600 border border-emerald-200 hover:bg-emerald-50 transition cursor-pointer">
              <FiDownload size={14} /> Export
            </button>
          </div>
        )}
      </div>
      {error && <p className="px-6 mt-1 text-xs text-red-500">{error}</p>}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
            <p className="mt-4 text-sm text-gray-400">Generating flashcards...</p>
          </div>
        )}

        {!loading && cards.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-300 select-none">
            <p className="text-4xl">&#127183;</p>
            <p className="mt-2 text-sm">Enter a topic to generate flashcards.</p>
          </div>
        )}

        {!loading && showScore && (
          <div className="flex flex-col items-center gap-4 max-w-lg mx-auto mb-6">
            <div className="w-full bg-white border border-gray-200 rounded-2xl shadow-sm px-8 py-6 text-center">
              <p className="text-2xl mb-2">&#127942;</p>
              <h3 className="text-lg font-semibold text-gray-700 mb-3">Study Session Complete!</h3>
              <div className="flex justify-center gap-8">
                <div><p className="text-2xl font-bold text-emerald-600">{score.correct}</p><p className="text-xs text-gray-400">Correct</p></div>
                <div><p className="text-2xl font-bold text-red-500">{score.wrong}</p><p className="text-xs text-gray-400">Needs Review</p></div>
                <div><p className="text-2xl font-bold text-gray-600">{cards.length}</p><p className="text-xs text-gray-400">Total</p></div>
              </div>
              <div className="mt-4 w-full bg-gray-100 rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${(score.correct / cards.length) * 100}%` }} />
              </div>
              <p className="mt-2 text-xs text-gray-400">{Math.round((score.correct / cards.length) * 100)}% accuracy</p>
              <button onClick={() => { setShowScore(false); setIdx(0); setFlipped(false); setScore({ correct: 0, wrong: 0 }); }}
                className="mt-4 px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer">
                Study Again
              </button>
            </div>
          </div>
        )}

        {!loading && cards.length > 0 && !showScore && (
          <div className="flex flex-col items-center gap-6 max-w-lg mx-auto">
            {summary && (
              <div className="w-full bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm text-emerald-800 leading-relaxed">
                <span className="font-semibold">Summary: </span>{summary}
              </div>
            )}
            <div className="w-full flex items-center gap-3">
              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${((idx + 1) / cards.length) * 100}%` }} />
              </div>
              <span className="text-[11px] text-gray-400 whitespace-nowrap">{idx + 1} / {cards.length}</span>
            </div>
            <div onClick={() => setFlipped((f) => !f)}
              className="w-full min-h-[220px] bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col items-center justify-center px-8 py-8 cursor-pointer select-none hover:shadow-md transition-shadow">
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
                <button onClick={markCorrect} className="px-4 py-2 rounded-lg text-sm border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition cursor-pointer">Got It!</button>
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
