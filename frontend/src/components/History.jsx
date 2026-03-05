import { FiMessageSquare, FiClock, FiChevronRight } from "react-icons/fi";

export default function History({ conversations = [], activeConvoId, onOpenChat }) {
  const formatWhen = (iso) => {
    if (!iso) return "Unknown time";
    const d = new Date(iso);
    return d.toLocaleString();
  };

  return (
    <div className="h-full p-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Memory & History</h2>
        <p className="text-sm text-gray-500 mb-6">
          Reopen any conversation and continue from where you left off.
        </p>

        {conversations.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-400">
            No history yet. Start a chat and it will appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((c) => {
              const isActive = c.id === activeConvoId;
              return (
                <button
                  key={c.id}
                  onClick={() => onOpenChat?.(c.id)}
                  className={`w-full text-left bg-white border rounded-xl p-4 transition hover:shadow-sm ${
                    isActive ? "border-emerald-300 bg-emerald-50/30" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FiMessageSquare size={14} className="text-emerald-600 shrink-0" />
                        <p className="font-medium text-gray-800 truncate">{c.title}</p>
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <FiClock size={12} />
                          {formatWhen(c.updated_at || c.created_at)}
                        </span>
                        <span>{c.message_count || 0} messages</span>
                      </div>
                    </div>
                    <FiChevronRight size={16} className="text-gray-400 shrink-0 mt-1" />
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
