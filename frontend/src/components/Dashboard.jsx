import { useState, useEffect } from "react";
import {
  FiFileText, FiMessageSquare, FiAward, FiZap,
  FiUpload, FiLayers, FiCheckCircle, FiGitBranch,
  FiEdit2, FiBarChart2, FiRefreshCw,
} from "react-icons/fi";
import { getOverviewStats } from "../api/client";

function StatCard({ icon: Icon, label, value, color = "emerald" }) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
    amber: "bg-amber-50 text-amber-600",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.emerald}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
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

export default function Dashboard({ user, workspaces, onSelectTab, onSelectWorkspace }) {
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

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const features = [
    { icon: FiMessageSquare, title: "AI Chat", description: "Ask questions about your PDFs with RAG-powered answers.", color: "emerald", tab: "chat" },
    { icon: FiLayers, title: "Flashcards", description: "Generate study flashcards and test your recall.", color: "blue", tab: "flashcards" },
    { icon: FiCheckCircle, title: "Quiz", description: "Take auto-generated quizzes with MCQ and short-answer.", color: "purple", tab: "quiz" },
    { icon: FiGitBranch, title: "Mind Map", description: "Visualize concepts and create structured summaries.", color: "amber", tab: "mindmap" },
    { icon: FiEdit2, title: "Notes", description: "Annotate, highlight, and organize study notes.", color: "pink", tab: "notes" },
    { icon: FiUpload, title: "Upload PDF", description: "Add new documents to your workspace.", color: "red", tab: "upload" },
  ];

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

      {/* Stats */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm mb-8">
          <FiRefreshCw className="animate-spin" /> Loading stats...
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard icon={FiFileText} label="Documents" value={stats.total_pdfs} color="emerald" />
          <StatCard icon={FiMessageSquare} label="Conversations" value={stats.total_conversations} color="blue" />
          <StatCard icon={FiAward} label="Avg Quiz Score" value={`${stats.average_quiz_score}%`} color="purple" />
          <StatCard icon={FiZap} label="Study Streak" value={`${stats.study_streak_days}d`} color="amber" />
        </div>
      ) : null}

      {/* Features Grid */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {features.map((f) => (
            <FeatureCard
              key={f.tab}
              {...f}
              onClick={() => {
                if (workspaces.length > 0) {
                  onSelectWorkspace?.(workspaces[0]);
                  onSelectTab?.(f.tab);
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* Recent Workspaces */}
      {workspaces.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Your Workspaces</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {workspaces.slice(0, 6).map((ws) => (
              <button
                key={ws.id}
                onClick={() => onSelectWorkspace?.(ws)}
                className="bg-white rounded-xl border border-gray-200/60 p-4 text-left hover:shadow-sm hover:border-gray-300/60 transition-all duration-200"
              >
                <h3 className="font-semibold text-gray-900 text-sm mb-1">{ws.title}</h3>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{ws.pdf_count ?? 0} PDFs</span>
                  <span>{ws.conversation_count ?? 0} chats</span>
                  {ws.updated_at && (
                    <span>Updated {new Date(ws.updated_at).toLocaleDateString()}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {workspaces.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200/60">
          <FiFileText size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500 mb-1">No workspaces yet</p>
          <p className="text-xs text-gray-400">Create a workspace from the sidebar to get started.</p>
        </div>
      )}
    </div>
  );
}
