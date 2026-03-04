import { useState, useEffect, useRef, useCallback } from "react";
import {
  FiCheckCircle, FiXCircle, FiClock, FiAward,
  FiChevronRight, FiChevronLeft, FiRefreshCw, FiPlay, FiFileText,
  FiBookOpen, FiZap, FiAlertTriangle, FiBarChart2,
} from "react-icons/fi";
import {
  generateQuiz, submitQuiz, retryWrongQuestions,
  getQuizTopicPerformance,
} from "../api/client";

// ── Timer config per difficulty ──
const TIMER_MAP = { easy: 60, medium: 45, hard: 30, mixed: 45 };

function getQuestionTimer(q, globalDifficulty) {
  const d = (q.difficulty || globalDifficulty || "medium").toLowerCase();
  return TIMER_MAP[d] || 45;
}

// ── Adaptive sort: easy → medium → hard ──
function sortByDifficulty(questions) {
  const order = { easy: 0, medium: 1, hard: 2 };
  return [...questions].sort(
    (a, b) => (order[a.difficulty] ?? 1) - (order[b.difficulty] ?? 1)
  );
}

export default function QuizGenerator({ workspaceId, activePdfIds, pdfs = [] }) {
  const activePdfs = pdfs.filter((p) => p.is_active);
  const [view, setView] = useState("config"); // config, quiz, results
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Config
  const [topic, setTopic] = useState("");
  const [quizType, setQuizType] = useState("mcq");
  const [difficulty, setDifficulty] = useState("mixed");
  const [numQuestions, setNumQuestions] = useState(10);
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [adaptiveMode, setAdaptiveMode] = useState(false);

  // Quiz state
  const [quizData, setQuizData] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [globalTimer, setGlobalTimer] = useState(0);
  const [questionTimer, setQuestionTimer] = useState(0);
  const globalTimerRef = useRef(null);
  const questionTimerRef = useRef(null);

  // Adaptive tracking
  const [streak, setStreak] = useState(0);

  // Results
  const [results, setResults] = useState(null);
  const [topicPerformance, setTopicPerformance] = useState(null);

  // ── Cleanup timers ──
  useEffect(() => {
    return () => {
      clearInterval(globalTimerRef.current);
      clearInterval(questionTimerRef.current);
    };
  }, []);

  const questions = quizData?.questions || [];
  const current = questions[currentIdx];
  const totalAnswered = Object.keys(answers).length;

  // ── Per-question timer ──
  const startQuestionTimer = useCallback((q, diff) => {
    clearInterval(questionTimerRef.current);
    if (!timerEnabled) return;
    const limit = getQuestionTimer(q, diff);
    setQuestionTimer(limit);
    questionTimerRef.current = setInterval(() => {
      setQuestionTimer((prev) => {
        if (prev <= 1) {
          clearInterval(questionTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [timerEnabled]);

  // Auto-advance when per-question timer hits 0
  useEffect(() => {
    if (!timerEnabled || questionTimer > 0 || view !== "quiz" || !current) return;
    // Timer expired — auto advance or auto submit
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionTimer]);

  // Restart per-question timer when question changes
  useEffect(() => {
    if (view === "quiz" && current) {
      startQuestionTimer(current, difficulty);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, view]);

  // ── Start Quiz ──
  const startQuiz = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await generateQuiz(topic, workspaceId, activePdfIds, {
        quiz_type: quizType,
        difficulty,
        n_questions: numQuestions,
      });
      // Adaptive mode: sort by difficulty
      if (adaptiveMode && data.questions) {
        data.questions = sortByDifficulty(data.questions);
      }
      setQuizData(data);
      setCurrentIdx(0);
      setAnswers({});
      setGlobalTimer(0);
      setStreak(0);
      setView("quiz");
      globalTimerRef.current = setInterval(() => setGlobalTimer((t) => t + 1), 1000);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to generate quiz.");
    } finally {
      setLoading(false);
    }
  };

  // ── Select Answer ──
  const selectAnswer = (idx, answer) => {
    setAnswers((prev) => ({ ...prev, [idx]: answer }));
  };

  // ── Submit Quiz ──
  const handleSubmit = async () => {
    clearInterval(globalTimerRef.current);
    clearInterval(questionTimerRef.current);
    setLoading(true);
    try {
      const answerList = Object.entries(answers).map(([idx, answer]) => ({
        question_index: parseInt(idx),
        answer: String(answer),
      }));
      const data = await submitQuiz(quizData.quiz_id, answerList);
      setResults(data);
      setView("results");

      // Track adaptive streak
      if (data.results) {
        let s = 0;
        for (const r of data.results) {
          if (r.correct) s++;
          else s = 0;
        }
        setStreak(s);
      }

      // Fetch topic performance
      try {
        const tp = await getQuizTopicPerformance(workspaceId);
        setTopicPerformance(tp);
      } catch { /* ignore */ }
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to submit quiz.");
    } finally {
      setLoading(false);
    }
  };

  // ── Retry Wrong ──
  const handleRetryWrong = async () => {
    if (!quizData?.quiz_id) return;
    setLoading(true);
    setError("");
    try {
      const data = await retryWrongQuestions(quizData.quiz_id);
      setQuizData(data);
      setCurrentIdx(0);
      setAnswers({});
      setResults(null);
      setGlobalTimer(0);
      setStreak(0);
      setView("quiz");
      globalTimerRef.current = setInterval(() => setGlobalTimer((t) => t + 1), 1000);
    } catch (err) {
      setError(err?.response?.data?.detail || "No wrong answers to retry.");
    } finally {
      setLoading(false);
    }
  };

  // ── Reset ──
  const resetQuiz = () => {
    clearInterval(globalTimerRef.current);
    clearInterval(questionTimerRef.current);
    setView("config");
    setQuizData(null);
    setResults(null);
    setAnswers({});
    setGlobalTimer(0);
    setQuestionTimer(0);
    setError("");
    setTopicPerformance(null);
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ── CONFIG VIEW ──
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (view === "config") {
    return (
      <div className="max-w-xl mx-auto py-10 px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Quiz Generator</h1>
          <p className="text-sm text-gray-500">Test your knowledge with AI-generated quizzes from your PDFs.</p>
          {activePdfs.length > 0 ? (
            <div className="flex items-center gap-1.5 mt-2">
              <FiFileText size={13} className="text-emerald-500" />
              <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                Quiz from: {activePdfs.map((p) => p.display_name || p.filename).join(", ")}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                No active PDFs — activate PDFs in the sidebar first
              </span>
            </div>
          )}
        </div>

        <div className="space-y-5">
          {/* Topic Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Topic or Question</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder='e.g. "Neural network fundamentals" or "Chapter 3 key concepts"'
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
              onKeyDown={(e) => e.key === "Enter" && startQuiz()}
            />
          </div>

          {/* Type / Difficulty / Count */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Type</label>
              <select
                value={quizType}
                onChange={(e) => setQuizType(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 bg-white"
              >
                <option value="mcq">Multiple Choice</option>
                <option value="true_false">True / False</option>
                <option value="fill_blank">Fill in the Blank</option>
                <option value="short_answer">Short Answer</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 bg-white"
              >
                <option value="mixed">Mixed</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Questions</label>
              <select
                value={numQuestions}
                onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 bg-white"
              >
                {[5, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Toggle Options */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={timerEnabled}
                onChange={(e) => setTimerEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-gray-700 flex items-center gap-1">
                <FiClock size={13} /> Per-question timer
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={adaptiveMode}
                onChange={(e) => setAdaptiveMode(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-gray-700 flex items-center gap-1">
                <FiZap size={13} /> Adaptive difficulty
              </span>
            </label>
          </div>

          {timerEnabled && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
              Timer per question: Easy = 60s, Medium = 45s, Hard = 30s. Auto-advances when time runs out.
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
          )}

          <button
            onClick={startQuiz}
            disabled={loading || !topic.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><FiRefreshCw className="animate-spin" /> Generating Quiz...</>
            ) : (
              <><FiPlay size={16} /> Start Quiz</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ── QUIZ TAKING VIEW ──
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (view === "quiz" && current) {
    const isMCQ = !!current.options && !("accept_alternatives" in current) && !(current.correct_answer === "True" || current.correct_answer === "False");
    const isTF = current.correct_answer === "True" || current.correct_answer === "False";
    const isFillBlank = "accept_alternatives" in current || (current.question && current.question.includes("_____"));
    const isShortAnswer = !isMCQ && !isTF && !isFillBlank && "expected_answer" in current;

    const timerLimit = getQuestionTimer(current, difficulty);
    const timerPct = timerEnabled ? (questionTimer / timerLimit) * 100 : 100;
    const timerDanger = timerEnabled && questionTimer <= 10;

    return (
      <div className="max-w-2xl mx-auto py-8 px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-500">
            Question {currentIdx + 1} of {questions.length}
          </div>
          <div className="flex items-center gap-3">
            {/* Per-question timer */}
            {timerEnabled && (
              <span className={`flex items-center gap-1 text-sm font-mono font-semibold px-2.5 py-1 rounded-lg ${
                timerDanger ? "bg-red-50 text-red-600 animate-pulse" : "bg-gray-100 text-gray-600"
              }`}>
                <FiClock size={14} /> {questionTimer}s
              </span>
            )}
            {/* Global timer */}
            <span className="flex items-center gap-1 text-sm text-gray-400">
              <FiClock size={12} /> {formatTime(globalTimer)}
            </span>
            <span className="text-xs bg-gray-100 px-2 py-1 rounded-lg text-gray-600">
              {totalAnswered}/{questions.length}
            </span>
            {/* Adaptive badge */}
            {adaptiveMode && (
              <span className={`text-xs px-2 py-1 rounded-lg font-medium ${
                (current.difficulty || "medium") === "hard" ? "bg-red-50 text-red-600" :
                (current.difficulty || "medium") === "medium" ? "bg-amber-50 text-amber-600" :
                "bg-emerald-50 text-emerald-600"
              }`}>
                {(current.difficulty || "medium").charAt(0).toUpperCase() + (current.difficulty || "medium").slice(1)}
              </span>
            )}
          </div>
        </div>

        {/* Per-question timer bar */}
        {timerEnabled && (
          <div className="w-full h-1.5 bg-gray-100 rounded-full mb-2">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                timerDanger ? "bg-red-500" : timerPct > 50 ? "bg-emerald-500" : "bg-amber-500"
              }`}
              style={{ width: `${timerPct}%` }}
            />
          </div>
        )}

        {/* Progress */}
        <div className="w-full h-1 bg-gray-100 rounded-full mb-6">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
          />
        </div>

        {/* Question Card */}
        <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-6 mb-6">
          <div className="flex items-start gap-2 mb-4">
            {current.difficulty && (
              <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                current.difficulty === "hard" ? "bg-red-50 text-red-600" :
                current.difficulty === "medium" ? "bg-amber-50 text-amber-600" :
                "bg-emerald-50 text-emerald-600"
              }`}>
                {current.difficulty}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-lg bg-gray-50 text-gray-500 font-medium">
              {isTF ? "True / False" : isFillBlank ? "Fill in the Blank" : isMCQ ? "Multiple Choice" : "Short Answer"}
            </span>
          </div>
          <p className="text-gray-900 font-medium text-lg leading-relaxed">{current.question}</p>
          {/* Hint for fill-blank */}
          {isFillBlank && current.hint && (
            <p className="mt-2 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
              Hint: {current.hint}
            </p>
          )}
        </div>

        {/* ── Answer Renderers ── */}

        {/* MCQ Options */}
        {isMCQ && (
          <div className="space-y-2.5 mb-6">
            {current.options.map((opt, i) => {
              const letter = opt.charAt(0);
              const isSelected = answers[currentIdx] === letter;
              return (
                <button
                  key={i}
                  onClick={() => selectAnswer(currentIdx, letter)}
                  className={`w-full text-left p-4 rounded-xl border text-sm transition ${
                    isSelected
                      ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                      : "border-gray-200 bg-white hover:border-gray-300 text-gray-700"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {/* True / False Buttons */}
        {isTF && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            {["True", "False"].map((val) => {
              const isSelected = answers[currentIdx] === val;
              return (
                <button
                  key={val}
                  onClick={() => selectAnswer(currentIdx, val)}
                  className={`p-6 rounded-xl border-2 text-lg font-semibold transition ${
                    isSelected
                      ? val === "True"
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-red-400 bg-red-50 text-red-700"
                      : "border-gray-200 bg-white hover:border-gray-300 text-gray-600"
                  }`}
                >
                  {val === "True" ? (
                    <span className="flex items-center justify-center gap-2">
                      <FiCheckCircle size={22} /> True
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <FiXCircle size={22} /> False
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Fill in the Blank */}
        {isFillBlank && (
          <div className="mb-6">
            <input
              type="text"
              value={answers[currentIdx] || ""}
              onChange={(e) => selectAnswer(currentIdx, e.target.value)}
              placeholder="Type the missing word or phrase..."
              className="w-full rounded-xl border-2 border-dashed border-gray-300 px-4 py-3.5 text-base text-center outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
              onKeyDown={(e) => {
                if (e.key === "Enter" && currentIdx < questions.length - 1) {
                  setCurrentIdx((i) => i + 1);
                }
              }}
              autoFocus
            />
          </div>
        )}

        {/* Short Answer */}
        {isShortAnswer && (
          <div className="mb-6">
            <textarea
              value={answers[currentIdx] || ""}
              onChange={(e) => selectAnswer(currentIdx, e.target.value)}
              placeholder="Type your answer here..."
              rows={4}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition resize-none"
            />
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition disabled:opacity-40"
          >
            <FiChevronLeft size={16} /> Previous
          </button>

          {currentIdx === questions.length - 1 ? (
            <button
              onClick={handleSubmit}
              disabled={loading || totalAnswered === 0}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {loading ? <FiRefreshCw className="animate-spin" /> : <FiAward size={16} />}
              Submit Quiz
            </button>
          ) : (
            <button
              onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
              className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm text-emerald-600 hover:bg-emerald-50 transition"
            >
              Next <FiChevronRight size={16} />
            </button>
          )}
        </div>

        {/* Question dots */}
        <div className="flex flex-wrap gap-1.5 mt-6 justify-center">
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIdx(i)}
              className={`w-7 h-7 rounded-lg text-xs font-medium transition ${
                i === currentIdx
                  ? "bg-emerald-600 text-white"
                  : answers[i] !== undefined
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ── RESULTS VIEW ──
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (view === "results" && results) {
    const wrongCount = results.results?.filter((r) => !r.correct).length || 0;

    return (
      <div className="max-w-2xl mx-auto py-8 px-6">
        {/* Score Card */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full mb-4 ${
            results.score >= 80 ? "bg-emerald-50" : results.score >= 50 ? "bg-amber-50" : "bg-red-50"
          }`}>
            <span className={`text-3xl font-bold ${
              results.score >= 80 ? "text-emerald-600" : results.score >= 50 ? "text-amber-600" : "text-red-600"
            }`}>
              {results.score}%
            </span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            {results.score >= 80 ? "Excellent!" : results.score >= 50 ? "Good effort!" : "Keep studying!"}
          </h2>
          <p className="text-sm text-gray-500">
            {results.correct} of {results.total} correct
            {results.time_taken_seconds ? ` in ${formatTime(results.time_taken_seconds)}` : ` in ${formatTime(globalTimer)}`}
          </p>
          {adaptiveMode && (
            <p className="text-xs text-blue-600 mt-1">
              Best streak: {streak} correct in a row
            </p>
          )}
        </div>

        {/* Score bar */}
        <div className="w-full h-2 bg-gray-100 rounded-full mb-6">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              results.score >= 80 ? "bg-emerald-500" : results.score >= 50 ? "bg-amber-500" : "bg-red-500"
            }`}
            style={{ width: `${results.score}%` }}
          />
        </div>

        {/* ── Topic Performance Heatmap ── */}
        {topicPerformance && topicPerformance.topics && topicPerformance.topics.length > 0 && (
          <div className="mb-6 p-4 rounded-xl border border-gray-200 bg-white">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <FiBarChart2 size={14} /> Topic Performance
            </h3>
            <div className="space-y-2">
              {topicPerformance.topics.map((t, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700 truncate">{t.source}</span>
                      <span className={`text-xs font-semibold ${
                        t.strength === "strong" ? "text-emerald-600" :
                        t.strength === "medium" ? "text-amber-600" : "text-red-600"
                      }`}>
                        {t.accuracy}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          t.strength === "strong" ? "bg-emerald-500" :
                          t.strength === "medium" ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${t.accuracy}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {t.correct}/{t.total}
                  </span>
                </div>
              ))}
            </div>
            {topicPerformance.summary && (
              <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                Overall: {topicPerformance.summary.overall_accuracy}% across {topicPerformance.summary.total_quizzes} quiz{topicPerformance.summary.total_quizzes !== 1 ? "zes" : ""}
              </div>
            )}
          </div>
        )}

        {/* Per-question Results */}
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-semibold text-gray-700">Question Review</h3>
          {results.results?.map((r, i) => {
            const q = questions[r.question_index] || {};
            return (
              <div key={i} className={`p-4 rounded-xl border ${
                r.correct ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"
              }`}>
                <div className="flex items-start gap-2 mb-2">
                  {r.correct ? (
                    <FiCheckCircle className="text-emerald-600 mt-0.5 shrink-0" />
                  ) : (
                    <FiXCircle className="text-red-500 mt-0.5 shrink-0" />
                  )}
                  <p className="text-sm font-medium text-gray-800">{q.question}</p>
                </div>
                <div className="ml-6 space-y-1 text-xs">
                  <p className="text-gray-600">
                    <span className="font-medium">Your answer:</span> {r.user_answer || "(no answer)"}
                  </p>
                  {r.correct_answer && (
                    <p className="text-emerald-700">
                      <span className="font-medium">Correct:</span> {r.correct_answer}
                    </p>
                  )}
                  {r.explanation && <p className="text-gray-500 italic">{r.explanation}</p>}
                  {r.feedback && <p className="text-gray-500">{r.feedback}</p>}
                  {r.score !== undefined && r.score !== 100 && r.score !== 0 && (
                    <p className="text-gray-500">Score: {r.score}/100</p>
                  )}
                  {/* Source / Page Reference */}
                  {(r.text_excerpt || r.source?.page) && (
                    <div className="mt-2 p-2.5 bg-white/80 rounded-lg border border-gray-200/50">
                      {r.source?.page && (
                        <span className="inline-block text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium mr-2">
                          p. {r.source.page}
                        </span>
                      )}
                      {r.source?.source && (
                        <span className="text-xs text-gray-400">{r.source.source}</span>
                      )}
                      {r.text_excerpt && (
                        <p className="text-xs text-gray-500 mt-1 italic leading-relaxed">
                          "{r.text_excerpt}"
                        </p>
                      )}
                    </div>
                  )}
                  {/* Also show from question data if result didn't include it */}
                  {!r.text_excerpt && !r.source?.page && (q.text_excerpt || q.source?.page) && (
                    <div className="mt-2 p-2.5 bg-white/80 rounded-lg border border-gray-200/50">
                      {q.source?.page && (
                        <span className="inline-block text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium mr-2">
                          p. {q.source.page}
                        </span>
                      )}
                      {q.source?.source && (
                        <span className="text-xs text-gray-400">{q.source.source}</span>
                      )}
                      {q.text_excerpt && (
                        <p className="text-xs text-gray-500 mt-1 italic leading-relaxed">
                          "{q.text_excerpt}"
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          {wrongCount > 0 && (
            <button
              onClick={handleRetryWrong}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 transition disabled:opacity-50"
            >
              {loading ? <FiRefreshCw className="animate-spin" /> : <FiAlertTriangle size={16} />}
              Retry Wrong ({wrongCount})
            </button>
          )}
          <button
            onClick={resetQuiz}
            className={`${wrongCount > 0 ? "flex-1" : "w-full"} flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition`}
          >
            <FiRefreshCw size={16} /> New Quiz
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
        )}
      </div>
    );
  }

  return null;
}
