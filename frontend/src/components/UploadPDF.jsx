import { useCallback, useState } from "react";
import { FiUploadCloud, FiCheckCircle, FiAlertCircle, FiTag } from "react-icons/fi";
import { uploadPDFToWorkspace } from "../api/client";

const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"];

export default function UploadPDF({ workspaceId, onUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("idle");
  const [info, setInfo] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const [tags, setTags] = useState("");

  const handleFile = useCallback(
    async (file) => {
      const name = file?.name?.toLowerCase?.() || "";
      const valid = ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
      if (!file || !valid) {
        setStatus("error");
        setErrMsg("Please select PDF or image (png/jpg/jpeg/webp/bmp/tiff).");
        return;
      }
      if (!workspaceId) {
        setStatus("error");
        setErrMsg("No workspace selected.");
        return;
      }
      setStatus("uploading");
      setErrMsg("");
      try {
        const data = await uploadPDFToWorkspace(workspaceId, file, tags.trim());
        setInfo(data);
        setStatus("done");
        onUploaded?.(file.name);
      } catch (err) {
        setStatus("error");
        setErrMsg(err?.response?.data?.detail || err.message);
      }
    },
    [workspaceId, tags, onUploaded]
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`w-full max-w-md border-2 border-dashed rounded-2xl p-10 text-center transition-colors
          ${dragging ? "border-emerald-400 bg-emerald-50/50" : "border-gray-200 bg-white"}`}
      >
        {status === "uploading" ? (
          <>
            <div className="mx-auto w-10 h-10 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
            <p className="mt-4 text-sm text-gray-500">Uploading & processing...</p>
          </>
        ) : status === "done" ? (
          <>
            <FiCheckCircle className="mx-auto text-emerald-500" size={40} />
            <p className="mt-4 text-sm font-medium text-emerald-700">Upload successful!</p>
            <p className="mt-1 text-xs text-gray-400">
              {info?.chunks_added} chunks indexed from {info?.pages} pages
            </p>
            <button onClick={() => { setStatus("idle"); setInfo(null); setTags(""); }}
              className="mt-4 text-xs text-emerald-600 hover:underline cursor-pointer">
              Upload another PDF
            </button>
          </>
        ) : (
          <>
            <FiUploadCloud className="mx-auto text-gray-300" size={40} />
            <p className="mt-4 text-sm text-gray-500">
              Drag & drop a PDF or image here, or{" "}
              <label className="text-emerald-600 font-medium cursor-pointer hover:underline">
                browse
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>
            </p>
            <div className="mt-4 flex items-center gap-2 w-full max-w-xs mx-auto">
              <FiTag size={14} className="text-gray-300 shrink-0" />
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Tags (e.g. chapter1, notes)"
                className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-emerald-400"
              />
            </div>
            <p className="mt-2 text-[10px] text-gray-300">
              Multiple PDFs/images per workspace supported (OCR for image text extraction)
            </p>
            {status === "error" && (
              <div className="mt-4 flex items-center gap-2 text-xs text-red-500 justify-center">
                <FiAlertCircle size={14} /> {errMsg}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
