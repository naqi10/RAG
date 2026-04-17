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
import DreamyBackground from "./components/DreamyBackground";
import {
  getLibraryPDFs, toggleLibraryPDF, removeLibraryPDF,
  getLibraryConversations, createLibraryConversation,
  renameConversation, deleteConversation,
} from "./api/client";

// ── Session persistence helpers ──────────────────────────────────────────────
const _try = (fn) => { try { fn(); } catch { /* ignore */ } };
const SS = {
  get: (key, fallback = null) => { try { return sessionStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set: (key, val) => _try(() => sessionStorage.setItem(key, val ?? "")),
  del: (key) => _try(() => sessionStorage.removeItem(key)),
  clear: () => _try(() => { sessionStorage.removeItem("tab"); sessionStorage.removeItem("convoId"); }),
};

/* Auto-create a new chat when user lands on chat tab with no active conversation */
function AutoCreateChat({ onCreate }) {
  const triggered = useRef(false);
  useEffect(() => {
    if (!triggered.current) {
      triggered.current = true;
      onCreate();
    }
  }, [onCreate]);
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] select-none px-6">
      <div className="w-11 h-11 border-[3px] border-[#FEC8D8] border-t-[#FF9AA2] rounded-full animate-spin" />
      <p className="mt-3 text-sm tracking-wide" style={{ color: "rgba(107,74,99,0.7)" }}>Starting a fresh chat… ✨</p>
    </div>
  );
}

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([fetchPdfs(false), fetchConversations()]);
  }, [user, fetchPdfs, fetchConversations]);

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      <div className="relative flex items-center justify-center h-screen overflow-hidden">
        <DreamyBackground />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="w-11 h-11 border-[3px] border-[#FEC8D8] border-t-[#FF9AA2] rounded-full animate-spin" />
          <p className="text-sm tracking-wide" style={{ color: "rgba(107,74,99,0.7)" }}>Loading your space… ✨</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  const needsWorkspace = !activeWsId && !["dashboard", "admin", "settings"].includes(tab);

  return (
    <div className="relative flex h-screen overflow-hidden antialiased text-[#4a3d4f]">
      <DreamyBackground />
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

      <main className="relative z-10 flex-1 min-w-0 min-h-0 overflow-y-auto flex flex-col">
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
          <div className="flex flex-col items-center justify-center min-h-[50vh] select-none px-6">
            <div className="w-16 h-16 rounded-2xl dreamy-glass-card flex items-center justify-center mb-4">
              <div className="w-8 h-8 border-[3px] border-[#FEC8D8] border-t-[#FF9AA2] rounded-full animate-spin" />
            </div>
            <p className="text-sm mb-1 tracking-wide" style={{ color: "rgba(107,74,99,0.75)" }}>Preparing your study space…</p>
            <span className="text-lg" aria-hidden>🌸</span>
          </div>
        )}

        {tab === "chat" && activeWsId && (
          <div className="flex-1 min-h-0 flex flex-col h-full">
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
              <AutoCreateChat onCreate={handleNewConvo} />
            )}
          </div>
        )}

        {tab === "history" && activeWsId && (
          <History
            conversations={conversations}
            activeConvoId={activeConvoId}
            onOpenChat={(id) => { setActiveConvoId(id); setTab("chat"); }}
            onDeleteChat={handleDeleteConvo}
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
