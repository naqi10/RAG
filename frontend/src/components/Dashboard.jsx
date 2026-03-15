import { useState, useEffect } from "react";
import {
  FiFileText, FiMessageSquare, FiAward, FiZap,
  FiUpload, FiLayers, FiCheckCircle, FiGitBranch,
  FiEdit2, FiRefreshCw, FiBookOpen, FiChevronRight,
  FiClock, FiCpu,
} from "react-icons/fi";
import { getOverviewStats } from "../api/client";

function StatCard({ icon: Icon, label, value, color = "emerald", onClick, hint }) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    teal: "bg-teal-50 text-teal-600",
  };

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200/60 shadow-sm p-4 text-left transition ${
        onClick ? "hover:shadow-md hover:border-gray-300/80 cursor-pointer" : ""
      }`}
      title={hint || ""}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.emerald}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </Wrapper>
  );
}

function FeatureCard({ icon: Icon, title, description, color = "emerald", onClick }) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100",
    blue: "bg-blue-50 text-blue-600 group-hover:bg-blue-100",
    purple: "bg-purple-50 text-purple-600 group-hover:bg-purple-100",
    amber: "bg-amber-50 text-amber-600 group-hover:bg-amber-100",
    red: "bg-red-50 text-red-600 group-hover:bg-red-100",
    pink: "bg-pink-50 text-pink-600 group-hover:bg-pink-100",
  };

  return (
    <button
      onClick={onClick}
      className="group bg-white rounded-xl border border-gray-200/60 shadow-sm p-5 text-left hover:shadow-md hover:border-gray-300/60 transition-all duration-200"
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition ${colorMap[color] || colorMap.emerald}`}>
        <Icon size={18} />
      </div>
      <h3 className="font-semibold text-gray-900 text-sm mb-1">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
    </button>
  );
}

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STEPS = [
  { icon: FiUpload, label: "Upload a PDF", key: "pdf", done: (s) => s?.total_pdfs > 0 },
  { icon: FiMessageSquare, label: "Start your first chat", key: "chat", done: (s) => s?.total_conversations > 0 },
  { icon: FiCheckCircle, label: "Take a quiz", key: "quiz", done: (s) => s?.total_quizzes > 0 },
  { icon: FiEdit2, label: "Write a note", key: "notes", done: (s) => s?.total_notes > 0 },
];

export default function Dashboard({ user, workspaces, onSelectTab, onSelectWorkspace, conversations = [], pdfs = [], onOpenConvo }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getOverviewStats();
        setStats(data);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Re-fetch background stats when conversation/pdf counts change (for messages, notes, quiz counts)
  useEffect(() => {
    getOverviewStats().then(setStats).catch(() => {});
  }, [conversations.length, pdfs.length]);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const features = [
    { icon: FiMessageSquare, title: "AI Chat", description: "Ask questions about your PDFs with RAG-powered answers.", color: "emerald", tab: "chat" },
    { icon: FiLayers, title: "Flashcards", description: "Generate study flashcards and test your recall.", color: "blue", tab: "flashcards" },
    { icon: FiCheckCircle, title: "Quiz", description: "Take auto-generated quizzes: MCQ, True/False, Fill-blank.", color: "purple", tab: "quiz" },
    { icon: FiGitBranch, title: "Mind Map", description: "Visualize concepts and create structured summaries.", color: "amber", tab: "mindmap" },
    { icon: FiEdit2, title: "Notes", description: "Annotate, highlight, and organize study notes.", color: "pink", tab: "notes" },
    { icon: FiUpload, title: "Upload PDF", description: "Add new documents in chat using the + button.", color: "red", tab: "chat" },
  ];

  const recentConvos = [...conversations]
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 5);

  const completedSteps = STEPS.filter((s) => s.done(stats)).length;
  const allDone = completedSteps === STEPS.length;
  const isNew = pdfs.length === 0;

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {greeting()}, {user?.display_name || user?.email?.split("@")[0] || "there"}
        </h1>
        <p className="text-sm text-gray-500">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Stats — Documents & Chats use live prop counts (instant), rest from API */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-8">
        <StatCard icon={FiFileText} label="Documents" value={pdfs.length} color="emerald"
          onClick={() => onSelectTab?.("chat")} hint="Open documents" />
        <StatCard icon={FiMessageSquare} label="Chats" value={conversations.length} color="blue"
          onClick={() => onSelectTab?.("history")} hint="View history" />
        <StatCard icon={FiBookOpen} label="Messages" value={stats?.total_messages ?? 0} color="teal" />
        <StatCard icon={FiEdit2} label="Notes" value={stats?.total_notes ?? 0} color="pink"
          onClick={() => onSelectTab?.("notes")} hint="Open notes" />
        <StatCard icon={FiAward} label="Avg Quiz" value={`${stats?.average_quiz_score ?? 0}%`} color="purple"
          onClick={() => onSelectTab?.("quiz")} hint="Open quiz" />
        <StatCard icon={FiZap} label="Streak" value={`${stats?.study_streak_days ?? 0}d`} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Getting Started / Recent Chats */}
        <div className="lg:col-span-1">
          {isNew || !allDone ? (
            <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                  <FiCpu size={14} className="text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Getting Started</h2>
                  <p className="text-[11px] text-gray-400">{completedSteps}/{STEPS.length} steps done</p>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${(completedSteps / STEPS.length) * 100}%` }}
                />
              </div>
              <div className="space-y-2.5">
                {STEPS.map((step) => {
                  const done = step.done(stats);
                  return (
                    <div key={step.key} className={`flex items-center gap-3 ${done ? "opacity-50" : ""}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-emerald-500" : "bg-gray-100"}`}>
                        {done ? (
                          <FiCheckCircle size={13} className="text-white" />
                        ) : (
                          <step.icon size={12} className="text-gray-400" />
                        )}
                      </div>
                      <span className={`text-xs ${done ? "line-through text-gray-400" : "text-gray-700"}`}>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-200/40 p-5">
              <p className="text-2xl mb-2">🎉</p>
              <h3 className="font-semibold text-emerald-900 text-sm mb-1">All set up!</h3>
              <p className="text-xs text-emerald-700 leading-relaxed">You've completed all the getting started steps. Keep studying!</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600">
                <FiZap size={12} />
                <span>{stats?.study_streak_days ?? 0}-day streak</span>
              </div>
            </div>
          )}

          {/* Recent Conversations */}
          {recentConvos.length > 0 && (
            <div className="mt-4 bg-white rounded-xl border border-gray-200/60 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent Chats</h2>
              <div className="space-y-1">
                {recentConvos.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onOpenConvo?.(c.id)}
                    className="w-full flex items-center justify-between text-left px-2 py-2 rounded-lg hover:bg-gray-50 transition group"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{c.title}</p>
                      <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                        <FiClock size={9} />
                        {formatWhen(c.updated_at || c.created_at)}
                        {c.message_count > 0 && <span className="ml-1">· {c.message_count} msg</span>}
                      </p>
                    </div>
                    <FiChevronRight size={12} className="text-gray-300 group-hover:text-gray-500 shrink-0 transition" />
                  </button>
                ))}
              </div>
              {conversations.length > 5 && (
                <button
                  onClick={() => onSelectTab?.("history")}
                  className="mt-2 w-full text-center text-[11px] text-emerald-600 hover:text-emerald-700 transition py-1"
                >
                  View all {conversations.length} chats →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Features Grid */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {features.map((f) => (
              <FeatureCard
                key={f.tab + f.title}
                {...f}
                onClick={() => onSelectTab?.(f.tab)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
