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
  workspaces, activeWsId, onSelectWs, onNewWs, onRenameWs, onDeleteWs,
  pdfs, onTogglePdf, onRemovePdf,
  conversations, activeConvoId, onSelectConvo, onNewConvo, onRenameConvo, onDeleteConvo,
  hideWorkspaceUI = false,
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
    <aside className="w-64 shrink-0 flex flex-col h-screen bg-white border-r border-gray-200">

      {/* ── Brand ── */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center shadow shadow-rose-200">
            <FiBookOpen size={15} className="text-white" />
          </div>
          <div>
            <h1 className="text-[13px] font-bold text-gray-900 leading-tight">RAG Academic</h1>
            <p className="text-[10px] text-gray-400 leading-tight">Chatbot</p>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-[9px] uppercase tracking-widest text-gray-400 px-2 mb-1.5 font-semibold">Study Tools</p>
        <nav className="space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon, needsWs }) => {
            const isActive   = active === id;
            const isDisabled = needsWs && !activeWsId;
            return (
              <button
                key={id}
                onClick={() => !isDisabled && onSelect(id)}
                disabled={isDisabled}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                  isActive
                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                    : isDisabled
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icon size={16} className={isActive ? "text-rose-600" : "text-gray-500"} />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Documents + Chats ── */}
      {activeWsId && (
        <div className="flex-1 overflow-y-auto px-3 pb-3 border-t border-gray-100 mt-1 pt-3">

          {/* PDFs */}
          <div className="mb-4">
            <button
              onClick={() => setShowPdfs(!showPdfs)}
              className="w-full flex items-center justify-between px-1 py-1 mb-1 group"
            >
              <span className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold flex items-center gap-1.5">
                <FiFile size={11} className="text-gray-400" />
                Documents ({pdfs.length})
              </span>
              {showPdfs
                ? <FiChevronDown size={12} className="text-gray-300" />
                : <FiChevronRight size={12} className="text-gray-300" />}
            </button>

            {showPdfs && (
              <div className="space-y-0.5">
                {pdfs.length === 0 && (
                  <p className="text-[11px] text-gray-300 italic px-2 py-1.5">Upload a PDF to start</p>
                )}
                {pdfs.map((pdf) => (
                  <div
                    key={pdf.id}
                    className="group/pdf flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition"
                  >
                    <button
                      onClick={() => onTogglePdf(pdf.id)}
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                        pdf.is_active
                          ? "border-rose-500 bg-rose-500 text-white"
                          : "border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {pdf.is_active && <FiCheck size={9} />}
                    </button>
                    <span
                      className={`truncate flex-1 text-[11px] font-medium ${pdf.is_active ? "text-gray-800" : "text-gray-400"}`}
                      title={pdf.display_name || pdf.filename}
                    >
                      {pdf.display_name || pdf.filename}
                    </span>
                    <button
                      onClick={() => onRemovePdf(pdf.id)}
                      className="opacity-0 group-hover/pdf:opacity-100 w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </div>
                ))}
                {pdfs.filter(p => p.is_active).length > 0 && (
                  <p className="text-[10px] text-rose-500 px-2 mt-1">
                    {pdfs.filter(p => p.is_active).length}/{pdfs.length} active
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
                <span className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold flex items-center gap-1.5">
                  <FiMessageSquare size={11} className="text-gray-400" />
                  Chats ({conversations.length})
                </span>
                {showChats
                  ? <FiChevronDown size={12} className="text-gray-300 ml-1" />
                  : <FiChevronRight size={12} className="text-gray-300 ml-1" />}
              </button>

              <button
                onClick={onNewConvo}
                title="New chat"
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-rose-400 hover:text-rose-600 hover:bg-rose-50 transition"
              >
                <FiPlus size={15} />
              </button>
            </div>

            {showChats && (
              <div className="space-y-0.5">
                {conversations.length === 0 && (
                  <p className="text-[11px] text-gray-300 italic px-2 py-1.5">No chats yet</p>
                )}
                {conversations.map((c) => {
                  const isActive  = activeConvoId === c.id;
                  const isEditing = editingId === c.id && editType === "convo";

                  return (
                    <div
                      key={c.id}
                      className={`group/c flex items-center rounded-lg transition-all ${
                        isActive
                          ? "bg-rose-50 border border-rose-200"
                          : "border border-transparent hover:bg-gray-50"
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
                            className="flex-1 text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-800 outline-none focus:border-rose-400 bg-white"
                            autoFocus
                          />
                          <button
                            onClick={confirmEdit}
                            className="w-6 h-6 flex items-center justify-center rounded text-white bg-rose-500 hover:bg-rose-600 transition"
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
                              isActive ? "text-rose-700" : "text-gray-700"
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
      <div className="border-t border-gray-100 px-3 py-2.5 space-y-0.5 bg-gray-50/60">
        <button
          onClick={() => onSelect("settings")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition ${
            active === "settings"
              ? "bg-rose-50 text-rose-700"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <FiSettings size={16} className={active === "settings" ? "text-rose-600" : "text-gray-500"} />
          Settings
        </button>

        {user?.role === "admin" && (
          <button
            onClick={() => onSelect("admin")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition ${
              active === "admin"
                ? "bg-rose-50 text-rose-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <FiUsers size={16} className={active === "admin" ? "text-rose-600" : "text-gray-500"} />
            Admin Panel
          </button>
        )}

        {/* User row */}
        <div className="flex items-center gap-2.5 px-2 py-2 mt-0.5">
          <div className="w-8 h-8 rounded-lg bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-rose-700">
              {(user?.display_name || user?.email || "U")[0].toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-gray-800 truncate">
              {user?.display_name || user?.email?.split("@")[0]}
            </p>
            <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            title="Logout"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
          >
            <FiLogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
