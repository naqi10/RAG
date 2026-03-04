import { useState } from "react";
import {
  FiPlus, FiMessageSquare, FiLayers, FiUpload, FiSettings, FiLogOut,
  FiEdit2, FiTrash2, FiCheck, FiX, FiChevronDown, FiChevronRight,
  FiFile, FiTag, FiHome, FiCheckCircle, FiGitBranch, FiFileText,
  FiUsers, FiCpu,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: FiHome, needsWs: false },
  { id: "chat", label: "AI Chat", icon: FiMessageSquare, needsWs: true },
  { id: "flashcards", label: "Flashcards", icon: FiLayers, needsWs: true },
  { id: "quiz", label: "Quiz", icon: FiCheckCircle, needsWs: true },
  { id: "mindmap", label: "Mind Map", icon: FiGitBranch, needsWs: true },
  { id: "notes", label: "Notes", icon: FiFileText, needsWs: true },
  { id: "upload", label: "Upload PDF", icon: FiUpload, needsWs: true },
];

export default function Sidebar({
  active, onSelect,
  workspaces, activeWsId, onSelectWs, onNewWs, onRenameWs, onDeleteWs,
  pdfs, onTogglePdf, onRemovePdf,
  conversations, activeConvoId, onSelectConvo, onNewConvo, onRenameConvo, onDeleteConvo,
}) {
  const { user, logout } = useAuth();
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState(null);
  const [creatingWs, setCreatingWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [showPdfs, setShowPdfs] = useState(true);
  const [showChats, setShowChats] = useState(true);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);

  const startEdit = (id, title, type) => { setEditingId(id); setEditTitle(title); setEditType(type); };
  const confirmEdit = () => {
    if (editTitle.trim() && editingId) {
      if (editType === "ws") onRenameWs(editingId, editTitle.trim());
      else onRenameConvo(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditType(null);
  };

  const confirmNewWs = () => {
    const name = newWsName.trim();
    if (name) onNewWs(name);
    setCreatingWs(false);
    setNewWsName("");
  };

  const activeWs = workspaces.find((w) => w.id === activeWsId);
  const activePdfs = pdfs.filter((p) => p.is_active);

  return (
    <aside className="w-60 shrink-0 bg-white border-r border-gray-200/60 flex flex-col h-screen">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-gray-100">
        <h1 className="text-base font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
            <FiCpu size={14} className="text-white" />
          </div>
          StudyAI
        </h1>
      </div>

      {/* Workspace Selector */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <button
            onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300 transition text-sm bg-white"
          >
            <span className="truncate text-gray-700 font-medium">
              {activeWs ? activeWs.title : "Select workspace..."}
            </span>
            <FiChevronDown size={14} className={`text-gray-400 transition ${wsDropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {wsDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
              {workspaces.map((ws) => (
                <div key={ws.id} className="group flex items-center hover:bg-gray-50">
                  <button
                    onClick={() => { onSelectWs(ws.id); setWsDropdownOpen(false); }}
                    className={`flex-1 text-left px-3 py-2 text-sm truncate ${
                      ws.id === activeWsId ? "text-emerald-700 font-medium" : "text-gray-600"
                    }`}
                  >
                    {ws.title}
                  </button>
                  <div className="hidden group-hover:flex items-center gap-0.5 pr-2">
                    <button onClick={() => startEdit(ws.id, ws.title, "ws")} className="p-1 text-gray-400 hover:text-gray-600">
                      <FiEdit2 size={10} />
                    </button>
                    <button onClick={() => onDeleteWs(ws.id)} className="p-1 text-gray-400 hover:text-red-500">
                      <FiTrash2 size={10} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="border-t border-gray-100">
                {creatingWs ? (
                  <div className="flex items-center gap-1 p-2">
                    <input
                      value={newWsName}
                      onChange={(e) => setNewWsName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") confirmNewWs(); if (e.key === "Escape") { setCreatingWs(false); setNewWsName(""); } }}
                      placeholder="Name..."
                      className="flex-1 text-xs px-2 py-1.5 rounded border border-gray-200 outline-none focus:border-emerald-400"
                      autoFocus
                    />
                    <button onClick={confirmNewWs} className="p-1.5 rounded bg-emerald-600 text-white"><FiCheck size={10} /></button>
                    <button onClick={() => { setCreatingWs(false); setNewWsName(""); }} className="p-1.5 text-gray-400"><FiX size={10} /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCreatingWs(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 transition"
                  >
                    <FiPlus size={14} /> New Workspace
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Rename workspace inline */}
        {editingId && editType === "ws" && (
          <div className="flex items-center gap-1 mt-2">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmEdit()}
              className="flex-1 text-xs px-2 py-1.5 rounded border border-gray-200 outline-none focus:border-emerald-400"
              autoFocus
            />
            <button onClick={confirmEdit} className="p-1 text-emerald-600"><FiCheck size={12} /></button>
            <button onClick={() => { setEditingId(null); setEditType(null); }} className="p-1 text-gray-400"><FiX size={12} /></button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="px-3 py-2">
        <p className="text-[10px] uppercase tracking-widest text-gray-400 px-2 mb-1.5 font-semibold">Features</p>
        <nav className="space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon, needsWs }) => {
            const isActive = active === id;
            const isDisabled = needsWs && !activeWsId;
            return (
              <button
                key={id}
                onClick={() => !isDisabled && onSelect(id)}
                disabled={isDisabled}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700"
                    : isDisabled
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                }`}
              >
                <Icon size={15} className={isActive ? "text-emerald-600" : ""} />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Workspace Content (PDFs + Chats) */}
      {activeWsId && (
        <div className="flex-1 overflow-y-auto px-3 pb-2 border-t border-gray-100 mt-1 pt-2">
          {/* PDFs Section */}
          <button
            onClick={() => setShowPdfs(!showPdfs)}
            className="w-full flex items-center justify-between px-2 py-1 mb-1"
          >
            <span className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold flex items-center gap-1">
              <FiFile size={9} /> Documents ({pdfs.length})
            </span>
            {showPdfs ? <FiChevronDown size={10} className="text-gray-400" /> : <FiChevronRight size={10} className="text-gray-400" />}
          </button>

          {showPdfs && (
            <div className="space-y-0.5 mb-3">
              {pdfs.length === 0 && (
                <p className="text-[10px] text-gray-300 italic px-2 py-1">Upload a PDF to start</p>
              )}
              {pdfs.map((pdf) => (
                <div
                  key={pdf.id}
                  className={`group/pdf flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition ${
                    pdf.is_active ? "text-gray-700" : "text-gray-400"
                  } hover:bg-gray-50`}
                >
                  <button
                    onClick={() => onTogglePdf(pdf.id)}
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                      pdf.is_active
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-gray-300"
                    }`}
                  >
                    {pdf.is_active && <FiCheck size={8} />}
                  </button>
                  <span className="truncate flex-1 text-[11px]" title={pdf.display_name || pdf.filename}>
                    {pdf.display_name || pdf.filename}
                  </span>
                  <button
                    onClick={() => onRemovePdf(pdf.id)}
                    className="hidden group-hover/pdf:block p-0.5 text-gray-300 hover:text-red-500"
                  >
                    <FiTrash2 size={10} />
                  </button>
                </div>
              ))}
              {activePdfs.length > 0 && (
                <p className="text-[9px] text-emerald-500 px-2 mt-1">
                  {activePdfs.length}/{pdfs.length} active for RAG
                </p>
              )}
            </div>
          )}

          {/* Conversations Section */}
          <button
            onClick={() => setShowChats(!showChats)}
            className="w-full flex items-center justify-between px-2 py-1 mb-1"
          >
            <span className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold flex items-center gap-1">
              <FiMessageSquare size={9} /> Chats ({conversations.length})
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onNewConvo(); }}
                className="text-emerald-500 hover:text-emerald-700"
              >
                <FiPlus size={10} />
              </button>
              {showChats ? <FiChevronDown size={10} className="text-gray-400" /> : <FiChevronRight size={10} className="text-gray-400" />}
            </div>
          </button>

          {showChats && (
            <div className="space-y-0.5">
              {conversations.length === 0 && (
                <p className="text-[10px] text-gray-300 italic px-2 py-1">No chats yet</p>
              )}
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={`group/c flex items-center rounded-md transition ${
                    activeConvoId === c.id
                      ? "bg-emerald-50 text-emerald-800"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {editingId === c.id && editType === "convo" ? (
                    <div className="flex items-center gap-1 flex-1 px-1 py-1">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && confirmEdit()}
                        className="flex-1 text-[10px] px-1.5 py-0.5 rounded border border-gray-200 outline-none focus:border-emerald-400"
                        autoFocus
                      />
                      <button onClick={confirmEdit} className="p-0.5 text-emerald-600"><FiCheck size={10} /></button>
                      <button onClick={() => { setEditingId(null); setEditType(null); }} className="p-0.5 text-gray-400"><FiX size={10} /></button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => onSelectConvo(c.id)}
                        className="flex-1 text-left px-2 py-1.5 text-[11px] font-medium truncate"
                      >
                        {c.title}
                      </button>
                      <div className="hidden group-hover/c:flex items-center gap-0.5 pr-1">
                        <button onClick={() => startEdit(c.id, c.title, "convo")} className="p-0.5 text-gray-400 hover:text-gray-600"><FiEdit2 size={9} /></button>
                        <button onClick={() => onDeleteConvo(c.id)} className="p-0.5 text-gray-400 hover:text-red-500"><FiTrash2 size={9} /></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Spacer when no workspace */}
      {!activeWsId && <div className="flex-1" />}

      {/* Footer */}
      <div className="border-t border-gray-100 px-3 py-2 space-y-0.5">
        <button
          onClick={() => onSelect("settings")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition ${
            active === "settings" ? "bg-emerald-50 text-emerald-700" : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          <FiSettings size={15} /> Settings
        </button>

        {user?.role === "admin" && (
          <button
            onClick={() => onSelect("admin")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition ${
              active === "admin" ? "bg-emerald-50 text-emerald-700" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            <FiUsers size={15} /> Admin Panel
          </button>
        )}

        <div className="flex items-center justify-between px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">{user?.display_name || user?.email?.split("@")[0]}</p>
            <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
            title="Logout"
          >
            <FiLogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
