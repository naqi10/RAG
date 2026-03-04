import axios from "axios";

const api = axios.create({ baseURL: "", timeout: 15000 });
const llmApi = axios.create({ baseURL: "", timeout: 120000 });

function addInterceptors(instance) {
  instance.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  instance.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err?.response?.status === 401 && localStorage.getItem("token")) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.reload();
      }
      return Promise.reject(err);
    }
  );
}
addInterceptors(api);
addInterceptors(llmApi);

// ── Auth ──
export const login = (email, password) => api.post("/auth/login", { email, password }).then(r => r.data);
export const getMe = () => api.get("/auth/me").then(r => r.data);

// ── Admin ──
export const getUsers = () => api.get("/admin/users").then(r => r.data);
export const inviteUser = (email, password, displayName) => api.post("/admin/users/invite", { email, password, display_name: displayName }).then(r => r.data);
export const deactivateUser = (id) => api.delete(`/admin/users/${id}`).then(r => r.data);
export const activateUser = (id) => api.patch(`/admin/users/${id}/activate`).then(r => r.data);

// ── Workspaces ──
export const getWorkspaces = () => api.get("/workspaces/").then(r => r.data);
export const createWorkspace = (title) => api.post("/workspaces/", { title }).then(r => r.data);
export const renameWorkspace = (id, title) => api.patch(`/workspaces/${id}/rename`, { title }).then(r => r.data);
export const deleteWorkspace = (id) => api.delete(`/workspaces/${id}`).then(r => r.data);

// ── Workspace PDFs ──
export const getWorkspacePDFs = (wsId) => api.get(`/workspaces/${wsId}/pdfs`).then(r => r.data);
export async function uploadPDFToWorkspace(wsId, file, tags = "", displayName = "") {
  const form = new FormData();
  form.append("file", file);
  form.append("tags", tags);
  form.append("display_name", displayName);
  const { data } = await llmApi.post(`/workspaces/${wsId}/upload`, form);
  return data;
}
export const togglePDF = (wsId, pdfId) => api.patch(`/workspaces/${wsId}/pdfs/${pdfId}/toggle`).then(r => r.data);
export const removePDF = (wsId, pdfId) => api.delete(`/workspaces/${wsId}/pdfs/${pdfId}`).then(r => r.data);
export const updatePDFTags = (wsId, pdfId, tags) => api.patch(`/workspaces/${wsId}/pdfs/${pdfId}/tags`, { tags }).then(r => r.data);

// ── Workspace Conversations ──
export const getWorkspaceConversations = (wsId) => api.get(`/workspaces/${wsId}/conversations`).then(r => r.data);
export const createWorkspaceConversation = (wsId, title) => api.post(`/workspaces/${wsId}/conversations`, { title }).then(r => r.data);

// ── Conversation ops ──
export const renameConversation = (id, title) => api.patch(`/conversations/${id}/rename`, { title }).then(r => r.data);
export const deleteConversation = (id) => api.delete(`/conversations/${id}`).then(r => r.data);
export const getConversationMessages = (id) => api.get(`/conversations/${id}/messages`).then(r => r.data);
export const exportConversation = (id, format = "json") => api.get(`/conversations/${id}/export?format=${format}`).then(r => r.data);

// ── RAG Chat ──
export const askQuestion = (query, conversationId, workspaceId, activePdfIds, k = 4) =>
  llmApi.post("/rag/ask", { query, conversation_id: conversationId, workspace_id: workspaceId, active_pdf_ids: activePdfIds, k }).then(r => r.data);

// ── RAG Flashcards ──
export const generateFlashcards = (query, conversationId, workspaceId, activePdfIds, nCards = 10, k = 4) =>
  llmApi.post("/rag/flashcards", { query, conversation_id: conversationId, workspace_id: workspaceId, active_pdf_ids: activePdfIds, n_cards: nCards, k }).then(r => r.data);

// ── Settings / LLM Status ──
export const getLLMStatus = () => api.get("/settings/status").then(r => r.data);
export const getAppConfig = () => api.get("/settings/config").then(r => r.data);
export const switchLLMProvider = (provider) => api.post("/settings/switch-llm", { provider }).then(r => r.data);
export const getProvidersStatus = () => api.get("/settings/providers-status").then(r => r.data);

// ── Quiz ──
export const generateQuiz = (query, workspaceId, activePdfIds, options = {}) =>
  llmApi.post("/quiz/generate", { query, workspace_id: workspaceId, active_pdf_ids: activePdfIds, ...options }).then(r => r.data);
export const submitQuiz = (quizId, answers) =>
  llmApi.post(`/quiz/${quizId}/submit`, { answers }).then(r => r.data);
export const getQuiz = (quizId) => api.get(`/quiz/${quizId}`).then(r => r.data);
export const getQuizHistory = (workspaceId) =>
  api.get(`/quiz/history?workspace_id=${workspaceId}`).then(r => r.data);
export const deleteQuiz = (quizId) => api.delete(`/quiz/${quizId}`).then(r => r.data);
export const retryWrongQuestions = (quizId) => api.post(`/quiz/${quizId}/retry-wrong`).then(r => r.data);

// ── Notes ──
export const createNote = (data) => api.post("/notes/", data).then(r => r.data);
export const getNotes = (workspaceId, pdfId) =>
  api.get(`/notes/?workspace_id=${workspaceId}${pdfId ? `&pdf_id=${pdfId}` : ""}`).then(r => r.data);
export const updateNote = (noteId, data) => api.patch(`/notes/${noteId}`, data).then(r => r.data);
export const deleteNote = (noteId) => api.delete(`/notes/${noteId}`).then(r => r.data);
export const exportNotes = (workspaceId) => api.get(`/notes/export?workspace_id=${workspaceId}`).then(r => r.data);
export const summarizeNotes = (workspaceId, pdfId) =>
  llmApi.post("/notes/ai-summarize", { workspace_id: workspaceId, pdf_id: pdfId }).then(r => r.data);

// ── Mind Map ──
export const generateMindMap = (query, workspaceId, activePdfIds, detailLevel = "detailed") =>
  llmApi.post("/mindmap/generate", { query, workspace_id: workspaceId, active_pdf_ids: activePdfIds, detail_level: detailLevel }).then(r => r.data);
export const generateStructuredSummary = (query, workspaceId, activePdfIds, formatType = "outline") =>
  llmApi.post("/mindmap/summary", { query, workspace_id: workspaceId, active_pdf_ids: activePdfIds, format_type: formatType }).then(r => r.data);

// ── Analytics ──
export const getOverviewStats = () => api.get("/analytics/overview").then(r => r.data);
export const getWorkspaceStats = (wsId) => api.get(`/analytics/workspace/${wsId}`).then(r => r.data);
export const getStudyProgress = (days = 30) => api.get(`/analytics/progress?days=${days}`).then(r => r.data);
export const getDocumentInsights = (wsId) => api.get(`/analytics/document-insights/${wsId}`).then(r => r.data);
export const getQuizTopicPerformance = (wsId) => api.get(`/analytics/quiz-topics/${wsId}`).then(r => r.data);
