import { useState, useEffect, useCallback } from "react";
import {
  FiFileText, FiPlus, FiTrash2, FiEdit2, FiBookmark,
  FiDownload, FiCpu, FiRefreshCw, FiX,
} from "react-icons/fi";
import { createNote, getNotes, updateNote, deleteNote, exportNotes, summarizeNotes } from "../api/client";

const COLORS = [
  { name: "Green", value: "#10B981" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Orange", value: "#F59E0B" },
  { name: "Red", value: "#EF4444" },
  { name: "Pink", value: "#EC4899" },
];

export default function PDFNotes({ workspaceId, pdfs }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPdf, setSelectedPdf] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState("");

  // Form state
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [highlightedText, setHighlightedText] = useState("");
  const [pageNumber, setPageNumber] = useState("");
  const [noteColor, setNoteColor] = useState("#10B981");
  const [noteTags, setNoteTags] = useState("");

  const fetchNotes = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const data = await getNotes(workspaceId, selectedPdf || undefined);
      setNotes(data.notes || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [workspaceId, selectedPdf]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const resetForm = () => {
    setNoteContent("");
    setNoteType("note");
    setHighlightedText("");
    setPageNumber("");
    setNoteColor("#10B981");
    setNoteTags("");
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!noteContent.trim()) return;

    try {
      if (editingId) {
        await updateNote(editingId, {
          content: noteContent,
          color: noteColor,
          tags: noteTags,
          note_type: noteType,
        });
      } else {
        await createNote({
          workspace_id: workspaceId,
          pdf_id: selectedPdf || undefined,
          note_type: noteType,
          content: noteContent,
          highlighted_text: highlightedText || undefined,
          page_number: pageNumber ? parseInt(pageNumber) : undefined,
          color: noteColor,
          tags: noteTags,
        });
      }
      resetForm();
      fetchNotes();
    } catch {
      /* ignore */
    }
  };

  const handleEdit = (note) => {
    setEditingId(note.note_id);
    setNoteContent(note.content);
    setNoteType(note.note_type);
    setHighlightedText(note.highlighted_text || "");
    setPageNumber(note.page_number?.toString() || "");
    setNoteColor(note.color);
    setNoteTags(note.tags || "");
    setShowForm(true);
  };

  const handleDelete = async (noteId) => {
    try {
      await deleteNote(noteId);
      fetchNotes();
    } catch {
      /* ignore */
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportNotes(workspaceId);
      const blob = new Blob([data.markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "study-notes.md";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  const handleSummarize = async () => {
    setSummarizing(true);
    setSummary("");
    try {
      const data = await summarizeNotes(workspaceId, selectedPdf || undefined);
      setSummary(data.summary);
    } catch {
      setSummary("Failed to generate summary.");
    } finally {
      setSummarizing(false);
    }
  };

  const activePdfs = (pdfs || []).filter((p) => p.is_active);

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Notes & Highlights</h1>
          <p className="text-sm text-gray-500">Annotate and organize your study notes.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition border border-gray-200"
          >
            <FiDownload size={14} /> Export
          </button>
          <button
            onClick={handleSummarize}
            disabled={summarizing || notes.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-emerald-600 hover:bg-emerald-50 transition border border-emerald-200 disabled:opacity-50"
          >
            {summarizing ? <FiRefreshCw size={14} className="animate-spin" /> : <FiCpu size={14} />}
            AI Summary
          </button>
        </div>
      </div>

      {/* PDF filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setSelectedPdf("")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            !selectedPdf ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All
        </button>
        {activePdfs.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedPdf(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition truncate max-w-[150px] ${
              selectedPdf === p.id ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {p.display_name || p.filename}
          </button>
        ))}
      </div>

      {/* AI Summary */}
      {summary && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-emerald-700 flex items-center gap-1.5">
              <FiCpu size={14} /> AI Summary
            </span>
            <button onClick={() => setSummary("")} className="text-gray-400 hover:text-gray-600">
              <FiX size={14} />
            </button>
          </div>
          <p className="whitespace-pre-wrap leading-relaxed">{summary}</p>
        </div>
      )}

      {/* Add Note Button / Form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-emerald-300 hover:text-emerald-600 transition mb-6"
        >
          <FiPlus size={16} /> Add Note
        </button>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 text-sm">
              {editingId ? "Edit Note" : "New Note"}
            </h3>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <FiX size={16} />
            </button>
          </div>

          <div className="space-y-3">
            {/* Type selector */}
            <div className="flex gap-2">
              {[
                { value: "note", label: "Note", icon: FiFileText },
                { value: "highlight", label: "Highlight", icon: FiEdit2 },
                { value: "bookmark", label: "Bookmark", icon: FiBookmark },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setNoteType(value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    noteType === value
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>

            {/* Highlighted text */}
            {noteType === "highlight" && (
              <input
                value={highlightedText}
                onChange={(e) => setHighlightedText(e.target.value)}
                placeholder="Paste the text you want to highlight..."
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 transition"
              />
            )}

            {/* Note content */}
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Write your note..."
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition resize-none"
            />

            {/* Page + Tags row */}
            <div className="flex gap-3">
              <input
                value={pageNumber}
                onChange={(e) => setPageNumber(e.target.value)}
                placeholder="Page #"
                type="number"
                className="w-24 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 transition"
              />
              <input
                value={noteTags}
                onChange={(e) => setNoteTags(e.target.value)}
                placeholder="Tags (comma separated)"
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-400 transition"
              />
            </div>

            {/* Color picker */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Color:</span>
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setNoteColor(c.value)}
                  className={`w-6 h-6 rounded-full transition ${
                    noteColor === c.value ? "ring-2 ring-offset-2 ring-gray-400" : ""
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={resetForm} className="px-4 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!noteContent.trim()}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {editingId ? "Update" : "Save Note"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
          <FiRefreshCw className="animate-spin mr-2" /> Loading notes...
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FiFileText size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">No notes yet. Start annotating your PDFs!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.note_id}
              className="bg-white rounded-xl border border-gray-200/60 p-4 hover:shadow-sm transition"
              style={{ borderLeftWidth: "3px", borderLeftColor: note.color }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {note.highlighted_text && (
                    <div className="mb-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-600 italic border-l-2 border-gray-300">
                      "{note.highlighted_text}"
                    </div>
                  )}
                  <p className="text-sm text-gray-800 leading-relaxed">{note.content}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    {note.page_number && <span>Page {note.page_number}</span>}
                    <span className="capitalize">{note.note_type}</span>
                    {note.tags && <span>{note.tags}</span>}
                    <span>{new Date(note.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleEdit(note)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                  >
                    <FiEdit2 size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(note.note_id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                  >
                    <FiTrash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
