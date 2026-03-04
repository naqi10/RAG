import { useState, useRef, useEffect, useCallback } from "react";
import {
  FiSend,
  FiClock,
  FiZap,
  FiDownload,
  FiFileText,
  FiBookOpen,
  FiCopy,
  FiCheck,
  FiChevronDown,
  FiUser,
  FiAlertCircle,
} from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askQuestion, getConversationMessages, exportConversation } from "../api/client";

/* ─── branding icon ─── */
const AiIcon = () => (
  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-md shadow-emerald-200/50">
    <FiBookOpen size={15} className="text-white" />
  </div>
);

const UserIcon = () => (
  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-violet-200/50">
    <FiUser size={15} className="text-white" />
  </div>
);

/* ─── confidence badge ─── */
const ConfidenceBadge = ({ level }) => {
  const styles = {
    High: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    Medium: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    Low: "bg-red-500/15 text-red-400 border-red-500/20",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${styles[level] || styles.Medium}`}>
      {level} confidence
    </span>
  );
};

/* ─── source / page pill ─── */
const SourcePill = ({ source, page }) => {
  const filename = source ? source.split(/[\\/]/).pop() : "Unknown";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] bg-slate-700/60 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-600/40">
      <FiFileText size={11} className="text-emerald-400" />
      <span className="max-w-[140px] truncate">{filename}</span>
      {page && (
        <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-1.5 py-0 rounded-md ml-0.5">
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
      className="text-slate-500 hover:text-emerald-400 transition p-1 rounded-md hover:bg-slate-700/50 cursor-pointer"
      title="Copy response"
    >
      {copied ? <FiCheck size={13} className="text-emerald-400" /> : <FiCopy size={13} />}
    </button>
  );
};

/* ─── typing indicator ─── */
const TypingIndicator = () => (
  <div className="flex items-start gap-3">
    <AiIcon />
    <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-tl-md px-5 py-4 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce [animation-delay:300ms]" />
        </div>
        <span className="text-xs text-slate-500 ml-1">Analyzing your document...</span>
      </div>
    </div>
  </div>
);

const SUGGESTED_QUESTIONS = [
  { icon: "📋", text: "Summarize this document in bullet points" },
  { icon: "🔑", text: "What are the key concepts explained here?" },
  { icon: "📚", text: "List the main topics covered" },
  { icon: "💡", text: "Explain the most important section" },
];

export default function Chat({ conversationId, convoTitle, workspaceId, activePdfIds, pdfs = [] }) {
  const activePdfs = pdfs.filter((p) => p.is_active);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const bottomRef = useRef(null);
  const scrollAreaRef = useRef(null);

  /* ─── load conversation history ─── */
  useEffect(() => {
    if (!conversationId || historyLoaded === conversationId) return;
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
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  /* ─── scroll to bottom detection ─── */
  const handleScroll = useCallback(() => {
    if (!scrollAreaRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 120);
  }, []);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: "smooth" });

  /* ─── send message ─── */
  const send = async (overrideQuery) => {
    const q = (overrideQuery || input).trim();
    if (!q || loading) return;

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
    } catch (err) {
      const isTimeout = err?.code === "ECONNABORTED" || err?.message?.includes("timeout");
      const errorMsg = isTimeout
        ? "Request timed out. The server may be busy — please try again."
        : err?.response?.data?.detail || "Something went wrong.";
      setMessages((m) => [
        ...m,
        { role: "assistant", text: errorMsg, error: true, ts: Date.now() },
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  /* ─── extract sources from text for display (remove from rendered answer) ─── */
  const cleanAnswer = (text) => {
    if (!text) return "";
    // Remove "Sources Referenced:" and "Confidence:" sections from the text
    return text
      .replace(/\n*Sources Referenced:[\s\S]*?(?=\n\nConfidence:|$)/i, "")
      .replace(/\n*Confidence:\s*(High|Medium|Low)\s*/i, "")
      .trim();
  };

  /* ─── deduplicate sources ─── */
  const getUniqueSources = (sources) => {
    if (!sources || !sources.length) return [];
    const seen = new Set();
    return sources.filter((s) => {
      const key = `${s.source || ""}|${s.page || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 4);
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-slate-50 to-white">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200/60 bg-white/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="text-sm font-semibold text-slate-700 truncate max-w-[180px]">
            {convoTitle || "Chat"}
          </h2>
          {activePdfs.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-hidden">
              <div className="h-4 w-px bg-slate-200" />
              {activePdfs.slice(0, 2).map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full truncate max-w-[120px]">
                  <FiFileText size={10} />
                  {p.display_name || p.filename}
                </span>
              ))}
              {activePdfs.length > 2 && (
                <span className="text-[10px] text-slate-400">+{activePdfs.length - 2}</span>
              )}
            </div>
          )}
          {activePdfs.length === 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-full">
              <FiAlertCircle size={10} /> No PDFs active
            </span>
          )}
        </div>
        {messages.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleExport("json")}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg transition cursor-pointer"
            >
              <FiDownload size={12} /> JSON
            </button>
            <button
              onClick={() => handleExport("txt")}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg transition cursor-pointer"
            >
              <FiDownload size={12} /> TXT
            </button>
          </div>
        )}
      </div>

      {/* ═══ Messages ═══ */}
      <div
        ref={scrollAreaRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6"
      >
        {/* Empty state */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full select-none">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-200/40">
              <FiBookOpen size={28} className="text-white" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-1">Your PDF is ready</h3>
            <p className="text-sm text-slate-400 mb-8">Ask anything about your document</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-lg w-full">
              {SUGGESTED_QUESTIONS.map((sq, i) => (
                <button
                  key={i}
                  onClick={() => send(sq.text)}
                  className="flex items-center gap-3 text-left px-4 py-3.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-700 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <span className="text-base">{sq.icon}</span>
                  <span className="group-hover:translate-x-0.5 transition-transform">{sq.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map((msg, i) =>
          msg.role === "user" ? (
            /* ─── User Message ─── */
            <div key={i} className="flex items-start gap-3 justify-end">
              <div className="max-w-[70%]">
                <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-2xl rounded-tr-md px-5 py-3.5 shadow-md shadow-violet-200/30">
                  <span className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</span>
                </div>
                {msg.ts && (
                  <div className="mt-1.5 text-[10px] text-slate-400 flex items-center gap-1 justify-end pr-1">
                    <FiClock size={9} /> {formatTime(msg.ts)}
                  </div>
                )}
              </div>
              <UserIcon />
            </div>
          ) : msg.error ? (
            /* ─── Error Message ─── */
            <div key={i} className="flex items-start gap-3">
              <AiIcon />
              <div className="max-w-[75%]">
                <div className="bg-red-50 border border-red-200/60 text-red-600 rounded-2xl rounded-tl-md px-5 py-3.5">
                  <div className="flex items-center gap-2 mb-1">
                    <FiAlertCircle size={14} />
                    <span className="text-xs font-semibold">Error</span>
                  </div>
                  <span className="text-sm">{msg.text}</span>
                </div>
              </div>
            </div>
          ) : (
            /* ─── AI Response ─── */
            <div key={i} className="flex items-start gap-3">
              <AiIcon />
              <div className="max-w-[80%] space-y-2">
                {/* Dark response card */}
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl rounded-tl-md overflow-hidden shadow-lg shadow-slate-900/20">
                  {/* Response body */}
                  <div className="px-5 py-4 text-sm leading-relaxed text-slate-200">
                    <div className="prose prose-sm prose-invert max-w-none
                      [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
                      prose-headings:text-emerald-400 prose-headings:font-semibold prose-headings:text-base
                      prose-strong:text-white prose-strong:font-semibold
                      prose-em:text-emerald-300
                      prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline
                      prose-code:text-emerald-300 prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs prose-code:font-mono
                      prose-pre:bg-slate-800/80 prose-pre:border prose-pre:border-slate-700/60 prose-pre:rounded-xl prose-pre:p-4
                      prose-li:text-slate-300 prose-li:marker:text-emerald-500
                      prose-blockquote:border-emerald-500/40 prose-blockquote:text-slate-400
                      prose-hr:border-slate-700
                      prose-th:text-slate-300 prose-td:text-slate-400 prose-table:text-xs
                    ">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {cleanAnswer(msg.text)}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {/* Source pills */}
                  {getUniqueSources(msg.sources).length > 0 && (
                    <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                      {getUniqueSources(msg.sources).map((s, j) => (
                        <SourcePill key={j} source={s.source} page={s.page} />
                      ))}
                    </div>
                  )}

                  {/* Footer bar */}
                  <div className="flex items-center justify-between px-5 py-2.5 bg-slate-800/60 border-t border-slate-700/40">
                    <div className="flex items-center gap-2">
                      {msg.confidence && <ConfidenceBadge level={msg.confidence} />}
                      {msg.task_type && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-500 border border-slate-600/30">
                          {msg.task_type}
                        </span>
                      )}
                      {msg.context_count && (
                        <span className="text-[10px] text-slate-600">
                          {msg.context_count} chunks
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CopyButton text={cleanAnswer(msg.text)} />
                      {msg.ts && (
                        <span className="text-[10px] text-slate-600 flex items-center gap-1">
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
          className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-slate-800 text-white p-2 rounded-full shadow-lg hover:bg-slate-700 transition z-20 cursor-pointer"
        >
          <FiChevronDown size={18} />
        </button>
      )}

      {/* ═══ Input ═══ */}
      <div className="border-t border-slate-200/60 bg-white/80 backdrop-blur-sm px-4 sm:px-6 py-4">
        <div className="flex items-end gap-3 max-w-3xl mx-auto">
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
              className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-5 py-3 pr-12 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition shadow-sm placeholder:text-slate-400"
              style={{ minHeight: 44, maxHeight: 120 }}
            />
          </div>
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="p-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-emerald-200/40 hover:shadow-lg cursor-pointer shrink-0"
          >
            <FiSend size={18} />
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-2">
          Answers are based on your uploaded PDFs. Always verify important information.
        </p>
      </div>
    </div>
  );
}
