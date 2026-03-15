import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  FiLock, FiMail, FiAlertCircle, FiMessageSquare,
  FiLayers, FiCheckCircle, FiGitBranch, FiFileText, FiCpu,
  FiEye, FiEyeOff,
} from "react-icons/fi";

const FEATURES = [
  { icon: FiMessageSquare, title: "AI-Powered Chat", description: "Ask questions and get cited answers from your PDFs" },
  { icon: FiLayers, title: "Smart Flashcards", description: "Generate study cards with AI and track your progress" },
  { icon: FiCheckCircle, title: "Quiz Generator", description: "Auto-generate MCQ and short-answer quizzes" },
  { icon: FiGitBranch, title: "Mind Maps", description: "Visualize concepts and create structured summaries" },
  { icon: FiFileText, title: "Notes & Highlights", description: "Annotate documents and organize your study notes" },
  { icon: FiCpu, title: "Fully Offline", description: "Runs locally with Ollama — no data leaves your machine" },
];

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError("");
    // Clear any stale token before a fresh login attempt
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    try {
      await login(email, password);
    } catch (err) {
      if (!err?.response) {
        setError("Cannot reach the server. Make sure the backend is running on port 8000.");
      } else {
        setError(err.response.data?.detail || "Invalid email or password.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 text-white p-12 flex-col justify-between relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 right-10 w-96 h-96 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-10 left-10 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <FiCpu size={20} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">StudyAI</h1>
          </div>
          <p className="text-emerald-100 text-sm mt-1">Your AI-powered study companion</p>
        </div>

        <div className="relative z-10 space-y-5">
          <h2 className="text-xl font-semibold">Everything you need to learn smarter</h2>
          <div className="grid grid-cols-2 gap-3">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="bg-white/10 backdrop-blur-sm rounded-xl p-3.5 border border-white/10">
                <Icon size={18} className="text-emerald-200 mb-2" />
                <h3 className="font-medium text-sm mb-0.5">{title}</h3>
                <p className="text-[11px] text-emerald-200 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-xs text-emerald-300">
            Built with LangChain, FAISS, and local LLMs via Ollama
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center bg-[#FAFAFA] p-8">
        <div className="w-full max-w-sm">
          {/* Mobile header */}
          <div className="text-center mb-8">
            <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
                <FiCpu size={18} className="text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">StudyAI</h1>
            </div>
            <h2 className="text-xl font-bold text-gray-900 lg:text-2xl">Welcome back</h2>
            <p className="text-sm text-gray-500 mt-1">Sign in to your account to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200/60 p-6 space-y-4">
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl border border-red-200">
                <FiAlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Email</label>
              <div className="relative">
                <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@pdfchat.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Password</label>
              <div className="relative">
                <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  tabIndex={-1}
                >
                  {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className="text-center text-[11px] text-gray-400 mt-6">
            Powered by LangChain + Ollama &middot; Fully Local & Private
          </p>
        </div>
      </div>
    </div>
  );
}
