import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import Chat from "./components/Chat";
import Flashcards from "./components/Flashcards";
import AdminPanel from "./components/AdminPanel";
import Dashboard from "./components/Dashboard";
import QuizGenerator from "./components/QuizGenerator";
import PDFNotes from "./components/PDFNotes";
import MindMap from "./components/MindMap";
import Settings from "./components/Settings";
import History from "./components/History";
import {
  getLibraryPDFs, toggleLibraryPDF, removeLibraryPDF,
  getLibraryConversations, createLibraryConversation,
  renameConversation, deleteConversation,
} from "./api/client";

// ── Session persistence helpers ──────────────────────────────────────────────
const SS = {
  get: (key, fallback = null) => { try { return sessionStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set: (key, val) => { try { sessionStorage.setItem(key, val ?? ""); } catch {} },
  del: (key) => { try { sessionStorage.removeItem(key); } catch {} },
  clear: () => { try { sessionStorage.removeItem("tab"); sessionStorage.removeItem("convoId"); } catch {} },
};

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const initialised = useRef(false);

  // ── Restore last position from sessionStorage ──
  const [tab, setTabRaw]           = useState(() => SS.get("tab", "dashboard"));
  const [activeConvoId, setConvoIdRaw] = useState(() => SS.get("convoId", null));

  // Wrapped setters that also persist to sessionStorage
  const setTab = useCallback((t) => { SS.set("tab", t); setTabRaw(t); }, []);
  const setActiveConvoId = useCallback((id) => {
    if (id) SS.set("convoId", id); else SS.del("convoId");
    setConvoIdRaw(id);
  }, []);

  const [workspaces]  = useState([]);
  const [activeWsId, setActiveWsId] = useState(null);
  const [pdfs, setPdfs]             = useState([]);
  const [conversations, setConversations] = useState([]);

  const activePdfIds = useMemo(() => pdfs.filter((p) => p.is_active).map((p) => p.id), [pdfs]);
  const activeConvo  = useMemo(() => conversations.find((c) => c.id === activeConvoId) || null, [conversations, activeConvoId]);

  // ── Fetch helpers ────────────────────────────────────────────────────────
  const fetchPdfs = useCallback(async (keepActive = true) => {
    try {
      const data = await getLibraryPDFs();
      const list = data.pdfs || [];
      setPdfs(keepActive ? list : list.map((p) => ({ ...p, is_active: false })));
      if (data.workspace_id) setActiveWsId(data.workspace_id);
    } catch { setPdfs([]); }
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const data = await getLibraryConversations();
      setConversations(data.conversations || []);
      if (data.workspace_id) setActiveWsId(data.workspace_id);
    } catch { setConversations([]); }
  }, []);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || initialised.current) return;
    initialised.current = true;
    Promise.all([fetchPdfs(false), fetchConversations()]);
  }, [user, fetchPdfs, fetchConversations]);

  useEffect(() => {
    if (user) {
      fetchPdfs(false);
      fetchConversations();
    } else {
      setPdfs([]);
      setConversations([]);
      setActiveConvoId(null);
      setActiveWsId(null);
      SS.clear();
    }
  }, [user, fetchPdfs, fetchConversations, setActiveConvoId]);

  // ── Validate restored session: if saved convoId no longer exists after load, fall back ──
  useEffect(() => {
    if (!activeWsId || conversations.length === 0) return;
    if (tab === "chat" && activeConvoId && !conversations.find((c) => c.id === activeConvoId)) {
      setActiveConvoId(null);
      setTab("dashboard");
    }
  }, [activeWsId, conversations, tab, activeConvoId, setActiveConvoId, setTab]);

  // ── Workspace handlers (stubs — personal library model) ──
  const handleNewWs    = async () => {};
  const handleSelectWs = () => {};
  const handleRenameWs = async () => {};
  const handleDeleteWs = async () => {};

  // ── PDF handlers — optimistic ─────────────────────────────────────────────
  const handleTogglePdf = useCallback((pdfId) => {
    // Optimistic toggle
    setPdfs((prev) => prev.map((p) => p.id === pdfId ? { ...p, is_active: !p.is_active } : p));
    toggleLibraryPDF(pdfId).catch(() => fetchPdfs()); // revert on error
  }, [fetchPdfs]);

  const handleRemovePdf = useCallback((pdfId) => {
    setPdfs((prev) => prev.filter((p) => p.id !== pdfId));
    removeLibraryPDF(pdfId).catch(() => fetchPdfs());
  }, [fetchPdfs]);

  const onPdfUploaded = useCallback(async () => {
    await fetchPdfs(true);
  }, [fetchPdfs]);

  // ── Conversation handlers — optimistic ────────────────────────────────────
  const handleNewConvo = useCallback(async () => {
    // Navigate immediately — don't wait for API
    const tempId = `temp-${Date.now()}`;
    const tempConvo = { id: tempId, title: "New Chat", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setConversations((prev) => [tempConvo, ...prev]);
    setActiveConvoId(tempId);
    setTab("chat");
    try {
      const data = await createLibraryConversation("New Chat");
      if (data.workspace_id) setActiveWsId(data.workspace_id);
      // Replace temp with real
      setConversations((prev) => prev.map((c) => c.id === tempId ? data : c));
      setActiveConvoId(data.id);
    } catch {
      // Remove temp on failure
      setConversations((prev) => prev.filter((c) => c.id !== tempId));
      setActiveConvoId(null);
      setTab("dashboard");
    }
  }, [setActiveConvoId, setTab]);

  const handleSelectConvo = useCallback((id) => {
    setActiveConvoId(id);
    setTab("chat");
  }, [setActiveConvoId, setTab]);

  const handleRenameConvo = useCallback(async (id, title) => {
    // Optimistic rename
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, title } : c));
    try {
      await renameConversation(id, title);
    } catch {
      fetchConversations(); // revert on error
    }
  }, [fetchConversations]);

  const handleDeleteConvo = useCallback(async (id) => {
    // Optimistic delete — remove instantly from UI
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConvoId === id) {
      setActiveConvoId(null);
      setTab("dashboard");
    }
    try {
      await deleteConversation(id);
    } catch {
      fetchConversations(); // revert on error
    }
  }, [activeConvoId, setActiveConvoId, setTab, fetchConversations]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FAFAFA]">
        <div className="w-10 h-10 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Login />;

  const needsWorkspace = !activeWsId && !["dashboard", "admin", "settings"].includes(tab);

  return (
    <div className="flex h-screen bg-[#FAFAFA] font-sans text-gray-800 antialiased">
      <Sidebar
        active={tab}
        onSelect={setTab}
        workspaces={workspaces}
        activeWsId={activeWsId}
        onSelectWs={handleSelectWs}
        onNewWs={handleNewWs}
        onRenameWs={handleRenameWs}
        onDeleteWs={handleDeleteWs}
        pdfs={pdfs}
        onTogglePdf={handleTogglePdf}
        onRemovePdf={handleRemovePdf}
        conversations={conversations}
        activeConvoId={activeConvoId}
        onSelectConvo={handleSelectConvo}
        onNewConvo={handleNewConvo}
        onRenameConvo={handleRenameConvo}
        onDeleteConvo={handleDeleteConvo}
        hideWorkspaceUI
      />

      <main className="flex-1 min-w-0 overflow-y-auto">
        {tab === "dashboard" && (
          <Dashboard
            user={user}
            workspaces={workspaces}
            onSelectTab={setTab}
            onSelectWorkspace={handleSelectWs}
            conversations={conversations}
            pdfs={pdfs}
            onOpenConvo={(id) => { setActiveConvoId(id); setTab("chat"); }}
          />
        )}

        {tab === "admin" && <AdminPanel onBack={() => setTab("dashboard")} />}
        {tab === "settings" && <Settings />}

        {needsWorkspace && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <div className="w-8 h-8 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
            </div>
            <p className="text-sm mb-4">Preparing your personal study space...</p>
          </div>
        )}

        {tab === "chat" && activeWsId && (
          <div className="h-full">
            {activeConvoId ? (
              <Chat
                conversationId={activeConvoId}
                convoTitle={activeConvo?.title}
                workspaceId={activeWsId}
                activePdfIds={activePdfIds}
                pdfs={pdfs}
                onUploadAsset={onPdfUploaded}
                onTitleChanged={fetchConversations}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                  <span className="text-2xl">💬</span>
                </div>
                <p className="text-sm mb-4">Start a conversation</p>
                <button
                  onClick={handleNewConvo}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition"
                >
                  + New Chat
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "history" && activeWsId && (
          <History
            conversations={conversations}
            activeConvoId={activeConvoId}
            onOpenChat={(id) => { setActiveConvoId(id); setTab("chat"); }}
          />
        )}

        {tab === "flashcards" && activeWsId && (
          <div className="h-full">
            <Flashcards conversationId={activeConvoId} workspaceId={activeWsId} activePdfIds={activePdfIds} />
          </div>
        )}

        {tab === "quiz" && activeWsId && (
          <QuizGenerator workspaceId={activeWsId} activePdfIds={activePdfIds} pdfs={pdfs} />
        )}

        {tab === "notes" && activeWsId && (
          <PDFNotes workspaceId={activeWsId} pdfs={pdfs} />
        )}

        {tab === "mindmap" && activeWsId && (
          <MindMap workspaceId={activeWsId} activePdfIds={activePdfIds} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
