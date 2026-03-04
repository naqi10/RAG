import { useState, useCallback, useEffect, useMemo } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import UploadPDF from "./components/UploadPDF";
import Chat from "./components/Chat";
import Flashcards from "./components/Flashcards";
import AdminPanel from "./components/AdminPanel";
import Dashboard from "./components/Dashboard";
import QuizGenerator from "./components/QuizGenerator";
import PDFNotes from "./components/PDFNotes";
import MindMap from "./components/MindMap";
import Settings from "./components/Settings";
import {
  getWorkspaces, createWorkspace, renameWorkspace, deleteWorkspace,
  getWorkspacePDFs, togglePDF, removePDF,
  getWorkspaceConversations, createWorkspaceConversation,
  renameConversation, deleteConversation,
} from "./api/client";

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState("dashboard");

  // Workspace state
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWsId, setActiveWsId] = useState(null);

  // PDFs & conversations for active workspace
  const [pdfs, setPdfs] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConvoId, setActiveConvoId] = useState(null);

  // Active PDF IDs for RAG filtering
  const activePdfIds = useMemo(() => pdfs.filter((p) => p.is_active).map((p) => p.id), [pdfs]);
  const activeConvo = useMemo(() => conversations.find((c) => c.id === activeConvoId) || null, [conversations, activeConvoId]);

  // ── Fetch helpers ──
  const fetchWorkspaces = useCallback(async () => {
    try {
      const data = await getWorkspaces();
      setWorkspaces(data.workspaces || []);
    } catch { /* not logged in */ }
  }, []);

  const fetchPdfs = useCallback(async (wsId) => {
    if (!wsId) { setPdfs([]); return; }
    try {
      const data = await getWorkspacePDFs(wsId);
      setPdfs(data.pdfs || []);
    } catch { setPdfs([]); }
  }, []);

  const fetchConversations = useCallback(async (wsId) => {
    if (!wsId) { setConversations([]); return; }
    try {
      const data = await getWorkspaceConversations(wsId);
      setConversations(data.conversations || []);
    } catch { setConversations([]); }
  }, []);

  useEffect(() => { if (user) fetchWorkspaces(); }, [user, fetchWorkspaces]);

  useEffect(() => {
    if (activeWsId) {
      fetchPdfs(activeWsId);
      fetchConversations(activeWsId);
    } else {
      setPdfs([]);
      setConversations([]);
      setActiveConvoId(null);
    }
  }, [activeWsId, fetchPdfs, fetchConversations]);

  // ── Workspace handlers ──
  const handleNewWs = async (name) => {
    try {
      const data = await createWorkspace(name || "New Workspace");
      await fetchWorkspaces();
      setActiveWsId(data.id);
      setActiveConvoId(null);
      setTab("upload");
    } catch (err) { console.error("Failed to create workspace:", err); }
  };

  const handleSelectWs = (ws) => {
    const id = typeof ws === "string" ? ws : ws?.id;
    setActiveWsId(id);
    setActiveConvoId(null);
    if (tab === "dashboard") setTab("upload");
  };

  const handleRenameWs = async (id, title) => {
    try { await renameWorkspace(id, title); fetchWorkspaces(); } catch {}
  };

  const handleDeleteWs = async (id) => {
    if (!window.confirm("Delete this workspace and all its PDFs / chats?")) return;
    try {
      await deleteWorkspace(id);
      if (activeWsId === id) { setActiveWsId(null); setTab("dashboard"); }
      fetchWorkspaces();
    } catch {}
  };

  // ── PDF handlers ──
  const handleTogglePdf = async (pdfId) => {
    if (!activeWsId) return;
    try {
      await togglePDF(activeWsId, pdfId);
      fetchPdfs(activeWsId);
    } catch {}
  };

  const handleRemovePdf = async (pdfId) => {
    if (!activeWsId || !window.confirm("Remove this PDF?")) return;
    try {
      await removePDF(activeWsId, pdfId);
      fetchPdfs(activeWsId);
    } catch {}
  };

  const onPdfUploaded = async () => {
    await fetchPdfs(activeWsId);
    fetchWorkspaces();
    // Auto-create a conversation and navigate to chat
    if (activeWsId) {
      try {
        const data = await createWorkspaceConversation(activeWsId, "New Chat");
        await fetchConversations(activeWsId);
        setActiveConvoId(data.id);
        setTab("chat");
      } catch {}
    }
  };

  // ── Conversation handlers ──
  const handleNewConvo = async () => {
    if (!activeWsId) return;
    try {
      const data = await createWorkspaceConversation(activeWsId, "New Chat");
      await fetchConversations(activeWsId);
      setActiveConvoId(data.id);
      setTab("chat");
    } catch {}
  };

  const handleSelectConvo = (id) => {
    setActiveConvoId(id);
    setTab("chat");
  };

  const handleRenameConvo = async (id, title) => {
    try { await renameConversation(id, title); fetchConversations(activeWsId); } catch {}
  };

  const handleDeleteConvo = async (id) => {
    if (!window.confirm("Delete this chat?")) return;
    try {
      await deleteConversation(id);
      if (activeConvoId === id) { setActiveConvoId(null); setTab("dashboard"); }
      fetchConversations(activeWsId);
    } catch {}
  };

  // ── Render ──
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FAFAFA]">
        <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Login />;

  const hasPdfs = pdfs.length > 0;
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
      />

      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* Dashboard */}
        {tab === "dashboard" && (
          <Dashboard
            user={user}
            workspaces={workspaces}
            onSelectTab={setTab}
            onSelectWorkspace={handleSelectWs}
          />
        )}

        {/* Admin panel */}
        {tab === "admin" && <AdminPanel onBack={() => setTab("dashboard")} />}

        {/* Settings */}
        {tab === "settings" && <Settings />}

        {/* No workspace selected (for workspace-dependent tabs) */}
        {needsWorkspace && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <span className="text-2xl">&#128218;</span>
            </div>
            <p className="text-sm mb-4">Select or create a workspace to get started</p>
            <button
              onClick={() => {
                const name = window.prompt("Workspace name:");
                if (name?.trim()) handleNewWs(name.trim());
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
            >
              + New Workspace
            </button>
          </div>
        )}

        {/* Upload page */}
        {tab === "upload" && activeWsId && (
          <UploadPDF workspaceId={activeWsId} onUploaded={onPdfUploaded} />
        )}

        {/* Chat */}
        {tab === "chat" && activeWsId && (
          <div className="h-full">
            {activeConvoId ? (
              <Chat
                conversationId={activeConvoId}
                convoTitle={activeConvo?.title}
                workspaceId={activeWsId}
                activePdfIds={activePdfIds}
                pdfs={pdfs}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 select-none">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                  <span className="text-2xl">&#128172;</span>
                </div>
                <p className="text-sm mb-4">Start a conversation in this workspace</p>
                <button
                  onClick={handleNewConvo}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
                >
                  + New Chat
                </button>
              </div>
            )}
          </div>
        )}

        {/* Flashcards */}
        {tab === "flashcards" && activeWsId && (
          <div className="h-full">
            <Flashcards
              conversationId={activeConvoId}
              workspaceId={activeWsId}
              activePdfIds={activePdfIds}
            />
          </div>
        )}

        {/* Quiz */}
        {tab === "quiz" && activeWsId && (
          <QuizGenerator
            workspaceId={activeWsId}
            activePdfIds={activePdfIds}
            pdfs={pdfs}
          />
        )}

        {/* Notes */}
        {tab === "notes" && activeWsId && (
          <PDFNotes
            workspaceId={activeWsId}
            pdfs={pdfs}
          />
        )}

        {/* Mind Map */}
        {tab === "mindmap" && activeWsId && (
          <MindMap
            workspaceId={activeWsId}
            activePdfIds={activePdfIds}
          />
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
