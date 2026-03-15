import { FiMessageSquare, FiClock, FiChevronRight, FiSearch, FiInbox } from "react-icons/fi";
import { useState } from "react";

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

export default function History({ conversations = [], activeConvoId, onOpenChat }) {
  const [search, setSearch] = useState("");

  const filtered = conversations.filter((c) =>
    c.title?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
  );

  return (
    <div className="h-full p-6 bg-gradient-to-b from-rose-50/20 via-white to-white">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-1">Chat History</h2>
            <p className="text-sm text-gray-500">
              {conversations.length} conversation{conversations.length !== 1 ? "s" : ""} — continue from where you left off
            </p>
          </div>
        </div>

        {/* Search */}
        {conversations.length > 3 && (
          <div className="relative mb-4">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition bg-white"
            />
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-4">
              <FiInbox size={24} className="text-rose-400" />
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
              return (
                <button
                  key={c.id}
                  onClick={() => onOpenChat?.(c.id)}
                  className={`w-full text-left rounded-xl p-4 transition hover:shadow-sm border ${
                    isActive
                      ? "border-rose-300 bg-rose-50/40 shadow-sm"
                      : "border-gray-200 bg-white hover:border-rose-200/60 hover:bg-rose-50/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-rose-100" : "bg-gray-100"}`}>
                          <FiMessageSquare size={12} className={isActive ? "text-rose-600" : "text-gray-400"} />
                        </div>
                        <p className={`font-medium truncate text-sm ${isActive ? "text-rose-800" : "text-gray-800"}`}>
                          {c.title}
                        </p>
                        {isActive && (
                          <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-rose-500 text-white">ACTIVE</span>
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
                      </div>
                    </div>
                    <FiChevronRight size={15} className="text-gray-300 shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
