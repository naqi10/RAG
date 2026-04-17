import { useState } from "react";
import {
  FiGitBranch, FiList, FiBookOpen, FiKey,
  FiRefreshCw, FiChevronDown, FiChevronRight, FiDownload,
} from "react-icons/fi";
import { generateMindMap, generateStructuredSummary } from "../api/client";

/* ── Demo mind map data ── */
const DEMO_MINDMAP = {
  title: "Machine Learning Fundamentals",
  description: "Core concepts and techniques in machine learning",
  summary: "Machine Learning is a subset of AI that enables systems to learn from data. It encompasses supervised, unsupervised, and reinforcement learning approaches.",
  children: [
    {
      title: "Supervised Learning",
      description: "Learning from labeled training data",
      children: [
        { title: "Classification", description: "Predicting categorical labels (e.g., spam detection, image recognition)" },
        { title: "Regression", description: "Predicting continuous values (e.g., house prices, temperature)" },
        { title: "Common Algorithms", description: "Decision Trees, Random Forest, SVM, Neural Networks" },
      ],
    },
    {
      title: "Unsupervised Learning",
      description: "Finding patterns in unlabeled data",
      children: [
        { title: "Clustering", description: "Grouping similar data points (K-Means, DBSCAN)" },
        { title: "Dimensionality Reduction", description: "PCA, t-SNE for reducing feature space" },
        { title: "Association Rules", description: "Finding relationships between variables" },
      ],
    },
    {
      title: "Deep Learning",
      description: "Neural networks with multiple layers",
      children: [
        { title: "CNN", description: "Convolutional Neural Networks for image processing" },
        { title: "RNN / LSTM", description: "Recurrent networks for sequential data" },
        { title: "Transformers", description: "Attention-based architecture (BERT, GPT)" },
      ],
    },
    {
      title: "Model Evaluation",
      description: "Measuring model performance",
      children: [
        { title: "Metrics", description: "Accuracy, Precision, Recall, F1-Score, AUC-ROC" },
        { title: "Cross-Validation", description: "K-fold validation for robust evaluation" },
        { title: "Overfitting vs Underfitting", description: "Bias-variance tradeoff" },
      ],
    },
  ],
};

const DEMO_OUTLINE = {
  title: "Machine Learning Overview",
  sections: [
    { heading: "Introduction", points: ["ML is a branch of AI focused on building systems that learn from data", "Key types: supervised, unsupervised, reinforcement learning", "Applications span healthcare, finance, NLP, and computer vision"] },
    { heading: "Data Preprocessing", points: ["Handle missing values and outliers", "Feature scaling: normalization vs standardization", "Feature engineering and selection techniques"] },
    { heading: "Training & Evaluation", points: ["Train-test split (typically 80/20)", "Cross-validation for reliable estimates", "Hyperparameter tuning with grid/random search"] },
  ],
};

const QUICK_TOPICS = [
  { label: "Key Concepts Map", icon: FiGitBranch, query: "Map the key concepts from the documents" },
  { label: "Chapter Outline", icon: FiList, query: "Create an outline of all chapters" },
  { label: "Study Notes", icon: FiBookOpen, query: "Generate Cornell notes for the main topics" },
  { label: "Core Terms", icon: FiKey, query: "List and define all key concepts" },
];

function TreeNode({ node, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const depthColors = [
    "text-[#6b4a63]", "text-pink-700", "text-purple-600", "text-gray-700",
  ];

  return (
    <div className={depth > 0 ? "ml-6 border-l-2 border-pink-100" : ""}>
      <div className={`flex items-start gap-2 py-1.5 ${depth > 0 ? "pl-4" : ""}`}>
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} className="mt-0.5 text-pink-400 hover:text-pink-600 shrink-0 transition">
            {expanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-[14px] mt-1.5 shrink-0">
            <span className="block w-2 h-2 rounded-full bg-gradient-to-r from-pink-400 to-purple-400 ml-0.5" />
          </span>
        )}
        <div className="min-w-0">
          <span className={`text-sm font-medium ${depth === 0 ? "text-base font-bold" : ""} ${depthColors[Math.min(depth, 3)]}`}>
            {node.title}
          </span>
          {node.description && (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{node.description}</p>
          )}
        </div>
      </div>
      {expanded && hasChildren && (
        <div>{node.children.map((child, i) => <TreeNode key={i} node={child} depth={depth + 1} />)}</div>
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
        <div key={i} className="dreamy-glass-card rounded-xl p-4 border border-white/80">
          <h3 className="font-semibold text-gray-800 mb-2">{section.heading}</h3>
          <ul className="space-y-1.5">
            {(section.points || []).map((p, j) => (
              <li key={j} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400 mt-1.5 shrink-0" />
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
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cues</h3>
          {(data.cue_column || []).map((cue, i) => (
            <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="font-semibold text-sm text-amber-800">{cue.keyword}</p>
              {(cue.questions || []).map((q, j) => <p key={j} className="text-xs text-amber-600 mt-1">- {q}</p>)}
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</h3>
          {(data.notes_column || []).map((note, i) => (
            <div key={i} className="dreamy-glass-card border border-white/80 rounded-xl p-3">
              <p className="font-medium text-sm text-gray-800 mb-1">{note.topic}</p>
              {(note.details || []).map((d, j) => <p key={j} className="text-xs text-gray-600">- {d}</p>)}
            </div>
          ))}
        </div>
      </div>
      {data.summary && (
        <div className="bg-pink-50 border border-pink-200 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-pink-700 uppercase tracking-wider mb-1">Summary</h3>
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
        <div key={i} className="dreamy-glass-card rounded-xl p-4 border border-white/80">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm text-gray-900">{c.name}</h3>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, j) => (
                <span key={j} className={`w-1.5 h-4 rounded-sm ${j < (c.importance || 0) ? "bg-pink-400" : "bg-gray-200"}`} />
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-600 mb-2">{c.definition}</p>
          {c.related && c.related.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {c.related.map((r, j) => <span key={j} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-lg">{r}</span>)}
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
  const [isDemo, setIsDemo] = useState(false);

  const [mindmapData, setMindmapData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryFormat, setSummaryFormat] = useState("outline");

  const tabs = [
    { key: "mindmap", label: "Mind Map", icon: FiGitBranch },
    { key: "outline", label: "Outline", icon: FiList },
    { key: "cornell", label: "Cornell Notes", icon: FiBookOpen },
    { key: "key_concepts", label: "Key Concepts", icon: FiKey },
  ];

  const generate = async (overrideQuery) => {
    const q = (overrideQuery || query).trim();
    if (!q) return;
    setLoading(true);
    setError("");
    setIsDemo(false);
    try {
      if (activeTab === "mindmap") {
        const data = await generateMindMap(q, workspaceId, activePdfIds, detailLevel);
        setMindmapData(data.mindmap);
      } else {
        const data = await generateStructuredSummary(q, workspaceId, activePdfIds, activeTab);
        setSummaryData(data.summary);
        setSummaryFormat(activeTab);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const loadDemo = () => {
    setIsDemo(true);
    setMindmapData(DEMO_MINDMAP);
    setSummaryData(DEMO_OUTLINE);
    setSummaryFormat("outline");
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

  const hasContent = mindmapData || summaryData;

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#6b4a63] mb-1">Mind Map & Summaries</h1>
        <p className="text-sm text-gray-500">Visualize and structure knowledge from your documents</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 rounded-xl p-1 border border-white/60 bg-white/35 backdrop-blur-sm">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition flex-1 justify-center ${
              activeTab === key ? "bg-white/85 text-[#4a3d4f] shadow-sm" : "text-[#8b5a7c] hover:text-[#6b4a63]"
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
          className="flex-1 rounded-xl border border-[#E0BBE4]/50 px-4 py-2.5 text-sm outline-none focus:border-[#FF9AA2] bg-white/70 backdrop-blur-sm transition"
          onKeyDown={(e) => e.key === "Enter" && generate()}
        />
        {activeTab === "mindmap" && (
          <select value={detailLevel} onChange={(e) => setDetailLevel(e.target.value)}
            className="rounded-xl border border-[#E0BBE4]/50 px-3 py-2.5 text-sm outline-none focus:border-[#FF9AA2] bg-white/75 backdrop-blur-sm">
            <option value="overview">Overview</option>
            <option value="detailed">Detailed</option>
            <option value="exhaustive">Exhaustive</option>
          </select>
        )}
        <button onClick={() => generate()} disabled={loading || !query.trim()}
          className="px-5 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-medium hover:bg-pink-700 transition disabled:opacity-50">
          {loading ? <FiRefreshCw className="animate-spin" /> : "Generate"}
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 mb-4">{error}</div>}

      {/* Export & demo badge */}
      {hasContent && (
        <div className="flex items-center justify-between mb-4">
          {isDemo && (
            <span className="text-xs bg-purple-50 text-purple-600 border border-purple-200 px-3 py-1 rounded-lg">
              Demo data — generate your own from your PDFs
            </span>
          )}
          <div className="flex-1" />
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 transition">
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
            <div className="dreamy-glass-card rounded-xl p-6 border border-white/80">
              <TreeNode node={mindmapData} />
              {mindmapData.summary && (
                <p className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600 italic">{mindmapData.summary}</p>
              )}
            </div>
          )}
          {activeTab === "outline" && summaryData && summaryFormat === "outline" && <OutlineView data={summaryData} />}
          {activeTab === "cornell" && summaryData && summaryFormat === "cornell" && <CornellView data={summaryData} />}
          {activeTab === "key_concepts" && summaryData && summaryFormat === "key_concepts" && <KeyConceptsView data={summaryData} />}

          {/* ── Empty State: Rich ── */}
          {!loading && !hasContent && (
            <div>
              {/* Quick topics */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-600 mb-3">Quick Generate</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {QUICK_TOPICS.map((topic) => (
                    <button
                      key={topic.label}
                      onClick={() => { setQuery(topic.query); generate(topic.query); }}
                      className="dreamy-glass-card rounded-xl p-4 text-left hover:shadow-md transition-all border border-white/80 group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-pink-50 flex items-center justify-center mb-2 group-hover:bg-pink-100 transition">
                        <topic.icon size={16} className="text-pink-500" />
                      </div>
                      <p className="text-xs font-medium text-gray-700">{topic.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Demo section */}
              <div className="dreamy-glass-card rounded-2xl p-6 border border-white/80 mb-6">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-2xl"
                    style={{ background: "linear-gradient(145deg, #FEC8D8, #E0BBE4)" }}>
                    🧠
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 mb-1">See a Sample Mind Map</h3>
                    <p className="text-sm text-gray-500 mb-3">
                      Preview how mind maps and structured summaries look, or generate your own from uploaded documents.
                    </p>
                    <button onClick={loadDemo}
                      className="px-4 py-2 rounded-xl text-sm font-medium text-white transition cursor-pointer hover:opacity-90"
                      style={{ background: "linear-gradient(135deg, #FF9AA2, #E0BBE4)" }}>
                      Load Demo
                    </button>
                  </div>
                </div>
              </div>

              {/* Feature overview */}
              <h3 className="text-sm font-semibold text-gray-600 mb-3">What You Can Create</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: FiGitBranch, title: "Mind Maps", desc: "Hierarchical concept trees with expandable nodes" },
                  { icon: FiList, title: "Outlines", desc: "Structured section-by-section document outlines" },
                  { icon: FiBookOpen, title: "Cornell Notes", desc: "Cue + notes + summary study format" },
                  { icon: FiKey, title: "Key Concepts", desc: "Important terms with definitions and relations" },
                ].map((f) => (
                  <div key={f.title} className="dreamy-glass-card rounded-xl p-4 border border-white/80 text-center">
                    <div className="w-10 h-10 rounded-lg bg-pink-50 flex items-center justify-center mx-auto mb-2">
                      <f.icon size={18} className="text-pink-500" />
                    </div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">{f.title}</p>
                    <p className="text-[11px] text-gray-400 leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
