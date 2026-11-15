const MODULES = [
  ["Início", "home"], ["Treino Diário", "target"], ["Simulado Fechado", "clipboard"],
  ["Simulados Realizados", "chart"], ["Monitor de Desempenho", "chart"], ["Discursiva", "pen"],
  ["Provas", "file"], ["Caderno de Erros", "search"], ["Súmulas e Jurisprudência", "bookmark"],
  ["Datas & Locais", "pin"], ["Cronograma", "calendar"], ["Metas Concluídas", "check"],
  ["Metas Não Concluídas", "clock"], ["Lei Seca", "book"], ["Matriz de Incidência", "scale"],
  ["PDFs Pessoais", "file"], ["Resumos & Mapas", "library"], ["Pontos Críticos", "sparkles"],
  ["Utilidades", "tools"], ["Backup e Restauração", "cloud"], ["Configurações", "settings"],
];
const ICON_PATHS = {
  home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9M9 21v-7h6v7"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  clipboard: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3h6v2M8 11h8M8 15h8M8 18h5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pen: '<path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5Z"/><path d="m14.5 6 3.5 3.5"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5M8 10h5M10.5 7.5v5"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/><path d="M9 8h6M9 11h6"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3M8 17h3M15 14h2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  book: '<path d="M3 5.5A3.5 3.5 0 0 1 6.5 4H12v16H6.5A3.5 3.5 0 0 0 3 21.5z"/><path d="M21 5.5A3.5 3.5 0 0 0 17.5 4H12v16h5.5a3.5 3.5 0 0 1 3.5 1.5z"/>',
  scale: '<path d="M12 4v16M5 8h14M7 8l-4 7h8zM17 8l-4 7h8zM7 20h10"/>',
  library: '<path d="M4 20V5l8-2 8 2v15"/><path d="M7 8h10M7 12h10M7 16h6"/>',
  sparkles: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/>',
  tools: '<path d="M14 7a5 5 0 0 0-6.5 6.5L3 18l3 3 4.5-4.5A5 5 0 0 0 17 10l-3 3-3-3z"/><path d="m14 7 3-3 3 3-3 3"/>',
  cloud: '<path d="M7 18h11a4 4 0 0 0 0-8 6 6 0 0 0-11.4-1.7A4.5 4.5 0 0 0 7 18Z"/><path d="m9 14 3-3 3 3M12 11v7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.2 1-1.5 2.6-1.5-.6a7.5 7.5 0 0 1-1.4.8l-.3 1.6h-3l-.3-1.6a7.5 7.5 0 0 1-1.4-.8l-1.5.6-1.5-2.6 1.2-1a7.6 7.6 0 0 1 0-1.6l-1.2-1 1.5-2.6 1.5.6a7.5 7.5 0 0 1 1.4-.8l.3-1.6h3l.3 1.6a7.5 7.5 0 0 1 1.4.8l1.5-.6 1.5 2.6-1.2 1a7.6 7.6 0 0 1 0 1.6Z"/>',
};
function iconSvg(name) {
  return `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.file}</svg>`;
}
const WEEKDAYS = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];
const HIGHLIGHT_COLORS = {
  yellow: { label: "Amarelo", background: "#f7d64a", foreground: "#221e0d" },
  green: { label: "Verde", background: "#a7e0b5", foreground: "#12351d" },
  blue: { label: "Azul", background: "#a8d1ff", foreground: "#153252" },
  pink: { label: "Rosa", background: "#f5b5d7", foreground: "#4b2038" },
  orange: { label: "Laranja", background: "#ffc18a", foreground: "#4b2b13" },
};
const THEMES = [
  { id: "black-red", name: "Preto e vermelho", description: "Preto profundo com detalhes vermelhos.", colors: ["#070707", "#101010", "#e11d2e"] },
  { id: "black-blue", name: "Preto e azul", description: "Preto profundo com detalhes azuis.", colors: ["#070707", "#101010", "#3185ee"] },
  { id: "baby-pink", name: "Rosa bebê", description: "Tons claros, suaves e acolhedores.", colors: ["#fff7fb", "#ffffff", "#d65b91"] },
];
const app = {
  page: "Início",
  state: null,
  preferences: { tema: "black-red", modules_top: false, sidebar_hidden: false, whiteboard_enabled: true, modules: {} },
  whiteboard: { key: "", image: "", color: "#111827", tool: "pen" },
  questions: [],
  quiz: null,
  simulationView: "builder",
  simulationResultsFilter: "all",
  selectedPdfFolder: "",
  selectedSummaryFolder: "",
  selectedProofBank: "",
  selectedLaw: "",
  lawItems: [],
  lawFilter: "",
  selectedFile: "",
  selectedFileKind: "",
  selectedEssayId: "",
  lawPdfs: [],
  completedGoalsFilter: { from: "", to: "", week: "" },
  scheduleOpenDays: null,
  editingNoteId: null,
  timerElapsed: 0,
  timerStartedAt: 0,
  focusDate: "",
  selectedProofAnswerBank: "",
  editingProofCorrectionId: "",
  noteFilter: { subject: "Todas as Matérias", type: "Todos", query: "" },
  caseLawFilter: { category: "Todas", query: "" },
  editingCaseLawId: "",
};
const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const attr = (value) => escapeHtml(value).replace(/`/g, "&#96;");
const fmt = (value) => escapeHtml(value || "—");
const lawFolderLabel = (name) => String(name || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
const visibleName = (name) => String(name || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
const normalizeSearch = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
const incidenceColor = (grade) => ({
  "Muito Alto": "very-high",
  Alto: "high",
  "Médio": "medium",
  Baixo: "low",
})[grade] || "unclassified";

const API_GET_CACHE_TTL_MS = 5000;
const apiGetCache = new Map();
const apiGetRequests = new Map();
let apiCacheGeneration = 0;

async function api(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET") {
    apiCacheGeneration += 1;
    apiGetCache.clear();
    apiGetRequests.clear();
  } else {
    const cached = apiGetCache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    if (cached) apiGetCache.delete(url);
    const pending = apiGetRequests.get(url);
    if (pending) return pending;
  }

  const generation = apiCacheGeneration;
  const request = (async () => {
    const response = await fetch(url, options);
    const type = response.headers.get("content-type") || "";
    if (!response.ok) {
      let message = `Falha na solicitação (${response.status}).`;
      if (type.includes("application/json")) {
        const body = await response.json();
        message = body.erro || message;
      }
      throw new Error(message);
    }
    if (!type.includes("application/json")) return response;
    const data = await response.json();
    if (method === "GET" && generation === apiCacheGeneration) {
      apiGetCache.set(url, { data, expiresAt: Date.now() + API_GET_CACHE_TTL_MS });
    }
    return data;
  })();

  if (method !== "GET") return request;
  apiGetRequests.set(url, request);
  try {
    return await request;
  } finally {
    if (apiGetRequests.get(url) === request) apiGetRequests.delete(url);
  }
}

let uploadProgressNode;
let uploadProgressTimer = 0;

function formatUploadSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
}

function setUploadProgress(fileName, percent, status) {
  if (!uploadProgressNode) {
    uploadProgressNode = document.createElement("section");
    uploadProgressNode.className = "upload-progress-card";
    uploadProgressNode.setAttribute("role", "status");
    uploadProgressNode.setAttribute("aria-live", "polite");
    uploadProgressNode.innerHTML = '<strong class="upload-progress-title"></strong><progress max="100" value="0"></progress><small class="upload-progress-status"></small>';
    document.body.append(uploadProgressNode);
  }
  window.clearTimeout(uploadProgressTimer);
  uploadProgressNode.querySelector(".upload-progress-title").textContent = fileName || "Arquivo";
  uploadProgressNode.querySelector("progress").value = Math.max(0, Math.min(100, percent));
  uploadProgressNode.querySelector(".upload-progress-status").textContent = status;
  uploadProgressNode.classList.add("visible");
}

function finishUploadProgress(fileName, success, percent = success ? 100 : 0, status = "") {
  setUploadProgress(fileName, percent, status || (success ? "Envio concluído." : "Falha no envio."));
  uploadProgressTimer = window.setTimeout(() => {
    uploadProgressNode?.classList.remove("visible");
  }, success ? 1600 : 4000);
}

function uploadRequest(endpoint, formData, method = "POST", batchProgress = null) {
  const file = [...formData.values()].find((value) => typeof Blob !== "undefined" && value instanceof Blob);
  const fileName = file?.name || "Arquivo";
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastProgressPercent = batchProgress?.completedPercent || 0;
    xhr.open(method, endpoint);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        const filePercent = Math.min(100, Math.round(event.loaded / event.total * 100));
        if (batchProgress) {
          const bytesSent = batchProgress.completedBytes + (file?.size || 0) * filePercent / 100;
          lastProgressPercent = batchProgress.totalBytes
            ? Math.min(99, Math.round(bytesSent / batchProgress.totalBytes * 100))
            : Math.round((batchProgress.index + filePercent / 100) / batchProgress.count * 100);
          const status = batchProgress.count > 1
            ? `Arquivo ${batchProgress.index + 1} de ${batchProgress.count} · ${filePercent}% · ${lastProgressPercent}% total`
            : `Enviando… ${filePercent}% · ${formatUploadSize((file?.size || 0) * filePercent / 100)} de ${formatUploadSize(file?.size || 0)}`;
          setUploadProgress(fileName, lastProgressPercent, status);
        } else {
          lastProgressPercent = filePercent;
          setUploadProgress(fileName, filePercent, `Enviando… ${filePercent}% · ${formatUploadSize((file?.size || 0) * filePercent / 100)} de ${formatUploadSize(file?.size || 0)}`);
        }
      } else {
        setUploadProgress(fileName, lastProgressPercent, `Enviando… ${formatUploadSize(event.loaded)} transferidos`);
      }
    });
    xhr.addEventListener("load", () => {
      const contentType = xhr.getResponseHeader("content-type") || "";
      if (xhr.status < 200 || xhr.status >= 300) {
        let message = `Falha na solicitação (${xhr.status}).`;
        if (contentType.includes("application/json")) {
          try { message = JSON.parse(xhr.responseText).erro || message; }
          catch { /* Keep the HTTP status message when the error body is invalid JSON. */ }
        }
        finishUploadProgress(fileName, false, lastProgressPercent, `Falha no envio (${xhr.status}).`);
        reject(new Error(message));
        return;
      }
      if (contentType.includes("application/json")) {
        try {
          const result = JSON.parse(xhr.responseText);
          if (!batchProgress) finishUploadProgress(fileName, true);
          resolve(result);
        } catch {
          if (!batchProgress) finishUploadProgress(fileName, false, lastProgressPercent, "Resposta inválida do servidor.");
          reject(new Error("O servidor retornou uma resposta JSON inválida."));
        }
        return;
      }
      if (!batchProgress) finishUploadProgress(fileName, true);
      resolve({
        blob: async () => new Blob([xhr.responseText], { type: contentType }),
        headers: { get: (name) => xhr.getResponseHeader(name) },
      });
    });
    xhr.addEventListener("error", () => {
      finishUploadProgress(fileName, false, lastProgressPercent, "Falha de rede durante o envio.");
      reject(new Error("Falha de rede durante o envio do arquivo."));
    });
    xhr.addEventListener("abort", () => {
      finishUploadProgress(fileName, false, lastProgressPercent, "Envio cancelado.");
      reject(new Error("O envio do arquivo foi cancelado."));
    });
    const initialPercent = batchProgress?.completedPercent || 0;
    const initialStatus = batchProgress?.count > 1
      ? `Arquivo ${batchProgress.index + 1} de ${batchProgress.count} · iniciando · ${initialPercent}% total`
      : "Iniciando envio…";
    setUploadProgress(fileName, initialPercent, initialStatus);
    xhr.send(formData);
  });
}

function toast(message, error = false) {
  const node = document.createElement("div");
  node.className = "toast";
  if (error) node.style.borderLeftColor = "var(--bad)";
  node.textContent = message;
  $("#toast-region").append(node);
  window.setTimeout(() => node.remove(), 4200);
}

function submitPdfDownload(url, payload) {
  return downloadFile(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function downloadFile(url, options = {}) {
  const nativeDownload = window.pywebview?.api?.download_endpoint;
  if (typeof nativeDownload === "function") {
    const requestUrl = new URL(url, location.href);
    if (requestUrl.origin !== location.origin || !requestUrl.pathname.startsWith("/api/")) {
      throw new Error("O endereço para download não é local.");
    }
    const method = options.method || "GET";
    let body;
    if (options.body) {
      try {
        body = JSON.parse(options.body);
      } catch {
        throw new Error("Os dados para gerar o arquivo são inválidos.");
      }
    }
    return nativeDownload(`${requestUrl.pathname}${requestUrl.search}`, method, body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const type = response.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      const body = await response.json();
      throw new Error(body.erro || "Não foi possível baixar o arquivo.");
    }
    throw new Error(`Não foi possível baixar o arquivo (${response.status}).`);
  }
  const disposition = response.headers.get("content-disposition") || "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const regularName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const filename = encodedName
    ? decodeURIComponent(encodedName)
    : regularName || "download";
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function jsonOptions(method, value) {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) };
}

function applyTheme() {
  document.documentElement.dataset.theme = app.preferences.tema || "black-red";
  const theme = THEMES.find((entry) => entry.id === app.preferences.tema);
  if (theme) $('meta[name="theme-color"]').content = theme.colors[0];
}

function navItem(name) {
  const item = MODULES.find(([label]) => label === name);
  if (!item) return "";
  const [label, icon] = item;
  return `<button class="nav-link ${app.page === label ? "active" : ""}" type="button" data-page="${attr(label)}" aria-label="${attr(label)}" title="${attr(label)}"><span class="nav-icon">${iconSvg(icon)}</span><span>${escapeHtml(label)}</span></button>`;
}

function navMarkup() {
  return MODULES.map(([name]) => navItem(name)).join("");
}

function preferenceModule(name) {
  app.preferences.modules ||= {};
  app.preferences.modules[name] ||= { hide_upload: false, hide_search: false };
  return app.preferences.modules[name];
}

function renderNav() {
  $("#module-nav").innerHTML = MODULES.map(([name]) => navItem(name)).join("");
  $("#top-module-nav").innerHTML = navMarkup();
  $("#page-title").textContent = app.page;
  const topNav = !!app.preferences.modules_top;
  const sidebarHidden = !!app.preferences.sidebar_hidden || topNav;
  $("#top-module-shell").classList.toggle("visible", topNav);
  $("#sidebar").classList.toggle("collapsed", sidebarHidden);
  $(".app-shell").classList.toggle("sidebar-collapsed", sidebarHidden);
  $(".app-shell").classList.toggle("sidebar-hover", !sidebarHidden);
  $(".app-shell").classList.toggle("modules-on-top", topNav);
}

function timerSeconds() {
  return app.timerElapsed + (app.timerStartedAt ? Math.floor((Date.now() - app.timerStartedAt) / 1000) : 0);
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  return [hours, minutes, remaining].map((part) => String(part).padStart(2, "0")).join(":");
}

function saveTimer() {
  localStorage.setItem("central-study-timer", JSON.stringify({
    elapsed: app.timerElapsed,
    startedAt: app.timerStartedAt,
  }));
}

function updateTimeDisplays() {
  syncQuizTimer();
  $("#live-clock").textContent = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date());
  updateDailyFocus();
  const elapsed = formatClock(timerSeconds());
  $("#top-timer").textContent = elapsed;
  $("#sidebar-timer").textContent = elapsed;
  const toggleLabel = app.timerStartedAt ? "Pausar" : "Iniciar";
  document.querySelectorAll('[data-action="toggle-timer"]').forEach((button) => {
    button.textContent = toggleLabel;
    button.setAttribute("aria-pressed", String(!!app.timerStartedAt));
  });
  if (app.timerStartedAt) saveTimer();
}

function ensureStudyTimerRunning() {
  if (app.timerStartedAt) return;
  app.timerStartedAt = Date.now();
  saveTimer();
  updateTimeDisplays();
}

function syncQuizTimer() {
  if (!app.quiz || app.quiz.completed) return;
  const current = timerSeconds();
  if (app.timerStartedAt) {
    app.quiz.studySeconds += Math.max(0, current - app.quiz.timerBaseline);
  }
  app.quiz.timerBaseline = current;
}

function loadTimer() {
  try {
    const saved = JSON.parse(localStorage.getItem("central-study-timer") || "{}");
    app.timerElapsed = Number.isFinite(saved.elapsed) ? Math.max(0, saved.elapsed) : 0;
    app.timerStartedAt = Number.isFinite(saved.startedAt) ? saved.startedAt : 0;
  } catch {
    app.timerElapsed = 0;
    app.timerStartedAt = 0;
  }
}

function heading(title, description, eyebrow = "MÓDULO") {
  return `<div class="page-heading"><div><div class="eyebrow-label">${escapeHtml(eyebrow)}</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div></div>`;
}

function panel(title, content, extra = "") {
  return `<section class="panel ${extra}"><div class="panel-title"><h3>${escapeHtml(title)}</h3></div>${content}</section>`;
}

function empty(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function field(label, name, value = "", type = "text", placeholder = "") {
  return `<div class="field"><label for="${attr(name)}">${escapeHtml(label)}</label><input id="${attr(name)}" name="${attr(name)}" type="${attr(type)}" value="${attr(value)}" placeholder="${attr(placeholder)}"></div>`;
}

function textArea(label, name, value = "", placeholder = "") {
  return `<div class="field full"><label for="${attr(name)}">${escapeHtml(label)}</label><textarea id="${attr(name)}" name="${attr(name)}" placeholder="${attr(placeholder)}">${escapeHtml(value)}</textarea></div>`;
}

function selectField(label, name, options, selected = "") {
  return `<div class="field"><label for="${attr(name)}">${escapeHtml(label)}</label><select id="${attr(name)}" name="${attr(name)}">${options.map((option) => {
    const value = typeof option === "string" ? option : option.value;
    const title = typeof option === "string" ? option : option.label;
    return `<option value="${attr(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(title)}</option>`;
  }).join("")}</select></div>`;
}

function uploadSettings(name, kind = "upload") {
  const preference = preferenceModule(name);
  const hidden = kind === "upload" ? preference.hide_upload : preference.hide_search;
  return hidden ? " search-hidden" : "";
}

async function refreshState() {
  app.state = await api("/api/state");
  app.preferences = { ...app.preferences, ...(app.state.preferencias || {}) };
  applyTheme();
  renderNav();
  updateDailyFocus();
}

function localDateKey() {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function updateDailyFocus(force = false) {
  const target = $("#header-focus");
  if (!target || !app.state) return;
  const today = localDateKey();
  if (!force && app.focusDate === today) return;
  const phrases = [...new Set((app.state.frases || [app.state.frase]).map((phrase) => String(phrase || "").trim()).filter(Boolean))];
  if (!phrases.length) phrases.push("Foco na missão.");
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("central-daily-quote") || "null"); }
  catch { saved = null; }
  const current = saved?.date === today ? saved.quote : "";
  const available = phrases.filter((phrase) => phrase !== current);
  const quote = !force && current && phrases.includes(current)
    ? current
    : (available.length ? available : phrases)[Math.floor(Math.random() * (available.length || phrases.length))];
  target.textContent = quote;
  target.title = quote;
  app.focusDate = today;
  localStorage.setItem("central-daily-quote", JSON.stringify({ date: today, quote }));
}

function paymentDateValue(value) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  match = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime();
  match = text.match(/^(\d{1,2})[/. -](\d{1,2})$/);
  if (match) return new Date(new Date().getFullYear(), Number(match[2]) - 1, Number(match[1])).getTime();
  return null;
}

function renderHome() {
  const state = app.state;
  const history = state.historico || {};
  const values = Object.entries(history).map(([subject, counts]) => {
    const total = counts.AcertoS || counts.Acertos || 0;
    const errors = counts.Erros || 0;
    const attempts = total + errors;
    const percentage = attempts ? Math.round(total / attempts * 100) : 0;
    return { subject, total, errors, attempts, percentage };
  }).sort((a, b) => b.percentage - a.percentage || b.attempts - a.attempts);
  const attempted = values.reduce((sum, item) => sum + item.attempts, 0);
  const pending = (state.concursos || []).filter((item) => String(item.status_pagamento || "").trim().toLowerCase() !== "pago")
    .map((item) => ({ ...item, paymentTimestamp: paymentDateValue(item.data_pagamento) }))
    .sort((a, b) => {
      if (a.paymentTimestamp === null) return b.paymentTimestamp === null ? 0 : 1;
      if (b.paymentTimestamp === null) return -1;
      return a.paymentTimestamp - b.paymentTimestamp;
    });
  const metrics = [
    ["Questões no banco", state.questoes || 0, "clipboard", `${attempted.toLocaleString("pt-BR")} questões respondidas`],
    ["Disciplinas", (state.disciplinas || []).length, "book", "Conteúdos organizados para revisão"],
    ["Simulados concluídos", state.simulados_concluidos || 0, "chart", "Consulte seus resultados no histórico"],
    ["Metas concluídas", (state.metas_concluidas || []).length, "check", "Continue avançando no seu plano de estudos"],
  ];
  const metricHtml = metrics.map(([label, value, icon, note]) =>
    `<article class="metric-card"><span class="metric-icon">${iconSvg(icon)}</span><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value.toLocaleString("pt-BR"))}</div><div class="metric-note">${escapeHtml(note)}</div></article>`
  ).join("");
  const subjectHtml = values.length ? values.map((entry) =>
    `<div class="subject-row"><div class="subject-label"><span class="subject-name" title="${attr(entry.subject)}">${escapeHtml(entry.subject)}</span><small>${entry.attempts.toLocaleString("pt-BR")} q.</small></div><div class="bar-track" role="progressbar" aria-label="Aproveitamento em ${attr(entry.subject)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${entry.percentage}"><div class="bar-fill" style="width:${entry.percentage}%"></div></div><strong class="subject-percent">${entry.percentage}%</strong></div>`
  ).join("") : empty("Resolva questões para ver seu desempenho por disciplina.");
  const nextPayment = pending[0];
  const paymentIsOverdue = nextPayment?.paymentTimestamp !== null && nextPayment?.paymentTimestamp < new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const pendingHtml = nextPayment
    ? `<div class="notice warning payment-alert"><strong>${paymentIsOverdue ? "Boleto em atraso" : "Próximo boleto"}</strong><span>${fmt(nextPayment.concurso)}</span><small>${nextPayment.paymentTimestamp === null ? "Data limite não informada" : `${paymentIsOverdue ? "Vencimento" : "Prazo"}: ${fmt(nextPayment.data_pagamento)}`}</small><button class="btn btn-small" data-page="Datas & Locais">Ver detalhes</button></div>`
    : `<div class="notice success payment-alert">Nenhum pagamento pendente cadastrado.</div>`;
  return `${heading("Visão geral da preparação", "Volume de questões, aproveitamento por disciplina e os próximos compromissos do ciclo.", "PAINEL DE CONTROLE")}
    <div class="grid metrics-grid">${metricHtml}</div>
    <div class="grid dashboard-grid">
      <section class="panel performance-panel"><div class="panel-title"><div><h3>Desempenho por disciplina</h3><small>Percentual de acertos nas questões já respondidas.</small></div><button class="btn btn-small" data-page="Monitor de Desempenho">Monitor →</button></div><div class="performance-chart">${subjectHtml}</div></section>
      <div class="grid">
        ${panel("Preparação", `<div class="muted">Questões respondidas: ${attempted}</div>${pendingHtml}<div class="button-row"><button class="btn btn-small" data-page="Datas & Locais">Ver concursos</button><button class="btn btn-small" data-page="Cronograma">Abrir cronograma</button></div>`)}
      </div>
    </div>
    <div class="grid quick-grid">
      ${[["Treino Diário", "Resolver questões", "target"], ["Lei Seca", "Continuar leitura", "book"], ["Provas", "Abrir provas", "file"], ["PDFs Pessoais", "Seus materiais", "library"], ["Pontos Críticos", "Revisar atualizações", "sparkles"], ["Utilidades", "Importar e converter", "tools"]].map(([name, caption, icon]) => `<button class="quick-card" data-page="${attr(name)}"><span class="quick-icon">${iconSvg(icon)}</span><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(caption)}</small></span></button>`).join("")}
    </div>
    <div class="muted section-spacer">Seus dados são salvos localmente neste computador.</div>`;
}

function extractOptions(question) {
  const alternatives = question && typeof question === "object" ? question.alternativas : null;
  if (Array.isArray(alternatives) && alternatives.length) {
    return alternatives.map((option) => ({
      key: String(option.letra || option.key || "").toUpperCase(),
      text: String(option.texto || option.text || "").trim(),
    })).filter((option) => /^[A-E]$/.test(option.key) && option.text);
  }
  const prompt = typeof question === "string" ? question : String(question?.enunciado || "");
  const matches = [...prompt.matchAll(/\[([A-E])\]\s*/gi)];
  if (!matches.length) return [];
  const seen = new Set();
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? prompt.length;
    const key = match[1].toUpperCase();
    return { key, text: prompt.slice(start, end).trim() };
  }).filter((option) => {
    if (seen.has(option.key)) return false;
    seen.add(option.key);
    return true;
  });
}

function questionStatement(question) {
  const prompt = String(question?.enunciado || "");
  if (Array.isArray(question?.alternativas) && question.alternativas.length) return prompt.trim();
  const firstOption = prompt.search(/\[[A-E]\]\s*/i);
  return firstOption >= 0 ? prompt.slice(0, firstOption).trim() : prompt.trim();
}

function isTrueFalseQuestion(question, options = extractOptions(question)) {
  if (String(question?.tipo || "").toUpperCase() === "CE") return true;
  if (options.length !== 2 || options[0].key !== "C" || options[1].key !== "E") return false;
  const labels = options.map((option) => option.text.trim().toLocaleLowerCase("pt-BR"));
  return /^(?:certo|correto|verdadeiro)$/.test(labels[0])
    && /^(?:errado|incorreto|falso)$/.test(labels[1]);
}

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function currentWhiteboardKey() {
  return app.quiz ? `${app.quiz.id}:${app.quiz.index}` : "";
}

function prepareWhiteboard() {
  const key = currentWhiteboardKey();
  if (app.whiteboard.key !== key) {
    app.whiteboard.key = key;
    app.whiteboard.image = "";
  }
  return app.whiteboard;
}

function captureWhiteboard() {
  const canvas = $("#simulation-whiteboard");
  if (!canvas || canvas.dataset.whiteboardKey !== currentWhiteboardKey()) return;
  app.whiteboard.image = canvas.toDataURL("image/png");
}

function clearWhiteboard() {
  app.whiteboard.key = "";
  app.whiteboard.image = "";
}

function initializeWhiteboard() {
  const canvas = $("#simulation-whiteboard");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível iniciar o quadro branco.");
  const bounds = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(bounds.width * ratio));
  canvas.height = Math.max(1, Math.round(bounds.height * ratio));
  context.scale(ratio, ratio);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.imageSmoothingEnabled = true;

  const key = canvas.dataset.whiteboardKey;
  const board = app.whiteboard;
  if (board.key !== key) {
    board.key = key;
    board.image = "";
  }
  if (board.image) {
    const image = new Image();
    image.onload = () => {
      if ($("#simulation-whiteboard") !== canvas || canvas.dataset.whiteboardKey !== currentWhiteboardKey()) return;
      context.drawImage(image, 0, 0, bounds.width, bounds.height);
    };
    image.src = board.image;
  }

  let drawing = false;
  let lastPoint = null;
  let lastPressure = 0.5;
  const pointFromEvent = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const finishStroke = () => {
    if (!drawing) return;
    drawing = false;
    lastPoint = null;
    lastPressure = 0.5;
    try {
      board.image = canvas.toDataURL("image/png");
    } catch (error) {
      toast(`Não foi possível manter o desenho desta questão: ${error.message}`, true);
    }
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drawing = true;
    lastPoint = pointFromEvent(event);
    lastPressure = event.pressure || 0.5;
    canvas.setPointerCapture(event.pointerId);
    context.globalCompositeOperation = board.tool === "eraser" ? "destination-out" : "source-over";
    const width = board.tool === "eraser" ? 26 : 1.8 + lastPressure * 3.2;
    context.lineWidth = width;
    context.beginPath();
    context.arc(lastPoint.x, lastPoint.y, width / 2, 0, Math.PI * 2);
    context.fillStyle = board.tool === "eraser" ? "#000" : board.color;
    context.fill();
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing || !lastPoint) return;
    event.preventDefault();
    context.globalCompositeOperation = board.tool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = board.color;
    const coalescedEvents = event.getCoalescedEvents?.() || [event];
    for (const sample of coalescedEvents) {
      const point = pointFromEvent(sample);
      const midpoint = {
        x: (lastPoint.x + point.x) / 2,
        y: (lastPoint.y + point.y) / 2,
      };
      context.lineWidth = board.tool === "eraser"
        ? 26
        : 1.8 + Math.max(0.12, sample.pressure || 0.5) * 3.2;
      context.beginPath();
      context.moveTo(lastPoint.x, lastPoint.y);
      context.quadraticCurveTo(lastPoint.x, lastPoint.y, midpoint.x, midpoint.y);
      context.stroke();
      lastPoint = point;
      lastPressure = sample.pressure || 0.5;
    }
  });
  canvas.addEventListener("pointerup", finishStroke);
  canvas.addEventListener("pointercancel", finishStroke);
}

function whiteboardMarkup() {
  if (!app.preferences.whiteboard_enabled) return "";
  const board = prepareWhiteboard();
  const colors = [
    ["#111827", "Preta"],
    ["#1769d2", "Azul"],
    ["#d62828", "Vermelha"],
  ];
  return `<section class="simulation-whiteboard section-spacer" aria-label="Quadro branco para rascunho"><div class="whiteboard-toolbar"><div><strong>Rascunho da questão</strong><small>Escreva ou desenhe livremente; a mesa digitalizadora é compatível com pressão da caneta.</small></div><div class="whiteboard-tools" role="group" aria-label="Ferramentas do quadro"><button type="button" class="whiteboard-tool ${board.tool === "pen" && board.color === colors[0][0] ? "active" : ""}" data-action="whiteboard-pen" data-color="${colors[0][0]}" aria-label="Caneta preta" title="Caneta preta"><i style="--pen-color:${colors[0][0]}"></i><span>Preta</span></button><button type="button" class="whiteboard-tool ${board.tool === "pen" && board.color === colors[1][0] ? "active" : ""}" data-action="whiteboard-pen" data-color="${colors[1][0]}" aria-label="Caneta azul" title="Caneta azul"><i style="--pen-color:${colors[1][0]}"></i><span>Azul</span></button><button type="button" class="whiteboard-tool ${board.tool === "pen" && board.color === colors[2][0] ? "active" : ""}" data-action="whiteboard-pen" data-color="${colors[2][0]}" aria-label="Caneta vermelha" title="Caneta vermelha"><i style="--pen-color:${colors[2][0]}"></i><span>Vermelha</span></button><button type="button" class="whiteboard-tool ${board.tool === "eraser" ? "active" : ""}" data-action="whiteboard-eraser" aria-label="Borracha" title="Borracha">⌫ <span>Borracha</span></button><button type="button" class="whiteboard-tool" data-action="whiteboard-clear">Limpar quadro</button></div></div><canvas id="simulation-whiteboard" data-whiteboard-key="${attr(board.key)}" class="whiteboard-canvas" aria-label="Área de desenho; compatível com mouse ou mesa digitalizadora"></canvas><small>O rascunho pertence somente a esta questão: será apagado ao avançar e não será salvo no resultado.</small></section>`;
}

async function loadQuestions(subject = "Todas as Matérias", includeSubmitted = false) {
  const params = new URLSearchParams({ materia: subject });
  if (includeSubmitted) params.set("incluir_simulados_enviados", "1");
  const data = await api(`/api/questoes?${params}`);
  return shuffled(data.questoes || []);
}

function quizCard(simulation = false) {
  if (!app.quiz) return "";
  const quiz = app.quiz;
  if (quiz.index >= quiz.questions.length) {
    const hiddenResult = simulation && quiz.submittedSimulationId && !quiz.savedResult;
    const correct = Number.isFinite(Number(quiz.savedResult?.acertos))
      ? Number(quiz.savedResult.acertos)
      : hiddenResult ? null : quiz.answers.filter((answer) => answer?.correta).length;
    const wrong = Number.isFinite(Number(quiz.savedResult?.erros))
      ? Number(quiz.savedResult.erros)
      : hiddenResult ? null : quiz.answers.length - correct;
    const net = quiz.answers.reduce((sum, answer) => sum + (answer.correta ? 1 : (answer.tipo === "CE" ? -1 : 0)), 0);
    const accuracy = Number.isFinite(Number(quiz.savedResult?.aproveitamento))
      ? Number(quiz.savedResult.aproveitamento)
      : correct === null || !quiz.questions.length ? null : Math.round(correct / quiz.questions.length * 100);
    const timeStatus = quiz.studyTimeError
      ? `<div class="notice warning">Não foi possível lançar o tempo no cronograma: ${escapeHtml(quiz.studyTimeError)} <button class="btn btn-small" data-action="retry-study-time">Tentar novamente</button></div>`
      : quiz.studyTimeRecorded
        ? `<div class="notice success">Tempo ativo registrado no cronograma de hoje: ${formatClock(quiz.studySeconds)}.</div>`
        : `<div class="notice">${quiz.studySeconds > 0 ? `Tempo ativo desta sessão: ${formatClock(quiz.studySeconds)}.` : "O cronômetro não foi usado nesta sessão; nenhum tempo foi lançado no cronograma."}</div>`;
    const archiveStatus = simulation
      ? quiz.savedResult
        ? `<div class="notice success">Resultado arquivado em Simulados Realizados · ${formatClock(quiz.elapsedSeconds)} · ${accuracy}% de acertos.</div>`
        : `<div class="notice warning">Não foi possível arquivar o resultado: ${escapeHtml(quiz.resultSaveError || "tentando salvar")} <button class="btn btn-small" data-action="retry-save-simulation-result">Tentar novamente</button></div>`
      : "";
    const reviewedQuestions = quiz.savedResult?.questoes
      || (quiz.submittedSimulationId ? [] : quiz.questions.map((question, index) => ({
        ...question,
        resposta: quiz.answers[index]?.resposta || "",
        gabarito: quiz.answers[index]?.gabarito || "",
        correta: Boolean(quiz.answers[index]?.correta),
      })));
    const review = simulation && reviewedQuestions.length
      ? `<section class="simulation-review section-spacer"><h3>Revisão das questões</h3>${reviewedQuestions.map((question, index) => {
        const options = extractOptions(question);
        const status = question.correta ? "Acertou" : "Errou";
        const optionList = options.length
          ? `<ol class="simulation-review-options">${options.map((option) => `<li><strong>${option.key}.</strong> ${escapeHtml(option.text)}</li>`).join("")}</ol>`
          : "";
        return `<article class="simulation-review-item ${question.correta ? "correct" : "incorrect"}"><div class="data-card-head"><strong>Questão ${question.numero || index + 1}</strong><span class="tag">${status}</span></div><p>${escapeHtml(questionStatement(question)).replace(/\n/g, "<br>")}</p>${optionList}<small>Marcada: ${escapeHtml(question.resposta || "—")} · Gabarito: ${escapeHtml(question.gabarito || "—")}</small>${question.comentario ? `<p class="muted">${escapeHtml(question.comentario)}</p>` : ""}</article>`;
      }).join("")}</section>`
      : "";
    const resultMetrics = simulation
      ? [["Acertos", correct ?? "—"], ["Erros", wrong ?? "—"], ["Total", quiz.questions.length], ["Aproveitamento", `${accuracy ?? "—"}%`], ["Tempo", formatClock(quiz.elapsedSeconds)]]
      : [["Acertos", correct], ["Erros", wrong], ["Pontuação líquida", net], ["Total", quiz.questions.length]];
    return `<div class="panel question-card">${heading(simulation ? "Simulado finalizado" : "Treino concluído", "Confira seu resultado e revise os itens que errou.", "RESULTADO")}
      ${archiveStatus}
      ${timeStatus}
      <div class="grid metrics-grid">${resultMetrics.map(([label, value]) => `<article class="metric-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div></article>`).join("")}</div>
      <div class="button-row"><button class="btn btn-primary" data-action="${simulation ? "new-simulation" : "restart-training"}">Novo ${simulation ? "simulado" : "treino"}</button>${simulation ? '<button class="btn" data-page="Simulados Realizados">Ver simulados realizados</button>' : ""}<button class="btn" data-page="Início">Voltar ao início</button></div>${review}</div>`;
  }
  const question = quiz.questions[quiz.index];
  const answer = quiz.answers[quiz.index];
  const multipleChoiceOptions = extractOptions(question);
  const trueFalse = isTrueFalseQuestion(question, multipleChoiceOptions);
  const multi = !trueFalse && (question.tipo === "ME" || multipleChoiceOptions.length >= 2);
  const options = trueFalse
    ? [{ key: "C", text: "Certo" }, { key: "E", text: "Errado" }]
    : multi ? multipleChoiceOptions : [{ key: "C", text: "Certo" }, { key: "E", text: "Errado" }];
  const statement = questionStatement(question);
  const revealAnswer = simulation && !quiz.submittedSimulationId;
  const answerButtons = options.length
    ? options.map((option) => `<button class="answer-btn ${answer?.resposta === option.key ? "selected" : ""} ${simulation && !quiz.submittedSimulationId && answer && !answer.pending && answer.gabarito === option.key ? "correct" : ""} ${simulation && !quiz.submittedSimulationId && answer && !answer.pending && answer.resposta === option.key && !answer.correta ? "incorrect" : ""}" data-action="answer" data-answer="${option.key}" aria-pressed="${answer?.resposta === option.key}" ${answer && !simulation ? "disabled" : ""}>${multi ? `[${option.key}] ${escapeHtml(option.text)}` : escapeHtml(option.text)}</button>`).join("")
    : ["A", "B", "C", "D", "E"].map((letter) => `<button class="answer-btn ${answer?.resposta === letter ? "selected" : ""}" data-action="answer" data-answer="${letter}" aria-pressed="${answer?.resposta === letter}" ${answer && !simulation ? "disabled" : ""}>${letter}</button>`).join("");
  const answerFeedback = answer
    ? quiz.submittedSimulationId
      ? `<div class="feedback notice">Resposta registrada. O resultado será exibido ao entregar a prova.</div>`
      : answer.pending
        ? `<div class="feedback notice">Alternativa ${escapeHtml(answer.resposta)} marcada. Você pode alterá-la antes de avançar.</div>`
      : `<div class="feedback ${answer.correta ? "notice success" : "notice warning"}"><strong>${answer.correta ? "Resposta correta." : `Resposta incorreta. Gabarito: ${answer.gabarito}.`}</strong>${question.comentario ? `<div>${escapeHtml(question.comentario)}</div>` : ""}</div>`
    : "";
  const nextLabel = quiz.index + 1 >= quiz.questions.length ? "Entregar prova ✓" : "Próxima questão →";
  return `<div class="panel question-card"><div class="question-meta"><span>${escapeHtml(question.materia)} · ${multi ? "Múltipla escolha" : "Certo / Errado"}</span><span>Questão ${quiz.index + 1} de ${quiz.questions.length}</span></div><div class="progress-track"><span style="width:${(quiz.index / quiz.questions.length) * 100}%"></span></div><div class="question-text">${escapeHtml(statement)}</div><div class="answer-grid ${multi ? "" : "ce-grid"}">${answerButtons}</div>${answerFeedback}<div class="button-row section-spacer">${answer ? `<button class="btn btn-primary" data-action="next-question">${nextLabel}</button>` : ""}<button class="btn" data-action="stop-quiz">Encerrar sessão</button></div>${simulation ? whiteboardMarkup() : ""}</div>`;
}

async function renderTraining() {
  if (app.quiz?.kind === "training") return quizCard(false);
  app.questions = await loadQuestions("Todas as Matérias", true);
  const materials = ["Todas as Matérias", ...new Set(app.questions.map((question) => question.materia).filter(Boolean))];
  return `${heading("Treino diário", "Pratique com questões do seu banco e dos simulados fechados. As respostas do treino não alteram provas nem resultados arquivados.")}
    <section class="panel"><div class="form-grid"><div class="field"><label for="training-subject">Disciplina</label><select id="training-subject">${materials.map((item) => `<option>${escapeHtml(item)}</option>`).join("")}</select></div><div class="field"><label for="training-count">Quantidade de questões</label><select id="training-count"><option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="all">Todas disponíveis</option></select></div></div><div class="button-row section-spacer"><button class="btn btn-primary" data-action="start-training">Iniciar treino</button><span class="muted">${app.questions.length} questões disponíveis</span></div></section>`;
}

async function startTraining() {
  const subject = $("#training-subject")?.value || "Todas as Matérias";
  const count = $("#training-count")?.value || "10";
  const questions = await loadQuestions(subject, true);
  if (!questions.length) return toast("Não há questões para essa disciplina.", true);
  ensureStudyTimerRunning();
  app.quiz = {
    id: crypto.randomUUID(), kind: "training",
    questions: count === "all" ? questions : questions.slice(0, Number(count)),
    index: 0, answers: [], studySeconds: 0, timerBaseline: timerSeconds(),
  };
  clearWhiteboard();
  await renderPage();
}

async function renderSimulation() {
  if (app.quiz?.kind === "simulation") return quizCard(true);
  const data = await api("/api/simulados-enviados");
  const submittedSimulations = data.simulados || [];
  const submittedButton = `<button class="btn ${app.simulationView === "submitted" ? "btn-primary" : ""}" data-action="simulation-view-submitted">Simulados Enviados (${submittedSimulations.length})</button>`;
  const builderButton = `<button class="btn ${app.simulationView === "builder" ? "btn-primary" : ""}" data-action="simulation-view-builder">Montar por disciplinas</button>`;
  const submittedCards = submittedSimulations.map((simulation) => `<article class="data-card"><div class="data-card-head"><div><h3>${escapeHtml(visibleName(simulation.titulo))}</h3><span class="tag">${escapeHtml(simulation.materia)}</span></div><span class="tag">${simulation.questoes} questão(ões)</span></div><p class="muted">Arquivo: ${escapeHtml(simulation.arquivo)} · Enviado em ${escapeHtml(simulation.data)}</p><div class="button-row"><button class="btn btn-primary" data-action="start-submitted-simulation" data-simulation-id="${attr(simulation.id)}">Iniciar simulado</button><button class="btn btn-danger btn-small" data-action="delete-submitted-simulation" data-simulation-id="${attr(simulation.id)}">Excluir simulado enviado</button></div></article>`).join("");
  const submittedSection = `<section class="section-spacer"><div class="panel-title"><h3>Provas enviadas</h3><span class="tag">${submittedSimulations.length}</span></div>${submittedCards || empty("Nenhum simulado enviado. Importe um TXT ou converta um PDF em Utilidades e marque “Enviar como simulado fechado”.")}</section>`;
  if (app.simulationView === "submitted") {
    return `${heading("Simulado fechado", "As provas enviadas são apresentadas na ordem original das questões.")}<div class="button-row section-spacer">${builderButton}${submittedButton}</div>${submittedSection}`;
  }
  const subjects = app.state.disciplinas || [];
  if (!subjects.length) return `${heading("Simulado fechado", "Monte um caderno de prova com questões das matérias selecionadas.")}<div class="button-row section-spacer">${builderButton}${submittedButton}</div>${empty("Não há questões cadastradas.")}${submittedSection}`;
  const counts = app.state.questoes_por_materia || {};
  return `${heading("Simulado fechado", "Defina a quantidade por disciplina. Uma resposta errada em Certo/Errado desconta um ponto líquido.")}
    <div class="button-row section-spacer">${builderButton}${submittedButton}</div>
    <section class="panel"><div class="panel-title"><h3>Composição da prova</h3><small>${subjects.length} disciplinas</small></div><div class="form-grid three">${subjects.map((subject) => `<div class="field"><label for="sim-${attr(subject)}">${escapeHtml(subject)} · ${counts[subject] || 0} disponíveis</label><input id="sim-${attr(subject)}" class="sim-count" type="number" min="0" max="${counts[subject] || 0}" value="${Math.min(5, counts[subject] || 0)}" data-subject="${attr(subject)}"></div>`).join("")}</div><label class="setting-row"><span><strong>Misturar disciplinas</strong><small>Distribui as questões aleatoriamente.</small></span><input id="sim-shuffle" type="checkbox" checked></label><div class="button-row section-spacer"><button class="btn btn-primary" data-action="start-simulation">Iniciar simulado</button></div></section>${submittedSection}`;
}

async function startSimulation() {
  const pool = [];
  for (const input of document.querySelectorAll(".sim-count")) {
    const count = Number(input.value);
    if (!count) continue;
    const questions = await loadQuestions(input.dataset.subject);
    pool.push(...shuffled(questions).slice(0, count));
  }
  if (!pool.length) return toast("Selecione ao menos uma questão.", true);
  const questions = $("#sim-shuffle")?.checked ? shuffled(pool) : pool;
  ensureStudyTimerRunning();
  app.quiz = {
    id: crypto.randomUUID(), kind: "simulation", questions,
    titulo: "Simulado por disciplinas", index: 0, answers: [], studySeconds: 0,
    startedAt: Date.now(), timerBaseline: timerSeconds(),
  };
  clearWhiteboard();
  await renderPage();
}

async function startSubmittedSimulation(simulationId) {
  const simulation = await api(`/api/simulados-enviados/${encodeURIComponent(simulationId)}`);
  const questions = (simulation.questoes || []).map((question, index) => ({ question, index }))
    .sort((a, b) => {
      const aNumber = Number.isInteger(a.question.numero) ? a.question.numero : a.index + 1;
      const bNumber = Number.isInteger(b.question.numero) ? b.question.numero : b.index + 1;
      return aNumber - bNumber || a.index - b.index;
    }).map(({ question }) => question);
  if (!questions.length) return toast("Este arquivo não contém questões válidas.", true);
  ensureStudyTimerRunning();
  app.quiz = {
    id: crypto.randomUUID(), kind: "simulation", submittedSimulationId: simulation.id,
    titulo: simulation.titulo, materia: simulation.materia, questions,
    index: 0, answers: [], studySeconds: 0, startedAt: Date.now(), timerBaseline: timerSeconds(),
  };
  clearWhiteboard();
  await renderPage();
}

async function renderCompletedSimulations() {
  const data = await api("/api/simulados-realizados");
  const simulations = data.simulados || [];
  const options = new Map();
  for (const simulation of simulations) {
    if (!options.has(simulation.prova_id)) options.set(simulation.prova_id, simulation.titulo);
  }
  if (app.simulationResultsFilter !== "all" && !options.has(app.simulationResultsFilter)) {
    app.simulationResultsFilter = "all";
  }
  const filtered = app.simulationResultsFilter === "all"
    ? simulations
    : simulations.filter((simulation) => simulation.prova_id === app.simulationResultsFilter);
  const correct = filtered.reduce((sum, item) => sum + (Number(item.acertos) || 0), 0);
  const wrong = filtered.reduce((sum, item) => sum + (Number(item.erros) || 0), 0);
  const total = correct + wrong;
  const byExam = new Map();
  for (const item of filtered) {
    const key = item.prova_id || "montado";
    const row = byExam.get(key) || { titulo: item.titulo || "Simulado", acertos: 0, erros: 0, tentativas: 0 };
    row.acertos += Number(item.acertos) || 0;
    row.erros += Number(item.erros) || 0;
    row.tentativas += 1;
    byExam.set(key, row);
  }
  const maxAnswers = Math.max(1, ...[...byExam.values()].map((item) => item.acertos + item.erros));
  const chart = byExam.size
    ? `<div class="simulation-results-chart">${[...byExam.values()].map((item) => {
      const count = item.acertos + item.erros;
      return `<article class="simulation-results-chart-row"><div class="data-card-head"><strong>${escapeHtml(visibleName(item.titulo))}</strong><span class="tag">${item.tentativas} tentativa(s)</span></div><div class="simulation-results-bar"><span class="simulation-results-correct" style="width:${item.acertos / maxAnswers * 100}%" title="${item.acertos} acertos"></span><span class="simulation-results-wrong" style="width:${item.erros / maxAnswers * 100}%" title="${item.erros} erros"></span></div><div class="simulation-results-legend"><span><i class="result-dot correct-dot"></i>Acertos: ${item.acertos}</span><span><i class="result-dot wrong-dot"></i>Erros: ${item.erros}</span><strong>${count} questão(ões)</strong></div></article>`;
    }).join("")}</div>`
    : empty("Finalize um simulado para acompanhar aqui os gráficos de acertos e erros.");
  const cards = filtered.map((simulation, index) => {
    const wrongNumbers = (simulation.questoes || []).filter((question) => !question.correta).map((question) => question.numero);
    const wrongSummary = wrongNumbers.length
      ? `<div class="notice warning">Questões erradas: ${wrongNumbers.join(", ")}</div>`
      : `<div class="notice success">Nenhuma questão errada.</div>`;
    return `<details class="simulation-result-record" ${index === 0 ? "open" : ""}><summary><span><strong>${escapeHtml(visibleName(simulation.titulo))}</strong><small>${escapeHtml(simulation.data || "")} · ${formatClock(simulation.tempo_segundos || 0)}</small></span><span class="tag">${simulation.acertos}/${simulation.total} · ${simulation.aproveitamento}%</span></summary><div class="simulation-result-review">${wrongSummary}${(simulation.questoes || []).map((question) => `<article class="simulation-review-item ${question.correta ? "correct" : "incorrect"}"><div class="data-card-head"><strong>Questão ${question.numero}</strong><span class="tag">${question.correta ? "Acertou" : "Errou"}</span></div><p>${escapeHtml(question.enunciado).replace(/\n/g, "<br>")}</p><small>Marcada: ${escapeHtml(question.resposta)} · Gabarito: ${escapeHtml(question.gabarito)}</small>${question.comentario ? `<p class="muted">${escapeHtml(question.comentario)}</p>` : ""}</article>`).join("")}</div></details>`;
  }).join("");
  const filter = `<div class="toolbar section-spacer"><label for="simulation-results-filter">Prova</label><select class="control" id="simulation-results-filter"><option value="all" ${app.simulationResultsFilter === "all" ? "selected" : ""}>Geral · todas as provas</option>${[...options].map(([id, title]) => `<option value="${attr(id)}" ${app.simulationResultsFilter === id ? "selected" : ""}>${escapeHtml(visibleName(title))}</option>`).join("")}</select><span class="tag">${filtered.length} simulado(s)</span></div>`;
  return `${heading("Simulados Realizados", "Consulte o histórico completo das provas, o tempo gasto e a revisão de cada resposta.")}${filter}<div class="grid metrics-grid"><article class="metric-card"><div class="metric-label">Acertos</div><div class="metric-value">${correct}</div></article><article class="metric-card"><div class="metric-label">Erros</div><div class="metric-value">${wrong}</div></article><article class="metric-card"><div class="metric-label">Questões respondidas</div><div class="metric-value">${total}</div></article><article class="metric-card"><div class="metric-label">Aproveitamento</div><div class="metric-value">${total ? Math.round(correct / total * 100) : 0}%</div></article></div>${panel("Gráfico de acertos e erros por prova", chart)}<section class="section-spacer">${cards || empty("Nenhum simulado finalizado ainda.")}</section>`;
}

async function recordQuizStudyTime(quiz) {
  syncQuizTimer();
  const counts = {};
  quiz.answers.forEach((answer, index) => {
    if (!answer) return;
    const subject = quiz.questions[index].materia;
    counts[subject] = (counts[subject] || 0) + 1;
  });
  const answers = Object.entries(counts).map(([subject, count]) => ({ subject, count }));
  if (quiz.studySeconds < 1 || !answers.length) return false;
  const result = await api(`/api/quiz/${encodeURIComponent(quiz.id)}/study-time`, jsonOptions("POST", {
    elapsed_seconds: Math.floor(quiz.studySeconds),
    answers,
  }));
  quiz.studyTimeRecorded = !!(result.recorded || result.already_recorded);
  quiz.studyTimeError = "";
  return quiz.studyTimeRecorded;
}

async function saveCompletedSimulation(quiz) {
  if (quiz.savedResult) return quiz.savedResult;
  const answers = quiz.questions.map((question, index) => {
    const answer = quiz.answers[index];
    if (!answer) throw new Error(`A questão ${index + 1} ainda não foi respondida.`);
    return { id: question.id, resposta: answer.resposta };
  });
  const result = await api("/api/simulados-realizados", jsonOptions("POST", {
    id: quiz.id,
    prova_id: quiz.submittedSimulationId || "",
    titulo: quiz.titulo || "Simulado por disciplinas",
    materia: quiz.materia || "",
    tempo_segundos: quiz.elapsedSeconds,
    ordem_questoes: quiz.questions.map((question) => question.id),
    respostas: answers,
  }));
  quiz.savedResult = result.simulado;
  quiz.resultSaveError = "";
  return quiz.savedResult;
}

async function persistSimulationAnswer(quiz, index) {
  const answer = quiz.answers[index];
  if (!answer?.pending || quiz.submittedSimulationId) return;
  const question = quiz.questions[index];
  const result = await api("/api/responder", jsonOptions("POST", {
    id: question.id,
    resposta: answer.resposta,
  }));
  quiz.answers[index] = {
    ...answer,
    correta: result.correta,
    gabarito: result.gabarito,
    tipo: result.tipo || question.tipo,
    pending: false,
  };
}

async function completeQuiz() {
  const quiz = app.quiz;
  if (!quiz) return;
  if (quiz.kind === "simulation" && quiz.index < quiz.questions.length) {
    await persistSimulationAnswer(quiz, quiz.index);
  }
  clearWhiteboard();
  if (!quiz.completed) {
    syncQuizTimer();
    quiz.index = quiz.questions.length;
    quiz.completed = true;
    quiz.elapsedSeconds = quiz.startedAt
      ? Math.max(0, Math.floor((Date.now() - quiz.startedAt) / 1000))
      : 0;
  }
  if (!quiz.studyTimeRecorded && quiz.studySeconds > 0 && quiz.answers.some(Boolean)) {
    try {
      await recordQuizStudyTime(quiz);
    } catch (error) {
      quiz.studyTimeError = error.message;
      toast(`Falha ao lançar o tempo: ${error.message}`, true);
    }
  }
  if (quiz.kind === "simulation" && !quiz.savedResult) {
    try {
      await saveCompletedSimulation(quiz);
    } catch (error) {
      quiz.resultSaveError = error.message;
      toast(`Falha ao arquivar o simulado: ${error.message}`, true);
    }
  }
  if (quiz.kind === "simulation" && quiz.savedResult) {
    await refreshState();
    app.quiz = null;
    app.page = "Simulados Realizados";
    app.simulationResultsFilter = "all";
  }
  await renderPage();
}

async function answerQuestion(letter) {
  const quiz = app.quiz;
  if (!quiz || (quiz.answers[quiz.index] && quiz.kind === "training")) return;
  const question = quiz.questions[quiz.index];
  if (quiz.submittedSimulationId) {
    quiz.answers[quiz.index] = {
      resposta: letter,
      tipo: question.tipo,
    };
  } else if (quiz.kind === "simulation") {
    quiz.answers[quiz.index] = {
      resposta: letter,
      tipo: question.tipo,
      pending: true,
    };
  } else {
    const result = await api("/api/responder", jsonOptions("POST", { id: question.id, resposta: letter }));
    quiz.answers[quiz.index] = { resposta: letter, correta: result.correta, gabarito: result.gabarito, tipo: question.tipo };
  }
  await renderPage();
}

function renderNotes() {
  const notes = app.state.anotacoes || [];
  const materials = [...new Set([...(app.state.disciplinas || []), ...notes.map((item) => item.materia)])].filter(Boolean).sort();
  const types = ["Erro Frequente", "Pegadinha de Banca", "Prazos", "Regra x Exceção", "Ponto Importante", "Nota Complementar"];
  const form = `<form id="note-form" class="form-grid"><div class="field"><label>Disciplina</label><select name="materia">${materials.map((material) => `<option>${escapeHtml(material)}</option>`).join("")}<option>Geral</option></select></div><div class="field"><label>Classificação</label><select name="tipo">${types.map((type) => `<option>${escapeHtml(type)}</option>`).join("")}</select></div>${textArea("Ponto para revisar", "texto", "", "Registre a regra, pegadinha ou erro…")}<div class="field full"><button class="btn btn-primary">Salvar anotação</button></div></form>`;
  const filter = app.noteFilter;
  const query = normalizeSearch(filter.query);
  const filtered = notes.filter((item) => {
    const type = normalizeSearch(item.tipo);
    const isQuestionError = type === "erro em questao (auto)" || type === "questao errada" || type === "questoes erradas" || type === "questao errada (prova)";
    if (filter.subject !== "Todas as Matérias" && item.materia !== filter.subject) return false;
    if (filter.type === "Questões erradas" && !isQuestionError) return false;
    if (filter.type === "Anotações manuais" && isQuestionError) return false;
    const questionText = item.questao
      ? `${item.questao.enunciado || ""} ${item.questao.resposta || ""} ${item.questao.gabarito || ""} ${(item.questao.alternativas || []).map((option) => `${option.letra || option.key || ""} ${option.texto || option.text || ""}`).join(" ")}`
      : "";
    return !query || normalizeSearch(`${item.tipo} ${item.materia} ${item.data} ${item.texto} ${item.arquivo_prova || ""} ${questionText}`).includes(query);
  });
  const cards = filtered.length ? filtered.map((item) => {
    const editing = app.editingNoteId === item.id;
    const question = item.questao;
    if (item.correcao_prova) {
      return `<article class="data-card"><div class="data-card-head"><div><h3>Questão errada na prova</h3><span class="tag">${escapeHtml(visibleName(item.materia))} · ${escapeHtml(item.data)}</span></div><div class="note-actions"><button class="btn btn-small" data-action="edit-proof-correction" data-id="${attr(item.correcao_id)}" data-kind="${attr(item.tipo_arquivo)}" data-folder="${attr(item.banca)}" data-file="${attr(item.arquivo_prova)}">Editar correção</button><button class="btn btn-danger btn-small" data-action="delete-proof-correction" data-id="${attr(item.correcao_id)}" data-kind="${attr(item.tipo_arquivo)}" data-folder="${attr(item.banca)}" data-file="${attr(item.arquivo_prova)}">Excluir</button></div></div><p class="proof-note-filename"><strong>Prova:</strong> ${escapeHtml(visibleName(item.arquivo_prova))}</p>${question ? `<section class="note-question"><strong>Questão</strong><p>${escapeHtml(question.enunciado || "").replace(/\n/g, "<br>")}</p></section>` : ""}</article>`;
    }
    const questionDetails = question
      ? `<section class="note-question"><strong>Questão respondida</strong><p>${escapeHtml(question.enunciado || "").replace(/\n/g, "<br>")}</p>${(question.alternativas || []).length ? `<ol class="simulation-review-options">${question.alternativas.map((option) => `<li><strong>${escapeHtml(option.letra || option.key || "")}.</strong> ${escapeHtml(option.texto || option.text || "")}</li>`).join("")}</ol>` : ""}<div class="notice warning">Marcada: ${escapeHtml(question.resposta || "—")} · Gabarito: ${escapeHtml(question.gabarito || "—")}</div>${question.comentario ? `<p class="muted">${escapeHtml(question.comentario)}</p>` : ""}</section>`
      : "";
    const noteForm = editing
      ? `<form class="note-edit-form section-spacer" data-note-id="${item.id}"><div class="form-grid"><div class="field"><label>Disciplina</label><input name="materia" value="${attr(item.materia)}" maxlength="120" required></div><div class="field"><label>Classificação</label><select name="tipo">${types.map((type) => `<option ${type === item.tipo ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}${types.includes(item.tipo) ? "" : `<option selected>${escapeHtml(item.tipo)}</option>`}</select></div><div class="field full"><label>Ponto para revisar</label><textarea name="texto" placeholder="Edite o erro ou a anotação…" required>${escapeHtml(item.texto)}</textarea></div><div class="field full button-row"><button class="btn btn-primary btn-small">Salvar edição</button><button class="btn btn-small" type="button" data-action="cancel-note-edit">Cancelar</button></div></div></form>`
      : `<p>${escapeHtml(item.texto)}</p>`;
    return `<article class="data-card"><div class="data-card-head"><div><h3>${escapeHtml(visibleName(item.tipo))}</h3><span class="tag">${escapeHtml(visibleName(item.materia))} · ${escapeHtml(item.data)}</span></div><div class="note-actions"><button class="btn btn-danger btn-small" data-action="delete-note" data-id="${item.id}">Excluir</button><button class="btn btn-small note-edit-button" data-action="edit-note" data-id="${item.id}">${iconSvg("pen")}<span>Editar</span></button></div></div>${questionDetails}${noteForm}</article>`;
  }).join("") : empty(notes.length ? "Nenhum registro corresponde aos filtros." : "Ainda não há anotações ou erros registrados.");
  const filters = `<div class="toolbar section-spacer"><select class="control" id="notes-filter-subject"><option>Todas as Matérias</option>${materials.map((material) => `<option ${filter.subject === material ? "selected" : ""}>${escapeHtml(material)}</option>`).join("")}</select><select class="control" id="notes-filter-type">${["Todos", "Questões erradas", "Anotações manuais"].map((type) => `<option ${filter.type === type ? "selected" : ""}>${type}</option>`).join("")}</select><input class="control" id="notes-filter-search" type="search" value="${attr(filter.query)}" placeholder="Buscar questão, prova ou anotação"><span class="tag">${filtered.length} de ${notes.length}</span></div>`;
  const exportControls = `<div class="toolbar"><label for="notes-export-subject">Baixar caderno</label><select class="control" id="notes-export-subject"><option value="Todas as Matérias">Geral · todas as matérias</option>${materials.map((material) => `<option value="${attr(material)}">${escapeHtml(material)}</option>`).join("")}</select><label class="setting-row note-export-question"><span>Incluir questão e alternativas</span><input id="notes-export-question" type="checkbox" checked></label><button class="btn btn-primary" data-action="download-notes" ${notes.length ? "" : "disabled"}>Baixar PDF</button></div>`;
  return `${heading("Caderno de erros", "Revise questões erradas e anotações, filtrando por matéria, tipo ou conteúdo.")}${panel("Adicionar anotação", form)}${exportControls}${filters}<div class="section-spacer">${cards}</div>`;
}

const CASE_LAW_CATEGORIES = ["Súmula", "Súmula Vinculante", "Jurisprudência", "Tema repetitivo", "Repercussão geral", "Outro"];

async function renderCaseLaw() {
  const items = await api("/api/sumulas-jurisprudencia");
  const filter = app.caseLawFilter;
  const editing = items.find((item) => item.id === app.editingCaseLawId);
  if (app.editingCaseLawId && !editing) app.editingCaseLawId = "";
  const selected = editing || {};
  const categoryOptions = ["Todas", ...new Set([...CASE_LAW_CATEGORIES, ...items.map((item) => item.categoria).filter(Boolean)])];
  if (filter.category !== "Todas" && !categoryOptions.includes(filter.category)) filter.category = "Todas";
  const query = filter.query.trim().toLocaleLowerCase("pt-BR");
  const filtered = items.filter((item) => {
    if (filter.category !== "Todas" && item.categoria !== filter.category) return false;
    return !query || `${item.categoria} ${item.titulo} ${item.tribunal} ${item.identificador} ${item.fonte} ${item.texto}`.toLocaleLowerCase("pt-BR").includes(query);
  });
  const categorySelect = (name, value) => `<select class="control" name="${name}">${CASE_LAW_CATEGORIES.map((category) => `<option ${value === category ? "selected" : ""}>${category}</option>`).join("")}</select>`;
  const form = `<form id="case-law-form" class="form-grid"><input type="hidden" name="id" value="${attr(selected.id || "")}"><div class="field"><label>Categoria</label>${categorySelect("categoria", selected.categoria || "Súmula")}</div><div class="field"><label>Tribunal</label><input name="tribunal" value="${attr(selected.tribunal || "")}" placeholder="Ex.: STF, STJ, TST"></div><div class="field"><label>Súmula, tema ou processo</label><input name="identificador" value="${attr(selected.identificador || "")}" placeholder="Ex.: Súmula 331, Tema 1.046"></div><div class="field"><label>Fonte ou link</label><input name="fonte" value="${attr(selected.fonte || "")}" placeholder="Referência para consulta"></div><div class="field full"><label>Título</label><input name="titulo" value="${attr(selected.titulo || "")}" required></div>${textArea("Tese, ementa ou entendimento", "texto", selected.texto || "", "Registre o enunciado ou trecho relevante…")}<div class="field full"><div class="button-row"><button class="btn btn-primary">${editing ? "Salvar alterações" : "Adicionar referência"}</button>${editing ? '<button class="btn" type="button" data-action="cancel-case-law-edit">Cancelar edição</button>' : ""}</div></div></form>`;
  const cards = filtered.length ? filtered.map((item) => `<article class="data-card"><div class="data-card-head"><div><h3>${escapeHtml(item.titulo)}</h3><span class="tag">${escapeHtml(item.categoria)}${item.tribunal ? ` · ${escapeHtml(item.tribunal)}` : ""}${item.identificador ? ` · ${escapeHtml(item.identificador)}` : ""}</span></div><div class="button-row"><button class="btn btn-small" data-action="edit-case-law" data-id="${attr(item.id)}">Editar</button><button class="btn btn-danger btn-small" data-action="delete-case-law" data-id="${attr(item.id)}">Excluir</button></div></div><p class="case-law-text">${escapeHtml(item.texto)}</p>${item.fonte ? `<p class="muted">Fonte: ${escapeHtml(item.fonte)}</p>` : ""}</article>`).join("") : empty(items.length ? "Nenhuma referência corresponde à busca." : "Ainda não há súmulas ou julgados cadastrados.");
  const filters = `<div class="toolbar section-spacer"><select class="control" id="case-law-filter-category">${categoryOptions.map((category) => `<option ${filter.category === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}</select><input class="control" id="case-law-filter-search" type="search" value="${attr(filter.query)}" placeholder="Buscar súmula, tribunal, tema ou conteúdo"><span class="tag">${filtered.length} de ${items.length}</span></div>`;
  return `${heading("Súmulas e Jurisprudência", "Organize e pesquise súmulas, temas e entendimentos dos tribunais.")}${panel(editing ? "Editar referência" : "Adicionar súmula ou jurisprudência", form)}${filters}<div class="section-spacer">${cards}</div>`;
}

function renderContests() {
  const contests = app.state.concursos || [];
  const form = `<form id="contest-form" class="form-grid"><div class="field"><label>Órgão / cargo</label><input name="concurso" required placeholder="Ex.: Guarda Municipal"></div><div class="field"><label>Status de pagamento</label><select name="status_pagamento"><option>Não Pago</option><option>Pago</option></select></div><div class="field"><label>Abertura / período</label><input name="data_abertura" placeholder="Data ou período"></div><div class="field"><label>Prazo de pagamento</label><input name="data_pagamento" placeholder="Data limite"></div><div class="field"><label>Local da prova</label><input name="local_prova"></div>${textArea("Observações", "observacoes") }<div class="field full"><button class="btn btn-primary">Cadastrar concurso</button></div></form>`;
  const cards = contests.length ? contests.map((item) => `<article class="data-card"><div class="data-card-head"><div><h3>${escapeHtml(item.concurso)}</h3><span class="tag ${item.status_pagamento === "Pago" ? "good" : "bad"}">${escapeHtml(item.status_pagamento)}</span></div><div class="button-row"><button class="btn btn-small" data-action="toggle-payment" data-id="${item.id}">${item.status_pagamento === "Pago" ? "Marcar pendente" : "Marcar pago"}</button><button class="btn btn-danger btn-small" data-action="delete-contest" data-id="${item.id}">Excluir</button></div></div><p>📅 Abertura: ${escapeHtml(item.data_abertura)} · 💰 Pagamento: ${escapeHtml(item.data_pagamento)} · 📍 ${escapeHtml(item.local_prova)}</p><p>${escapeHtml(item.observacoes)}</p></article>`).join("") : empty("Cadastre seu primeiro concurso para acompanhar datas e pagamentos.");
  return `${heading("Datas e locais", "Acompanhe inscrições, prazos de pagamento e locais de prova.")}${panel("Cadastrar concurso", form)}<div class="grid metrics-grid section-spacer">${[["Inscrições", contests.length], ["Pagas", contests.filter((item) => item.status_pagamento === "Pago").length], ["Pendentes", contests.filter((item) => item.status_pagamento !== "Pago").length]].map(([label, value]) => `<article class="metric-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div></article>`).join("")}</div>${cards}`;
}

function renderSchedule() {
  const schedule = app.state.cronograma || {};
  if (!Array.isArray(app.scheduleOpenDays)) {
    app.scheduleOpenDays = [WEEKDAYS[(new Date().getDay() + 6) % 7]];
  }
  const days = WEEKDAYS.map((day) => {
    const topics = schedule[day] || [];
    const rows = topics.map((topic, index) => `<div class="topic-row" data-day="${attr(day)}" data-topic="${index}">
      <div class="field"><label>Data</label><input data-field="data" type="date" value="${attr(goalDateIso(topic.data) || localDateIso())}"></div>
      <div class="field"><label>Matéria</label><input data-field="materia" value="${attr(topic.materia || "")}"></div>
      <div class="field"><label>Tempo</label><input data-field="tempo" value="${attr(topic.tempo || "")}"></div>
      <div class="field"><label>Observações</label><input data-field="observacoes" value="${attr(topic.observacoes || "")}"></div>
      <div class="topic-actions"><button class="btn btn-small" title="Concluir e arquivar" aria-label="Concluir ${attr(topic.materia || "tópico")}" data-action="archive-topic" data-day="${attr(day)}" data-index="${index}">✓</button><button class="btn btn-small incomplete-topic-button" title="Arquivar como não concluída" aria-label="Marcar ${attr(topic.materia || "tópico")} como não concluída" data-action="archive-incomplete-topic" data-day="${attr(day)}" data-index="${index}">Pendente</button><button class="btn btn-danger btn-small" title="Excluir" aria-label="Excluir ${attr(topic.materia || "tópico")}" data-action="delete-topic" data-day="${attr(day)}" data-index="${index}">×</button></div>
    </div>`).join("");
    return `<details class="schedule-day" data-schedule-day-group="${attr(day)}" ${app.scheduleOpenDays.includes(day) ? "open" : ""}><summary>${escapeHtml(day)} <span class="tag">${topics.length} tópico(s)</span></summary><div class="schedule-body" data-schedule-day="${attr(day)}">${rows || empty("Nenhum tópico.")}<div class="button-row section-spacer"><button class="btn btn-small" data-action="add-topic" data-day="${attr(day)}">＋ Adicionar tópico</button><button class="btn btn-primary btn-small" data-action="save-day" data-day="${attr(day)}">Salvar dia</button></div></div></details>`;
  }).join("");
  const pendingCount = Object.values(schedule).flat().filter((topic) => topic.materia || topic.observacoes).length;
  return `${heading("Cronograma semanal", "Conclua cada tópico, marque uma pendência ou arquive a semana para guardar o que ficou.")}<div class="grid">${days}</div>
    <section class="panel section-spacer week-archive-panel"><div><h3>Fechar semana</h3><p class="muted">Os ${pendingCount} tópico(s) restantes serão movidos para Metas Não Concluídas e retirados do cronograma.</p></div><button class="btn btn-small btn-primary" data-action="archive-week" ${pendingCount ? "" : "disabled"}>Arquivar semana inteira</button></section>`;
}

async function renderGoals() {
  const goals = app.state.metas_concluidas || [];
  const filter = app.completedGoalsFilter;
  if (!filter.week) filter.week = weekStartIso();
  const weeklyNotes = await api(`/api/metas/observacoes-semanais?semana=${encodeURIComponent(filter.week)}`);
  filter.week = weeklyNotes.semana;
  const filtered = goals.filter((item) => {
    const date = goalDateIso(item.data);
    return (!filter.from || (date && date >= filter.from))
      && (!filter.to || (date && date <= filter.to));
  });
  const groups = filtered.reduce((all, item) => {
    (all[item.data] ||= []).push(item);
    return all;
  }, {});
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const filters = `<div class="toolbar section-spacer"><label>De <input class="control" id="completed-goals-from" type="date" value="${attr(filter.from)}"></label><label>Até <input class="control" id="completed-goals-to" type="date" value="${attr(filter.to)}"></label><span class="tag">${filtered.length} meta(s)</span><button class="btn btn-small" data-action="clear-goal-date-filter">Limpar filtro</button></div>`;
  const weekEnd = new Date(`${filter.week}T12:00:00`);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekRange = `${new Date(`${filter.week}T12:00:00`).toLocaleDateString("pt-BR")} a ${weekEnd.toLocaleDateString("pt-BR")}`;
  const notes = `<section class="panel section-spacer"><div class="panel-title"><h3>Observações semanais</h3></div><div class="field"><label for="completed-goals-week">Semana</label><input class="control" id="completed-goals-week" type="week" value="${attr(isoWeekInputValue(filter.week))}"><small class="weekly-goal-week-range">Período selecionado: ${escapeHtml(weekRange)}</small></div><div class="field section-spacer"><label for="completed-goals-week-notes">Anotações da semana</label><textarea id="completed-goals-week-notes" maxlength="20000" rows="4" placeholder="Registre seu balanço semanal, dificuldades e próximos passos…">${escapeHtml(weeklyNotes.observacoes)}</textarea></div><button class="btn btn-primary btn-small" data-action="save-weekly-goal-notes">Salvar observações da semana</button></section>`;
  const cards = dates.length
    ? dates.map((date) => `<details class="schedule-day" open><summary>${escapeHtml(date)} · ${groups[date].length} meta(s)</summary><div class="schedule-body">${groups[date].map((item) => `<article class="data-card"><div class="data-card-head"><div><h3>${escapeHtml(visibleName(item.materia))}</h3><span class="tag">${escapeHtml(item.dia_semana)} · ${escapeHtml(item.tempo)}</span></div><div class="button-row"><button class="btn btn-small" data-action="reopen-completed-goal" data-id="${item.id}">Reabrir meta</button><button class="btn btn-danger btn-small" data-action="delete-goal" data-id="${item.id}">Excluir</button></div></div><p>${escapeHtml(item.observacoes)}</p></article>`).join("")}</div></details>`).join("")
    : empty(goals.length ? "Nenhuma meta concluída corresponde às datas selecionadas." : "As metas concluídas aparecerão aqui.");
  return `${heading("Metas concluídas", "Filtre as metas por data e registre observações semanais.")}${filters}${notes}${cards}`;
}

function renderIncompleteGoals() {
  const goals = app.state.metas_nao_concluidas || [];
  const groups = goals.reduce((all, item) => {
    const date = item.arquivado_em || "Data não registrada";
    (all[date] ||= []).push(item);
    return all;
  }, {});
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const cards = (item) => `<article class="data-card"><div class="data-card-head"><div><h3>${escapeHtml(visibleName(item.materia))}</h3><span class="tag">${escapeHtml(item.dia_semana)} · ${escapeHtml(item.data)} · ${escapeHtml(item.tempo)}</span></div><div class="button-row"><button class="btn btn-primary btn-small" data-action="complete-incomplete-goal" data-id="${item.id}">Concluir meta</button><button class="btn btn-danger btn-small" data-action="delete-incomplete-goal" data-id="${item.id}">Excluir</button></div></div><p>${escapeHtml(item.observacoes)}</p></article>`;
  return `${heading("Metas não concluídas", "Tópicos pendentes ou metas reabertas para você retomar.")}${dates.length ? dates.map((date) => `<details class="schedule-day" open><summary>Registrada em ${escapeHtml(date)} · ${groups[date].length} tópico(s)</summary><div class="schedule-body">${groups[date].map(cards).join("")}</div></details>`).join("") : empty("As metas pendentes aparecerão aqui depois que você arquivar uma semana ou reabrir uma meta.")}`;
}

function localDateIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekStartIso(value) {
  const date = new Date(`${value || localDateIso()}T12:00:00`);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return localDateIso(date);
}

function isoWeekInputValue(value) {
  const monday = new Date(`${weekStartIso(value)}T12:00:00`);
  const thursday = new Date(monday);
  thursday.setDate(thursday.getDate() + 3);
  const weekYear = thursday.getFullYear();
  const januaryFourth = new Date(weekYear, 0, 4, 12);
  const firstMonday = new Date(januaryFourth);
  firstMonday.setDate(firstMonday.getDate() - (firstMonday.getDay() + 6) % 7);
  const weekNumber = Math.round((monday - firstMonday) / 604800000) + 1;
  return `${weekYear}-W${String(weekNumber).padStart(2, "0")}`;
}

function isoWeekStartDate(value) {
  const match = String(value || "").match(/^(\d{4})-W(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return "";
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const weekday = (januaryFourth.getUTCDay() + 6) % 7;
  januaryFourth.setUTCDate(januaryFourth.getUTCDate() - weekday + (week - 1) * 7);
  const thursday = new Date(januaryFourth);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  if (thursday.getUTCFullYear() !== year) return "";
  return `${januaryFourth.getUTCFullYear()}-${String(januaryFourth.getUTCMonth() + 1).padStart(2, "0")}-${String(januaryFourth.getUTCDate()).padStart(2, "0")}`;
}

function goalDateIso(value) {
  const date = String(value || "").trim();
  const brazilian = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brazilian) return `${brazilian[3]}-${brazilian[2].padStart(2, "0")}-${brazilian[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function dateInputToBrazilian(value) {
  const date = String(value || "").trim();
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : date;
}

async function loadLaw(folder = app.selectedLaw) {
  if (!folder) {
    const data = await api("/api/leis");
    app.state.leis = data.pastas || [];
    app.selectedLaw = app.state.leis[0] || "";
    if (!app.selectedLaw) return;
    folder = app.selectedLaw;
  }
  app.selectedLaw = folder;
  const url = new URL("/api/leis", location.origin);
  url.searchParams.set("pasta", folder);
  if (app.lawFilter) url.searchParams.set("q", app.lawFilter);
  const result = await api(url.pathname + url.search);
  app.state.leis = result.pastas || app.state.leis || [];
  app.lawItems = result.itens || [];
  app.lawPdfs = result.pdfs || [];
}

function readerContent(text, highlights = []) {
  let safeText = escapeHtml(text);
  const entries = highlights.map((item) => typeof item === "string" ? { text: item, color: "yellow" } : item)
    .filter((item) => item?.text && HIGHLIGHT_COLORS[item.color]);
  for (const entry of [...entries].sort((a, b) => b.text.length - a.text.length)) {
    const safePhrase = escapeHtml(entry.text);
    const color = HIGHLIGHT_COLORS[entry.color];
    const style = `background:${color.background};color:${color.foreground}`;
    safeText = safeText.replace(new RegExp(safePhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (match) => `<mark style="${style}">${match}</mark>`);
  }
  return safeText.split(/\n{2,}/).filter(Boolean).map((part) => `<p>${part.replace(/\n/g, "<br>")}</p>`).join("");
}

function getHighlights() {
  try {
    const saved = JSON.parse(localStorage.getItem(`central-highlights:${app.selectedLaw}`) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.map((item) => {
      if (typeof item === "string") return { text: item, color: "yellow" };
      if (!item || typeof item.text !== "string") return null;
      return { text: item.text, color: HIGHLIGHT_COLORS[item.color] ? item.color : "yellow" };
    }).filter(Boolean);
  }
  catch { return []; }
}

function renderLaws() {
  if (!app.state.leis?.length) {
    const folderForm = `<form id="law-folder-form" class="form-grid"><div class="field"><label>Nome da legislação</label><input name="nome" required></div><button class="btn btn-primary">Criar pasta</button></form>`;
    return `${heading("Lei seca", "Leitura e revisão das legislações organizadas em pastas.")}${panel("Criar legislação", folderForm)}${empty("Não há legislações disponíveis. Crie uma pasta ou adicione arquivos na Matriz de Incidência.")}`;
  }
  const folders = app.state.leis.map((name) => `<option value="${attr(name)}" ${name === app.selectedLaw ? "selected" : ""}>${escapeHtml(lawFolderLabel(name))}</option>`).join("");
  const search = app.lawItems.map((item) => `<article class="law-item law-continuous"><div class="law-entry-heading"><strong>${escapeHtml(visibleName(item.dispositivo))}</strong><span class="tag">${escapeHtml(item.grau)}</span></div><div class="law-body"><div class="law-text">${readerContent(item.texto)}</div>${item.dica ? `<p class="law-note"><strong>Ponto de atenção:</strong> ${escapeHtml(item.dica)}</p>` : ""}${item.observacao ? `<div class="notice">Sua observação: ${escapeHtml(item.observacao)}</div>` : ""}</div></article>`).join("");
  const fullText = app.lawItems.map((item) => `${item.dispositivo}\n${item.texto}${item.dica ? `\nPonto de atenção: ${item.dica}` : ""}`).join("\n\n");
  const highlights = getHighlights();
  const lawPdfRows = app.lawPdfs.map((file) => `<div class="file-row"><button class="file-row-name link-button" data-action="preview-file" data-kind="leis" data-folder="${attr(app.selectedLaw)}" data-file="${attr(file.name)}">${escapeHtml(visibleName(file.name))}</button><a class="btn btn-small" href="/api/arquivos/leis/${encodeURIComponent(app.selectedLaw)}/${encodeURIComponent(file.name)}?download=1">Baixar original</a></div>`).join("");
  const lawPdfPreview = app.selectedFileKind === "leis" && app.selectedFile
    ? pdfEditor("leis", `${app.selectedLaw}/${app.selectedFile}`, "PDF da legislação")
    : "";
  const highlightOptions = Object.entries(HIGHLIGHT_COLORS).map(([key, color]) => `<option value="${key}">${color.label}</option>`).join("");
  return `${heading("Lei seca", "Leia e grife o PDF original ou o texto convertido. Os grifos do PDF são gravados no próprio arquivo.")}
    <div class="toolbar"><select class="control" id="law-select">${folders}</select><input class="control${uploadSettings("Lei Seca", "search")}" id="law-search" type="search" value="${attr(app.lawFilter)}" placeholder="Buscar dispositivo ou trecho…"><button class="btn btn-small" data-action="law-export">📥 PDF com grifos</button><button class="btn btn-small" data-page="Matriz de Incidência">Matriz de incidência →</button></div>
    ${app.lawPdfs.length ? `<section class="panel section-spacer"><div class="panel-title"><h3>PDFs originais da legislação</h3></div><div class="file-list">${lawPdfRows}</div>${lawPdfPreview}</section>` : ""}
    <div class="panel section-spacer"><div class="panel-title"><h3>${escapeHtml(lawFolderLabel(app.selectedLaw))} · ${app.lawItems.length} dispositivos</h3></div><div class="button-row"><select class="control highlight-color" id="highlight-color" aria-label="Cor do marcador">${highlightOptions}</select><button class="btn btn-small" data-action="highlight-selection">🖍 Grifar seleção</button><button class="btn btn-small" data-action="remove-highlight">Remover último grifo</button><span class="tag">${highlights.length} grifo(s) salvo(s)</span></div>    <div class="law-text section-spacer" id="law-reader">${readerContent(fullText, highlights)}</div></div>
    <div class="section-spacer">${search || empty("Nenhum dispositivo encontrado.")}</div>
    <div class="notice">A leitura e a busca usam o texto disponível nos arquivos da pasta. PDF escaneado, sem texto selecionável, requer OCR, que não está disponível nesta versão.</div>`;
}

async function renderMatrix() {
  const folders = (await api("/api/leis")).pastas || [];
  app.state.leis = folders;
  const selected = app.selectedLaw && folders.includes(app.selectedLaw) ? app.selectedLaw : (folders[0] || "");
  app.selectedLaw = selected;
  const form = `<form id="law-folder-form" class="form-grid"><div class="field"><label>Nome da legislação</label><input name="nome" required placeholder="Ex.: Código Penal"></div><button class="btn btn-primary">＋ Criar pasta</button></form>`;
  const upload = `<form id="law-upload-form" class="form-grid"><div class="field"><label>Pasta de destino</label><select name="pasta">${folders.map((name) => `<option value="${attr(name)}">${escapeHtml(lawFolderLabel(name))}</option>`).join("")}</select></div><div class="field"><label>Arquivo (.txt, .md, .pdf ou .docx)</label><input name="arquivo" type="file" accept=".txt,.md,.pdf,.docx" required></div><div class="field full"><button class="btn btn-primary">Adicionar legislação</button></div></form>`;
  const addItem = `<form id="law-item-form" class="form-grid"><div class="field"><label>Pasta</label><select name="pasta">${folders.map((name) => `<option value="${attr(name)}" ${name === selected ? "selected" : ""}>${escapeHtml(lawFolderLabel(name))}</option>`).join("")}</select></div>${field("Dispositivo", "dispositivo", "", "text", "Art. 5º, inciso…")}${textArea("Texto legal", "texto")}${textArea("Ponto de atenção", "dica")}<div class="field"><label>Grau de incidência</label><select name="grau" class="matrix-grade-control grade-unclassified" data-incidence-grade>${["Não Classificado", "Muito Alto", "Alto", "Médio", "Baixo"].map((grade) => `<option>${grade}</option>`).join("")}</select></div><div class="field"><button class="btn btn-primary">Salvar dispositivo</button></div></form>`;
  let items = [];
  if (selected) {
    const url = new URL("/api/leis", location.origin);
    url.searchParams.set("pasta", selected);
    const data = await api(url.pathname + url.search);
    items = data.itens || [];
  }
  const filtered = app.lawFilter ? items.filter((item) => `${item.dispositivo} ${item.texto}`.toLowerCase().includes(app.lawFilter.toLowerCase())) : items;
  const cards = filtered.map((item) => {
    const index = Number(item.id.split("::").pop());
    const grades = ["Não Classificado", "Muito Alto", "Alto", "Médio", "Baixo"];
    const colorClass = incidenceColor(item.grau);
    return `<article class="law-item"><div class="law-entry-heading"><strong>${escapeHtml(visibleName(item.dispositivo))}</strong><span class="tag incidence-tag grade-${colorClass}">${escapeHtml(item.grau)}</span></div><p>${escapeHtml(item.texto)}</p>${item.dica ? `<div class="notice warning">Ponto de atenção: ${escapeHtml(item.dica)}</div>` : ""}<div class="matrix-edit-row"><div class="field"><label>Grau</label><select class="matrix-grade-control grade-${colorClass}" data-incidence-grade data-grade="${index}">${grades.map((grade) => `<option ${grade === item.grau ? "selected" : ""}>${grade}</option>`).join("")}</select></div><div class="field"><label>Observações</label><input data-observation="${index}" value="${attr(item.observacao)}"></div><button class="btn btn-small btn-primary" data-action="save-law-item" data-index="${index}" data-file="${attr(item.arquivo)}" data-device="${attr(item.dispositivo)}">Salvar</button></div></article>`;
  }).join("");
  return `<div class="matrix-page">${heading("Matriz de incidência", "Classifique os dispositivos, mantenha observações e organize seus arquivos de legislação.")}
    <div class="grid dashboard-grid">${panel("Criar pasta", form)}${panel("Adicionar arquivo", upload)}</div>
    <div class="panel section-spacer">${panel("Adicionar dispositivo manualmente", addItem)}</div>
    <div class="toolbar section-spacer"><select class="control" id="law-select">${folders.map((name) => `<option value="${attr(name)}" ${name === selected ? "selected" : ""}>${escapeHtml(lawFolderLabel(name))}</option>`).join("")}</select><input class="control" id="matrix-search" value="${attr(app.lawFilter)}" placeholder="Buscar artigo ou palavra-chave">${selected ? `<a class="btn btn-small" href="/api/leis/matriz-pdf?pasta=${encodeURIComponent(selected)}" target="_blank" rel="noopener">Salvar PDF desta lei</a>` : '<button class="btn btn-small" type="button" disabled>Salvar PDF desta lei</button>'}<span class="tag">${filtered.length} dispositivo(s)</span></div>
    ${cards || empty(selected ? "Não há dispositivos nesta pasta." : "Crie uma pasta para começar.")}</div>`;
}

function pdfEditor(kind, relativePath, title) {
  const source = `/static/pdf-viewer.html?kind=${encodeURIComponent(kind)}&path=${encodeURIComponent(relativePath)}`;
  return `<iframe class="pdf-editor-frame" title="${attr(title)}" src="${source}"></iframe>`;
}

function replacePdfControl(kind, folder, file) {
  const label = `Substituir ${visibleName(file)} na pasta original`;
  return `<input class="upload-input" type="file" accept=".pdf,application/pdf" data-replace-pdf data-kind="${attr(kind)}" data-folder="${attr(folder)}" data-file="${attr(file)}" aria-label="${attr(label)}"><button type="button" class="btn btn-small" data-action="replace-pdf" title="Selecione o PDF editado salvo no computador para substituir o original na pasta do app.">Substituir original</button>`;
}

async function renderPdfs() {
  const data = await api("/api/pdfs");
  const folders = data.pastas || [];
  if (!app.selectedPdfFolder || !folders.includes(app.selectedPdfFolder)) app.selectedPdfFolder = folders[0] || "";
  const folderControls = `<form id="pdf-folder-form" class="form-grid"><div class="field"><label>Nova pasta</label><input name="nome" required placeholder="Ex.: Provas Cebraspe"></div><button class="btn btn-primary">Criar pasta</button></form>`;
  const currentFiles = app.selectedPdfFolder
    ? await api(`/api/pdfs?pasta=${encodeURIComponent(app.selectedPdfFolder)}`)
    : { arquivos: [] };
  if (app.selectedFileKind === "pdfs" && !(currentFiles.arquivos || []).some((file) => file.name === app.selectedFile)) {
    app.selectedFile = "";
    app.selectedFileKind = "";
  }
  const upload = `<form id="pdf-upload-form" class="form-grid" data-module="PDFs Pessoais"><div class="field"><label>Pasta</label><select name="pasta">${folders.map((folder) => `<option value="${attr(folder)}" ${folder === app.selectedPdfFolder ? "selected" : ""}>${escapeHtml(visibleName(folder))}</option>`).join("")}</select></div><div class="field"><label>PDFs (selecione vários ou arraste)</label><input name="arquivos" type="file" accept=".pdf,application/pdf" multiple required></div><div class="field full"><button class="btn btn-primary">Enviar PDF(s)</button></div></form>`;
  const files = (currentFiles.arquivos || []).map((file) => `<div class="file-row"><button class="file-row-name link-button" data-action="preview-file" data-kind="pdfs" data-folder="${attr(app.selectedPdfFolder)}" data-file="${attr(file.name)}">${escapeHtml(visibleName(file.name))}</button><div class="button-row"><a class="btn btn-small" href="/api/arquivos/pdfs/${encodeURIComponent(app.selectedPdfFolder)}/${encodeURIComponent(file.name)}" target="_blank" rel="noopener" aria-label="Abrir PDF: ${attr(file.name)}">Abrir</a>${replacePdfControl("pdfs", app.selectedPdfFolder, file.name)}<button class="btn btn-danger btn-small" data-action="delete-pdf" data-folder="${attr(app.selectedPdfFolder)}" data-file="${attr(file.name)}">Excluir</button></div></div>`).join("");
  const preview = app.selectedFile && app.selectedFileKind === "pdfs"
    ? pdfEditor("pdfs", `${app.selectedPdfFolder}/${app.selectedFile}`, "Visualizador de PDF pessoal")
    : "";
  const folderCards = (data.pastas_detalhes || folders.map((nome) => ({ nome, quantidade: 0 }))).map((folder) =>
    `<article class="drive-folder ${folder.nome === app.selectedPdfFolder ? "selected" : ""}" data-drop="pdfs" data-pdf-upload-drop data-folder="${attr(folder.nome)}">
      <input class="upload-input" type="file" accept=".pdf,application/pdf" multiple data-pdf-folder-input data-folder="${attr(folder.nome)}" aria-label="Adicionar PDFs à pasta ${attr(folder.nome)}">
      <button type="button" class="drive-folder-open" data-action="open-pdf-folder" data-folder="${attr(folder.nome)}"><span class="drive-folder-icon" aria-hidden="true">▰</span><span class="drive-folder-copy"><strong>${escapeHtml(visibleName(folder.nome))}</strong><small>${folder.quantidade} PDF(s)</small></span></button>
      <div class="drive-folder-actions"><button type="button" class="btn btn-small" data-action="open-pdf-folder-location" data-folder="${attr(folder.nome)}" aria-label="Abrir local da pasta ${attr(folder.nome)}">Abrir local</button><button type="button" class="btn btn-small drive-folder-add" data-action="pick-pdf-folder" data-folder="${attr(folder.nome)}" aria-label="Adicionar PDF à pasta ${attr(folder.nome)}">+ Adicionar PDF</button><button type="button" class="btn btn-danger btn-small" data-action="delete-pdf-folder" data-folder="${attr(folder.nome)}" aria-label="Remover pasta ${attr(folder.nome)}">Remover pasta</button></div>
    </article>`
  ).join("");
  return `${heading("PDFs pessoais", "Abra os PDFs em novas guias. Depois de salvar uma cópia editada no computador, use Substituir original para gravá-la nesta pasta.")}
    ${panel("Pastas pessoais", `${folderControls}<div class="drive-folder-grid section-spacer">${folderCards || empty("Crie uma pasta para começar.")}</div>`)}
    ${app.selectedPdfFolder ? `<section class="panel section-spacer"><div class="panel-title"><h3>${escapeHtml(visibleName(app.selectedPdfFolder))}</h3><span class="tag">${(currentFiles.arquivos || []).length} PDF(s)</span></div><div class="drop-zone pdf-drop-zone" data-drop="pdfs" data-pdf-upload-drop data-folder="${attr(app.selectedPdfFolder)}"><div><strong>Arraste arquivos PDF para ${escapeHtml(visibleName(app.selectedPdfFolder))}</strong><div class="muted">Os arquivos entram diretamente nesta pasta</div></div></div><div class="section-spacer">${upload}</div><div class="file-list">${files || empty("Esta pasta ainda não tem PDFs.")}</div>${preview}</section>` : empty("Crie uma pasta para adicionar seus PDFs.")}`;
}

async function renderSummaries() {
  const data = await api(`/api/resumos${app.selectedSummaryFolder ? `?pasta=${encodeURIComponent(app.selectedSummaryFolder)}` : ""}`);
  const folders = data.pastas || [];
  if (!app.selectedSummaryFolder || !folders.includes(app.selectedSummaryFolder)) app.selectedSummaryFolder = folders[0] || "";
  const form = `<form id="summary-folder-form" class="form-grid"><div class="field"><label>Nova pasta temática</label><input name="nome" required placeholder="Ex.: Direito Penal"></div><button class="btn btn-primary">Criar pasta</button></form>`;
  const filesData = app.selectedSummaryFolder ? await api(`/api/resumos?pasta=${encodeURIComponent(app.selectedSummaryFolder)}`) : { arquivos: [] };
  const upload = `<form id="summary-upload-form" class="form-grid"><div class="field"><label>Pasta</label><select name="pasta">${folders.map((folder) => `<option value="${attr(folder)}" ${folder === app.selectedSummaryFolder ? "selected" : ""}>${escapeHtml(visibleName(folder))}</option>`).join("")}</select></div><div class="field"><label>PDF ou imagem</label><input name="arquivo" type="file" accept=".pdf,.png,.jpg,.jpeg" required></div><div class="field full"><button class="btn btn-primary">Enviar arquivo</button></div></form>`;
  const files = (filesData.arquivos || []).map((file) => `<div class="file-row"><button class="file-row-name link-button" data-action="preview-file" data-kind="resumos" data-folder="${attr(app.selectedSummaryFolder)}" data-file="${attr(file.name)}">${escapeHtml(visibleName(file.name))}</button><div class="button-row"><button class="btn btn-small" data-action="download-summary" data-folder="${attr(app.selectedSummaryFolder)}" data-file="${attr(file.name)}">Baixar</button><button class="btn btn-danger btn-small" data-action="delete-summary" data-folder="${attr(app.selectedSummaryFolder)}" data-file="${attr(file.name)}">Excluir</button></div></div>`).join("");
  const preview = app.selectedFile && app.selectedFileKind === "resumos"
    ? app.selectedFile.toLowerCase().endsWith(".pdf")
      ? pdfEditor("resumos", `${app.selectedSummaryFolder}/${app.selectedFile}`, "Visualizador de PDF")
      : `<iframe class="file-preview" title="Pré-visualização" src="/api/arquivos/resumos/${encodeURIComponent(app.selectedSummaryFolder)}/${encodeURIComponent(app.selectedFile)}"></iframe>`
    : "";
  return `${heading("Resumos e mapas", "Guarde seus resumos, mapas mentais, PDFs e imagens por matéria.")}${panel("Criar pasta", form)}
    ${app.selectedSummaryFolder ? `<section class="panel section-spacer"><div class="toolbar"><select class="control" id="summary-folder-select">${folders.map((folder) => `<option value="${attr(folder)}" ${folder === app.selectedSummaryFolder ? "selected" : ""}>${escapeHtml(visibleName(folder))}</option>`).join("")}</select></div>${upload}<div class="file-list">${files || empty("Não há arquivos nesta pasta.")}</div>${preview}</section>` : empty("Crie uma pasta para começar.")}`;
}

function proofCorrectionsSection(file, kind, bank) {
  const corrections = file.correcoes || [];
  const rows = corrections.map((correction) => {
    const editing = app.editingProofCorrectionId === correction.id;
    return `<article class="data-card proof-correction-card"><div class="data-card-head"><strong>Questão corrigida</strong><div class="button-row"><button type="button" class="btn btn-small" data-action="edit-proof-correction" data-id="${attr(correction.id)}" data-kind="${attr(kind)}" data-folder="${attr(bank)}" data-file="${attr(file.name)}">${editing ? "Fechar edição" : "Editar"}</button><button type="button" class="btn btn-danger btn-small" data-action="delete-proof-correction" data-id="${attr(correction.id)}" data-kind="${attr(kind)}" data-folder="${attr(bank)}" data-file="${attr(file.name)}">Excluir</button></div></div>${editing
      ? `<form class="proof-correction-form form-grid section-spacer" data-proof-kind="${attr(kind)}" data-proof-bank="${attr(bank)}" data-proof-file="${attr(file.name)}" data-correction-id="${attr(correction.id)}"><div class="field full"><label>Questão que errei</label><textarea name="questao" maxlength="100000" required>${escapeHtml(correction.questao)}</textarea></div><div class="field full"><label>Observações desta questão (não vão para o Caderno de Erros)</label><textarea name="observacoes" maxlength="100000">${escapeHtml(correction.observacoes || "")}</textarea></div><div class="field full button-row"><button class="btn btn-primary btn-small">Salvar correção</button><button type="button" class="btn btn-small" data-action="edit-proof-correction" data-id="${attr(correction.id)}" data-kind="${attr(kind)}" data-folder="${attr(bank)}" data-file="${attr(file.name)}">Cancelar</button></div></form>`
      : `<p>${escapeHtml(correction.questao).replace(/\n/g, "<br>")}</p>${correction.observacoes ? `<p class="muted"><strong>Observações:</strong> ${escapeHtml(correction.observacoes).replace(/\n/g, "<br>")}</p>` : ""}`}</article>`;
  }).join("");
  const editingId = app.editingProofCorrectionId;
  const editingThisProof = corrections.some((correction) => correction.id === editingId);
  const addForm = editingThisProof ? "" : `<form class="proof-correction-form form-grid section-spacer" data-proof-kind="${attr(kind)}" data-proof-bank="${attr(bank)}" data-proof-file="${attr(file.name)}"><div class="field full"><label>Questão que errei</label><textarea name="questao" maxlength="100000" required placeholder="Registre uma questão por vez."></textarea></div><div class="field full"><label>Observações desta questão (não vão para o Caderno de Erros)</label><textarea name="observacoes" maxlength="100000" placeholder="Anotações para revisar esta correção."></textarea></div><div class="field full"><button class="btn btn-primary btn-small">Adicionar questão ao Caderno de Erros</button></div></form>`;
  return `<details class="proof-observation-details proof-corrections-details" ${editingThisProof ? "open" : ""}><summary>Questões corrigidas · ${corrections.length}</summary>${rows || empty("Nenhuma questão adicionada ao Caderno de Erros para esta prova.")}${addForm}</details>`;
}

async function renderProofs() {
  const requestedBank = app.selectedProofBank;
  const [data, pairData] = await Promise.all([
    api(`/api/provas${requestedBank ? `?banca=${encodeURIComponent(requestedBank)}` : ""}`),
    api("/api/provas-com-gabarito"),
  ]);
  const banks = data.bancas || [];
  const requestedBankIsValid = requestedBank && banks.includes(requestedBank);
  if (!requestedBankIsValid) app.selectedProofBank = banks[0] || "";
  const form = `<form id="bank-form" class="form-grid"><div class="field"><label>Nome da banca</label><input name="nome" required placeholder="Ex.: Cebraspe"></div><button class="btn btn-primary">Criar guia</button></form>`;
  let selectedBankFiles = requestedBankIsValid ? data.arquivos || [] : [];
  if (!requestedBank && app.selectedProofBank) {
    selectedBankFiles = (data.arquivos || []).find((item) => item.banca === app.selectedProofBank)?.arquivos || [];
  } else if (requestedBank && !requestedBankIsValid && app.selectedProofBank) {
    selectedBankFiles = (await api(`/api/provas?banca=${encodeURIComponent(app.selectedProofBank)}`)).arquivos || [];
  }
  const files = { arquivos: selectedBankFiles };
  const rows = (files.arquivos || []).map((file) => `<article class="data-card proof-pair-card"><div class="file-row"><button class="file-row-name link-button" data-action="preview-file" data-kind="provas" data-folder="${attr(app.selectedProofBank)}" data-file="${attr(file.name)}">${escapeHtml(visibleName(file.name))}</button><div class="button-row"><a class="btn btn-small" href="/api/arquivos/provas/${encodeURIComponent(app.selectedProofBank)}/${encodeURIComponent(file.name)}" target="_blank" rel="noopener" aria-label="Abrir prova: ${attr(file.name)}">Abrir</a><a class="btn btn-small" href="/api/arquivos/provas/${encodeURIComponent(app.selectedProofBank)}/${encodeURIComponent(file.name)}?download=1">Baixar prova</a>${replacePdfControl("provas", app.selectedProofBank, file.name)}<button class="btn btn-danger btn-small" data-action="delete-proof" data-folder="${attr(app.selectedProofBank)}" data-file="${attr(file.name)}">Excluir</button></div></div>${file.gabarito_arquivo ? `<div class="file-row proof-answer-row"><strong>Gabarito associado · ${file.gabarito_questoes} resposta(s)</strong><a class="btn btn-small" href="/api/arquivos/provas/${encodeURIComponent(app.selectedProofBank)}/${encodeURIComponent(file.gabarito_arquivo)}?download=1">Baixar gabarito</a></div>` : '<div class="muted">Sem gabarito associado</div>'}${proofCorrectionsSection(file, "provas", app.selectedProofBank)}</article>`).join("");
  const pairBanks = [...new Set([...(pairData.bancas || []), ...banks, "Geral"])];
  if (!pairBanks.includes(app.selectedProofAnswerBank)) {
    app.selectedProofAnswerBank = pairData.bancas?.[0] || app.selectedProofBank || "Geral";
  }
  const pairFiles = await api(`/api/provas-com-gabarito?banca=${encodeURIComponent(app.selectedProofAnswerBank)}`);
  const pairBankOptions = pairBanks.map((bank) => `<option value="${attr(bank)}" ${bank === app.selectedProofAnswerBank ? "selected" : ""}>${escapeHtml(visibleName(bank))}</option>`).join("");
  const pairedUpload = `<form id="proof-pair-upload-form" class="form-grid"><div class="field"><label>Banca</label><select name="banca">${pairBankOptions}</select></div><div class="field"><label>Prova em PDF</label><input name="arquivo" type="file" accept=".pdf,application/pdf" required></div><div class="field full"><label>Gabarito em PDF ou TXT (opcional se digitado)</label><input name="arquivo_gabarito" type="file" accept=".pdf,.txt,application/pdf,text/plain"></div>${textArea("Gabarito digitado", "gabarito", "", "Ex.: 1-A, 2: C, 3-ERRADO ou A B C D…")}${textArea("Observações gerais desta prova", "observacoes", "", "Notas gerais vinculadas somente a esta prova; não entram no Caderno de Erros.")}<div class="field full"><button class="btn btn-primary">Salvar prova + gabarito</button></div></form>`;
  const pairRows = (pairFiles.arquivos || []).map((file) => `<article class="data-card proof-pair-card"><div class="file-row"><button class="file-row-name link-button" data-action="preview-file" data-kind="provas-com-gabarito" data-folder="${attr(app.selectedProofAnswerBank)}" data-file="${attr(file.name)}">${escapeHtml(visibleName(file.name))}</button><div class="button-row"><a class="btn btn-small" href="/api/arquivos/provas-com-gabarito/${encodeURIComponent(app.selectedProofAnswerBank)}/${encodeURIComponent(file.name)}" target="_blank" rel="noopener" aria-label="Abrir prova: ${attr(file.name)}">Abrir</a><a class="btn btn-small" href="/api/arquivos/provas-com-gabarito/${encodeURIComponent(app.selectedProofAnswerBank)}/${encodeURIComponent(file.name)}?download=1">Baixar prova</a><a class="btn btn-small" href="/api/arquivos/provas-com-gabarito/${encodeURIComponent(app.selectedProofAnswerBank)}/${encodeURIComponent(file.gabarito_arquivo)}?download=1">Baixar gabarito</a>${replacePdfControl("provas-com-gabarito", app.selectedProofAnswerBank, file.name)}<button class="btn btn-danger btn-small" data-action="delete-proof-with-answer" data-folder="${attr(app.selectedProofAnswerBank)}" data-file="${attr(file.name)}">Excluir</button></div></div><div class="muted">Gabarito associado · ${file.gabarito_questoes} resposta(s)</div><details class="proof-observation-details"><summary>Observações gerais da prova</summary><form class="proof-observation-form section-spacer" data-proof-bank="${attr(app.selectedProofAnswerBank)}" data-proof-file="${attr(file.name)}"><div class="field full"><label>Observações gerais (não vão para o Caderno de Erros)</label><textarea name="observacoes" maxlength="100000" placeholder="Fica vinculada ao PDF e não é adicionada ao Caderno de Erros.">${escapeHtml(file.observacoes || "")}</textarea></div><button class="btn btn-primary btn-small">Salvar observações</button></form></details>${proofCorrectionsSection(file, "provas-com-gabarito", app.selectedProofAnswerBank)}</article>`).join("");
  const preview = app.selectedFile && app.selectedFileKind === "provas"
    ? pdfEditor("provas", `${app.selectedProofBank}/${app.selectedFile}`, "Visualizador de prova")
    : app.selectedFile && app.selectedFileKind === "provas-com-gabarito"
      ? pdfEditor("provas-com-gabarito", `${app.selectedProofAnswerBank}/${app.selectedFile}`, "Visualizador de prova com gabarito")
      : "";
  const pairedSection = `<section class="panel section-spacer"><div class="panel-title"><h3>Provas com gabarito</h3><span class="tag">${(pairFiles.arquivos || []).length} prova(s)</span></div><p class="muted">Arquivos enviados aqui ficam em uma pasta própria, separados por banca. O sistema associa os arquivos sem verificar se o gabarito corresponde às questões.</p><div class="field section-spacer"><label for="proof-answer-bank-select">Banca</label><select class="control" id="proof-answer-bank-select">${pairBankOptions}</select></div>${pairedUpload}<div class="file-list">${pairRows || empty("Nenhuma prova com gabarito nesta banca.")}</div>${preview}</section>`;
  return `${heading("Provas", "Abra PDFs em novas guias; depois de salvar uma cópia editada, use Substituir original. Registre questões erradas por prova no Caderno de Erros.")}${panel("Criar banca", form)}
    <section class="panel section-spacer"><div class="toolbar">${selectField("Banca", "proof-bank-select", banks, app.selectedProofBank)}</div><div class="file-list">${rows || empty("Nenhuma prova cadastrada nesta banca.")}</div>${app.selectedFileKind === "provas" ? preview : ""}</section>${pairedSection}`;
}

async function renderPoints() {
  const rows = await api("/api/pontos");
  const form = `<form id="point-form" class="form-grid"><div class="field"><label>Ano / vigência</label><input name="data" value="${new Date().getFullYear()}"></div><div class="field"><label>Disciplina</label><select name="materia">${[...(app.state.disciplinas || []), "Geral"].map((item) => `<option>${escapeHtml(item)}</option>`).join("")}</select></div><div class="field full"><label>Título / norma</label><input name="titulo" required></div>${textArea("O que mudou e o que observar", "texto")}<div class="field full"><button class="btn btn-primary">Salvar atualização</button></div></form>`;
  const cards = rows.length ? rows.map((item) => `<article class="data-card"><div class="data-card-head"><div><h3>${escapeHtml(item.titulo)}</h3><span class="tag">${escapeHtml(item.materia)} · ${escapeHtml(item.data)}</span></div><button class="btn btn-danger btn-small" data-action="delete-point" data-id="${item.id}">Excluir</button></div><p>${escapeHtml(item.texto)}</p></article>`).join("") : empty("Ainda não há pontos críticos ou atualizações cadastrados.");
  return `${heading("Pontos críticos", "Registre alterações legislativas, jurisprudência e assuntos que merecem revisão.")}${panel("Adicionar atualização", form)}<div class="section-spacer">${cards}</div>`;
}

async function renderStudyPerformance() {
  const data = await api("/api/desempenho");
  const daily = data.daily || [];
  const maxAnswered = Math.max(1, ...daily.map((item) => item.answered));
  const dailyRows = daily.map((item) => {
    const [, month, day] = item.date.split("-");
    const accuracy = item.answered ? Math.round(item.correct / item.answered * 100) : 0;
    return `<div class="daily-performance-row"><span>${day}/${month}</span><div class="daily-performance-track" title="${item.answered} questão(ões), ${accuracy}% de acerto"><i style="width:${Math.max(item.answered ? 3 : 0, item.answered / maxAnswered * 100)}%"></i></div><strong>${item.answered} · ${accuracy}%</strong><small>${formatClock(item.study_seconds)}</small></div>`;
  }).join("");
  const subjects = (data.subjects || []).map((item) =>
    `<div class="subject-row"><div class="subject-label"><span class="subject-name" title="${attr(item.subject)}">${escapeHtml(visibleName(item.subject))}</span><small>${item.correct}/${item.answered} acertos</small></div><div class="bar-track" role="progressbar" aria-label="Aproveitamento em ${attr(item.subject)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${item.accuracy}"><div class="bar-fill" style="width:${item.accuracy}%"></div></div><strong class="subject-percent">${item.accuracy}%</strong></div>`
  ).join("");
  const answered = data.total_answered || 0;
  const accuracy = answered ? Math.round((data.total_correct || 0) / answered * 100) : 0;
  return `${heading("Monitor de desempenho", "Acompanhe questões resolvidas, tempo registrado e aproveitamento nos estudos.")}
    <div class="grid metrics-grid"><article class="metric-card"><div class="metric-label">Questões respondidas</div><div class="metric-value">${answered}</div></article><article class="metric-card"><div class="metric-label">Aproveitamento geral</div><div class="metric-value">${accuracy}%</div></article><article class="metric-card"><div class="metric-label">Tempo cronometrado</div><div class="metric-value performance-time">${formatClock(data.total_study_seconds || 0)}</div></article></div>
    ${panel("Últimos 14 dias", `<div class="daily-performance">${dailyRows}</div>`)}
    ${panel("Desempenho por matéria", subjects || empty("Resolva questões para começar a acompanhar o desempenho."))}`;
}

async function renderDiscursive() {
  const essays = await api("/api/redacoes");
  const form = `<form id="essay-submit-form" class="form-grid"><div class="field full"><label>Título da redação</label><input name="titulo" required maxlength="160" placeholder="Ex.: Tema e data"></div><div class="field full"><label>Redação (.txt, .pdf ou .docx)</label><input name="arquivo" type="file" accept=".txt,.pdf,.docx" required></div><div class="field full"><button class="btn btn-primary">Enviar redação</button></div></form>`;
  const cards = essays.map((essay) => {
    const corrected = essay.corrigido_arquivo
      ? `<a class="btn btn-small" href="/api/arquivos/redacoes/${encodeURIComponent(essay.id)}/${encodeURIComponent(essay.corrigido_arquivo)}?download=1">Baixar redação corrigida</a>${essay.corrigido_arquivo.toLowerCase().endsWith(".pdf") ? `<button class="btn btn-small" data-action="preview-file" data-kind="redacoes" data-folder="${attr(essay.id)}" data-file="${attr(essay.corrigido_arquivo)}">Visualizar e grifar corrigida</button>` : ""}`
      : `<span class="tag">Aguardando correção</span>`;
    const original = `<a class="btn btn-small" href="/api/arquivos/redacoes/${encodeURIComponent(essay.id)}/${encodeURIComponent(essay.original_arquivo)}?download=1">Baixar original</a>${essay.original_arquivo.toLowerCase().endsWith(".pdf") ? `<button class="btn btn-small" data-action="preview-file" data-kind="redacoes" data-folder="${attr(essay.id)}" data-file="${attr(essay.original_arquivo)}">Visualizar e grifar original</button>` : ""}`;
    const correctedStatus = essay.corrigido_arquivo || essay.feedback;
    return `<article class="data-card"><div class="data-card-head"><div><h3>${escapeHtml(visibleName(essay.titulo))}</h3><span class="tag">${escapeHtml(essay.data)}</span></div><span class="tag ${correctedStatus ? "good" : ""}">${correctedStatus ? "Corrigida" : "Enviada"}</span></div><div class="button-row section-spacer">${original}${corrected}</div>${essay.feedback ? `<div class="notice section-spacer"><strong>Comentários da correção</strong><p>${escapeHtml(essay.feedback)}</p></div>` : ""}<form class="essay-correction-form form-grid section-spacer" data-essay-id="${attr(essay.id)}"><div class="field full"><label>Arquivo corrigido (opcional)</label><input name="arquivo_corrigido" type="file" accept=".txt,.pdf,.docx"></div><div class="field full"><label>Comentários / correção em texto</label><textarea name="feedback" rows="4" placeholder="Registre a correção ou observações">${escapeHtml(essay.feedback || "")}</textarea></div><div class="field full"><button class="btn btn-primary">Salvar correção</button></div></form></article>`;
  }).join("");
  const preview = app.selectedFileKind === "redacoes" && app.selectedFile && app.selectedEssayId
    ? pdfEditor("redacoes", `${app.selectedEssayId}/${app.selectedFile}`, "PDF da redação")
    : "";
  return `${heading("Redação discursiva", "Envie suas redações e mantenha os arquivos corrigidos e os comentários organizados.")}${panel("Enviar redação", form)}<section class="section-spacer"><div class="panel-title"><h3>${essays.length} redação(ões)</h3></div>${cards || empty("As redações enviadas aparecerão aqui.")}${preview}</section>`;
}

function renderBackup() {
  return `${heading("Backup e restauração", "Sincronize e recupere seus dados pela pasta Backup_CentralEstudos no Google Drive.")}
    ${panel("Google Drive", `<p class="muted">O backup reúne os dados e materiais de estudo, incluindo questões, legislação, PDFs e redações. Credenciais não são incluídas. A restauração cria uma cópia local de segurança antes de gravar os arquivos.</p><div class="button-row"><button class="btn" data-action="drive-test">Testar conexão</button><button class="btn btn-primary" data-action="drive-backup">Fazer backup na nuvem</button><button class="btn" data-action="drive-restore">Restaurar backup do Drive</button></div><div class="notice" role="status">A conta Google precisa ter permissão de Editor na pasta. Se o escopo OAuth estiver desatualizado, será solicitada nova autorização automaticamente.</div><div class="notice warning">A restauração grava os arquivos do backup sobre os locais correspondentes. Confirme somente se essa for a versão que deseja recuperar.</div>`)}`;
}

function renderSettings() {
  const themeCards = THEMES.map((theme) => `<button class="theme-choice ${app.preferences.tema === theme.id ? "selected" : ""}" data-action="set-theme" data-theme="${theme.id}"><span class="theme-swatch">${theme.colors.map((color) => `<i style="background:${color}"></i>`).join("")}</span><strong>${escapeHtml(theme.name)}</strong><small>${escapeHtml(theme.description)}</small></button>`).join("");
  const modules = MODULES.filter(([name]) => name !== "Configurações").map(([name]) => {
    const item = preferenceModule(name);
    return `<div class="data-card"><div class="panel-title"><h3>${escapeHtml(name)}</h3></div><div class="setting-row"><span><strong>Ocultar envio de arquivos</strong><small>Esconde os controles de upload nesta guia.</small></span><label class="switch"><input type="checkbox" data-pref-module="${attr(name)}" data-pref-key="hide_upload" ${item.hide_upload ? "checked" : ""}><span></span></label></div><div class="setting-row"><span><strong>Ocultar pesquisa</strong><small>Esconde os filtros e campos de busca nesta guia.</small></span><label class="switch"><input type="checkbox" data-pref-module="${attr(name)}" data-pref-key="hide_search" ${item.hide_search ? "checked" : ""}><span></span></label></div></div>`;
  }).join("");
  return `${heading("Configurações", "Personalize a aparência e os controles de cada módulo.")}${panel("Tema visual", `<div class="theme-grid">${themeCards}</div>`)}
    <section class="panel section-spacer"><div class="panel-title"><h3>Posição da navegação</h3></div>
      <div class="setting-row"><span><strong>Exibir módulos no topo</strong><small>Mostra os grupos e subgrupos abaixo do cabeçalho e oculta o menu lateral.</small></span><label class="switch"><input type="checkbox" id="pref-modules-top" ${app.preferences.modules_top ? "checked" : ""}><span></span></label></div>
      <div class="setting-row"><span><strong>Ocultar menu lateral</strong><small>Libera mais espaço para o conteúdo quando os módulos estão na lateral.</small></span><label class="switch"><input type="checkbox" id="pref-sidebar" ${app.preferences.sidebar_hidden || app.preferences.modules_top ? "checked" : ""}><span></span></label></div>
      <div class="setting-row"><span><strong>Iniciar em tela cheia</strong><small>Quando desativado, o programa inicia maximizado. A alteração é aplicada imediatamente.</small></span><label class="switch"><input type="checkbox" id="pref-fullscreen" ${app.preferences.fullscreen ? "checked" : ""}><span></span></label></div>
      <div class="setting-row"><span><strong>Ocultar quadro branco no simulado fechado</strong><small>Remove a área de rascunho com canetas e borracha durante as questões.</small></span><label class="switch"><input type="checkbox" id="pref-whiteboard-enabled" ${app.preferences.whiteboard_enabled !== false ? "checked" : ""}><span></span></label></div>
    </section>
    <section class="panel section-spacer"><div class="panel-title"><h3>Envios e pesquisas por módulo</h3></div><div class="settings-list">${modules}</div></section>
    <div class="notice">Os temas e preferências são salvos neste computador. Arquivos e registros de estudo continuam armazenados na pasta local do aplicativo.</div>`;
}

async function renderUtilities() {
  const groupedImports = app.state.avisos_questoes || [];
  const subjects = [...new Set(app.state.disciplinas || [])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const subjectOptions = subjects.map((subject) => `<option value="${attr(subject)}">${escapeHtml(subject)}</option>`).join("");
  const importWarnings = groupedImports.length
    ? `<div class="notice warning"><strong>Importação antiga precisa ser refeita.</strong> ${groupedImports.map((name) => escapeHtml(name)).join(", ")} contém registros com várias questões agrupadas sob um único gabarito; esses registros foram ignorados. Reenvie o TXT original para importar cada questão separadamente. Os arquivos locais foram preservados.</div>`
    : "";
  return `${heading("Utilidades", "Importe cronogramas e questões em texto e converta PDFs de provas e legislações em materiais de estudo.")}
    ${importWarnings}
    <div class="grid utilities-upload-grid">
      ${panel("Importar cronograma (.txt)", `<p class="muted">Cada linha adiciona um tópico ao cronograma existente. Use UTF-8 e separe os campos por |.</p><pre class="schedule-import-example">Dia | Data | Matéria | Tempo | Observações
Segunda-feira | 09/11/2026 | Direito Constitucional | 1h | Revisar direitos fundamentais</pre><form id="schedule-import-form" class="form-grid" data-module="Utilidades"><div class="field full"><label>Arquivo TXT</label><input name="arquivo" type="file" accept=".txt,text/plain" required></div><div class="field full"><button class="btn btn-primary">Adicionar ao cronograma</button></div></form>`) }
      ${panel("Importar questões (.txt)", `<p class="muted">Aceita linhas <code>enunciado | gabarito | comentário</code>, questões numeradas com <code>Gabarito: A</code> ou uma seção final de gabarito. Alternativas podem usar [A], A) ou A.</p><form id="question-import-form" class="form-grid" data-module="Utilidades"><div class="field"><label>Disciplina (opcional)</label><input name="materia" placeholder="Usa o nome do arquivo se ficar vazio"></div><div class="field"><label>Arquivo TXT (até 5 MB)</label><input name="arquivo" type="file" accept=".txt,text/plain" required></div><label class="setting-row full"><span><strong>Enviar como simulado fechado</strong><small>Arquiva a prova e disponibiliza as questões no treino diário sem alterar seus resultados fechados.</small></span><input name="como_simulado" type="checkbox"></label><div class="field full"><button class="btn btn-primary">Importar questões</button></div></form>`) }
      ${panel("Adicionar questão manualmente", `<p class="muted">Cadastre uma questão diretamente no banco de questões. Ela ficará disponível no Treino Diário.</p><form id="manual-question-form" class="form-grid" data-module="Utilidades"><div class="field"><label for="manual-question-subject">Disciplina existente</label><select id="manual-question-subject" name="materia"><option value="">Selecione uma disciplina</option>${subjectOptions}</select></div><div class="field"><label for="manual-question-new-subject">Ou informe uma nova disciplina</label><input id="manual-question-new-subject" name="nova_materia" placeholder="Ex.: Direito Penal"></div><div class="field full"><label for="enunciado">Enunciado</label><textarea id="enunciado" name="enunciado" placeholder="Digite a questão" required></textarea></div>${textArea("Alternativas (opcional)", "alternativas", "", "Uma por linha: A) texto da alternativa")}<div class="field"><label for="manual-question-answer">Gabarito</label><input id="manual-question-answer" name="gabarito" required placeholder="A, B… ou C/E"></div>${textArea("Comentário (opcional)", "comentario", "", "Explicação ou observação")}<div class="field full"><button class="btn btn-primary">Adicionar questão</button></div></form>`) }
      ${panel("Converter legislação PDF", `<p class="muted">Cria uma pasta da legislação com o texto dividido por artigos. A mesma pasta fica disponível em Lei Seca e na Matriz de Incidência para classificar os graus.</p><form id="law-pdf-convert-form" class="form-grid" data-module="Utilidades"><div class="field"><label>Nome da pasta (opcional)</label><input name="pasta" placeholder="Usa o nome do arquivo"></div><div class="field"><label>Legislação em PDF (texto selecionável)</label><input name="arquivo" type="file" accept=".pdf,application/pdf" required></div><div class="field full"><button class="btn btn-primary">Converter para Lei Seca e Matriz</button></div></form><div class="notice">PDF escaneado exige OCR, que não está disponível. Os artigos importados começam como “Não Classificado” e podem ser graduados na Matriz.</div>`) }
      ${panel("Converter prova PDF em simulado", `<p class="muted">Envie a prova e o gabarito para extrair as questões numeradas em sequência.</p><form id="proof-convert-form" class="form-grid"><div class="field"><label>Disciplina (opcional)</label><input name="materia" placeholder="Usa o nome do PDF se ficar vazio"></div><div class="field"><label>Prova em PDF</label><input name="arquivo" type="file" accept=".pdf" required></div><div class="field full"><label>Gabarito (.txt ou .pdf, opcional se colar abaixo)</label><input name="arquivo_gabarito" type="file" accept=".txt,.pdf"></div>${textArea("Gabarito", "gabarito", "", "Ex.: 1-A, 2: C, 3) ERRADO, 4 – B ou A B C D…")}<label class="setting-row full"><span><strong>Enviar como simulado fechado</strong><small>Arquiva a prova e disponibiliza as questões no treino diário sem alterar os resultados do simulado.</small></span><input name="como_simulado" type="checkbox"></label><div class="field full"><button class="btn btn-primary">Extrair questões</button></div></form>`) }
      ${panel("Transformar prova em TXT", `<p class="muted">Gera um arquivo de texto com enunciados, alternativas e gabarito em seções separadas. O gabarito é opcional.</p><form id="proof-txt-form" class="form-grid" data-module="Utilidades"><div class="field"><label>Prova em PDF</label><input name="arquivo" type="file" accept=".pdf,application/pdf" required></div><div class="field full"><label>Gabarito em PDF ou TXT (opcional se digitado)</label><input name="arquivo_gabarito" type="file" accept=".pdf,.txt,application/pdf,text/plain"></div>${textArea("Gabarito digitado", "gabarito", "", "Ex.: 1-A, 2: C, 3-ERRADO ou A B C D…")}<div class="field full"><button class="btn btn-primary">Baixar prova estruturada em TXT</button></div></form>`) }
    </div><div class="notice warning">A conversão não inventa gabaritos nem faz OCR. Revise as questões importadas e confirme o gabarito antes de usar em simulados.</div>`;
}

let pageRenderSequence = 0;

async function renderPage() {
  const renderSequence = ++pageRenderSequence;
  const page = app.page;
  renderNav();
  const target = $("#page-content");
  captureWhiteboard();
  target.setAttribute("aria-busy", "true");
  target.classList.add("is-loading");
  try {
    let html;
    switch (page) {
      case "Início": html = renderHome(); break;
      case "Treino Diário": html = await renderTraining(); break;
      case "Simulado Fechado": html = await renderSimulation(); break;
      case "Simulados Realizados": html = await renderCompletedSimulations(); break;
      case "Monitor de Desempenho": html = await renderStudyPerformance(); break;
      case "Discursiva": html = await renderDiscursive(); break;
      case "Provas": html = await renderProofs(); break;
      case "Caderno de Erros": html = renderNotes(); break;
      case "Súmulas e Jurisprudência": html = await renderCaseLaw(); break;
      case "Datas & Locais": html = renderContests(); break;
      case "Cronograma": html = renderSchedule(); break;
      case "Metas Concluídas": html = await renderGoals(); break;
      case "Metas Não Concluídas": html = renderIncompleteGoals(); break;
      case "Lei Seca": await loadLaw(); html = renderLaws(); break;
      case "Matriz de Incidência": html = await renderMatrix(); break;
      case "PDFs Pessoais": html = await renderPdfs(); break;
      case "Resumos & Mapas": html = await renderSummaries(); break;
      case "Pontos Críticos": html = await renderPoints(); break;
      case "Utilidades": html = await renderUtilities(); break;
      case "Backup e Restauração": html = renderBackup(); break;
      case "Configurações": html = renderSettings(); break;
      default: html = renderHome();
    }
    if (renderSequence !== pageRenderSequence) return;
    target.innerHTML = html;
    target.classList.remove("is-loading");
    target.removeAttribute("aria-busy");
    initializeWhiteboard();
    applyModuleVisibility();
  } catch (error) {
    if (renderSequence !== pageRenderSequence) return;
    target.innerHTML = `<div class="notice warning"><strong>Não foi possível carregar esta página.</strong><div>${escapeHtml(error.message)}</div><button class="btn btn-small section-spacer" data-action="retry">Tentar novamente</button></div>`;
    target.classList.remove("is-loading");
    target.removeAttribute("aria-busy");
  }
}

function applyModuleVisibility() {
  const mapping = {
    "Lei Seca": { upload: [], search: ["#law-search"] },
    "Matriz de Incidência": { upload: ["#law-upload-form"], search: ["#matrix-search"] },
    "PDFs Pessoais": { upload: ["#pdf-upload-form", ".drive-folder-add", ".pdf-drop-zone"], search: [] },
    "Resumos & Mapas": { upload: ["#summary-upload-form"], search: [] },
    "Provas": { upload: ["#proof-pair-upload-form"], search: [] },
    "Utilidades": { upload: ["#schedule-import-form", "#question-import-form", "#law-pdf-convert-form", "#proof-convert-form", "#proof-txt-form"], search: [] },
    "Discursiva": { upload: ["#essay-submit-form", ".essay-correction-form"], search: [] },
  };
  const settings = mapping[app.page];
  if (!settings) return;
  const preference = preferenceModule(app.page);
  settings.upload.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => element.classList.toggle("search-hidden", preference.hide_upload));
  });
  settings.search.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => element.classList.toggle("search-hidden", preference.hide_search));
  });
  if (app.page === "PDFs Pessoais") {
    document.querySelectorAll("[data-pdf-upload-drop]").forEach((element) => {
      element.classList.toggle("search-hidden", preference.hide_upload);
    });
  }
}

async function savePreferences() {
  applyTheme();
  await api("/api/preferencias", jsonOptions("PUT", app.preferences));
  renderNav();
  applyModuleVisibility();
}

async function applyNativeFullscreen(enabled) {
  const setFullscreen = window.pywebview?.api?.set_fullscreen;
  if (typeof setFullscreen === "function") await setFullscreen(enabled);
}

async function uploadFiles(endpoint, files, fields) {
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  let completedBytes = 0;
  for (const [index, file] of files.entries()) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append("arquivo", file);
    const completedPercent = totalBytes
      ? Math.round(completedBytes / totalBytes * 100)
      : Math.round(index / files.length * 100);
    await uploadRequest(endpoint, form, "POST", {
      index,
      count: files.length,
      totalBytes,
      completedBytes,
      completedPercent,
    });
    completedBytes += file.size;
    const percent = totalBytes
      ? Math.round(completedBytes / totalBytes * 100)
      : Math.round((index + 1) / files.length * 100);
    if (index === files.length - 1) {
      finishUploadProgress(file.name, true, 100, "Envio concluído.");
    } else {
      setUploadProgress(file.name, percent, `Arquivo ${index + 1} de ${files.length} enviado · ${percent}% total`);
    }
  }
}

async function addPdfsToFolder(folder, files) {
  const pdfs = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
  if (!pdfs.length) throw new Error("Selecione arquivos PDF para enviar.");
  await uploadFiles("/api/pdfs/arquivo", pdfs, { pasta: folder });
  app.selectedPdfFolder = folder;
  app.selectedFile = "";
  app.selectedFileKind = "";
  return pdfs.length;
}

async function saveSchedule(day, archiveIndex = -1) {
  const schedule = app.state.cronograma;
  const container = document.querySelector(`[data-schedule-day="${CSS.escape(day)}"]`);
  const rows = [...container.querySelectorAll(".topic-row")].map((row, index) => ({
    id: schedule[day][index]?.id || crypto.randomUUID().slice(0, 8),
    data: dateInputToBrazilian(row.querySelector('[data-field="data"]').value),
    materia: row.querySelector('[data-field="materia"]').value.trim(),
    tempo: row.querySelector('[data-field="tempo"]').value.trim(),
    observacoes: row.querySelector('[data-field="observacoes"]').value.trim(),
  }));
  const removed = archiveIndex >= 0 ? rows.splice(archiveIndex, 1)[0] : null;
  await api("/api/cronograma", jsonOptions("PUT", { ...schedule, [day]: rows }));
  if (removed) await api("/api/metas", jsonOptions("POST", { ...removed, dia_semana: day }));
  await refreshState();
  await renderPage();
}

function readScheduleDay(day) {
  const schedule = app.state.cronograma;
  const container = document.querySelector(`[data-schedule-day="${CSS.escape(day)}"]`);
  return [...container.querySelectorAll(".topic-row")].map((row, index) => ({
    id: schedule[day][index]?.id || crypto.randomUUID().slice(0, 8),
    data: dateInputToBrazilian(row.querySelector('[data-field="data"]').value),
    materia: row.querySelector('[data-field="materia"]').value.trim(),
    tempo: row.querySelector('[data-field="tempo"]').value.trim(),
    observacoes: row.querySelector('[data-field="observacoes"]').value.trim(),
  }));
}

async function handleClick(event) {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) {
    event.preventDefault();
    app.page = pageButton.dataset.page;
    app.selectedFile = "";
    $(".app-shell").classList.remove("mobile-open");
    await renderPage();
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  try {
    if (action === "toggle-timer") {
      syncQuizTimer();
      if (app.timerStartedAt) {
        app.timerElapsed = timerSeconds();
        app.timerStartedAt = 0;
      } else {
        app.timerStartedAt = Date.now();
      }
      syncQuizTimer();
      saveTimer();
      updateTimeDisplays();
    } else if (action === "reset-timer") {
      syncQuizTimer();
      app.timerElapsed = 0;
      app.timerStartedAt = 0;
      syncQuizTimer();
      saveTimer();
      updateTimeDisplays();
      toast("Cronômetro zerado.");
    } else if (action === "change-focus-quote") {
      updateDailyFocus(true);
    } else if (action === "drive-test") {
      button.disabled = true;
      try {
        const result = await api("/api/utilidades/drive-test", { method: "POST" });
        toast(result.mensagem);
      } finally {
        button.disabled = false;
      }
    } else if (action === "drive-backup") {
      button.disabled = true;
      try {
        const result = await api("/api/utilidades/drive-backup", { method: "POST" });
        toast(`Backup concluído: ${result.arquivos.length} arquivo(s) enviados ao Google Drive.`);
      } finally {
        button.disabled = false;
      }
    } else if (action === "drive-restore") {
      if (!confirm("A restauração vai substituir os arquivos locais cobertos pelo backup do Google Drive. Uma cópia local de segurança será criada antes. Deseja continuar?")) return;
      button.disabled = true;
      try {
        const result = await api("/api/utilidades/drive-restore", { method: "POST" });
        await refreshState();
        toast(`Restauração concluída: ${result.arquivos.length} arquivo(s). Cópia local de segurança criada.`);
        await renderPage();
      } finally {
        button.disabled = false;
      }
    } else if (action === "open-pdf-folder") {
      app.selectedPdfFolder = button.dataset.folder;
      app.selectedFile = "";
      app.selectedFileKind = "";
      await renderPage();
    } else if (action === "pick-pdf-folder") {
      const input = [...document.querySelectorAll("[data-pdf-folder-input]")]
        .find((item) => item.dataset.folder === button.dataset.folder);
      input?.click();
    } else if (action === "retry") await renderPage();
    else if (action === "start-training") await startTraining();
    else if (action === "start-simulation") await startSimulation();
    else if (action === "simulation-view-builder") {
      app.simulationView = "builder";
      await renderPage();
    } else if (action === "simulation-view-submitted") {
      app.simulationView = "submitted";
      await renderPage();
    } else if (action === "retry-save-simulation-result") {
      await completeQuiz();
    } else if (action === "start-submitted-simulation") {
      await startSubmittedSimulation(button.dataset.simulationId);
    } else if (action === "delete-submitted-simulation") {
      if (!confirm("Excluir este simulado enviado e apagar também suas tentativas e estatísticas salvas?")) return;
      button.disabled = true;
      try {
        const result = await api(
          `/api/simulados-enviados/${encodeURIComponent(button.dataset.simulationId)}`,
          { method: "DELETE" },
        );
        await renderPage();
        toast(`Simulado removido. ${result.tentativas_removidas} tentativa(s) e estatísticas excluídas.`);
      } finally {
        button.disabled = false;
      }
    }
    else if (action === "answer") await answerQuestion(button.dataset.answer);
    else if (action === "next-question") {
      if (app.quiz.index + 1 >= app.quiz.questions.length) await completeQuiz();
      else {
        await persistSimulationAnswer(app.quiz, app.quiz.index);
        app.quiz.index += 1;
        await renderPage();
      }
    } else if (action === "whiteboard-pen") {
      app.whiteboard.tool = "pen";
      app.whiteboard.color = button.dataset.color;
      await renderPage();
    } else if (action === "whiteboard-eraser") {
      app.whiteboard.tool = "eraser";
      await renderPage();
    } else if (action === "whiteboard-clear") {
      const canvas = $("#simulation-whiteboard");
      if (canvas) {
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        app.whiteboard.image = canvas.toDataURL("image/png");
      } else {
        app.whiteboard.image = "";
      }
      await renderPage();
    } else if (action === "retry-study-time") {
      await recordQuizStudyTime(app.quiz);
      await renderPage();
    } else if (action === "stop-quiz") {
      app.quiz = null;
      clearWhiteboard();
      await renderPage();
    } else if (action === "restart-training" || action === "new-simulation") {
      app.quiz = null;
      clearWhiteboard();
      await renderPage();
    } else if (action === "edit-note") {
      app.editingNoteId = Number(button.dataset.id);
      await renderPage();
    } else if (action === "cancel-note-edit") {
      app.editingNoteId = null;
      await renderPage();
    } else if (action === "edit-proof-correction") {
      const alreadyOnProofPage = app.page === "Provas";
      app.page = "Provas";
      if (button.dataset.kind === "provas") app.selectedProofBank = button.dataset.folder;
      if (button.dataset.kind === "provas-com-gabarito") app.selectedProofAnswerBank = button.dataset.folder;
      const sameCorrection = alreadyOnProofPage && app.editingProofCorrectionId === button.dataset.id;
      app.editingProofCorrectionId = sameCorrection ? "" : button.dataset.id;
      await renderPage();
    } else if (action === "delete-proof-correction") {
      if (!confirm("Excluir esta correção e removê-la do Caderno de Erros?")) return;
      await api("/api/provas/correcoes", jsonOptions("DELETE", {
        id: button.dataset.id,
        tipo_arquivo: button.dataset.kind,
        banca: button.dataset.folder,
        arquivo: button.dataset.file,
      }));
      if (app.editingProofCorrectionId === button.dataset.id) app.editingProofCorrectionId = "";
      await refreshState();
      await renderPage();
      toast("Correção excluída da prova e do Caderno de Erros.");
    } else if (action === "delete-note") {
      if (!confirm("Excluir esta anotação?")) return;
      await api("/api/anotacoes", jsonOptions("DELETE", { id: Number(button.dataset.id) }));
      if (app.editingNoteId === Number(button.dataset.id)) app.editingNoteId = null;
      await refreshState(); await renderPage();
    } else if (action === "download-notes") {
      const subject = $("#notes-export-subject")?.value || "Todas as Matérias";
      const available = (app.state.anotacoes || []).some((item) => subject === "Todas as Matérias" || item.materia === subject);
      if (!available) {
        toast("Não há registros para exportar nessa matéria.", true);
        return;
      }
      const includeQuestion = $("#notes-export-question")?.checked ? "1" : "0";
      button.disabled = true;
      try {
        await downloadFile(`/api/anotacoes/exportar?materia=${encodeURIComponent(subject)}&incluir_questao=${includeQuestion}`);
        toast("Caderno de erros baixado em PDF.");
      } finally {
        button.disabled = false;
      }
    } else if (action === "edit-case-law") {
      app.editingCaseLawId = button.dataset.id;
      await renderPage();
    } else if (action === "cancel-case-law-edit") {
      app.editingCaseLawId = "";
      await renderPage();
    } else if (action === "delete-case-law") {
      if (!confirm("Excluir esta referência?")) return;
      await api("/api/sumulas-jurisprudencia", jsonOptions("DELETE", { id: button.dataset.id }));
      if (app.editingCaseLawId === button.dataset.id) app.editingCaseLawId = "";
      await renderPage();
      toast("Referência excluída.");
    } else if (action === "toggle-payment") {
      const row = app.state.concursos[Number(button.dataset.id)];
      await api("/api/concursos", jsonOptions("PUT", { ...row, status_pagamento: row.status_pagamento === "Pago" ? "Não Pago" : "Pago" }));
      await refreshState(); await renderPage();
    } else if (action === "delete-contest") {
      if (!confirm("Excluir este concurso?")) return;
      await api("/api/concursos", jsonOptions("DELETE", { id: Number(button.dataset.id) }));
      await refreshState(); await renderPage();
    } else if (action === "add-topic") {
      const day = button.dataset.day;
      const schedule = app.state.cronograma;
      schedule[day].push({ id: crypto.randomUUID().slice(0, 8), data: new Date().toLocaleDateString("pt-BR"), materia: "", tempo: "1h", observacoes: "" });
      await api("/api/cronograma", jsonOptions("PUT", schedule));
      await refreshState(); await renderPage();
    } else if (action === "save-day") await saveSchedule(button.dataset.day);
    else if (action === "archive-incomplete-topic") {
      const day = button.dataset.day;
      const index = Number(button.dataset.index);
      const schedule = Object.fromEntries(WEEKDAYS.map((weekday) => [weekday, readScheduleDay(weekday)]));
      const [topic] = schedule[day].splice(index, 1);
      if (!topic) throw new Error("O tópico selecionado não foi encontrado.");
      button.disabled = true;
      try {
        await api("/api/metas-nao-concluidas", jsonOptions("POST", {
          dia: day,
          topico: topic,
          cronograma: schedule,
        }));
        await refreshState();
        await renderPage();
        toast(`"${visibleName(topic.materia || "Tópico")}" foi salvo em Metas Não Concluídas.`);
      } finally {
        button.disabled = false;
      }
    }
    else if (action === "archive-week") {
      const currentSchedule = Object.fromEntries(WEEKDAYS.map((day) => [day, readScheduleDay(day)]));
      const count = Object.values(currentSchedule).flat().filter((topic) => topic.materia || topic.observacoes).length;
      if (!count) {
        toast("Não há tópicos para arquivar.", true);
        return;
      }
      if (!confirm(`Arquivar a semana inteira? ${count} tópico(s) serão movidos para Metas Não Concluídas e removidos do cronograma.`)) return;
      button.disabled = true;
      try {
        const result = await api("/api/cronograma/arquivar-semana", jsonOptions("POST", currentSchedule));
        await refreshState();
        await renderPage();
        toast(`${result.arquivados} tópico(s) movido(s) para Metas Não Concluídas.`);
      } finally {
        button.disabled = false;
      }
    }
    else if (action === "delete-topic") {
      const day = button.dataset.day, index = Number(button.dataset.index);
      app.state.cronograma[day].splice(index, 1);
      await api("/api/cronograma", jsonOptions("PUT", app.state.cronograma));
      await refreshState(); await renderPage();
    } else if (action === "archive-topic") await saveSchedule(button.dataset.day, Number(button.dataset.index));
    else if (action === "delete-goal") {
      if (!confirm("Excluir esta meta concluída?")) return;
      await api("/api/metas", jsonOptions("DELETE", { id: Number(button.dataset.id) }));
      await refreshState(); await renderPage();
    } else if (action === "reopen-completed-goal") {
      if (!confirm("Mover esta meta para Metas Não Concluídas?")) return;
      button.disabled = true;
      try {
        await api("/api/metas", jsonOptions("POST", {
          acao: "reabrir",
          id: Number(button.dataset.id),
        }));
        await refreshState();
        await renderPage();
        toast("Meta movida para Metas Não Concluídas.");
      } finally {
        button.disabled = false;
      }
    } else if (action === "save-weekly-goal-notes") {
      button.disabled = true;
      try {
        const result = await api("/api/metas/observacoes-semanais", jsonOptions("PUT", {
          semana: app.completedGoalsFilter.week,
          observacoes: $("#completed-goals-week-notes")?.value || "",
        }));
        app.completedGoalsFilter.week = result.semana;
        toast("Observações semanais salvas.");
      } finally {
        button.disabled = false;
      }
    } else if (action === "clear-goal-date-filter") {
      app.completedGoalsFilter.from = "";
      app.completedGoalsFilter.to = "";
      await renderPage();
    } else if (action === "delete-incomplete-goal") {
      if (!confirm("Excluir esta meta não concluída?")) return;
      await api("/api/metas-nao-concluidas", jsonOptions("DELETE", { id: Number(button.dataset.id) }));
      await refreshState(); await renderPage();
    } else if (action === "complete-incomplete-goal") {
      if (!confirm("Marcar esta meta como concluída e movê-la para Metas Concluídas?")) return;
      button.disabled = true;
      try {
        await api("/api/metas-nao-concluidas", jsonOptions("POST", {
          acao: "concluir",
          id: Number(button.dataset.id),
        }));
        await refreshState();
        await renderPage();
        toast("Meta movida para Metas Concluídas.");
      } finally {
        button.disabled = false;
      }
    } else if (action === "set-theme") {
      app.preferences.tema = button.dataset.theme;
      await savePreferences(); await renderPage();
    } else if (action === "preview-file") {
      app.selectedFile = button.dataset.file;
      app.selectedFileKind = button.dataset.kind;
      if (button.dataset.kind === "pdfs") {
        app.selectedPdfFolder = button.dataset.folder;
      }
      if (button.dataset.kind === "resumos") app.selectedSummaryFolder = button.dataset.folder;
      if (button.dataset.kind === "provas") app.selectedProofBank = button.dataset.folder;
      if (button.dataset.kind === "provas-com-gabarito") app.selectedProofAnswerBank = button.dataset.folder;
      if (button.dataset.kind === "leis") app.selectedLaw = button.dataset.folder;
      if (button.dataset.kind === "redacoes") app.selectedEssayId = button.dataset.folder;
      await renderPage();
    } else if (action === "replace-pdf") {
      const input = button.closest(".button-row")?.querySelector("[data-replace-pdf]");
      if (!input) throw new Error("Não foi possível abrir o seletor do PDF para substituição.");
      input.click();
    } else if (action === "open-pdf-folder-location") {
      await api("/api/pdfs/abrir-pasta", jsonOptions("POST", { pasta: button.dataset.folder }));
      toast(`Pasta "${visibleName(button.dataset.folder)}" aberta no Explorador de Arquivos.`);
    } else if (action === "delete-pdf") {
      if (!confirm("Remover este PDF da pasta?")) return;
      const params = new URLSearchParams({ pasta: button.dataset.folder, arquivo: button.dataset.file });
      await api(`/api/pdfs/arquivo?${params}`, { method: "DELETE" });
      app.selectedFile = ""; toast("PDF removido."); await renderPage();
    } else if (action === "delete-pdf-folder") {
      const folder = button.dataset.folder;
      if (!confirm(`Remover a pasta "${visibleName(folder)}" e todos os PDFs contidos nela? Essa ação não pode ser desfeita.`)) return;
      const params = new URLSearchParams({ pasta: folder });
      const result = await api(`/api/pdfs/pasta?${params}`, { method: "DELETE" });
      if (app.selectedPdfFolder === folder) app.selectedPdfFolder = "";
      if (app.selectedFileKind === "pdfs" && app.selectedFile) {
        app.selectedFile = "";
        app.selectedFileKind = "";
      }
      await renderPage();
      toast(`Pasta removida. ${result.arquivos_removidos} PDF(s) excluído(s).`);
    } else if (action === "download-summary") {
      const { folder, file } = button.dataset;
      const result = await downloadFile(`/api/arquivos/resumos/${encodeURIComponent(folder)}/${encodeURIComponent(file)}?download=1`);
      toast(result.path ? `Arquivo salvo em ${result.path}.` : "Arquivo baixado.");
    } else if (action === "delete-summary") {
      const { folder, file } = button.dataset;
      if (!confirm(`Excluir "${visibleName(file)}" desta pasta? Essa ação não pode ser desfeita.`)) return;
      const params = new URLSearchParams({ pasta: folder, arquivo: file });
      await api(`/api/resumos/arquivo?${params}`, { method: "DELETE" });
      if (app.selectedFileKind === "resumos" && app.selectedSummaryFolder === folder && app.selectedFile === file) {
        app.selectedFile = "";
        app.selectedFileKind = "";
      }
      await renderPage();
      toast("Arquivo excluído.");
    } else if (action === "delete-proof") {
      if (!confirm(`Excluir a prova "${visibleName(button.dataset.file)}"? Essa ação não pode ser desfeita.`)) return;
      const params = new URLSearchParams({ banca: button.dataset.folder, arquivo: button.dataset.file });
      await api(`/api/provas/arquivo?${params}`, { method: "DELETE" });
      if (app.selectedFileKind === "provas" && app.selectedProofBank === button.dataset.folder && app.selectedFile === button.dataset.file) {
        app.selectedFile = "";
        app.selectedFileKind = "";
      }
      toast("Prova excluída.");
      await renderPage();
    } else if (action === "delete-proof-with-answer") {
      if (!confirm(`Excluir "${visibleName(button.dataset.file)}" e o gabarito associado?`)) return;
      const params = new URLSearchParams({ banca: button.dataset.folder, arquivo: button.dataset.file });
      await api(`/api/provas-com-gabarito/arquivo?${params}`, { method: "DELETE" });
      if (app.selectedFileKind === "provas-com-gabarito" && app.selectedProofAnswerBank === button.dataset.folder && app.selectedFile === button.dataset.file) {
        app.selectedFile = "";
        app.selectedFileKind = "";
      }
      toast("Prova e gabarito excluídos.");
      await renderPage();
    } else if (action === "highlight-selection") {
      const selection = window.getSelection()?.toString().trim();
      if (!selection) return toast("Selecione um trecho da lei antes de grifar.", true);
      const list = getHighlights();
      const color = $("#highlight-color")?.value || "yellow";
      const existing = list.find((item) => item.text === selection);
      if (existing) existing.color = color;
      else list.push({ text: selection, color });
      localStorage.setItem(`central-highlights:${app.selectedLaw}`, JSON.stringify(list));
      toast("Trecho salvo nos grifos.");
      await renderPage();
    } else if (action === "remove-highlight") {
      const list = getHighlights();
      if (list.length) list.pop();
      localStorage.setItem(`central-highlights:${app.selectedLaw}`, JSON.stringify(list));
      toast("Último grifo removido.");
      await renderPage();
    } else if (action === "law-export") {
      button.disabled = true;
      try {
        const result = await submitPdfDownload("/api/leis/pdf", {
          texto: app.lawItems.map((item) => `${item.dispositivo}\n${item.texto}${item.dica ? `\nPonto de atenção: ${item.dica}` : ""}`).join("\n\n"),
          grifos: getHighlights(),
        });
        toast(result?.path ? `PDF com grifos salvo em ${result.path}.` : "PDF com grifos baixado.");
      } finally {
        button.disabled = false;
      }
    } else if (action === "save-law-item") {
      const index = Number(button.dataset.index);
      const row = button.closest(".law-item");
      const body = {
        pasta: app.selectedLaw, arquivo: button.dataset.file, indice: index,
        dispositivo: button.dataset.device,
        grau: row.querySelector("[data-grade]").value,
        observacao: row.querySelector("[data-observation]").value,
      };
      await api("/api/leis/item", jsonOptions("PUT", body));
      toast("Grau e observação salvos."); await renderPage();
    } else if (action === "delete-point") {
      if (!confirm("Excluir esta atualização?")) return;
      await api("/api/pontos", jsonOptions("DELETE", { id: Number(button.dataset.id) }));
      await renderPage();
    }
  } catch (error) {
    toast(error.message, true);
  }
}

async function handleSubmit(event) {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  try {
    if (form.id === "note-form") {
      await api("/api/anotacoes", jsonOptions("POST", Object.fromEntries(data)));
      await refreshState(); toast("Anotação salva.");
    } else if (form.matches(".note-edit-form")) {
      const body = Object.fromEntries(data);
      await api("/api/anotacoes", jsonOptions("PUT", {
        id: Number(form.dataset.noteId),
        materia: body.materia,
        tipo: body.tipo,
        texto: body.texto,
      }));
      app.editingNoteId = null;
      await refreshState();
      await renderPage();
      toast("Erro atualizado.");
    } else if (form.id === "case-law-form") {
      const body = Object.fromEntries(data);
      const editingId = body.id;
      delete body.id;
      await api("/api/sumulas-jurisprudencia", jsonOptions(editingId ? "PUT" : "POST", editingId ? { ...body, id: editingId } : body));
      app.editingCaseLawId = "";
      await renderPage();
      toast(editingId ? "Alterações salvas." : "Referência adicionada.");
    } else if (form.id === "contest-form") {
      await api("/api/concursos", jsonOptions("POST", Object.fromEntries(data)));
      await refreshState(); toast("Concurso cadastrado.");
    } else if (form.id === "law-folder-form") {
      const result = await api("/api/leis/pasta", jsonOptions("POST", Object.fromEntries(data)));
      app.selectedLaw = result.nome; app.lawFilter = ""; await refreshState(); toast("Pasta de legislação criada.");
    } else if (form.id === "law-upload-form") {
      const file = data.get("arquivo");
      const uploadData = new FormData(); uploadData.append("pasta", data.get("pasta")); uploadData.append("arquivo", file);
      await uploadRequest("/api/leis/arquivo", uploadData); app.selectedLaw = data.get("pasta"); toast("Arquivo de legislação enviado.");
    } else if (form.id === "law-item-form") {
      const result = await api("/api/leis/artigo", jsonOptions("POST", Object.fromEntries(data)));
      app.selectedLaw = data.get("pasta"); toast("Dispositivo adicionado.");
    } else if (form.id === "pdf-folder-form") {
      const result = await api("/api/pdfs/pasta", jsonOptions("POST", Object.fromEntries(data)));
      app.selectedPdfFolder = result.nome; app.selectedFile = ""; toast("Pasta criada.");
    } else if (form.id === "pdf-upload-form") {
      const files = data.getAll("arquivos").filter((file) => file.name);
      const count = await addPdfsToFolder(data.get("pasta"), files);
      toast(`${count} PDF(s) enviado(s).`);
    } else if (form.id === "summary-folder-form") {
      const result = await api("/api/resumos/pasta", jsonOptions("POST", Object.fromEntries(data)));
      app.selectedSummaryFolder = result.nome; app.selectedFile = ""; toast("Pasta temática criada.");
    } else if (form.id === "summary-upload-form") {
      const file = data.get("arquivo");
      const uploadData = new FormData(); uploadData.append("pasta", data.get("pasta")); uploadData.append("arquivo", file);
      await uploadRequest("/api/resumos/arquivo", uploadData); app.selectedSummaryFolder = data.get("pasta"); app.selectedFile = ""; toast("Arquivo enviado.");
    } else if (form.id === "bank-form") {
      const result = await api("/api/provas/banca", jsonOptions("POST", Object.fromEntries(data)));
      app.selectedProofBank = result.nome; toast("Banca criada.");
    } else if (form.id === "proof-pair-upload-form") {
      const answerFile = data.get("arquivo_gabarito");
      const answerText = String(data.get("gabarito") || "").trim();
      if (!answerFile?.name && !answerText) throw new Error("Envie o gabarito em PDF/TXT ou digite as respostas.");
      if (answerFile?.name && answerText) throw new Error("Escolha o gabarito em arquivo ou digitado, não nos dois formatos.");
      const uploadData = new FormData();
      uploadData.append("banca", data.get("banca"));
      uploadData.append("arquivo", data.get("arquivo"));
      uploadData.append("gabarito", answerText);
      uploadData.append("observacoes", String(data.get("observacoes") || ""));
      if (answerFile?.name) uploadData.append("arquivo_gabarito", answerFile);
      const result = await uploadRequest("/api/provas-com-gabarito", uploadData);
      app.selectedProofAnswerBank = result.banca;
      app.selectedFile = "";
      app.selectedFileKind = "";
      toast(`Prova e gabarito associados: ${result.gabarito_questoes} resposta(s).`);
    } else if (form.matches(".proof-correction-form")) {
      const correctionId = form.dataset.correctionId || "";
      await api("/api/provas/correcoes", jsonOptions(correctionId ? "PUT" : "POST", {
        id: correctionId,
        tipo_arquivo: form.dataset.proofKind,
        banca: form.dataset.proofBank,
        arquivo: form.dataset.proofFile,
        questao: String(data.get("questao") || ""),
        observacoes: String(data.get("observacoes") || ""),
      }));
      app.editingProofCorrectionId = "";
      await refreshState();
      toast(correctionId ? "Correção atualizada." : "Questão adicionada à prova e ao Caderno de Erros.");
    } else if (form.matches(".proof-observation-form")) {
      const result = await api("/api/provas-com-gabarito/observacoes", jsonOptions("PUT", {
        banca: form.dataset.proofBank,
        arquivo: form.dataset.proofFile,
        observacoes: String(data.get("observacoes") || ""),
      }));
      await refreshState();
      await renderPage();
      toast(result.observacoes ? "Correções da prova salvas." : "Observações da prova removidas.");
    } else if (form.id === "point-form") {
      await api("/api/pontos", jsonOptions("POST", Object.fromEntries(data))); toast("Atualização cadastrada.");
    } else if (form.id === "question-import-form") {
      const uploadData = new FormData();
      uploadData.append("arquivo", data.get("arquivo"));
      uploadData.append("materia", data.get("materia") || "");
      if (data.get("como_simulado")) uploadData.append("como_simulado", "on");
      const result = await uploadRequest("/api/utilidades/questoes", uploadData);
      if (result.simulado) {
        app.page = "Simulado Fechado";
        app.simulationView = "submitted";
        toast(`${result.importadas} questão(ões) salvas em Simulados Enviados.`);
      } else {
        toast(`${result.importadas} questão(ões) importada(s) para ${result.materia}.`);
      }
    } else if (form.id === "manual-question-form") {
      const body = Object.fromEntries(data);
      body.materia = String(body.nova_materia || body.materia || "").trim();
      delete body.nova_materia;
      const result = await api("/api/utilidades/questao-manual", jsonOptions("POST", body));
      form.reset();
      await refreshState();
      await renderPage();
      toast(`Questão adicionada a ${result.materia} e disponível no Treino Diário.`);
    } else if (form.id === "law-pdf-convert-form") {
      const uploadData = new FormData();
      uploadData.append("arquivo", data.get("arquivo"));
      uploadData.append("pasta", data.get("pasta") || "");
      const result = await uploadRequest("/api/utilidades/converter-pdf", uploadData);
      app.selectedLaw = result.pasta;
      app.lawFilter = "";
      app.lawItems = (await api(`/api/leis?pasta=${encodeURIComponent(result.pasta)}`)).itens || [];
      app.page = "Lei Seca";
      toast(`${result.dispositivos} dispositivo(s) convertidos. A pasta também está na Matriz de Incidência.`);
    } else if (form.id === "proof-convert-form") {
      const uploadData = new FormData();
      uploadData.append("arquivo", data.get("arquivo"));
      uploadData.append("materia", data.get("materia") || "");
      uploadData.append("gabarito", data.get("gabarito") || "");
      if (data.get("como_simulado")) uploadData.append("como_simulado", "on");
      const answerFile = data.get("arquivo_gabarito");
      if (answerFile?.name) uploadData.append("arquivo_gabarito", answerFile);
      const result = await uploadRequest("/api/utilidades/prova", uploadData);
      if (result.simulado) {
        app.page = "Simulado Fechado";
        app.simulationView = "submitted";
        toast(`${result.importadas} questão(ões) salvas em Simulados Enviados.`);
      } else {
        toast(`${result.importadas} questão(ões) adicionada(s) ao banco de ${result.materia}.`);
      }
    } else if (form.id === "proof-txt-form") {
      const uploadData = new FormData();
      uploadData.append("arquivo", data.get("arquivo"));
      uploadData.append("gabarito", data.get("gabarito") || "");
      const answerFile = data.get("arquivo_gabarito");
      if (answerFile?.name) uploadData.append("arquivo_gabarito", answerFile);
      const response = await uploadRequest("/api/utilidades/prova-txt", uploadData);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1]
        || `${String(data.get("arquivo").name || "prova").replace(/\.pdf$/i, "")}_estruturada.txt`;
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Arquivo TXT estruturado baixado.");
    } else if (form.id === "schedule-import-form") {
      const uploadData = new FormData();
      uploadData.append("arquivo", data.get("arquivo"));
      const result = await uploadRequest("/api/utilidades/cronograma", uploadData);
      toast(`${result.importados} tópico(s) adicionado(s) ao cronograma.`);
    } else if (form.id === "essay-submit-form") {
      const uploadData = new FormData();
      uploadData.append("titulo", data.get("titulo"));
      uploadData.append("arquivo", data.get("arquivo"));
      const result = await uploadRequest("/api/redacoes", uploadData);
      toast(`Redação "${visibleName(result.titulo)}" enviada.`);
    } else if (form.matches(".essay-correction-form")) {
      const uploadData = new FormData();
      uploadData.append("feedback", data.get("feedback") || "");
      const correctedFile = data.get("arquivo_corrigido");
      if (correctedFile?.name) uploadData.append("arquivo_corrigido", correctedFile);
      const result = await uploadRequest(`/api/redacoes/${encodeURIComponent(form.dataset.essayId)}`, uploadData, "PUT");
      toast(`Correção de "${visibleName(result.titulo)}" salva.`);
    }
    await refreshState();
    await renderPage();
  } catch (error) {
    toast(error.message, true);
  }
}

let lawSearchTimer;
let noteSearchTimer;
let caseLawSearchTimer;
document.addEventListener("click", async (event) => {
  const link = event.target.closest("a[href]");
  const nativeDownload = window.pywebview?.api?.download_endpoint;
  if (!link || typeof nativeDownload !== "function") return;
  let url;
  try {
    url = new URL(link.href, location.href);
  } catch {
    return;
  }
  if (url.origin !== location.origin) return;
  const isStoredFile = url.pathname.startsWith("/api/arquivos/") && url.searchParams.get("download") === "1";
  const isMatrixPdf = url.pathname === "/api/leis/matriz-pdf";
  if (!isStoredFile && !isMatrixPdf) return;

  event.preventDefault();
  link.setAttribute("aria-disabled", "true");
  try {
    const result = await nativeDownload(`${url.pathname}${url.search}`, "GET", null);
    toast(result.path ? `Arquivo salvo em ${result.path}.` : "Arquivo baixado.");
  } catch (error) {
    toast(error.message || "Não foi possível baixar o arquivo.", true);
  } finally {
    link.removeAttribute("aria-disabled");
  }
}, true);
document.addEventListener("click", (event) => {
  const summary = event.target.closest(".schedule-day[data-schedule-day-group] > summary");
  if (!summary) return;
  window.setTimeout(() => {
    app.scheduleOpenDays = [...document.querySelectorAll(".schedule-day[data-schedule-day-group]")]
      .filter((day) => day.open)
      .map((day) => day.dataset.scheduleDayGroup);
  }, 0);
});
document.addEventListener("click", handleClick);
document.addEventListener("submit", handleSubmit);
document.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.matches("[data-replace-pdf]")) {
    const replacement = target.files?.[0];
    if (!replacement) return;
    try {
      if (!confirm(`Substituir "${visibleName(target.dataset.file)}" pelo PDF selecionado? O conteúdo original será sobrescrito na pasta do app.`)) return;
      const { kind, folder, file } = target.dataset;
      if (!["pdfs", "provas", "provas-com-gabarito"].includes(kind)) {
        throw new Error("Este tipo de arquivo não permite substituição.");
      }
      const uploadData = new FormData();
      uploadData.append("arquivo", replacement);
      const endpoint = `/api/arquivos/${kind}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`;
      await uploadRequest(endpoint, uploadData, "PUT");
      await refreshState();
      await renderPage();
      toast(`PDF "${visibleName(file)}" substituído na pasta original.`);
    } catch (error) {
      toast(error.message, true);
    } finally {
      target.value = "";
    }
  } else if (target.matches("[data-pdf-folder-input]")) {
    try {
      const count = await addPdfsToFolder(target.dataset.folder, [...target.files]);
      toast(`${count} PDF(s) adicionado(s) à pasta.`);
      await refreshState();
      await renderPage();
    } catch (error) {
      toast(error.message, true);
    } finally {
      target.value = "";
    }
  } else if (target.id === "law-select") {
    app.selectedLaw = target.value; app.lawFilter = ""; await renderPage();
  } else if (target.id === "pdf-folder-select") {
    app.selectedPdfFolder = target.value; app.selectedFile = ""; app.selectedFileKind = ""; await renderPage();
  } else if (target.id === "summary-folder-select") {
    app.selectedSummaryFolder = target.value; app.selectedFile = ""; app.selectedFileKind = ""; await renderPage();
  } else if (target.id === "proof-bank-select") {
    app.selectedProofBank = target.value; app.selectedFile = ""; app.selectedFileKind = ""; await renderPage();
  } else if (target.id === "proof-answer-bank-select") {
    app.selectedProofAnswerBank = target.value; app.selectedFile = ""; app.selectedFileKind = ""; await renderPage();
  } else if (target.id === "completed-goals-week") {
    app.completedGoalsFilter.week = isoWeekStartDate(target.value);
    if (!app.completedGoalsFilter.week) {
      toast("Selecione uma semana válida.", true);
      return;
    }
    await renderPage();
  } else if (target.id === "completed-goals-from") {
    app.completedGoalsFilter.from = target.value;
    await renderPage();
  } else if (target.id === "completed-goals-to") {
    app.completedGoalsFilter.to = target.value;
    await renderPage();
  } else if (target.id === "notes-filter-subject") {
    app.noteFilter.subject = target.value; await renderPage();
  } else if (target.id === "notes-filter-type") {
    app.noteFilter.type = target.value; await renderPage();
  } else if (target.id === "case-law-filter-category") {
    app.caseLawFilter.category = target.value; await renderPage();
  } else if (target.id === "simulation-results-filter") {
    app.simulationResultsFilter = target.value;
    await renderPage();
  } else if (target.matches("[data-incidence-grade]")) {
    target.className = `matrix-grade-control grade-${incidenceColor(target.value)}`;
  } else if (target.id === "pref-sidebar") {
    app.preferences.sidebar_hidden = target.checked;
    if (!target.checked) app.preferences.modules_top = false;
    await savePreferences();
  } else if (target.id === "pref-modules-top") {
    app.preferences.modules_top = target.checked;
    app.preferences.sidebar_hidden = target.checked;
    await savePreferences();
  } else if (target.id === "pref-fullscreen") {
    const previous = !target.checked;
    app.preferences.fullscreen = target.checked;
    try {
      await savePreferences();
      await applyNativeFullscreen(target.checked);
    } catch (error) {
      app.preferences.fullscreen = previous;
      target.checked = previous;
      try { await savePreferences(); }
      catch (saveError) { toast(saveError.message, true); }
      toast(error.message, true);
    }
  } else if (target.id === "pref-whiteboard-enabled") {
    app.preferences.whiteboard_enabled = target.checked;
    try { await savePreferences(); }
    catch (error) {
      app.preferences.whiteboard_enabled = !target.checked;
      target.checked = !target.checked;
      toast(error.message, true);
    }
  } else if (target.dataset.prefModule) {
    const setting = preferenceModule(target.dataset.prefModule);
    setting[target.dataset.prefKey] = target.checked;
    try { await savePreferences(); }
    catch (error) { toast(error.message, true); }
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "law-search" || event.target.id === "matrix-search") {
    app.lawFilter = event.target.value;
    const searchId = event.target.id;
    const caret = event.target.selectionStart;
    clearTimeout(lawSearchTimer);
    lawSearchTimer = setTimeout(async () => {
      await renderPage();
      const input = $(`#${searchId}`);
      if (input) {
        input.focus();
        input.setSelectionRange(caret, caret);
      }
    }, 260);
  } else if (event.target.id === "notes-filter-search" || event.target.id === "case-law-filter-search") {
    const isNotesFilter = event.target.id === "notes-filter-search";
    const searchId = event.target.id;
    const caret = event.target.selectionStart;
    if (isNotesFilter) app.noteFilter.query = event.target.value;
    else app.caseLawFilter.query = event.target.value;
    const timerName = isNotesFilter ? "noteSearchTimer" : "caseLawSearchTimer";
    clearTimeout(isNotesFilter ? noteSearchTimer : caseLawSearchTimer);
    const timer = setTimeout(async () => {
      await renderPage();
      const input = $(`#${searchId}`);
      if (input) {
        input.focus();
        input.setSelectionRange(caret, caret);
      }
    }, 220);
    if (timerName === "noteSearchTimer") noteSearchTimer = timer;
    else caseLawSearchTimer = timer;
  }
});
document.addEventListener("dragover", (event) => {
  const zone = event.target.closest("[data-drop]");
  if (zone && !zone.classList.contains("search-hidden")) { event.preventDefault(); zone.classList.add("drag-over"); }
});
document.addEventListener("dragleave", (event) => {
  const zone = event.target.closest("[data-drop]");
  if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
});
document.addEventListener("drop", async (event) => {
  const zone = event.target.closest("[data-drop]");
  if (!zone || zone.classList.contains("search-hidden")) return;
  event.preventDefault();
  zone.classList.remove("drag-over");
  try {
    const count = await addPdfsToFolder(zone.dataset.folder, [...event.dataTransfer.files]);
    toast(`${count} PDF(s) adicionado(s) à pasta.`);
    await renderPage();
  } catch (error) { toast(error.message, true); }
});
$("#mobile-menu").addEventListener("click", () => $(".app-shell").classList.toggle("mobile-open"));
$("#mobile-backdrop").addEventListener("click", () => $(".app-shell").classList.remove("mobile-open"));

async function init() {
  try {
    loadTimer();
    updateTimeDisplays();
    window.setInterval(updateTimeDisplays, 1000);
    app.preferences = await api("/api/preferencias");
    app.preferences = { tema: "black-red", modules: {}, whiteboard_enabled: true, fullscreen: false, ...app.preferences };
    applyTheme();
    await refreshState();
    await renderPage();
  } catch (error) {
    $("#page-content").innerHTML = `<div class="notice warning"><strong>Não foi possível conectar ao servidor local.</strong><div>${escapeHtml(error.message)}</div><p>Feche esta janela e inicie o aplicativo pelo arquivo <code>iniciar_app.bat</code>.</p></div>`;
  }
}
init();
