import { useState, useEffect } from "react";
import { FiCpu, FiRefreshCw, FiCheck, FiAlertCircle, FiCloud, FiServer, FiZap } from "react-icons/fi";
import { getLLMStatus, getAppConfig, switchLLMProvider, getProvidersStatus } from "../api/client";

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [providers, setProviders] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [cfg, prov] = await Promise.all([getAppConfig(), getProvidersStatus()]);
      setConfig(cfg);
      setProviders(prov);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSwitch = async (provider) => {
    if (switching || provider === config?.llm_provider) return;
    setSwitching(true);
    try {
      await switchLLMProvider(provider);
      await fetchAll();
    } catch {
      alert("Failed to switch provider.");
    } finally {
      setSwitching(false);
    }
  };

  const activeProvider = config?.llm_provider || providers?.active_provider || "unknown";
  const ollamaStatus = providers?.ollama?.status || "unknown";
  const groqStatus = providers?.groq?.status || "unknown";
  const ollamaModels = providers?.ollama?.models || [];
  const groqModels = providers?.groq?.models || [];

  return (
    <div className="max-w-2xl mx-auto py-10 px-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-sm text-gray-500 mb-8">Manage your AI provider — switch between cloud and offline mode instantly.</p>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <FiRefreshCw className="animate-spin" /> Loading configuration...
        </div>
      ) : (
        <div className="space-y-6">
          {/* ═══ Provider Selector ═══ */}
          <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-200/40">
                  <FiCpu className="text-white text-lg" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">AI Provider</h2>
                  <p className="text-xs text-gray-500">Choose between cloud (Groq) or offline (Ollama)</p>
                </div>
              </div>
              <button
                onClick={fetchAll}
                disabled={loading}
                className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <FiRefreshCw size={16} className={loading ? "animate-spin" : ""} />
              </button>
            </div>

            {/* Provider Toggle Cards */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {/* Groq Card */}
              <button
                onClick={() => handleSwitch("groq")}
                disabled={switching}
                className={`relative p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                  activeProvider === "groq"
                    ? "border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-100"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                }`}
              >
                {activeProvider === "groq" && (
                  <span className="absolute top-2 right-2 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">ACTIVE</span>
                )}
                <div className="flex items-center gap-2.5 mb-2">
                  <FiCloud size={18} className={activeProvider === "groq" ? "text-emerald-600" : "text-gray-400"} />
                  <span className="font-semibold text-sm text-gray-800">Groq Cloud</span>
                </div>
                <p className="text-[11px] text-gray-500 mb-3">Fast cloud API — needs internet</p>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    groqStatus === "connected" ? "bg-emerald-500 animate-pulse" :
                    groqStatus === "not_configured" ? "bg-gray-400" : "bg-red-500"
                  }`} />
                  <span className={`text-[11px] font-medium ${
                    groqStatus === "connected" ? "text-emerald-600" :
                    groqStatus === "not_configured" ? "text-gray-500" : "text-red-500"
                  }`}>
                    {groqStatus === "connected" ? "Connected" :
                     groqStatus === "not_configured" ? "No API Key" : "Disconnected"}
                  </span>
                </div>
              </button>

              {/* Ollama Card */}
              <button
                onClick={() => handleSwitch("ollama")}
                disabled={switching}
                className={`relative p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                  activeProvider === "ollama"
                    ? "border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-100"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                }`}
              >
                {activeProvider === "ollama" && (
                  <span className="absolute top-2 right-2 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">ACTIVE</span>
                )}
                <div className="flex items-center gap-2.5 mb-2">
                  <FiServer size={18} className={activeProvider === "ollama" ? "text-emerald-600" : "text-gray-400"} />
                  <span className="font-semibold text-sm text-gray-800">Ollama Local</span>
                </div>
                <p className="text-[11px] text-gray-500 mb-3">Offline — runs on your machine</p>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    ollamaStatus === "connected" ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                  }`} />
                  <span className={`text-[11px] font-medium ${
                    ollamaStatus === "connected" ? "text-emerald-600" : "text-red-500"
                  }`}>
                    {ollamaStatus === "connected" ? "Running" : "Not Running"}
                  </span>
                </div>
              </button>
            </div>

            {switching && (
              <div className="flex items-center gap-2 text-sm text-emerald-600 mb-3">
                <FiRefreshCw className="animate-spin" size={14} /> Switching provider...
              </div>
            )}

            {/* Active Provider Details */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Active Model:</span>
                <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border border-gray-200">
                  {activeProvider === "ollama" ? config?.ollama_model : "llama-3.3-70b-versatile"}
                </span>
              </div>

              {activeProvider === "groq" && groqModels.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Available:</span>
                  <span className="text-xs text-gray-400">{groqModels.length} models</span>
                </div>
              )}

              {activeProvider === "ollama" && ollamaModels.length > 0 && (
                <div>
                  <span className="text-xs text-gray-500">Installed Models:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {ollamaModels.map((m) => (
                      <span key={m} className={`text-[11px] px-2 py-0.5 rounded-lg border ${
                        m === config?.ollama_model || m.startsWith(config?.ollama_model)
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-white border-gray-200 text-gray-600"
                      }`}>
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Ollama setup hint */}
          {activeProvider === "ollama" && ollamaStatus !== "connected" && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <FiAlertCircle className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Ollama not detected</p>
                  <p className="text-xs mt-1 text-amber-700">
                    Install from <span className="font-medium">ollama.com</span>, then run:{" "}
                    <code className="bg-amber-100 px-1 rounded">ollama serve</code> and{" "}
                    <code className="bg-amber-100 px-1 rounded">ollama pull {config?.ollama_model}</code>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Info Card */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200/40 p-4 text-sm text-emerald-800">
            <div className="flex items-start gap-2">
              <FiZap className="mt-0.5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-medium">Auto-Fallback Enabled</p>
                <p className="text-xs mt-1 text-emerald-700">
                  If your primary provider fails, the app will automatically try the other one. No manual switching needed during failures.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
