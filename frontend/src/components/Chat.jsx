import { useState, useRef, useEffect, useCallback } from "react";
import {
  FiSend, FiClock, FiDownload, FiPlus, FiImage, FiFileText,
  FiCopy, FiCheck, FiChevronDown, FiUser, FiAlertCircle,
} from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askQuestion, getConversationMessages, exportConversation, uploadPDFToWorkspace, uploadToLibrary } from "../api/client";

/* ─── AI avatar — soft feminine ─── */
const AiIcon = () => (
  <div
    className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 text-lg shadow-lg"
    style={{
      background: "linear-gradient(145deg, #FEC8D8 0%, #E0BBE4 55%, #FFC0CB 100%)",
      boxShadow: "0 6px 20px rgba(224, 187, 228, 0.45), 0 0 0 2px rgba(255,255,255,0.85)",
    }}
    title="Study assistant"
  >
    <span className="leading-none" aria-hidden>
      🌸
    </span>
  </div>
);

/* ─── User avatar ─── */
const UserIcon = () => (
  <div
    className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
    style={{
      background: "linear-gradient(145deg, #FF9AA2 0%, #FFC0CB 100%)",
      boxShadow: "0 4px 16px rgba(255, 154, 162, 0.35), 0 0 0 2px rgba(255,255,255,0.7)",
    }}
  >
    <FiUser size={16} className="text-white" />
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
      className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full"
      style={{background:"rgba(255,192,203,0.35)", border:"1px solid rgba(224,187,228,0.55)", color:"#8b5a7c"}}
    >
      <FiFileText size={11} style={{color:"#e85d8c"}} />
      <span className="max-w-[140px] truncate">{filename}</span>
      {page && (
        <span className="text-[9px] font-bold px-1.5 rounded-full ml-0.5"
          style={{background:"linear-gradient(135deg,#FF9AA2,#E0BBE4)", color:"white"}}>
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
      style={{color:"rgba(184,127,168,0.55)"}}
      onMouseEnter={e => { e.currentTarget.style.background="rgba(255,192,203,0.35)"; e.currentTarget.style.color="#b87fa8"; }}
      onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="rgba(184,127,168,0.55)"; }}
      title="Copy response"
    >
      {copied ? <FiCheck size={13} style={{color:"#059669"}} /> : <FiCopy size={13} />}
    </button>
  );
};

/* ─── typing indicator ─── */
const TypingIndicator = () => (
  <div className="flex items-start gap-3 msg-row">
    <AiIcon />
    <div
      className="rounded-[1.35rem] rounded-tl-lg px-5 py-4 backdrop-blur-xl"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.72), rgba(255,240,248,0.55))",
        border: "1px solid rgba(255,255,255,0.85)",
        boxShadow: "0 8px 32px rgba(224,187,228,0.25), 0 0 0 1px rgba(255,192,203,0.2)",
      }}
    >
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          <span className="typing-dot w-2 h-2 rounded-full" style={{background:"#FF9AA2", animationDelay:"0ms"}} />
          <span className="typing-dot w-2 h-2 rounded-full" style={{background:"#E0BBE4", animationDelay:"180ms"}} />
          <span className="typing-dot w-2 h-2 rounded-full" style={{background:"#FFC0CB", animationDelay:"360ms"}} />
        </div>
        <span className="text-xs ml-1 tracking-wide" style={{color:"rgba(139,90,124,0.75)"}}>✨ Reading your docs…</span>
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

  return (
    <div className="flex flex-col h-full min-h-0 relative z-10 px-2 sm:px-4 py-3">
      <div className="relative flex-1 flex flex-col min-h-0 max-w-3xl w-full mx-auto dreamy-chat-shell rounded-[2rem] overflow-hidden">

      {/* ═══ Header ═══ */}
      <div
        className="flex items-center justify-between px-4 sm:px-5 py-3 shrink-0"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,248,252,0.35))",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.65)",
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
          <span className="text-sm" aria-hidden>💕</span>
          <div className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{background:"#FF9AA2", boxShadow:"0 0 10px rgba(255,154,162,0.9)"}} />
          <h2 className="text-sm font-semibold tracking-wide truncate max-w-[160px] sm:max-w-[200px]" style={{color:"#6b4a63"}}>
            {convoTitle || "Chat"}
          </h2>
          {activePdfs.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-hidden">
              <div className="h-4 w-px bg-[#E0BBE4]/80" />
              {activePdfs.slice(0, 2).map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full truncate max-w-[120px]"
                  style={{background:"rgba(255,192,203,0.35)", border:"1px solid rgba(224,187,228,0.5)", color:"#8b5a7c"}}>
                  <FiFileText size={10} />
                  {p.display_name || p.filename}
                </span>
              ))}
              {activePdfs.length > 2 && (
                <span className="text-[10px]" style={{color:"#c77b9e"}}>+{activePdfs.length - 2}</span>
              )}
            </div>
          )}
          {activePdfs.length === 0 && pendingActiveName && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full max-w-[200px] truncate"
              style={{background:"rgba(255,192,203,0.35)", border:"1px solid rgba(224,187,228,0.45)", color:"#8b5a7c"}}>
              <FiFileText size={10} /> {pendingActiveName}
            </span>
          )}
          {activePdfs.length === 0 && !pendingActiveName && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
              style={{background:"rgba(254,243,199,0.6)", border:"1px solid rgba(251,191,36,0.35)", color:"#a16207"}}>
              <FiAlertCircle size={10} /> No PDF yet
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {messages.length > 0 && (
            <>
              <button
                onClick={() => handleExport("json")}
                className="dreamy-btn-glow flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-full cursor-pointer"
                style={{background:"rgba(255,255,255,0.5)", border:"1px solid rgba(224,187,228,0.55)", color:"#b87fa8"}}
              >
                <FiDownload size={12} /> JSON
              </button>
              <button
                onClick={() => handleExport("txt")}
                className="dreamy-btn-glow flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-full cursor-pointer"
                style={{background:"rgba(255,255,255,0.5)", border:"1px solid rgba(224,187,228,0.55)", color:"#b87fa8"}}
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
        className="flex-1 overflow-y-auto chat-scroll px-4 sm:px-5 py-5 space-y-5 min-h-0"
        style={{scrollbarColor: "rgba(224,187,228,0.5) transparent"}}
      >
        {/* Creating new chat spinner */}
        {conversationId?.startsWith("temp-") && (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-3" style={{color:"rgba(184,127,168,0.75)"}}>
              <div className="w-4 h-4 rounded-full border-2 border-[#FEC8D8] border-t-[#FF9AA2] animate-spin" />
              <span className="text-sm tracking-wide">✨ Creating your chat…</span>
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
              className="w-16 h-16 rounded-[1.25rem] flex items-center justify-center mb-3 text-3xl"
              style={{
                background: "linear-gradient(135deg, #FEC8D8, #E0BBE4, #FFC0CB)",
                boxShadow: "0 12px 40px rgba(224,187,228,0.45), 0 0 0 3px rgba(255,255,255,0.85)",
              }}
            >
              🌷
            </div>

            {activePdfs.length > 0 ? (
              <>
                <h3 className="text-base font-semibold mb-1 tracking-wide" style={{color:"#6b4a63"}}>
                  {activePdfs.length === 1
                    ? `Ready — ${activePdfs[0].display_name || activePdfs[0].filename}`
                    : `${activePdfs.length} documents loaded 💕`}
                </h3>
                <p className="text-xs mb-6" style={{color:"rgba(139,90,124,0.65)"}}>
                  Pick a sparkly prompt or type your own ✨
                </p>

                <div className="grid grid-cols-2 gap-2 w-full max-w-xl mb-4">
                  {PDF_SUGGESTIONS.map((sq, i) => (
                    <button
                      key={i}
                      onClick={() => send(sq.text)}
                      className="dreamy-btn-glow flex items-center gap-2.5 text-left px-3.5 py-3 rounded-2xl text-[13px] transition-all cursor-pointer"
                      style={{
                        background: "rgba(255,255,255,0.55)",
                        border: "1px solid rgba(255,255,255,0.85)",
                        color: "#6b4a63",
                        boxShadow: "0 4px 20px rgba(224,187,228,0.2)",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.85)";
                        e.currentTarget.style.transform = "translateY(-2px)";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.55)";
                        e.currentTarget.style.transform = "";
                      }}
                    >
                      <span className="text-sm shrink-0">{sq.icon}</span>
                      <span className="leading-snug">{sq.text}</span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5 justify-center mt-1">
                  {activePdfs.map((p, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full"
                      style={{background:"rgba(255,192,203,0.4)", border:"1px solid rgba(224,187,228,0.55)", color:"#8b5a7c"}}
                    >
                      <FiFileText size={9} />
                      {p.display_name || p.filename}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold mb-1 tracking-wide" style={{color:"#6b4a63"}}>Hi, lovely 💗</h3>
                <p className="text-xs mb-6" style={{color:"rgba(139,90,124,0.65)"}}>
                  Tap the <strong style={{color:"#e85d8c"}}>+</strong> to upload a PDF or image, then ask anything
                </p>

                <div className="grid grid-cols-1 gap-2 w-full max-w-sm mb-6">
                  <div
                    className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[13px] backdrop-blur-sm"
                    style={{background:"rgba(255,255,255,0.45)", border:"1px dashed rgba(224,187,228,0.65)"}}
                  >
                    <span className="text-lg">📄</span>
                    <div>
                      <p className="font-medium" style={{color:"#6b4a63"}}>Upload a PDF</p>
                      <p className="text-[11px]" style={{color:"rgba(139,90,124,0.55)"}}>Use the + button in the bar below</p>
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[13px] backdrop-blur-sm"
                    style={{background:"rgba(255,255,255,0.45)", border:"1px dashed rgba(224,187,228,0.65)"}}
                  >
                    <span className="text-lg">🖼️</span>
                    <div>
                      <p className="font-medium" style={{color:"#6b4a63"}}>Upload an image</p>
                      <p className="text-[11px]" style={{color:"rgba(139,90,124,0.55)"}}>OCR reads the text for you</p>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] mb-3" style={{color:"rgba(139,90,124,0.45)"}}>Or say hi to start chatting</p>
                <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                  {[
                    { icon: "👋", text: "Hey, what can you do?" },
                    { icon: "❓", text: "How does this app work?" },
                  ].map((sq, i) => (
                    <button
                      key={i}
                      onClick={() => send(sq.text)}
                      className="dreamy-btn-glow flex items-center gap-2 text-left px-3 py-2.5 rounded-2xl text-[12px] transition-all"
                      style={{background:"rgba(255,255,255,0.5)", border:"1px solid rgba(255,192,203,0.45)", color:"#8b5a7c"}}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.85)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.5)"; }}
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
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] backdrop-blur-sm"
                style={{background:"rgba(167,243,208,0.35)", border:"1px solid rgba(52,211,153,0.45)", color:"#047857"}}
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
                  className="user-bubble text-white rounded-[1.35rem] rounded-tr-md px-5 py-3.5"
                  style={{
                    background: "linear-gradient(135deg, #FF9AA2 0%, #FFC0CB 45%, #FEC8D8 100%)",
                    boxShadow: "0 8px 28px rgba(255,154,162,0.4), 0 0 0 1px rgba(255,255,255,0.5)",
                  }}
                >
                  <span className="text-sm leading-relaxed whitespace-pre-wrap font-medium" style={{color:"#fff", textShadow:"0 1px 8px rgba(199,72,120,0.25)"}}>{msg.text}</span>
                </div>
                {msg.ts && (
                  <div className="mt-1.5 text-[10px] flex items-center gap-1 justify-end pr-1" style={{color:"rgba(139,90,124,0.45)"}}>
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
                <div className="rounded-[1.25rem] rounded-tl-md px-5 py-3.5 backdrop-blur-md"
                  style={{background:"rgba(254,202,202,0.45)", border:"1px solid rgba(248,113,113,0.35)"}}>
                  <div className="flex items-center gap-2 mb-1">
                    <FiAlertCircle size={14} style={{color:"#b91c1c"}} />
                    <span className="text-xs font-semibold" style={{color:"#b91c1c"}}>Oops</span>
                  </div>
                  <span className="text-sm" style={{color:"#7f1d1d"}}>{msg.text}</span>
                </div>
              </div>
            </div>

          ) : (

            /* ─── AI Response ─── */
            <div key={i} className="flex items-start gap-3 msg-row">
              <AiIcon />
              <div className="max-w-[80%] msg-ai">
                <div
                  className="ai-bubble rounded-[1.35rem] rounded-tl-lg overflow-hidden backdrop-blur-xl"
                  style={{
                    background: "linear-gradient(160deg, rgba(255,255,255,0.82) 0%, rgba(255,248,252,0.72) 50%, rgba(255,236,245,0.65) 100%)",
                    border: "1px solid rgba(255,255,255,0.9)",
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
                      style={{borderTop: "1px solid rgba(255,192,203,0.35)"}}
                    >
                      <span className="text-[10px] font-medium mr-0.5" style={{color:"rgba(139,90,124,0.55)"}}>📎 Pages cited:</span>
                      {getUniqueSources(msg.sources).map((s, j) => (
                        <SourcePill key={j} source={s.source} page={s.page} />
                      ))}
                    </div>
                  )}

                  {/* Footer bar */}
                  <div
                    className="flex items-center justify-between px-5 py-2"
                    style={{ background:"rgba(255,192,203,0.12)", borderTop:"1px solid rgba(224,187,228,0.35)" }}
                  >
                    <div className="flex items-center gap-2">
                      {msg.confidence && <ConfidenceBadge level={msg.confidence} />}
                      {msg.task_type && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{background:"rgba(255,255,255,0.65)", color:"#8b5a7c", border:"1px solid rgba(224,187,228,0.5)"}}>
                          {msg.task_type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CopyButton text={cleanAnswer(msg.text)} />
                      {msg.ts && (
                        <span className="text-[10px] flex items-center gap-1" style={{color:"rgba(139,90,124,0.4)"}}>
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
          className="dreamy-btn-glow absolute bottom-[5.5rem] sm:bottom-[5rem] left-1/2 -translate-x-1/2 p-2.5 rounded-full z-20 cursor-pointer"
          style={{
            background: "rgba(255,255,255,0.75)",
            backdropFilter: "blur(14px)",
            border: "1px solid rgba(224,187,228,0.65)",
            boxShadow: "0 8px 28px rgba(224,187,228,0.35)",
            color: "#b87fa8",
          }}
        >
          <FiChevronDown size={18} />
        </button>
      )}

      {/* ═══ Input ═══ */}
      <div
        className="relative z-10 px-4 sm:px-5 py-3.5 shrink-0"
        style={{
          background: "linear-gradient(180deg, rgba(255,252,254,0.5), rgba(255,248,252,0.75))",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          borderTop: "1px solid rgba(255,255,255,0.85)",
        }}
      >
        <div className="flex items-end gap-2.5 mx-auto relative">
          {/* Upload button */}
          <div className="relative">
            <button
              onClick={() => setShowUploadMenu((v) => !v)}
              className="dreamy-btn-glow w-11 h-11 rounded-2xl flex items-center justify-center cursor-pointer"
              title="Upload PDF / Image"
              style={{
                background: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(224,187,228,0.55)",
                color: "#e85d8c",
              }}
            >
              <FiPlus size={18} />
            </button>
            {showUploadMenu && (
              <div className="absolute left-0 bottom-14 w-72 rounded-2xl p-3 z-30 dreamy-glass-card-strong"
                style={{ boxShadow: "0 24px 48px rgba(224,187,228,0.35)" }}>
                <button
                  onClick={handlePickAsset}
                  disabled={uploadingAsset}
                  className="dreamy-btn-glow w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-white text-xs font-semibold disabled:opacity-60 tracking-wide"
                  style={{background:"linear-gradient(135deg,#FF9AA2,#E0BBE4)"}}
                >
                  <FiImage size={13} />
                  {uploadingAsset ? "Uploading…" : "Choose PDF / Image ✨"}
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
                    background:"rgba(255,255,255,0.65)",
                    border:"1px solid rgba(224,187,228,0.45)",
                    color:"#6b4a63",
                  }}
                />
                <p className="mt-1 text-[10px]" style={{color:"rgba(139,90,124,0.5)"}}>Upload right from this chat 💕</p>
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
              placeholder="Ask about your PDF… 💭"
              className="w-full resize-none rounded-2xl px-5 py-3 pr-12 text-sm outline-none transition shadow-sm"
              style={{
                minHeight: 44,
                maxHeight: 120,
                background: "rgba(255,255,255,0.85)",
                border: "1px solid rgba(224,187,228,0.45)",
                color: "#4a3d4f",
                caretColor: "#e85d8c",
              }}
              onFocus={e => { e.currentTarget.style.border="1px solid rgba(255,154,162,0.75)"; e.currentTarget.style.boxShadow="0 0 0 3px rgba(255,192,203,0.45), 0 0 28px rgba(224,187,228,0.35)"; }}
              onBlur={e => { e.currentTarget.style.border="1px solid rgba(224,187,228,0.45)"; e.currentTarget.style.boxShadow=""; }}
            />
          </div>

          {/* Send button */}
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="dreamy-btn-glow p-3 rounded-2xl text-white disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shrink-0"
            style={{
              background: "linear-gradient(135deg, #FF9AA2 0%, #FFC0CB 40%, #E0BBE4 100%)",
              boxShadow: "0 6px 24px rgba(255,154,162,0.45)",
            }}
          >
            <FiSend size={18} />
          </button>
        </div>
        <p className="text-center text-[10px] mt-2 tracking-wide" style={{color:"rgba(139,90,124,0.4)"}}>
          💗 Grounded in your PDFs · Double-check anything important
        </p>
      </div>
      </div>
    </div>
  );
}
