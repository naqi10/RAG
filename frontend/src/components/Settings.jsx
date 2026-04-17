import { useState, useEffect } from "react";
import { FiCpu, FiRefreshCw, FiCheck, FiAlertCircle, FiCloud, FiServer, FiZap, FiUser, FiBook, FiMessageSquare, FiGlobe, FiEdit2, FiSave } from "react-icons/fi";
import { getAppConfig, switchLLMProvider, getProvidersStatus, getMyProfile, updateMyProfile } from "../api/client";

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [providers, setProviders] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  // Profile state
  const [profile, setProfile] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [cfg, prov, prof] = await Promise.all([getAppConfig(), getProvidersStatus(), getMyProfile()]);
      setConfig(cfg);
      setProviders(prov);
      setProfile(prof);
      setNameInput(prof?.name || "");
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      await updateMyProfile({ display_name: nameInput.trim() });
      setProfile(p => ({ ...p, name: nameInput.trim() }));
      setEditingName(false);
    } catch { /* ignore */ } finally {
      setSavingName(false);
    }
  };

  const handleLangChange = async (lang) => {
    try {
      await updateMyProfile({ preferred_language: lang });
      setProfile(p => ({ ...p, preferred_language: lang }));
    } catch { /* ignore */ }
  };

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
      <p className="text-sm text-gray-500 mb-8">Manage your profile, AI provider, and preferences.</p>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <FiRefreshCw className="animate-spin" /> Loading configuration...
        </div>
      ) : (
        <div className="space-y-6">

          {/* ═══ My Profile Card ═══ */}
          {profile && (
            <div className="dreamy-glass-card rounded-xl p-5 border border-white/80">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-md shadow-rose-200/40">
                  <FiUser className="text-white text-lg" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">My Profile</h2>
                  <p className="text-xs text-gray-500">The AI remembers this to personalise responses</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Name row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500 w-32 shrink-0">
                    <FiUser size={13} /> Name
                  </div>
                  {editingName ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        value={nameInput}
                        onChange={e => setNameInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSaveName()}
                        className="flex-1 border border-rose-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-rose-100"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveName}
                        disabled={savingName}
                        className="px-3 py-1.5 bg-rose-500 text-white rounded-lg text-xs font-medium hover:bg-rose-600 transition flex items-center gap-1"
                      >
                        <FiSave size={11} /> Save
                      </button>
                      <button onClick={() => setEditingName(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 justify-between">
                      <span className="font-medium text-sm text-gray-800">{profile.name}</span>
                      <button onClick={() => setEditingName(true)} className="text-gray-400 hover:text-rose-500 transition">
                        <FiEdit2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-rose-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-rose-600">{profile.total_messages}</div>
                    <div className="text-[11px] text-gray-500 flex items-center justify-center gap-1 mt-0.5">
                      <FiMessageSquare size={10} /> Messages sent
                    </div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-purple-600">{profile.total_study_sessions}</div>
                    <div className="text-[11px] text-gray-500 flex items-center justify-center gap-1 mt-0.5">
                      <FiBook size={10} /> Study sessions
                    </div>
                  </div>
                </div>

                {/* Study topics */}
                {profile.study_topics?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><FiBook size={11} /> Topics the AI knows you&apos;ve studied</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.study_topics.slice(-20).map(t => (
                        <span key={t} className="text-[11px] px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-full">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Language preference */}
                <div>
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><FiGlobe size={11} /> Language preference</p>
                  <div className="flex gap-2">
                    {[["english", "English"], ["urdu", "اردو / Roman Urdu"], ["mixed", "Mixed"]].map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => handleLangChange(val)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                          profile.preferred_language === val
                            ? "bg-rose-500 text-white border-rose-500"
                            : "bg-white/60 text-[#5c4a5c] border-[#E0BBE4]/50 hover:border-[#FF9AA2]/60"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Last session */}
                {profile.last_topic_summary && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[11px] text-gray-400 mb-1">Last session</p>
                    <p className="text-xs text-gray-700">{profile.last_topic_summary}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* ═══ Provider Selector ═══ */}
          <div className="dreamy-glass-card rounded-xl p-5 border border-white/80">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center shadow-md shadow-pink-200/40">
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
                    ? "border-pink-500 bg-pink-50/50 shadow-sm shadow-pink-100"
                    : "border-[#E0BBE4]/50 bg-white/55 hover:border-[#FEC8D8] hover:shadow-md"
                }`}
              >
                {activeProvider === "groq" && (
                  <span className="absolute top-2 right-2 bg-pink-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">ACTIVE</span>
                )}
                <div className="flex items-center gap-2.5 mb-2">
                  <FiCloud size={18} className={activeProvider === "groq" ? "text-pink-600" : "text-gray-400"} />
                  <span className="font-semibold text-sm text-gray-800">Groq Cloud</span>
                </div>
                <p className="text-[11px] text-gray-500 mb-3">Fast cloud API — needs internet</p>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    groqStatus === "connected" ? "bg-pink-500 animate-pulse" :
                    groqStatus === "not_configured" ? "bg-gray-400" : "bg-red-500"
                  }`} />
                  <span className={`text-[11px] font-medium ${
                    groqStatus === "connected" ? "text-pink-600" :
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
                    ? "border-pink-500 bg-pink-50/50 shadow-sm shadow-pink-100"
                    : "border-[#E0BBE4]/50 bg-white/55 hover:border-[#FEC8D8] hover:shadow-md"
                }`}
              >
                {activeProvider === "ollama" && (
                  <span className="absolute top-2 right-2 bg-pink-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">ACTIVE</span>
                )}
                <div className="flex items-center gap-2.5 mb-2">
                  <FiServer size={18} className={activeProvider === "ollama" ? "text-pink-600" : "text-gray-400"} />
                  <span className="font-semibold text-sm text-gray-800">Ollama Local</span>
                </div>
                <p className="text-[11px] text-gray-500 mb-3">Offline — runs on your machine</p>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    ollamaStatus === "connected" ? "bg-pink-500 animate-pulse" : "bg-red-500"
                  }`} />
                  <span className={`text-[11px] font-medium ${
                    ollamaStatus === "connected" ? "text-pink-600" : "text-red-500"
                  }`}>
                    {ollamaStatus === "connected" ? "Running" : "Not Running"}
                  </span>
                </div>
              </button>
            </div>

            {switching && (
              <div className="flex items-center gap-2 text-sm text-pink-600 mb-3">
                <FiRefreshCw className="animate-spin" size={14} /> Switching provider...
              </div>
            )}

            {/* Active Provider Details */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Active Model:</span>
                <span className="font-mono text-xs bg-white/80 px-2 py-0.5 rounded border border-[#E0BBE4]/45">
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
                          ? "bg-pink-50 border-pink-200 text-pink-700"
                          : "bg-white/60 border-[#E0BBE4]/50 text-[#5c4a5c]"
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
          <div className="bg-gradient-to-r from-pink-50 to-rose-50 rounded-xl border border-pink-200/40 p-4 text-sm text-pink-800">
            <div className="flex items-start gap-2">
              <FiZap className="mt-0.5 shrink-0 text-pink-600" />
              <div>
                <p className="font-medium">Auto-Fallback Enabled</p>
                <p className="text-xs mt-1 text-pink-700">
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
