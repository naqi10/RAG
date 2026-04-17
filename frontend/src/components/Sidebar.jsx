import { useState } from "react";
import {
  FiPlus, FiMessageSquare, FiLayers, FiSettings, FiLogOut,
  FiEdit2, FiTrash2, FiCheck, FiX, FiChevronDown, FiChevronRight,
  FiFile, FiHome, FiCheckCircle, FiGitBranch, FiFileText,
  FiUsers, FiCpu, FiClock, FiBookOpen,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { id: "dashboard",  label: "Dashboard",  icon: FiHome,          needsWs: false },
  { id: "chat",       label: "AI Chat",    icon: FiMessageSquare, needsWs: true  },
  { id: "history",    label: "History",    icon: FiClock,         needsWs: true  },
  { id: "flashcards", label: "Flashcards", icon: FiLayers,        needsWs: true  },
  { id: "quiz",       label: "Quiz",       icon: FiCheckCircle,   needsWs: true  },
  { id: "mindmap",    label: "Mind Map",   icon: FiGitBranch,     needsWs: true  },
  { id: "notes",      label: "Notes",      icon: FiFileText,      needsWs: true  },
];

export default function Sidebar({
  active, onSelect,
  activeWsId, onRenameWs,
  pdfs, onTogglePdf, onRemovePdf,
  conversations, activeConvoId, onSelectConvo, onNewConvo, onRenameConvo, onDeleteConvo,
}) {
  const { user, logout } = useAuth();
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType]   = useState(null);
  const [showPdfs, setShowPdfs]   = useState(true);
  const [showChats, setShowChats] = useState(true);

  const startEdit  = (id, title, type) => { setEditingId(id); setEditTitle(title); setEditType(type); };
  const confirmEdit = () => {
    if (editTitle.trim() && editingId) {
      if (editType === "ws") onRenameWs(editingId, editTitle.trim());
      else onRenameConvo(editingId, editTitle.trim());
    }
    setEditingId(null); setEditType(null);
  };
  const cancelEdit = () => { setEditingId(null); setEditType(null); };

  return (
    <aside
      className="w-64 shrink-0 flex flex-col h-screen border-r relative z-10"
      style={{
        background: "rgba(255,255,255,0.42)",
        backdropFilter: "blur(22px)",
        WebkitBackdropFilter: "blur(22px)",
        borderColor: "rgba(255,255,255,0.75)",
        boxShadow: "4px 0 32px rgba(224,187,228,0.12)",
      }}
    >

      {/* ── Brand ── */}
      <div className="px-4 py-4 border-b border-white/60">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm shadow-md"
            style={{
              background: "linear-gradient(145deg, #FEC8D8, #E0BBE4)",
              boxShadow: "0 4px 16px rgba(224,187,228,0.4), 0 0 0 2px rgba(255,255,255,0.85)",
            }}
          >
            🌸
          </div>
          <div>
            <h1 className="text-[13px] font-bold text-[#6b4a63] leading-tight tracking-wide">StudyAI</h1>
            <p className="text-[10px] opacity-55 leading-tight">Dreamy RAG chat</p>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-[9px] uppercase tracking-widest px-2 mb-1.5 font-semibold opacity-50 text-[#8b5a7c]">Study tools</p>
        <nav className="space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: _Icon, needsWs }) => {
            const Icon = _Icon;
            const isActive   = active === id;
            const isDisabled = needsWs && !activeWsId;
            return (
              <button
                key={id}
                onClick={() => !isDisabled && onSelect(id)}
                disabled={isDisabled}
                className={`dreamy-btn-glow w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                  isActive
                    ? "text-[#8b3d6b] border border-white/90 bg-white/55 shadow-sm"
                    : isDisabled
                    ? "text-gray-300 cursor-not-allowed opacity-50"
                    : "text-[#5c4a5c] border border-transparent hover:bg-white/40 hover:text-[#6b4a63]"
                }`}
              >
                <Icon size={16} className={isActive ? "text-[#e85d8c]" : "opacity-70"} />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Documents + Chats ── */}
      {activeWsId && (
        <div className="flex-1 overflow-y-auto px-3 pb-3 border-t border-white/50 mt-1 pt-3">

          {/* PDFs */}
          <div className="mb-4">
            <button
              onClick={() => setShowPdfs(!showPdfs)}
              className="w-full flex items-center justify-between px-1 py-1 mb-1 group"
            >
              <span className="text-[10px] uppercase tracking-widest font-semibold flex items-center gap-1.5 opacity-55 text-[#8b5a7c]">
                <FiFile size={11} />
                Documents ({pdfs.length})
              </span>
              {showPdfs
                ? <FiChevronDown size={12} className="opacity-40" />
                : <FiChevronRight size={12} className="opacity-40" />}
            </button>

            {showPdfs && (
              <div className="space-y-0.5">
                {pdfs.length === 0 && (
                  <p className="text-[11px] italic px-2 py-1.5 opacity-45 text-[#8b5a7c]">Upload a PDF to start ✨</p>
                )}
                {pdfs.map((pdf) => (
                  <div
                    key={pdf.id}
                    className="group/pdf flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/45 transition"
                  >
                    <button
                      onClick={() => onTogglePdf(pdf.id)}
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                        pdf.is_active
                          ? "border-[#e85d8c] bg-gradient-to-br from-[#FF9AA2] to-[#E0BBE4] text-white"
                          : "border-[#E0BBE4]/80 hover:border-[#FF9AA2]/80 bg-white/30"
                      }`}
                    >
                      {pdf.is_active && <FiCheck size={9} />}
                    </button>
                    <span
                      className={`truncate flex-1 text-[11px] font-medium ${pdf.is_active ? "text-[#4a3d4f]" : "opacity-50"}`}
                      title={pdf.display_name || pdf.filename}
                    >
                      {pdf.display_name || pdf.filename}
                    </span>
                    <button
                      onClick={() => onRemovePdf(pdf.id)}
                      className="opacity-0 group-hover/pdf:opacity-100 w-6 h-6 flex items-center justify-center rounded-md text-[#8b5a7c] hover:text-red-500 hover:bg-red-50/80 transition"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </div>
                ))}
                {pdfs.filter(p => p.is_active).length > 0 && (
                  <p className="text-[10px] px-2 mt-1 text-[#c77b9e]">
                    {pdfs.filter(p => p.is_active).length}/{pdfs.length} active 💕
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Conversations */}
          <div>
            <div className="flex items-center justify-between px-1 mb-1">
              <button
                onClick={() => setShowChats(!showChats)}
                className="flex items-center gap-1.5"
              >
                <span className="text-[10px] uppercase tracking-widest font-semibold flex items-center gap-1.5 opacity-55 text-[#8b5a7c]">
                  <FiMessageSquare size={11} />
                  Chats ({conversations.length})
                </span>
                {showChats
                  ? <FiChevronDown size={12} className="opacity-40 ml-1" />
                  : <FiChevronRight size={12} className="opacity-40 ml-1" />}
              </button>

              <button
                onClick={onNewConvo}
                title="New chat"
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-white/80 text-[#b87fa8] hover:bg-white/50 hover:border-[#FEC8D8] transition dreamy-btn-glow"
              >
                <FiPlus size={15} />
              </button>
            </div>

            {showChats && (
              <div className="space-y-0.5">
                {conversations.length === 0 && (
                  <p className="text-[11px] italic px-2 py-1.5 opacity-45 text-[#8b5a7c]">No chats yet 🌷</p>
                )}
                {conversations.map((c) => {
                  const isActive  = activeConvoId === c.id;
                  const isEditing = editingId === c.id && editType === "convo";

                  return (
                    <div
                      key={c.id}
                      className={`group/c flex items-center rounded-xl transition-all ${
                        isActive
                          ? "bg-white/55 border border-white/90 shadow-sm"
                          : "border border-transparent hover:bg-white/35"
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-1.5 flex-1 px-2 py-1.5">
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                            className="flex-1 text-[11px] px-2 py-1 rounded-md border border-[#E0BBE4]/60 text-[#4a3d4f] outline-none focus:border-[#FF9AA2] bg-white/80"
                            autoFocus
                          />
                          <button
                            onClick={confirmEdit}
                            className="w-6 h-6 flex items-center justify-center rounded text-white bg-pink-500 hover:bg-pink-600 transition"
                          >
                            <FiCheck size={11} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 transition"
                          >
                            <FiX size={11} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => onSelectConvo(c.id)}
                            className={`flex-1 text-left px-3 py-2 text-[12px] font-medium truncate min-w-0 ${
                              isActive ? "text-[#b0306e]" : "text-[#5c4a5c]"
                            }`}
                          >
                            {c.title}
                          </button>

                          {/* ── Action buttons — CSS group hover (reliable, no React state) ── */}
                          <div className="flex items-center gap-0.5 pr-1.5 opacity-0 group-hover/c:opacity-100 transition-opacity">
                            <button
                              onMouseDown={(e) => {
                                e.preventDefault(); // prevent blur before click
                                e.stopPropagation();
                                startEdit(c.id, c.title, "convo");
                              }}
                              title="Rename"
                              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                            >
                              <FiEdit2 size={13} />
                            </button>
                            <button
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onDeleteConvo(c.id);
                              }}
                              title="Delete"
                              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                            >
                              <FiTrash2 size={13} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {!activeWsId && <div className="flex-1" />}

      {/* ── Footer ── */}
      <div className="border-t border-white/55 px-3 py-2.5 space-y-0.5 bg-white/25">
        <button
          onClick={() => onSelect("settings")}
          className={`dreamy-btn-glow w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition ${
            active === "settings"
              ? "bg-white/55 text-[#b0306e] border border-white/80"
              : "text-[#5c4a5c] hover:bg-white/40"
          }`}
        >
          <FiSettings size={16} className={active === "settings" ? "text-[#e85d8c]" : "opacity-70"} />
          Settings
        </button>

        {user?.role === "admin" && (
          <button
            onClick={() => onSelect("admin")}
            className={`dreamy-btn-glow w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition ${
              active === "admin"
                ? "bg-white/55 text-[#b0306e] border border-white/80"
                : "text-[#5c4a5c] hover:bg-white/40"
            }`}
          >
            <FiUsers size={16} className={active === "admin" ? "text-[#e85d8c]" : "opacity-70"} />
            Admin
          </button>
        )}

        <div className="flex items-center gap-2.5 px-2 py-2 mt-0.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #FF9AA2, #E0BBE4)",
              boxShadow: "0 2px 10px rgba(224,187,228,0.45)",
            }}
          >
            {(user?.display_name || user?.email || "U")[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-[#4a3d4f] truncate">
              {user?.display_name || user?.email?.split("@")[0]}
            </p>
            <p className="text-[10px] opacity-50 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            title="Logout"
            className="w-7 h-7 flex items-center justify-center rounded-lg opacity-50 hover:text-red-600 hover:bg-red-50/80 transition"
          >
            <FiLogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
