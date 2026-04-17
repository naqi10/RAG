import { FiMessageSquare, FiClock, FiChevronRight, FiSearch, FiInbox, FiTrendingUp, FiBookOpen, FiTrash2 } from "react-icons/fi";
import { useState, useMemo } from "react";

/* ── Demo conversations — realistic Pakistani university students ── */
const DEMO_CONVERSATIONS = [
  { id: "demo-1", title: "Operating System Scheduling Algorithms", message_count: 24, updated_at: daysAgo(0, 2), tags: ["CS-301", "OS"] },
  { id: "demo-2", title: "Database Normalization (1NF to BCNF)", message_count: 18, updated_at: daysAgo(0, 5), tags: ["CS-202", "DB"] },
  { id: "demo-3", title: "Pakistan Studies: Lahore Resolution 1940", message_count: 31, updated_at: daysAgo(1, 1), tags: ["HUM-101"] },
  { id: "demo-4", title: "Calculus II: Integration by Parts", message_count: 15, updated_at: daysAgo(1, 4), tags: ["MTH-201"] },
  { id: "demo-5", title: "OOP Concepts: Polymorphism vs Inheritance", message_count: 22, updated_at: daysAgo(1, 8), tags: ["CS-103", "OOP"] },
  { id: "demo-6", title: "Data Structures: AVL Tree Rotations", message_count: 19, updated_at: daysAgo(2, 3), tags: ["CS-201"] },
  { id: "demo-7", title: "Islamic Studies: Surah Al-Baqarah Tafseer", message_count: 27, updated_at: daysAgo(2, 6), tags: ["ISL-101"] },
  { id: "demo-8", title: "Computer Networks: TCP/IP vs OSI Model", message_count: 16, updated_at: daysAgo(3, 2), tags: ["CS-302"] },
  { id: "demo-9", title: "Software Engineering: Agile vs Waterfall", message_count: 14, updated_at: daysAgo(3, 7), tags: ["SE-201"] },
  { id: "demo-10", title: "Discrete Maths: Graph Theory Basics", message_count: 20, updated_at: daysAgo(4, 1), tags: ["MTH-301"] },
  { id: "demo-11", title: "English Composition: Essay Writing Tips", message_count: 11, updated_at: daysAgo(4, 5), tags: ["ENG-101"] },
  { id: "demo-12", title: "Digital Logic Design: Karnaugh Maps", message_count: 23, updated_at: daysAgo(5, 3), tags: ["EE-201"] },
  { id: "demo-13", title: "Artificial Intelligence: Search Algorithms", message_count: 28, updated_at: daysAgo(5, 6), tags: ["CS-401", "AI"] },
  { id: "demo-14", title: "Probability & Statistics: Bayes Theorem", message_count: 17, updated_at: daysAgo(6, 2), tags: ["MTH-202"] },
  { id: "demo-15", title: "Web Development: React Hooks Explained", message_count: 25, updated_at: daysAgo(6, 8), tags: ["CS-305", "Web"] },
  { id: "demo-16", title: "Linear Algebra: Eigenvalues & Eigenvectors", message_count: 13, updated_at: daysAgo(7, 4), tags: ["MTH-203"] },
  { id: "demo-17", title: "Compiler Design: Lexical Analysis", message_count: 19, updated_at: daysAgo(8, 1), tags: ["CS-403"] },
  { id: "demo-18", title: "Pakistan Economy: CPEC Impact Analysis", message_count: 21, updated_at: daysAgo(9, 5), tags: ["ECO-201"] },
  { id: "demo-19", title: "Theory of Automata: NFA to DFA Conversion", message_count: 16, updated_at: daysAgo(10, 3), tags: ["CS-303"] },
  { id: "demo-20", title: "Machine Learning: Neural Network Backprop", message_count: 30, updated_at: daysAgo(11, 2), tags: ["CS-402", "ML"] },
  { id: "demo-21", title: "Technical Writing: Report Formatting", message_count: 9, updated_at: daysAgo(12, 6), tags: ["ENG-201"] },
  { id: "demo-22", title: "Parallel Computing: MPI vs OpenMP", message_count: 14, updated_at: daysAgo(13, 1), tags: ["CS-404"] },
  { id: "demo-23", title: "Urdu Adab: Allama Iqbal ki Shayeri", message_count: 18, updated_at: daysAgo(14, 4), tags: ["URD-101"] },
  { id: "demo-24", title: "Physics: Electromagnetic Waves", message_count: 12, updated_at: daysAgo(15, 7), tags: ["PHY-201"] },
  { id: "demo-25", title: "Cloud Computing: AWS vs Azure", message_count: 22, updated_at: daysAgo(16, 2), tags: ["CS-405"] },
];

function daysAgo(days, hours = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

function formatWhen(iso) {
  if (!iso) return "Unknown time";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: diffDays > 365 ? "numeric" : undefined });
}

export default function History({ conversations = [], activeConvoId, onOpenChat, onDeleteChat }) {
  const [search, setSearch] = useState("");

  // Merge real conversations with demo data
  const allConversations = useMemo(() => {
    const real = conversations.map((c) => ({ ...c, isReal: true }));
    // Only show demo data to fill the screen
    const demoNeeded = Math.max(0, 25 - conversations.length);
    const demo = DEMO_CONVERSATIONS.slice(0, demoNeeded).map((c) => ({ ...c, isReal: false }));
    return [...real, ...demo];
  }, [conversations]);

  const filtered = allConversations.filter((c) =>
    c.title?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
  );

  const totalMessages = allConversations.reduce((sum, c) => sum + (c.message_count || 0), 0);

  return (
    <div className="h-full p-6 bg-gradient-to-b from-pink-50/30 via-white to-white">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-[#6b4a63] mb-1">Chat History</h2>
            <p className="text-sm text-gray-500">
              {allConversations.length} conversation{allConversations.length !== 1 ? "s" : ""} — continue from where you left off
            </p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="dreamy-glass-card rounded-xl px-4 py-3 flex items-center gap-3 border border-white/80">
            <div className="w-9 h-9 rounded-lg bg-pink-50 flex items-center justify-center">
              <FiMessageSquare size={16} className="text-pink-500" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-800">{allConversations.length}</p>
              <p className="text-[11px] text-gray-400">Total Chats</p>
            </div>
          </div>
          <div className="dreamy-glass-card rounded-xl px-4 py-3 flex items-center gap-3 border border-white/80">
            <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
              <FiBookOpen size={16} className="text-purple-500" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-800">{totalMessages}</p>
              <p className="text-[11px] text-gray-400">Total Messages</p>
            </div>
          </div>
          <div className="dreamy-glass-card rounded-xl px-4 py-3 flex items-center gap-3 border border-white/80">
            <div className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center">
              <FiTrendingUp size={16} className="text-rose-500" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-800">
                {sorted.length > 0 ? Math.round(totalMessages / allConversations.length) : 0}
              </p>
              <p className="text-[11px] text-gray-400">Avg per Chat</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none transition bg-white/75 backdrop-blur-sm shadow-sm"
            style={{ borderColor: "rgba(224,187,228,0.55)" }}
          />
        </div>

        {/* Conversation list */}
        {sorted.length === 0 ? (
          <div className="dreamy-glass-card rounded-2xl p-12 text-center border border-white/80">
            <div className="w-14 h-14 rounded-2xl bg-pink-50 flex items-center justify-center mx-auto mb-4">
              <FiInbox size={24} className="text-pink-400" />
            </div>
            <p className="text-gray-700 font-medium mb-1">
              {search ? "No matching conversations" : "No history yet"}
            </p>
            <p className="text-sm text-gray-400">
              {search ? "Try a different search term." : "Start a chat and it will appear here."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((c) => {
              const isActive = c.id === activeConvoId;
              const isReal = c.isReal !== false;
              return (
                <div
                  key={c.id}
                  className={`w-full text-left rounded-xl p-4 transition hover:shadow-sm border group ${
                    isActive
                      ? "border-pink-300 bg-pink-50/40 shadow-sm"
                      : "border-[#E0BBE4]/50 bg-white/50 hover:border-[#FF9AA2]/50 hover:bg-white/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => isReal && onOpenChat?.(c.id)}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-pink-100" : "bg-gray-100"}`}>
                          <FiMessageSquare size={12} className={isActive ? "text-pink-600" : "text-gray-400"} />
                        </div>
                        <p className={`font-medium truncate text-sm ${isActive ? "text-pink-800" : "text-gray-800"}`}>
                          {c.title}
                        </p>
                        {isActive && (
                          <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-pink-500 text-white">ACTIVE</span>
                        )}
                      </div>
                      <div className="mt-1.5 ml-8 flex items-center gap-3 text-xs text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <FiClock size={11} />
                          {formatWhen(c.updated_at || c.created_at)}
                        </span>
                        {c.message_count > 0 && (
                          <span>{c.message_count} message{c.message_count !== 1 ? "s" : ""}</span>
                        )}
                        {c.tags && c.tags.length > 0 && (
                          <div className="flex items-center gap-1">
                            {c.tags.map((tag) => (
                              <span key={tag} className="text-[10px] bg-pink-50 text-pink-500 px-1.5 py-0.5 rounded-md">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0 mt-1">
                      {isReal && onDeleteChat && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteChat(c.id);
                          }}
                          className="p-1.5 rounded-lg text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                          title="Delete conversation"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      )}
                      <FiChevronRight size={15} className="text-gray-300" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
