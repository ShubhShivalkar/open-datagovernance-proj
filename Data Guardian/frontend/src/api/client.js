import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// ── CSRF handling ────────────────────────────────────────────────────────────
// The backend returns X-CSRFToken on login and /me responses so the token is
// always available without depending on cookie propagation through the Vite proxy.
// We persist it to sessionStorage so it survives page refreshes within the tab.

function _readCsrfToken() {
  return (
    sessionStorage.getItem("csrfToken") ||
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrftoken="))
      ?.split("=")[1] ||
    null
  );
}

// Capture token from any response that includes it (login, me)
api.interceptors.response.use((response) => {
  const token = response.headers["x-csrftoken"];
  if (token) sessionStorage.setItem("csrfToken", token);
  return response;
});

// Attach token to every state-mutating request
api.interceptors.request.use((config) => {
  const token = _readCsrfToken();
  if (token) config.headers["X-CSRFToken"] = token;
  return config;
});

// ── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  login:      (data)  => api.post("/auth/login/", data).then((r) => r.data),
  logout:     ()      => api.post("/auth/logout/").then((r) => r.data),
  me:         ()      => api.get("/auth/me/").then((r) => r.data),
  listUsers:  ()      => api.get("/auth/users/").then((r) => r.data),
  createUser: (data)  => api.post("/auth/users/", data).then((r) => r.data),
  updateUser: (id, d) => api.patch(`/auth/users/${id}/`, d).then((r) => r.data),
  deleteUser: (id)    => api.delete(`/auth/users/${id}/`),
};

// ── Data Sources ────────────────────────────────────────────────────────────

export const datasourceApi = {
  list: () => api.get("/datasources/").then((r) => r.data),
  get: (id) => api.get(`/datasources/${id}/`).then((r) => r.data),
  create: (data) => api.post("/datasources/", data).then((r) => r.data),
  /**
   * createRaw — accepts either a plain object (JSON) or a FormData instance
   * (multipart, e.g. for CSV uploads). Axios detects FormData automatically
   * and sets the correct Content-Type boundary.
   */
  createRaw: (data) =>
    api
      .post("/datasources/", data, {
        headers: data instanceof FormData ? { "Content-Type": "multipart/form-data" } : {},
      })
      .then((r) => r.data),
  update: (id, data) => api.patch(`/datasources/${id}/`, data).then((r) => r.data),
  delete: (id) => api.delete(`/datasources/${id}/`),
  testConnection: (id) =>
    api.post(`/datasources/${id}/test-connection/`).then((r) => r.data),
  rawSchema: (id) => api.get(`/datasources/${id}/raw-schema/`).then((r) => r.data),
};

// ── Data Islands ────────────────────────────────────────────────────────────

export const islandsApi = {
  list:         ()           => api.get("/data-islands/").then((r) => r.data),
  get:          (id)         => api.get(`/data-islands/${id}/`).then((r) => r.data),
  create:       (data)       => api.post("/data-islands/", data).then((r) => r.data),
  update:       (id, data)   => api.patch(`/data-islands/${id}/`, data).then((r) => r.data),
  delete:       (id)         => api.delete(`/data-islands/${id}/`),
  refresh:      (id)         => api.post(`/data-islands/${id}/refresh/`).then((r) => r.data),
  runDue:       ()           => api.post("/data-islands/run-due/").then((r) => r.data),
  listAccess:   (id)         => api.get(`/data-islands/${id}/access/`).then((r) => r.data),
  addAccess:    (id, data)   => api.post(`/data-islands/${id}/access/`, data).then((r) => r.data),
  removeAccess: (id, aId)    => api.delete(`/data-islands/${id}/access/${aId}/`),
};

// ── IAM ─────────────────────────────────────────────────────────────────────

export const iamApi = {
  createUserInDb: (data) => api.post("/iam/users/create-in-db/", data).then((r) => r.data),
  syncUsers:    (datasourceId) => api.post("/iam/users/sync/", { datasource_id: datasourceId }).then((r) => r.data),
  listUsers:    ()           => api.get("/iam/users/").then((r) => r.data),
  getUser:      (id)         => api.get(`/iam/users/${id}/`).then((r) => r.data),
  createUser:   (data)       => api.post("/iam/users/", data).then((r) => r.data),
  updateUser:   (id, data)   => api.patch(`/iam/users/${id}/`, data).then((r) => r.data),
  deleteUser:   (id)         => api.delete(`/iam/users/${id}/`),
  toggleStatus: (id)         => api.post(`/iam/users/${id}/toggle-status/`).then((r) => r.data),

  listGroups:   ()           => api.get("/iam/groups/").then((r) => r.data),
  getGroup:     (id)         => api.get(`/iam/groups/${id}/`).then((r) => r.data),
  createGroup:  (data)       => api.post("/iam/groups/", data).then((r) => r.data),
  updateGroup:  (id, data)   => api.patch(`/iam/groups/${id}/`, data).then((r) => r.data),
  deleteGroup:  (id)         => api.delete(`/iam/groups/${id}/`),
  addMember:    (gId, uId)   => api.post(`/iam/groups/${gId}/add-member/`, { user_id: uId }).then((r) => r.data),
  removeMember: (gId, uId)   => api.delete(`/iam/groups/${gId}/remove-member/${uId}/`).then((r) => r.data),
  addIsland:    (gId, iId)   => api.post(`/iam/groups/${gId}/add-island/`, { island_id: iId }).then((r) => r.data),
  removeIsland: (gId, iId)   => api.delete(`/iam/groups/${gId}/remove-island/${iId}/`).then((r) => r.data),
};

// ── Catalogue ───────────────────────────────────────────────────────────────

export const catalogueApi = {
  generateCatalogue: (datasourceId, params = {}) =>
    api
      .post(`/datasources/${datasourceId}/generate-catalogue/`, params)
      .then((r) => r.data),
  // params: { refresh_mode: "incremental" | "full" }
  refreshCatalogue: (datasourceId, params = {}) =>
    api
      .post(`/datasources/${datasourceId}/generate-catalogue/`, params)
      .then((r) => r.data),

  latestCatalogue: (datasourceId) =>
    api
      .get(`/datasources/${datasourceId}/latest-catalogue/`)
      .then((r) => r.data),

  getRun: (runId) => api.get(`/catalogue/runs/${runId}/`).then((r) => r.data),

  listRuns: (params = {}) =>
    api.get("/catalogue/runs/", { params }).then((r) => r.data),

  listTables: (params = {}) =>
    api.get("/catalogue/tables/", { params }).then((r) => r.data),

  getTable: (id) => api.get(`/catalogue/tables/${id}/`).then((r) => r.data),

  updateTable: (id, data) =>
    api.patch(`/catalogue/tables/${id}/`, data).then((r) => r.data),

  updateColumn: (id, data) =>
    api.patch(`/catalogue/columns/${id}/`, data).then((r) => r.data),
};

export const relationshipsApi = {
  get: (datasourceId) =>
    api.get(`/datasources/${datasourceId}/relationships/`).then((r) => r.data),

  createRule: (datasourceId, data) =>
    api.post(`/datasources/${datasourceId}/relationships/rules/`, data).then((r) => r.data),

  updateRule: (datasourceId, ruleId, data) =>
    api.patch(`/datasources/${datasourceId}/relationships/rules/${ruleId}/`, data).then((r) => r.data),

  deleteRule: (datasourceId, ruleId) =>
    api.delete(`/datasources/${datasourceId}/relationships/rules/${ruleId}/`).then((r) => r.data),
};

// ── SQL Query Editor ────────────────────────────────────────────────────────

export const queryEditorApi = {
  tables:      (datasourceId) => api.get("/query-editor/tables/", { params: { datasource: datasourceId } }).then((r) => r.data),
  run:         (data)         => api.post("/query-editor/run/", data).then((r) => r.data),
  preview:     (data)         => api.post("/query-editor/preview/", data).then((r) => r.data),
  listSaved:   (datasourceId) => api.get("/query-editor/saved/", { params: { datasource: datasourceId } }).then((r) => r.data),
  createSaved: (data)         => api.post("/query-editor/saved/", data).then((r) => r.data),
  updateSaved: (id, data)     => api.patch(`/query-editor/saved/${id}/`, data).then((r) => r.data),
  deleteSaved: (id)           => api.delete(`/query-editor/saved/${id}/`),

  // Schedules — turn a saved query into a recurring routine
  listSchedules:  (params = {}) => api.get("/query-editor/schedules/", { params }).then((r) => r.data),
  createSchedule: (data)        => api.post("/query-editor/schedules/", data).then((r) => r.data),
  updateSchedule: (id, data)    => api.patch(`/query-editor/schedules/${id}/`, data).then((r) => r.data),
  deleteSchedule: (id)          => api.delete(`/query-editor/schedules/${id}/`),
  runScheduleNow: (id)          => api.post(`/query-editor/schedules/${id}/run-now/`).then((r) => r.data),
  scheduleRuns:   (id)          => api.get(`/query-editor/schedules/${id}/runs/`).then((r) => r.data),
  // Email a saved query's fresh results now — works in demo mode too.
  sendResultsEmail: (data)      => api.post("/query-editor/send-results-email/", data).then((r) => r.data),
};

// ── Compliance / Erasure ─────────────────────────────────────────────────────

export const erasureApi = {
  createRequest: (data)       => api.post("/compliance/erasure/requests/", data).then((r) => r.data),
  listRequests:  ()            => api.get("/compliance/erasure/requests/").then((r) => r.data),
  getRequest:    (id)          => api.get(`/compliance/erasure/requests/${id}/`).then((r) => r.data),
  buildPlan:     (id)          => api.post(`/compliance/erasure/requests/${id}/plan/`).then((r) => r.data),
  approve:       (id, phrase)  => api.post(`/compliance/erasure/requests/${id}/approve/`, { confirmation_phrase: phrase }).then((r) => r.data),
  execute:       (id)          => api.post(`/compliance/erasure/requests/${id}/execute/`).then((r) => r.data),
  cancel:        (id)          => api.post(`/compliance/erasure/requests/${id}/cancel/`).then((r) => r.data),
  auditLog:      ()            => api.get("/compliance/erasure/audit-log/").then((r) => r.data),
};

// ── Compliance / Data Access Request (DSAR) ──────────────────────────────────

export const accessApi = {
  createRequest:  (data)          => api.post("/compliance/access/requests/", data).then((r) => r.data),
  listRequests:   ()               => api.get("/compliance/access/requests/").then((r) => r.data),
  getRequest:     (id)             => api.get(`/compliance/access/requests/${id}/`).then((r) => r.data),
  startDiscovery: (id)             => api.post(`/compliance/access/requests/${id}/discover/`).then((r) => r.data),
  getReport:      (id)             => api.get(`/compliance/access/requests/${id}/report/`).then((r) => r.data),
  sendReport:     (id, emails)     => api.post(`/compliance/access/requests/${id}/send-report/`, { additional_emails: emails }).then((r) => r.data),
  exportXlsx:     (id)             => api.get(`/compliance/access/requests/${id}/export/`, { responseType: "blob" }),
  cancel:         (id)             => api.post(`/compliance/access/requests/${id}/cancel/`).then((r) => r.data),
};
