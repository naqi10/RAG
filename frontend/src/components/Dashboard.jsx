import { useState, useEffect, useMemo } from "react";
import {
  FiFileText, FiMessageSquare, FiAward, FiZap,
  FiUpload, FiLayers, FiCheckCircle, FiGitBranch,
  FiEdit2, FiBookOpen, FiChevronRight,
  FiClock, FiTrendingUp, FiStar,
} from "react-icons/fi";
import { getOverviewStats } from "../api/client";

/* ── Streak Calendar (GitHub-style) ── */
function StreakCalendar({ streakDays = 0 }) {
  const weeks = 12;
  const today = new Date();
  const cells = [];
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    // Simulate activity: recent days active based on streak, older days random
    const daysAgo = i;
    let active = false;
    if (daysAgo < streakDays) active = true;
    else if (daysAgo < 60) active = Math.random() > 0.6;
    else active = Math.random() > 0.8;
    cells.push({ date: d, active, daysAgo });
  }

  const grid = [];
  for (let col = 0; col < weeks; col++) {
    const week = [];
    for (let row = 0; row < 7; row++) {
      week.push(cells[col * 7 + row]);
    }
    grid.push(week);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <FiZap size={14} className="text-pink-500" />
        <span className="text-sm font-semibold text-gray-700">Study Activity</span>
        <span className="text-xs text-gray-400 ml-auto">{streakDays} day streak</span>
      </div>
      <div className="flex gap-[3px]">
        {grid.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((cell, ci) => (
              <div
                key={ci}
                className="w-[11px] h-[11px] rounded-[2px] transition-colors"
                style={{
                  background: cell?.active
                    ? cell.daysAgo < 3 ? "#ec4899" : cell.daysAgo < 14 ? "#f9a8d4" : "#fce7f3"
                    : "rgba(0,0,0,0.04)",
                }}
                title={cell ? `${cell.date.toLocaleDateString()}${cell.active ? " - Active" : ""}` : ""}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-400">
        <span>Less</span>
        <div className="w-[11px] h-[11px] rounded-[2px]" style={{ background: "rgba(0,0,0,0.04)" }} />
        <div className="w-[11px] h-[11px] rounded-[2px]" style={{ background: "#fce7f3" }} />
        <div className="w-[11px] h-[11px] rounded-[2px]" style={{ background: "#f9a8d4" }} />
        <div className="w-[11px] h-[11px] rounded-[2px]" style={{ background: "#ec4899" }} />
        <span>More</span>
      </div>
    </div>
  );
}

/* ── Mini bar chart ── */
function MiniBarChart({ data, label }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <FiTrendingUp size={14} className="text-purple-500" />
        <span className="text-sm font-semibold text-gray-700">{label}</span>
      </div>
      <div className="flex items-end gap-1 h-16">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full rounded-t-sm transition-all"
              style={{
                height: `${Math.max((d.value / max) * 100, 4)}%`,
                background: `linear-gradient(to top, #ec4899, #E0BBE4)`,
                opacity: 0.4 + (d.value / max) * 0.6,
              }}
            />
            <span className="text-[9px] text-gray-400">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ icon: Icon, label, value, color = "emerald", onClick, hint }) {
  const colorMap = {
    emerald: "bg-pink-50 text-pink-600",
    blue: "bg-fuchsia-50 text-fuchsia-600",
    purple: "bg-purple-50 text-purple-600",
    amber: "bg-rose-50 text-rose-500",
    rose: "bg-rose-50 text-rose-600",
    teal: "bg-pink-50 text-pink-500",
  };
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`dreamy-glass-card rounded-xl p-4 text-left transition ${onClick ? "hover:shadow-md hover:border-gray-300/80 cursor-pointer" : ""}`}
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
    emerald: "bg-pink-50 text-pink-600 group-hover:bg-pink-100",
    blue: "bg-fuchsia-50 text-fuchsia-600 group-hover:bg-fuchsia-100",
    purple: "bg-purple-50 text-purple-500 group-hover:bg-purple-100",
    amber: "bg-rose-50 text-rose-500 group-hover:bg-rose-100",
    red: "bg-red-50 text-red-500 group-hover:bg-red-100",
    pink: "bg-pink-50 text-pink-500 group-hover:bg-pink-100",
  };
  return (
    <button onClick={onClick} className="group dreamy-glass-card rounded-xl p-5 text-left hover:shadow-lg transition-all duration-200 border border-white/80">
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

/* ── Weekly activity data (simulated from stats) ── */
function getWeeklyData(stats) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const today = new Date().getDay(); // 0=Sun
  return days.map((label, i) => {
    const dayIndex = (i + 1) % 7; // Mon=1 ... Sun=0
    const isToday = dayIndex === today;
    const isPast = (dayIndex < today) || (dayIndex === 0 && today !== 0);
    const msgs = stats?.total_messages || 0;
    let value = 0;
    if (isToday) value = Math.min(msgs, 20) + Math.floor(Math.random() * 5);
    else if (isPast) value = Math.floor(Math.random() * 15) + 2;
    else value = 0;
    return { label, value };
  });
}

export default function Dashboard({ user, onSelectTab, conversations = [], pdfs = [], onOpenConvo }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      try { setStats(await getOverviewStats()); } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    getOverviewStats().then(setStats).catch(() => {});
  }, [conversations.length, pdfs.length]);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const weeklyData = useMemo(() => getWeeklyData(stats), [stats]);

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
    <div className="max-w-5xl mx-auto py-8 px-6 flex-1">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#6b4a63] mb-1 tracking-wide">
          {greeting()}, {user?.display_name || user?.email?.split("@")[0] || "there"} 💕
        </h1>
        <p className="text-sm opacity-65">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        <StatCard icon={FiFileText} label="Documents" value={pdfs.length} color="emerald" onClick={() => onSelectTab?.("chat")} hint="Open documents" />
        <StatCard icon={FiMessageSquare} label="Chats" value={conversations.length} color="blue" onClick={() => onSelectTab?.("history")} hint="View history" />
        <StatCard icon={FiBookOpen} label="Messages" value={stats?.total_messages ?? 0} color="teal" />
        <StatCard icon={FiEdit2} label="Notes" value={stats?.total_notes ?? 0} color="pink" onClick={() => onSelectTab?.("notes")} hint="Open notes" />
        <StatCard icon={FiAward} label="Avg Quiz" value={`${stats?.average_quiz_score ?? 0}%`} color="purple" onClick={() => onSelectTab?.("quiz")} hint="Open quiz" />
        <StatCard icon={FiZap} label="Streak" value={`${stats?.study_streak_days ?? 0}d`} color="amber" />
      </div>

      {/* Main grid: 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Column 1: Getting Started + Recent Chats */}
        <div className="space-y-4">
          {isNew || !allDone ? (
            <div className="dreamy-glass-card rounded-xl p-5 border border-white/80">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm text-sm"
                  style={{ background: "linear-gradient(145deg, #FEC8D8, #E0BBE4)" }}>✨</div>
                <div>
                  <h2 className="text-sm font-semibold text-[#6b4a63]">Getting Started</h2>
                  <p className="text-[11px] opacity-55">{completedSteps}/{STEPS.length} steps done</p>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
                <div className="bg-pink-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${(completedSteps / STEPS.length) * 100}%` }} />
              </div>
              <div className="space-y-2.5">
                {STEPS.map((step) => {
                  const done = step.done(stats);
                  return (
                    <div key={step.key} className={`flex items-center gap-3 ${done ? "opacity-50" : ""}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-pink-500" : "bg-gray-100"}`}>
                        {done ? <FiCheckCircle size={13} className="text-white" /> : <step.icon size={12} className="text-gray-400" />}
                      </div>
                      <span className={`text-xs ${done ? "line-through text-gray-400" : "text-gray-700"}`}>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl border border-pink-200/40 p-5">
              <p className="text-2xl mb-2">🎉</p>
              <h3 className="font-semibold text-pink-800 text-sm mb-1">All set up!</h3>
              <p className="text-xs text-pink-600 leading-relaxed">You've completed all the getting started steps. Keep studying!</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-pink-500">
                <FiZap size={12} />
                <span>{stats?.study_streak_days ?? 0}-day streak</span>
              </div>
            </div>
          )}

          {/* Recent Conversations */}
          {recentConvos.length > 0 && (
            <div className="dreamy-glass-card rounded-xl p-5 border border-white/80">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent Chats</h2>
              <div className="space-y-1">
                {recentConvos.map((c) => (
                  <button key={c.id} onClick={() => onOpenConvo?.(c.id)}
                    className="w-full flex items-center justify-between text-left px-2 py-2 rounded-lg hover:bg-gray-50 transition group">
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
                <button onClick={() => onSelectTab?.("history")}
                  className="mt-2 w-full text-center text-[11px] text-pink-600 hover:text-pink-700 transition py-1">
                  View all {conversations.length} chats →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Column 2: Streak Calendar + Weekly Activity */}
        <div className="space-y-4">
          <div className="dreamy-glass-card rounded-xl p-5 border border-white/80">
            <StreakCalendar streakDays={stats?.study_streak_days ?? 3} />
          </div>
          <div className="dreamy-glass-card rounded-xl p-5 border border-white/80">
            <MiniBarChart data={weeklyData} label="This Week's Activity" />
          </div>
          {/* Quick study tip */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-200/40 p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                <FiStar size={14} className="text-purple-500" />
              </div>
              <div>
                <p className="text-xs font-semibold text-purple-800 mb-1">Study Tip</p>
                <p className="text-[11px] text-purple-600 leading-relaxed">
                  Use flashcards after reading a chapter to boost retention by 40%. Try generating cards from your most recent PDF!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Quick Actions */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {features.map((f) => (
              <FeatureCard key={f.tab + f.title} {...f} onClick={() => onSelectTab?.(f.tab)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
