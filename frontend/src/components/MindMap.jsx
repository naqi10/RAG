import { useState } from "react";
import {
  FiGitBranch, FiList, FiBookOpen, FiKey,
  FiRefreshCw, FiChevronDown, FiChevronRight, FiDownload,
} from "react-icons/fi";
import { generateMindMap, generateStructuredSummary } from "../api/client";

function TreeNode({ node, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className={depth > 0 ? "ml-6 border-l border-gray-200" : ""}>
      <div
        className={`flex items-start gap-2 py-1.5 ${depth > 0 ? "pl-4" : ""}`}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-0.5 text-gray-400 hover:text-gray-600 shrink-0"
          >
            {expanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-[14px] mt-1.5 shrink-0">
            <span className="block w-1.5 h-1.5 rounded-full bg-emerald-400 ml-1" />
          </span>
        )}
        <div className="min-w-0">
          <span className={`text-sm font-medium ${depth === 0 ? "text-gray-900 text-base" : "text-gray-800"}`}>
            {node.title}
          </span>
          {node.description && (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{node.description}</p>
          )}
        </div>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child, i) => (
            <TreeNode key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function OutlineView({ data }) {
  if (!data?.sections) return null;
  return (
    <div className="space-y-4">
      {data.title && <h2 className="text-lg font-bold text-gray-900">{data.title}</h2>}
      {data.sections.map((section, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200/60 p-4">
          <h3 className="font-semibold text-gray-800 mb-2">{section.heading}</h3>
          <ul className="space-y-1.5">
            {(section.points || []).map((p, j) => (
              <li key={j} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-emerald-400 mt-2 shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CornellView({ data }) {
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[200px_1fr] gap-4">
        {/* Cue Column */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cues</h3>
          {(data.cue_column || []).map((cue, i) => (
            <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="font-semibold text-sm text-amber-800">{cue.keyword}</p>
              {(cue.questions || []).map((q, j) => (
                <p key={j} className="text-xs text-amber-600 mt-1">- {q}</p>
              ))}
            </div>
          ))}
        </div>
        {/* Notes Column */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</h3>
          {(data.notes_column || []).map((note, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-3">
              <p className="font-medium text-sm text-gray-800 mb-1">{note.topic}</p>
              {(note.details || []).map((d, j) => (
                <p key={j} className="text-xs text-gray-600">- {d}</p>
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* Summary */}
      {data.summary && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1">Summary</h3>
          <p className="text-sm text-gray-800">{data.summary}</p>
        </div>
      )}
    </div>
  );
}

function KeyConceptsView({ data }) {
  if (!data?.concepts) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {data.concepts.map((c, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200/60 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm text-gray-900">{c.name}</h3>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, j) => (
                <span
                  key={j}
                  className={`w-1.5 h-4 rounded-sm ${
                    j < (c.importance || 0) ? "bg-emerald-400" : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-600 mb-2">{c.definition}</p>
          {c.related && c.related.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {c.related.map((r, j) => (
                <span key={j} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-lg">{r}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function MindMap({ workspaceId, activePdfIds }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("mindmap");
  const [detailLevel, setDetailLevel] = useState("detailed");

  const [mindmapData, setMindmapData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryFormat, setSummaryFormat] = useState("outline");

  const tabs = [
    { key: "mindmap", label: "Mind Map", icon: FiGitBranch },
    { key: "outline", label: "Outline", icon: FiList },
    { key: "cornell", label: "Cornell Notes", icon: FiBookOpen },
    { key: "key_concepts", label: "Key Concepts", icon: FiKey },
  ];

  const generate = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");

    try {
      if (activeTab === "mindmap") {
        const data = await generateMindMap(query, workspaceId, activePdfIds, detailLevel);
        setMindmapData(data.mindmap);
      } else {
        const data = await generateStructuredSummary(query, workspaceId, activePdfIds, activeTab);
        setSummaryData(data.summary);
        setSummaryFormat(activeTab);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const data = activeTab === "mindmap" ? mindmapData : summaryData;
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTab}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Mind Map & Summaries</h1>
        <p className="text-sm text-gray-500">Visualize and structure knowledge from your documents.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 bg-gray-100 rounded-xl p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition flex-1 justify-center ${
              activeTab === key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='e.g. "Map the key concepts in machine learning"'
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
          onKeyDown={(e) => e.key === "Enter" && generate()}
        />
        {activeTab === "mindmap" && (
          <select
            value={detailLevel}
            onChange={(e) => setDetailLevel(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 bg-white"
          >
            <option value="overview">Overview</option>
            <option value="detailed">Detailed</option>
            <option value="exhaustive">Exhaustive</option>
          </select>
        )}
        <button
          onClick={generate}
          disabled={loading || !query.trim()}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50"
        >
          {loading ? <FiRefreshCw className="animate-spin" /> : "Generate"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mb-4">{error}</div>
      )}

      {/* Export button */}
      {(mindmapData || summaryData) && (
        <div className="flex justify-end mb-4">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 transition"
          >
            <FiDownload size={12} /> Export JSON
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          <FiRefreshCw className="animate-spin mr-2" /> Generating {activeTab === "mindmap" ? "mind map" : "summary"}...
        </div>
      ) : (
        <div>
          {activeTab === "mindmap" && mindmapData && (
            <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-6">
              <TreeNode node={mindmapData} />
              {mindmapData.summary && (
                <p className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600 italic">
                  {mindmapData.summary}
                </p>
              )}
            </div>
          )}

          {activeTab === "outline" && summaryData && summaryFormat === "outline" && (
            <OutlineView data={summaryData} />
          )}

          {activeTab === "cornell" && summaryData && summaryFormat === "cornell" && (
            <CornellView data={summaryData} />
          )}

          {activeTab === "key_concepts" && summaryData && summaryFormat === "key_concepts" && (
            <KeyConceptsView data={summaryData} />
          )}

          {/* Empty state */}
          {!loading && !mindmapData && !summaryData && (
            <div className="text-center py-16 text-gray-400">
              <FiGitBranch size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">Enter a topic and generate a {activeTab === "mindmap" ? "mind map" : "structured summary"}.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
