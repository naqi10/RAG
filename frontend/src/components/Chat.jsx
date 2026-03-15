import { useState, useRef, useEffect, useCallback } from "react";
import {
  FiSend, FiClock, FiDownload, FiPlus, FiImage, FiFileText,
  FiBookOpen, FiCopy, FiCheck, FiChevronDown, FiUser, FiAlertCircle,
} from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askQuestion, getConversationMessages, exportConversation, uploadPDFToWorkspace, uploadToLibrary } from "../api/client";

/* ─── AI avatar ─── */
const AiIcon = () => (
  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center shrink-0 shadow-md shadow-rose-300/40">
    <FiBookOpen size={15} className="text-white" />
  </div>
);

/* ─── User avatar ─── */
const UserIcon = () => (
  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-rose-800 to-rose-950 flex items-center justify-center shrink-0 shadow-md shadow-rose-900/40">
    <FiUser size={15} className="text-rose-200" />
  </div>
);

/* ─── confidence badge ─── */
const ConfidenceBadge = ({ level }) => {
  const styles = {
    High:   { background:"rgba(16,185,129,0.15)", color:"#6ee7b7", border:"1px solid rgba(16,185,129,0.25)" },
    Medium: { background:"rgba(245,158,11,0.15)", color:"#fcd34d", border:"1px solid rgba(245,158,11,0.25)" },
    Low:    { background:"rgba(239,68,68,0.15)",  color:"#fca5a5", border:"1px solid rgba(239,68,68,0.25)" },
  };
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={styles[level] || styles.Medium}>
      {level} confidence
    </span>
  );
};

/* ─── source pill ─── */
const SourcePill = ({ source, page }) => {
  const filename = source ? source.split(/[\\/]/).pop() : "Unknown";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg"
      style={{background:"rgba(244,63,94,0.12)", border:"1px solid rgba(244,63,94,0.22)", color:"#fda4af"}}
    >
      <FiFileText size={11} style={{color:"#f43f5e"}} />
      <span className="max-w-[140px] truncate">{filename}</span>
      {page && (
        <span className="text-[9px] font-bold px-1.5 rounded-md ml-0.5"
          style={{background:"#f43f5e", color:"white"}}>
          p.{page}
        </span>
      )}
    </span>
  );
};

/* ─── copy button ─── */
const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="transition p-1.5 rounded-md cursor-pointer"
      style={{color:"rgba(253,164,175,0.55)"}}
      onMouseEnter={e => { e.currentTarget.style.background="rgba(244,63,94,0.12)"; e.currentTarget.style.color="#fda4af"; }}
      onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="rgba(253,164,175,0.55)"; }}
      title="Copy response"
    >
      {copied ? <FiCheck size={13} style={{color:"#6ee7b7"}} /> : <FiCopy size={13} />}
    </button>
  );
};

/* ─── typing indicator ─── */
const TypingIndicator = () => (
  <div className="flex items-start gap-3 msg-row">
    <AiIcon />
    <div
      className="rounded-2xl rounded-tl-md px-5 py-4"
      style={{
        background: "linear-gradient(145deg, rgba(40,10,25,0.96), rgba(22,5,15,0.94))",
        border: "1px solid rgba(244,63,94,0.28)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.50), 0 0 20px rgba(244,63,94,0.06)",
      }}
    >
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          <span className="typing-dot w-2 h-2 rounded-full" style={{background:"#f43f5e", animationDelay:"0ms"}} />
          <span className="typing-dot w-2 h-2 rounded-full" style={{background:"#fb7185", animationDelay:"180ms"}} />
          <span className="typing-dot w-2 h-2 rounded-full" style={{background:"#fda4af", animationDelay:"360ms"}} />
        </div>
        <span className="text-xs ml-1" style={{color:"rgba(253,164,175,0.65)"}}>Reading your document...</span>
      </div>
    </div>
  </div>
);

// Shown when no PDF is active yet
const NO_PDF_SUGGESTIONS = [
  { icon: "📄", text: "Upload a PDF using the + button above", disabled: true },
  { icon: "🖼️", text: "You can also upload images for OCR analysis", disabled: true },
];

// Shown when at least one PDF/image is active
const PDF_SUGGESTIONS = [
  { icon: "📋", text: "Summarize this document for me" },
  { icon: "🔑", text: "What are the key concepts in this PDF?" },
  { icon: "📚", text: "List the main topics covered" },
  { icon: "💡", text: "Explain the most important section" },
  { icon: "❓", text: "Generate 5 exam questions from this document" },
  { icon: "🃏", text: "Create flashcards from the key points" },
  { icon: "🧩", text: "What problems does this document solve?" },
  { icon: "📝", text: "Give me a chapter-by-chapter breakdown" },
];

export default function Chat({ conversationId, convoTitle, workspaceId, activePdfIds, pdfs = [], onUploadAsset, onTitleChanged }) {
  const activePdfs = pdfs.filter((p) => p.is_active);
  const [pendingActiveName, setPendingActiveName] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const firstMessageSent = useRef(false);
  const [historyLoaded, setHistoryLoaded] = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [uploadTags, setUploadTags] = useState("");
  const bottomRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const uploadInputRef = useRef(null);

  /* ─── load conversation history ─── */
  useEffect(() => {
    if (!conversationId || historyLoaded === conversationId) return;
    if (conversationId.startsWith("temp-")) return; // not yet saved to DB
    let cancelled = false;
    (async () => {
      try {
        const data = await getConversationMessages(conversationId);
        if (!cancelled && data.messages) {
          setMessages(
            data.messages.map((m) => ({
              role: m.role,
              text: m.text,
              metadata: m.metadata,
              sources: m.metadata?.sources || [],
              confidence: m.metadata?.confidence,
              task_type: m.metadata?.task_type,
              created_at: m.created_at,
              restored: true,
            }))
          );
        }
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setHistoryLoaded(conversationId);
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId, historyLoaded]);

  useEffect(() => {
    setMessages([]);
    setHistoryLoaded(null);
    firstMessageSent.current = false;
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleScroll = useCallback(() => {
    if (!scrollAreaRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 120);
  }, []);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  const handlePickAsset = () => uploadInputRef.current?.click();

  const handleUploadAsset = async (file) => {
    if (!file) return;
    setUploadingAsset(true);
    try {
      setPendingActiveName(file.name);
      if (workspaceId) {
        await uploadPDFToWorkspace(workspaceId, file, uploadTags.trim());
      } else {
        await uploadToLibrary(file, uploadTags.trim());
      }
      setShowUploadMenu(false);
      setUploadTags("");
      await onUploadAsset?.(file.name);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: `Uploaded **${file.name}** successfully. You can now ask questions from this file.`,
          confidence: "High",
          task_type: "upload",
          ts: Date.now(),
        },
      ]);
    } catch (err) {
      setPendingActiveName("");
      setMessages((m) => [
        ...m,
        { role: "assistant", text: err?.response?.data?.detail || "Upload failed.", error: true, ts: Date.now() },
      ]);
    } finally {
      setUploadingAsset(false);
    }
  };

  useEffect(() => {
    if (activePdfs.length > 0) setPendingActiveName("");
  }, [activePdfs.length]);

  /* ─── send ─── */
  const send = async (overrideQuery) => {
    const q = (overrideQuery || input).trim();
    if (!q || loading || !conversationId || conversationId.startsWith("temp-")) return;
    const isFirst = !firstMessageSent.current && (convoTitle === "New Chat" || !convoTitle);
    firstMessageSent.current = true;
    setMessages((m) => [...m, { role: "user", text: q, ts: Date.now() }]);
    setInput("");
    setLoading(true);
    try {
      const data = await askQuestion(q, conversationId, workspaceId, activePdfIds);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.answer,
          sources: data.sources,
          confidence: data.confidence,
          task_type: data.task_type,
          context_count: data.context_count,
          ts: Date.now(),
        },
      ]);
      // After first real message, tell the parent to refresh conversations so
      // the auto-generated title shows in the sidebar
      if (isFirst) onTitleChanged?.();
    } catch (err) {
      const isTimeout = err?.code === "ECONNABORTED" || err?.message?.includes("timeout");
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: isTimeout
            ? "Request timed out. The server may be busy — please try again."
            : err?.response?.data?.detail || "Something went wrong.",
          error: true,
          ts: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  /* ─── export ─── */
  const handleExport = async (format) => {
    try {
      const data = await exportConversation(conversationId, format);
      const content = format === "json" ? JSON.stringify(data.content, null, 2) : data.content;
      const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || `chat-export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed.");
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const cleanAnswer = (text) => {
    if (!text) return "";
    return text
      // Strip entire "Sources" / "Sources Referenced" block to end or Confidence
      .replace(/\n*\*{0,2}Sources(?: Referenced)?:?\*{0,2}[\s\S]*?(?=\n\n\*{0,2}Confidence:|$)/gi, "")
      // Strip any remaining Confidence line
      .replace(/\n*\*{0,2}Confidence:\*{0,2}\s*(High|Medium|Low)\s*/gi, "")
      // Strip lines that look like full file paths (Windows or Unix)
      .replace(/\n?[A-Za-z]:\\[^\n]+/g, "")
      .replace(/\n?\/[^\s]+\.(pdf|png|jpg|jpeg)\s*(?:\(page \d+\))?/gi, "")
      // Strip 📄 source lines the LLM might write
      .replace(/\n?📄[^\n]+/g, "")
      // Strip "- filename.pdf (Page X)" bullet lines
      .replace(/\n?-\s+[^\s\n]+\.(pdf|png|jpg|jpeg)[^\n]*/gi, "")
      .trim();
  };

  const getUniqueSources = (sources) => {
    if (!sources?.length) return [];
    const seen = new Set();
    return sources.filter((s) => {
      const key = `${s.source || ""}|${s.page || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 4);
  };

  // ── Aurora background style ──
  const auroraStyle = {
    background: `
      radial-gradient(ellipse 90% 55% at 10% 10%, rgba(244,63,94,0.13) 0%, transparent 55%),
      radial-gradient(ellipse 70% 60% at 90% 85%, rgba(168,85,247,0.10) 0%, transparent 55%),
      radial-gradient(ellipse 55% 45% at 75% 20%, rgba(236,72,153,0.09) 0%, transparent 50%),
      radial-gradient(ellipse 50% 50% at 30% 75%, rgba(251,113,133,0.07) 0%, transparent 55%),
      radial-gradient(ellipse 80% 80% at 50% 50%, rgba(15,3,20,0) 0%, transparent 100%),
      #07040d
    `,
  };

  return (
    <div className="flex flex-col h-full relative overflow-hidden" style={auroraStyle}>

      {/* Subtle noise/grain texture overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "128px 128px",
        }}
      />

      {/* ═══ Header ═══ */}
      <div
        className="relative z-10 flex items-center justify-between px-6 py-3"
        style={{
          background: "rgba(10,5,18,0.55)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(244,63,94,0.12)",
          boxShadow: "0 1px 0 rgba(244,63,94,0.06)",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" style={{boxShadow: "0 0 8px rgba(244,63,94,0.8)"}} />
          <h2 className="text-sm font-semibold text-rose-100 truncate max-w-[180px]">
            {convoTitle || "Chat"}
          </h2>
          {activePdfs.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-hidden">
              <div className="h-4 w-px bg-rose-900/60" />
              {activePdfs.slice(0, 2).map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] text-rose-300 px-2 py-0.5 rounded-full truncate max-w-[120px]"
                  style={{background:"rgba(244,63,94,0.12)", border:"1px solid rgba(244,63,94,0.22)"}}>
                  <FiFileText size={10} />
                  {p.display_name || p.filename}
                </span>
              ))}
              {activePdfs.length > 2 && (
                <span className="text-[10px] text-rose-500">+{activePdfs.length - 2}</span>
              )}
            </div>
          )}
          {activePdfs.length === 0 && pendingActiveName && (
            <span className="inline-flex items-center gap-1 text-[10px] text-rose-300 px-2 py-0.5 rounded-full max-w-[220px] truncate"
              style={{background:"rgba(244,63,94,0.12)", border:"1px solid rgba(244,63,94,0.20)"}}>
              <FiFileText size={10} /> {pendingActiveName} active
            </span>
          )}
          {activePdfs.length === 0 && !pendingActiveName && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 px-2 py-0.5 rounded-full"
              style={{background:"rgba(251,191,36,0.10)", border:"1px solid rgba(251,191,36,0.22)"}}>
              <FiAlertCircle size={10} /> No PDF selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {messages.length > 0 && (
            <>
              <button
                onClick={() => handleExport("json")}
                className="flex items-center gap-1 text-[11px] text-rose-500 hover:text-rose-300 px-2 py-1 rounded-lg transition cursor-pointer"
                style={{background:"transparent"}}
                onMouseEnter={e => e.currentTarget.style.background="rgba(244,63,94,0.10)"}
                onMouseLeave={e => e.currentTarget.style.background="transparent"}
              >
                <FiDownload size={12} /> JSON
              </button>
              <button
                onClick={() => handleExport("txt")}
                className="flex items-center gap-1 text-[11px] text-rose-500 hover:text-rose-300 px-2 py-1 rounded-lg transition cursor-pointer"
                style={{background:"transparent"}}
                onMouseEnter={e => e.currentTarget.style.background="rgba(244,63,94,0.10)"}
                onMouseLeave={e => e.currentTarget.style.background="transparent"}
              >
                <FiDownload size={12} /> TXT
              </button>
            </>
          )}
        </div>
      </div>

      {/* ═══ Messages ═══ */}
      <div
        ref={scrollAreaRef}
        onScroll={handleScroll}
        className="relative z-10 flex-1 overflow-y-auto chat-scroll px-4 sm:px-6 py-6 space-y-6"
        style={{scrollbarColor: "rgba(244,63,94,0.2) transparent"}}
      >
        {/* Creating new chat spinner */}
        {conversationId?.startsWith("temp-") && (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-3" style={{color:"rgba(251,113,133,0.5)"}}>
              <div className="w-4 h-4 rounded-full border-2 border-rose-500/30 border-t-rose-400 animate-spin" />
              <span className="text-sm">Creating chat...</span>
            </div>
          </div>
        )}

        {/* ═══ Empty / pre-question state ═══
             Show whenever no user message has been sent yet — this covers:
             - Fresh empty chat (no messages at all)
             - After PDF upload (assistant upload-confirmation message exists, but user hasn't typed a question)
        */}
        {!messages.some((m) => m.role === "user") && !loading && !conversationId?.startsWith("temp-") && (
          <div className="flex flex-col items-center justify-center h-full select-none px-4 py-8">

            {/* Icon + heading */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: "linear-gradient(135deg, #f43f5e, #e11d48)",
                boxShadow: "0 0 40px rgba(244,63,94,0.35), 0 8px 32px rgba(0,0,0,0.4)",
              }}
            >
              <FiBookOpen size={26} className="text-white" />
            </div>

            {activePdfs.length > 0 ? (
              <>
                <h3 className="text-base font-semibold text-rose-100 mb-1">
                  {activePdfs.length === 1
                    ? `Ready — ${activePdfs[0].display_name || activePdfs[0].filename}`
                    : `${activePdfs.length} documents loaded`}
                </h3>
                <p className="text-xs mb-6" style={{color:"rgba(251,113,133,0.55)"}}>
                  Pick a prompt below or type your own question
                </p>

                {/* PDF action suggestions — 2 cols grid */}
                <div className="grid grid-cols-2 gap-2 w-full max-w-xl mb-4">
                  {PDF_SUGGESTIONS.map((sq, i) => (
                    <button
                      key={i}
                      onClick={() => send(sq.text)}
                      className="flex items-center gap-2.5 text-left px-3.5 py-3 rounded-xl text-[13px] text-rose-200 transition-all cursor-pointer group"
                      style={{
                        background: "rgba(244,63,94,0.07)",
                        border: "1px solid rgba(244,63,94,0.14)",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = "rgba(244,63,94,0.14)";
                        e.currentTarget.style.border = "1px solid rgba(244,63,94,0.30)";
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = "rgba(244,63,94,0.07)";
                        e.currentTarget.style.border = "1px solid rgba(244,63,94,0.14)";
                        e.currentTarget.style.transform = "";
                      }}
                    >
                      <span className="text-sm shrink-0">{sq.icon}</span>
                      <span className="leading-snug">{sq.text}</span>
                    </button>
                  ))}
                </div>

                {/* Active PDF chips */}
                <div className="flex flex-wrap gap-1.5 justify-center mt-1">
                  {activePdfs.map((p, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full"
                      style={{background:"rgba(244,63,94,0.10)", border:"1px solid rgba(244,63,94,0.20)", color:"#fda4af"}}
                    >
                      <FiFileText size={9} />
                      {p.display_name || p.filename}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-rose-100 mb-1">Start a conversation</h3>
                <p className="text-xs mb-6" style={{color:"rgba(251,113,133,0.55)"}}>
                  Upload a PDF or image using the <strong style={{color:"#f43f5e"}}>+</strong> button, then ask anything
                </p>

                {/* Upload hint cards */}
                <div className="grid grid-cols-1 gap-2 w-full max-w-sm mb-6">
                  <div
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-[13px]"
                    style={{background:"rgba(244,63,94,0.06)", border:"1px dashed rgba(244,63,94,0.20)"}}
                  >
                    <span className="text-lg">📄</span>
                    <div>
                      <p className="text-rose-200 font-medium">Upload a PDF</p>
                      <p className="text-[11px]" style={{color:"rgba(251,113,133,0.45)"}}>Click the + button in the input bar below</p>
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-[13px]"
                    style={{background:"rgba(244,63,94,0.06)", border:"1px dashed rgba(244,63,94,0.20)"}}
                  >
                    <span className="text-lg">🖼️</span>
                    <div>
                      <p className="text-rose-200 font-medium">Upload an Image</p>
                      <p className="text-[11px]" style={{color:"rgba(251,113,133,0.45)"}}>OCR will extract the text automatically</p>
                    </div>
                  </div>
                </div>

                {/* General questions (no PDF needed) */}
                <p className="text-[11px] mb-3" style={{color:"rgba(251,113,133,0.35)"}}>Or just say hello and start chatting</p>
                <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                  {[
                    { icon: "👋", text: "Hey, what can you do?" },
                    { icon: "❓", text: "How does this app work?" },
                  ].map((sq, i) => (
                    <button
                      key={i}
                      onClick={() => send(sq.text)}
                      className="flex items-center gap-2 text-left px-3 py-2.5 rounded-xl text-[12px] text-rose-300 transition-all"
                      style={{background:"rgba(244,63,94,0.06)", border:"1px solid rgba(244,63,94,0.12)"}}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(244,63,94,0.12)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(244,63,94,0.06)"; }}
                    >
                      <span>{sq.icon}</span>
                      <span>{sq.text}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Message list */}
        {messages.map((msg, i) =>
          msg.task_type === "upload" ? (

            /* ─── Upload confirmation — compact banner, not a full bubble ─── */
            <div key={i} className="flex justify-center msg-row">
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px]"
                style={{background:"rgba(16,185,129,0.10)", border:"1px solid rgba(16,185,129,0.22)", color:"#6ee7b7"}}
              >
                <FiCheck size={12} />
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{p: ({children}) => <span>{children}</span>}}>
                  {msg.text}
                </ReactMarkdown>
              </div>
            </div>

          ) : msg.role === "user" ? (

            /* ─── User Message ─── */
            <div key={i} className="flex items-start gap-3 justify-end msg-row">
              <div className="max-w-[70%] msg-user">
                <div
                  className="user-bubble text-white rounded-3xl rounded-tr-lg px-5 py-3.5"
                  style={{
                    background: "linear-gradient(135deg, #e11d48 0%, #9f1239 100%)",
                    boxShadow: "0 4px 18px rgba(190,18,60,0.35), 0 0 0 1px rgba(244,63,94,0.15)",
                  }}
                >
                  <span className="text-sm leading-relaxed whitespace-pre-wrap" style={{color:"#ffe4e8"}}>{msg.text}</span>
                </div>
                {msg.ts && (
                  <div className="mt-1.5 text-[10px] flex items-center gap-1 justify-end pr-1" style={{color:"rgba(251,113,133,0.35)"}}>
                    <FiClock size={9} /> {formatTime(msg.ts)}
                  </div>
                )}
              </div>
              <UserIcon />
            </div>

          ) : msg.error ? (

            /* ─── Error Message ─── */
            <div key={i} className="flex items-start gap-3 msg-row">
              <AiIcon />
              <div className="max-w-[75%] msg-ai">
                <div className="rounded-2xl rounded-tl-md px-5 py-3.5"
                  style={{background:"rgba(239,68,68,0.10)", border:"1px solid rgba(239,68,68,0.25)"}}>
                  <div className="flex items-center gap-2 mb-1">
                    <FiAlertCircle size={14} style={{color:"#fca5a5"}} />
                    <span className="text-xs font-semibold" style={{color:"#fca5a5"}}>Error</span>
                  </div>
                  <span className="text-sm" style={{color:"rgba(252,165,165,0.85)"}}>{msg.text}</span>
                </div>
              </div>
            </div>

          ) : (

            /* ─── AI Response ─── */
            <div key={i} className="flex items-start gap-3 msg-row">
              <AiIcon />
              <div className="max-w-[80%] msg-ai">
                {/* Dark glass card — visible & stunning on dark bg */}
                <div
                  className="ai-bubble rounded-3xl rounded-tl-lg overflow-hidden"
                  style={{
                    background: "linear-gradient(145deg, rgba(42,10,26,0.97) 0%, rgba(22,5,15,0.95) 100%)",
                    border: "1px solid rgba(244,63,94,0.22)",
                  }}
                >
                  {/* Shimmer gradient top bar */}
                  <div className="shimmer-bar" style={{height: 3}} />

                  {/* Response body */}
                  <div className="ai-prose px-5 py-4 text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {cleanAnswer(msg.text)}
                    </ReactMarkdown>
                  </div>

                  {/* Page reference pills */}
                  {getUniqueSources(msg.sources).length > 0 && (
                    <div
                      className="px-5 pb-3 pt-2 flex flex-wrap items-center gap-1.5"
                      style={{borderTop: "1px solid rgba(244,63,94,0.12)"}}
                    >
                      <span className="text-[10px] font-medium mr-0.5" style={{color:"rgba(253,164,175,0.50)"}}>Pages cited:</span>
                      {getUniqueSources(msg.sources).map((s, j) => (
                        <SourcePill key={j} source={s.source} page={s.page} />
                      ))}
                    </div>
                  )}

                  {/* Footer bar */}
                  <div
                    className="flex items-center justify-between px-5 py-2"
                    style={{ background:"rgba(244,63,94,0.05)", borderTop:"1px solid rgba(244,63,94,0.10)" }}
                  >
                    <div className="flex items-center gap-2">
                      {msg.confidence && <ConfidenceBadge level={msg.confidence} />}
                      {msg.task_type && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{background:"rgba(244,63,94,0.10)", color:"rgba(253,164,175,0.65)", border:"1px solid rgba(244,63,94,0.15)"}}>
                          {msg.task_type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CopyButton text={cleanAnswer(msg.text)} />
                      {msg.ts && (
                        <span className="text-[10px] flex items-center gap-1" style={{color:"rgba(253,164,175,0.35)"}}>
                          <FiClock size={9} /> {formatTime(msg.ts)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 p-2 rounded-full transition z-20 cursor-pointer"
          style={{
            background: "rgba(244,63,94,0.18)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(244,63,94,0.30)",
            boxShadow: "0 4px 20px rgba(244,63,94,0.20)",
            color: "#fda4af",
          }}
        >
          <FiChevronDown size={18} />
        </button>
      )}

      {/* ═══ Input ═══ */}
      <div
        className="relative z-10 px-4 sm:px-6 py-4"
        style={{
          background: "rgba(8,4,14,0.65)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(244,63,94,0.10)",
        }}
      >
        <div className="flex items-end gap-2.5 max-w-3xl mx-auto relative">
          {/* Upload button */}
          <div className="relative">
            <button
              onClick={() => setShowUploadMenu((v) => !v)}
              className="w-11 h-11 rounded-2xl flex items-center justify-center transition cursor-pointer"
              title="Upload PDF / Image"
              style={{
                background: "rgba(244,63,94,0.09)",
                border: "1px solid rgba(244,63,94,0.18)",
                color: "#fb7185",
              }}
              onMouseEnter={e => { e.currentTarget.style.background="rgba(244,63,94,0.16)"; e.currentTarget.style.borderColor="rgba(244,63,94,0.30)"; }}
              onMouseLeave={e => { e.currentTarget.style.background="rgba(244,63,94,0.09)"; e.currentTarget.style.borderColor="rgba(244,63,94,0.18)"; }}
            >
              <FiPlus size={18} />
            </button>
            {showUploadMenu && (
              <div className="absolute left-0 bottom-14 w-72 rounded-2xl shadow-2xl p-3 z-30"
                style={{
                  background: "rgba(15,8,25,0.92)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid rgba(244,63,94,0.18)",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(244,63,94,0.08)",
                }}>
                <button
                  onClick={handlePickAsset}
                  disabled={uploadingAsset}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-white text-xs font-medium disabled:opacity-60 transition"
                  style={{background:"linear-gradient(135deg,#f43f5e,#e11d48)"}}
                >
                  <FiImage size={13} />
                  {uploadingAsset ? "Uploading..." : "Choose PDF / Image"}
                </button>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff"
                  className="hidden"
                  onChange={(e) => handleUploadAsset(e.target.files?.[0])}
                />
                <input
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  placeholder="Tags (optional)"
                  className="mt-2 w-full text-xs px-3 py-2 rounded-xl outline-none transition"
                  style={{
                    background:"rgba(244,63,94,0.07)",
                    border:"1px solid rgba(244,63,94,0.15)",
                    color:"#fda4af",
                  }}
                />
                <p className="mt-1 text-[10px]" style={{color:"rgba(251,113,133,0.40)"}}>Upload directly from chat.</p>
              </div>
            )}
          </div>

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              onKeyDown={handleKey}
              placeholder="Ask about your PDF..."
              className="w-full resize-none rounded-2xl px-5 py-3 pr-12 text-sm outline-none transition"
              style={{
                minHeight: 44,
                maxHeight: 120,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(244,63,94,0.18)",
                color: "#ffe4e6",
                caretColor: "#f43f5e",
              }}
              onFocus={e => { e.currentTarget.style.border="1px solid rgba(244,63,94,0.45)"; e.currentTarget.style.boxShadow="0 0 0 3px rgba(244,63,94,0.08), 0 0 20px rgba(244,63,94,0.05)"; }}
              onBlur={e => { e.currentTarget.style.border="1px solid rgba(244,63,94,0.18)"; e.currentTarget.style.boxShadow=""; }}
            />
          </div>

          {/* Send button */}
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="p-3 rounded-2xl text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
            style={{
              background: "linear-gradient(135deg, #f43f5e, #be123c)",
              boxShadow: "0 4px 20px rgba(244,63,94,0.35)",
            }}
            onMouseEnter={e => !e.currentTarget.disabled && (e.currentTarget.style.boxShadow="0 6px 28px rgba(244,63,94,0.50)")}
            onMouseLeave={e => (e.currentTarget.style.boxShadow="0 4px 20px rgba(244,63,94,0.35)")}
          >
            <FiSend size={18} />
          </button>
        </div>
        <p className="text-center text-[10px] mt-2" style={{color:"rgba(251,113,133,0.30)"}}>
          Answers are grounded in your uploaded PDFs · Always verify important information
        </p>
      </div>
    </div>
  );
}
