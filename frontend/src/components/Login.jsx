import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  FiLock, FiMail, FiAlertCircle, FiMessageSquare,
  FiLayers, FiCheckCircle, FiGitBranch, FiFileText, FiCpu,
  FiEye, FiEyeOff,
} from "react-icons/fi";
import DreamyBackground from "./DreamyBackground";

const FEATURES = [
  { icon: FiMessageSquare, title: "AI-Powered Chat", description: "Ask questions and get cited answers from your PDFs" },
  { icon: FiLayers, title: "Smart Flashcards", description: "Generate study cards with AI and track your progress" },
  { icon: FiCheckCircle, title: "Quiz Generator", description: "Auto-generate MCQ and short-answer quizzes" },
  { icon: FiGitBranch, title: "Mind Maps", description: "Visualize concepts and create structured summaries" },
  { icon: FiFileText, title: "Notes & Highlights", description: "Annotate documents and organize your study notes" },
  { icon: FiCpu, title: "Private by design", description: "Optional on-device mode — your library stays yours" },
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
    <div className="relative min-h-screen flex">
      <DreamyBackground />

      {/* Left — branding */}
      <div className="hidden lg:flex lg:w-[46%] relative z-10 p-10 xl:p-12 flex-col justify-center gap-10 xl:gap-12 text-[#5c3d55]">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-lg"
              style={{
                background: "linear-gradient(145deg, #FEC8D8, #E0BBE4)",
                boxShadow: "0 8px 28px rgba(224,187,228,0.45), 0 0 0 2px rgba(255,255,255,0.9)",
              }}
            >
              ✨
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-wide text-[#6b4a63]">StudyAI</h1>
              <p className="text-xs tracking-wider opacity-75">Academic RAG App</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-wide text-[#6b4a63]">
            Everything you need
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {FEATURES.map(({ icon: _Icon, title, description }) => {
              const Icon = _Icon;
              return (
              <div
                key={title}
                className="dreamy-glass-card rounded-2xl p-3.5 border border-white/80"
              >
                <Icon size={17} className="text-[#c77b9e] mb-2" />
                <h3 className="font-medium text-sm text-[#6b4a63] mb-0.5">{title}</h3>
                <p className="text-[11px] leading-relaxed opacity-80">{description}</p>
              </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative z-10">
        <div className="w-full max-w-[400px]">
          <div className="text-center mb-8">
            <div className="lg:hidden flex items-center justify-center gap-2 mb-5">
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                style={{
                  background: "linear-gradient(145deg, #FEC8D8, #E0BBE4)",
                  boxShadow: "0 6px 20px rgba(224,187,228,0.4)",
                }}
              >
                🌷
              </span>
              <h1 className="text-xl font-semibold text-[#6b4a63] tracking-wide">StudyAI</h1>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#6b4a63] tracking-wide">Welcome back</h2>
            <p className="text-sm mt-2 opacity-70">Sign in to continue to Academic RAG App</p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="dreamy-glass-card-strong rounded-[1.75rem] p-6 sm:p-7 space-y-4"
          >
            {error && (
              <div
                className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border backdrop-blur-sm"
                style={{
                  background: "rgba(254,202,202,0.45)",
                  borderColor: "rgba(248,113,113,0.35)",
                  color: "#991b1b",
                }}
              >
                <FiAlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1.5 opacity-80 tracking-wide">Email</label>
              <div className="relative">
                <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-45" size={15} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition shadow-sm bg-white/80"
                  style={{ borderColor: "rgba(224,187,228,0.55)", color: "#4a3d4f" }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "rgba(255,154,162,0.85)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(255,192,203,0.4), 0 0 24px rgba(224,187,228,0.25)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(224,187,228,0.55)";
                    e.target.style.boxShadow = "";
                  }}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5 opacity-80 tracking-wide">Password</label>
              <div className="relative">
                <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 opacity-45" size={15} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl border text-sm outline-none transition shadow-sm bg-white/80"
                  style={{ borderColor: "rgba(224,187,228,0.55)", color: "#4a3d4f" }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "rgba(255,154,162,0.85)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(255,192,203,0.4), 0 0 24px rgba(224,187,228,0.25)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "rgba(224,187,228,0.55)";
                    e.target.style.boxShadow = "";
                  }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-45 hover:opacity-80 transition"
                  tabIndex={-1}
                >
                  {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="dreamy-btn-glow w-full py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-45 tracking-wide"
              style={{
                background: "linear-gradient(135deg, #FF9AA2 0%, #FFC0CB 45%, #E0BBE4 100%)",
                boxShadow: "0 8px 28px rgba(255,154,162,0.4)",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                "Sign in ✨"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
