/**
 * ============================================================================
 * CENTRAL DE ESTUDOS (estuda.gov.br) — BACKEND 100% GOOGLE APPS SCRIPT
 * Arquitetura Serverless Headless: Google Drive + Planilha Oculta
 * Versão: 2.0.0
 * ============================================================================
 *
 * COMO IMPLANTAR / ATUALIZAR (MANTENDO A MESMA URL /exec):
 * 1. Abra seu projeto em https://script.google.com
 * 2. Substitua todo o conteúdo de Code.gs por este código completo.
 * 3. Ajuste AUTH_USER e AUTH_PASS abaixo se desejar personalizar sua senha.
 * 4. Clique em "Salvar" (Ctrl+S).
 * 5. Clique em "Implantar" -> "Gerenciar implantações" -> ícone de lápis (Editar).
 * 6. Em "Versão", selecione "Nova versão" e clique em "Implantar".
 *    (Mantenha: Executar como = "Eu" | Quem pode acessar = "Qualquer pessoa").
 * 7. Se pedir autorização na primeira vez, autorize o acesso ao Drive e Planilhas.
 * ============================================================================
 */

var CONFIG = {
  APP_VERSION: '2.0.0',
  // Credenciais de acesso universal (use em qualquer computador ou celular)
  AUTH_USER: 'estudos.halberes@gmail.com',
  AUTH_USER_ALIASES: ['estudos.halberes@gmail.com', 'halberes', 'ayla.tayna22@gmail.com'],
  AUTH_PASS: 'estuda2026',

  // Pasta padrão no Google Drive (opcionalmente fixe um ID específico ou configure pelo site)
  DEFAULT_ROOT_FOLDER_NAME: 'Central de Estudos - Materiais',
  DEFAULT_ROOT_FOLDER_ID: '',

  // Planilha oculta usada como banco relacional estruturado no backend
  HIDDEN_SHEET_NAME: '_estuda_gov_br_db_oculto',

  // Arquivos canônicos no Google Drive
  SYNC_FILENAME: 'central_estudos_sync_latest.json',
  POST_IT_FILENAME: 'Post-it.txt',
  AUDIT_LOG_FILENAME: '_sync_audit_log.json',
  MAX_AUDIT_LOG_ENTRIES: 250,

  // Controle de sessão e backups rotativos
  SESSION_TTL_DAYS: 30,
  MAX_ROTATING_BACKUPS: 15,
  AUTO_BACKUP_INTERVAL_MS: 30 * 60 * 1000,
  LOCK_WAIT_MS: 25000,
};

var PROP_KEYS = {
  ROOT_FOLDER_ID: 'CE_ROOT_FOLDER_ID',
  SHEET_ID: 'CE_HIDDEN_SHEET_ID',
  SERVER_VERSION: 'CE_SERVER_VERSION',
  LAST_UPDATED_AT: 'CE_LAST_UPDATED_AT',
  LAST_CONTENT_HASH: 'CE_LAST_CONTENT_HASH',
  LAST_AUTO_BACKUP_MS: 'CE_LAST_AUTO_BACKUP_MS',
  SESSIONS_JSON: 'CE_ACTIVE_SESSIONS_V2',
  AUTH_PASS_OVERRIDE: 'CE_AUTH_PASS_OVERRIDE',
  CHUNK_PREFIX: 'CE_CHUNK_UPLOAD_',
};

var SUBFOLDERS = [
  'Backups',
  'PDFs Pessoais',
  'Lei Seca',
  'Provas',
  'Resumos e Mapas',
  'Discursivas',
  'Cronograma',
  'Editais',
  'Datas e Locais',
];

// ============================================================================
// ENTRYPOINTS HTTP (doGet / doPost)
// ============================================================================

function doGet(e) {
  try {
    var folder = getOrCreateRootFolder_();
    var props = PropertiesService.getScriptProperties();
    return jsonResponse_({
      ok: true,
      service: 'Central de Estudos - Google Apps Script Headless Backend',
      version: CONFIG.APP_VERSION,
      serverVersion: Number(props.getProperty(PROP_KEYS.SERVER_VERSION) || '0'),
      lastUpdatedAt: props.getProperty(PROP_KEYS.LAST_UPDATED_AT) || null,
      folderName: folder.getName(),
      folderId: folder.getId(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return jsonResponse_({
      ok: false,
      code: 'HEALTH_ERROR',
      error: String(err && err.message ? err.message : err),
    });
  }
}

function doPost(e) {
  var body = {};
  try {
    var raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : '{}';
    body = JSON.parse(raw);
  } catch (parseErr) {
    return jsonResponse_({
      ok: false,
      code: 'INVALID_JSON',
      error: 'Corpo da requisição JSON inválido.',
    });
  }

  var action = String(body.action || '').trim();
  if (!action) {
    return jsonResponse_({ ok: false, code: 'MISSING_ACTION', error: 'Ação não informada.' });
  }

  try {
    // Rotas públicas (ping e login)
    if (action === 'ping') {
      return handlePing_();
    }
    if (action === 'login') {
      return handleLogin_(body);
    }

    // Validação obrigatória de sessão para todas as demais rotas
    var authResult = validateSession_(body);
    if (!authResult.ok) {
      return jsonResponse_({
        ok: false,
        code: 'UNAUTHORIZED',
        error: authResult.error || 'Sessão inválida ou expirada. Faça login novamente.',
      });
    }

    var startedAtMs = Date.now();
    var deviceId = String(body.deviceId || 'web').trim();
    var output = dispatchAuthenticatedAction_(action, body, authResult.username);

    // Registra log estruturado de auditoria (Leitura/Escrita + Sucesso/Falha) no Google Drive
    if (shouldRecordSyncAudit_(action)) {
      recordAuditFromOutput_(action, authResult.username, deviceId, output, Date.now() - startedAtMs);
    }

    return output;
  } catch (err) {
    var errMsg = String(err && err.message ? err.message : err);
    if (shouldRecordSyncAudit_(action)) {
      appendSyncAuditEntry_({
        action: action,
        status: 'FAILURE',
        reason: errMsg,
        username: String(body.username || ''),
        deviceId: String(body.deviceId || 'web'),
        durationMs: 0,
      });
    }
    return jsonResponse_({
      ok: false,
      code: 'SERVER_ERROR',
      error: errMsg,
    });
  }
}

function dispatchAuthenticatedAction_(action, body, username) {
  switch (action) {
    case 'logout':
      return handleLogout_(body, username);
    case 'changePassword':
      return handleChangePassword_(body, username);
    case 'pullState':
      return handlePullState_(body, username);
    case 'inspectVersion':
      return handleInspectVersion_();
    case 'pushState':
      return handlePushState_(body, username);
    case 'createBackup':
      return handleCreateBackup_(body, username);
    case 'listBackups':
      return handleListBackups_();
    case 'downloadBackup':
      return handleDownloadBackup_(body);
    case 'deleteBackup':
      return handleDeleteBackup_(body, username);
    case 'pruneBackups':
      return handlePruneBackups_(body, username);
    case 'uploadFile':
      return handleUploadFile_(body, username);
    case 'uploadFileChunk':
      return handleUploadFileChunk_(body);
    case 'finalizeChunkedUpload':
      return handleFinalizeChunkedUpload_(body, username);
    case 'listFiles':
      return handleListFiles_();
    case 'downloadFile':
      return handleDownloadFile_(body);
    case 'deleteFile':
      return handleDeleteFile_(body, username);
    case 'readPostIt':
      return handleReadPostIt_();
    case 'savePostIt':
      return handleSavePostIt_(body, username);
    case 'setStudyFolder':
      return handleSetStudyFolder_(body, username);
    case 'listConflicts':
      return handleListConflicts_();
    case 'resolveConflict':
      return handleResolveConflict_(body, username);
    case 'listAuditLogs':
      return handleListAuditLogs_(body);
    case 'setupDailyBackupTrigger':
      return handleSetupDailyBackupTrigger_(username);
    default:
      return jsonResponse_({
        ok: false,
        code: 'UNKNOWN_ACTION',
        error: 'Ação não reconhecida: ' + action,
      });
  }
}

function shouldRecordSyncAudit_(action) {
  return action !== 'ping' && action !== 'listAuditLogs' && action !== 'uploadFileChunk';
}

function classifyAuditAction_(action) {
  var readMap = {
    pullState: 'Leitura do estado principal',
    inspectVersion: 'Verificação de versão remota',
    listFiles: 'Listagem de arquivos do Drive',
    listBackups: 'Listagem de backups',
    downloadFile: 'Download de arquivo do Drive',
    downloadBackup: 'Download de backup JSON',
    readPostIt: 'Leitura do Post-it.txt',
    listConflicts: 'Consulta de histórico de conflitos',
    login: 'Autenticação de sessão',
  };
  var writeMap = {
    pushState: 'Salvamento do banco na nuvem',
    createBackup: 'Criação de snapshot de backup',
    deleteBackup: 'Exclusão de backup',
    pruneBackups: 'Limpeza de backups antigos',
    uploadFile: 'Envio de arquivo ao Drive',
    finalizeChunkedUpload: 'Envio de arquivo grande (em partes)',
    deleteFile: 'Exclusão de arquivo no Drive',
    savePostIt: 'Salvamento do Post-it.txt',
    setStudyFolder: 'Alteração da pasta padrão do Drive',
    resolveConflict: 'Resolução de conflito de versão',
    setupDailyBackupTrigger: 'Ativação de backup diário',
    logout: 'Encerramento de sessão',
    changePassword: 'Alteração de senha',
  };
  if (readMap[action]) return { operationType: 'READ', actionLabel: readMap[action] };
  if (writeMap[action]) return { operationType: 'WRITE', actionLabel: writeMap[action] };
  return { operationType: 'WRITE', actionLabel: String(action || 'Operação') };
}

function recordAuditFromOutput_(action, username, deviceId, textOutput, durationMs) {
  try {
    var parsed = JSON.parse(textOutput.getContent());
    var isOk = Boolean(parsed && parsed.ok);
    var reason = isOk
      ? buildAuditSuccessReason_(action, parsed)
      : String((parsed && (parsed.error || parsed.code)) || 'Operação recusada pelo servidor');
    appendSyncAuditEntry_({
      action: action,
      status: isOk ? 'SUCCESS' : 'FAILURE',
      reason: reason,
      details: parsed && parsed.code ? 'Código: ' + parsed.code : '',
      username: username,
      deviceId: deviceId,
      serverVersion: typeof (parsed && parsed.serverVersion) === 'number' ? parsed.serverVersion : null,
      durationMs: durationMs,
    });
  } catch (e) {
    // Nunca interrompe resposta principal
  }
}

function buildAuditSuccessReason_(action, parsed) {
  if (action === 'pushState' && typeof parsed.serverVersion === 'number') {
    return 'Estado salvo na nuvem (versão v' + parsed.serverVersion + ')';
  }
  if (action === 'pullState') {
    return parsed.payload
      ? 'Estado carregado do Drive (versão v' + (parsed.serverVersion || 0) + ')'
      : 'Pasta verificada (sem snapshot prévio)';
  }
  if (action === 'listFiles' && parsed.files) {
    return parsed.files.length + ' arquivo(s) listado(s) no Drive' + (parsed.truncated ? ' (parcial)' : '');
  }
  if (action === 'uploadFile' || action === 'finalizeChunkedUpload') {
    return 'Arquivo salvo: ' + ((parsed.file && parsed.file.name) || 'arquivo');
  }
  if (action === 'createBackup') {
    return 'Backup criado: ' + ((parsed.file && parsed.file.name) || 'snapshot');
  }
  return 'Operação concluída com sucesso';
}

function appendSyncAuditEntry_(input) {
  try {
    var folder = getOrCreateRootFolder_();
    var backupsFolder = getOrCreateSubfolder_(folder, 'Backups');
    var meta = classifyAuditAction_(input.action);
    var entry = {
      id: Utilities.getUuid(),
      timestamp: new Date().toISOString(),
      operationType: meta.operationType,
      action: String(input.action || ''),
      actionLabel: meta.actionLabel,
      status: input.status === 'FAILURE' ? 'FAILURE' : 'SUCCESS',
      reason: String(input.reason || '').slice(0, 400),
      details: String(input.details || '').slice(0, 400),
      username: String(input.username || ''),
      deviceId: String(input.deviceId || 'web'),
      serverVersion: typeof input.serverVersion === 'number' ? input.serverVersion : null,
      durationMs: typeof input.durationMs === 'number' ? Math.round(input.durationMs) : null,
      source: 'drive-script',
    };

    var existingFile = findLatestFileByName_(backupsFolder, CONFIG.AUDIT_LOG_FILENAME);
    var entries = [];
    if (existingFile) {
      try {
        var parsed = JSON.parse(existingFile.getBlob().getDataAsString('UTF-8'));
        if (parsed && Array.isArray(parsed.logs)) {
          entries = parsed.logs;
        } else if (Array.isArray(parsed)) {
          entries = parsed;
        }
      } catch (parseErr) {
        entries = [];
      }
    }

    entries.unshift(entry);
    if (entries.length > CONFIG.MAX_AUDIT_LOG_ENTRIES) {
      entries = entries.slice(0, CONFIG.MAX_AUDIT_LOG_ENTRIES);
    }

    var doc = {
      version: 1,
      updatedAt: entry.timestamp,
      total: entries.length,
      logs: entries,
    };
    upsertTextFile_(backupsFolder, CONFIG.AUDIT_LOG_FILENAME, JSON.stringify(doc), 'application/json');
  } catch (e) {
    // Log de auditoria nunca derruba operação principal
  }
}

function handleListAuditLogs_(body) {
  var limit = Math.max(10, Math.min(250, Number((body && body.limit) || 150)));
  var folder = getOrCreateRootFolder_();
  var backupsFolder = getOrCreateSubfolder_(folder, 'Backups');
  var auditFile = findLatestFileByName_(backupsFolder, CONFIG.AUDIT_LOG_FILENAME);
  var logs = [];
  var source = 'drive-json';
  var fileId = null;
  var updatedAt = null;

  if (auditFile) {
    fileId = auditFile.getId();
    updatedAt = auditFile.getLastUpdated().toISOString();
    try {
      var parsed = JSON.parse(auditFile.getBlob().getDataAsString('UTF-8'));
      var arr = parsed && Array.isArray(parsed.logs) ? parsed.logs : Array.isArray(parsed) ? parsed : [];
      logs = arr.slice(0, limit);
    } catch (e) {
      logs = [];
    }
  }

  // Fallback/complemento com tb_logs_acesso caso o arquivo JSON ainda esteja vazio
  if (logs.length === 0) {
    try {
      var ss = ensureHiddenSpreadsheet_(folder);
      var sheet = ss.getSheetByName('tb_logs_acesso');
      if (sheet && sheet.getLastRow() >= 2) {
        source = 'sheet';
        var rows = sheet.getDataRange().getValues();
        for (var i = rows.length - 1; i >= 1 && logs.length < limit; i--) {
          var row = rows[i];
          var act = String(row[4] || '');
          var meta = classifyAuditAction_(act);
          var rawStatus = String(row[5] || 'OK').toUpperCase();
          logs.push({
            id: String(row[0] || Utilities.getUuid()),
            timestamp: String(row[1] || ''),
            operationType: meta.operationType,
            action: act,
            actionLabel: meta.actionLabel,
            status: rawStatus === 'OK' || rawStatus === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
            reason: String(row[6] || (rawStatus === 'OK' ? 'Operação concluída' : 'Falha registrada')),
            username: String(row[2] || ''),
            deviceId: String(row[3] || 'web'),
            source: 'drive-script',
          });
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return jsonResponse_({
    ok: true,
    logs: logs,
    source: source,
    fileId: fileId,
    updatedAt: updatedAt,
  });
}

// ============================================================================
// AUTENTICAÇÃO UNIVERSAL (USUÁRIO + SENHA -> TOKEN 30 DIAS)
// ============================================================================

function getEffectivePassword_() {
  var override = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.AUTH_PASS_OVERRIDE);
  return override && override.trim() ? override.trim() : CONFIG.AUTH_PASS;
}

function isAllowedUsername_(username) {
  var clean = String(username || '').trim().toLowerCase();
  if (!clean) return false;
  if (clean === String(CONFIG.AUTH_USER).trim().toLowerCase()) return true;
  for (var i = 0; i < CONFIG.AUTH_USER_ALIASES.length; i++) {
    if (clean === String(CONFIG.AUTH_USER_ALIASES[i]).trim().toLowerCase()) return true;
  }
  return false;
}

function loadSessionsMap_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.SESSIONS_JSON);
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveSessionsMap_(map) {
  var now = Date.now();
  var cleaned = {};
  var keys = Object.keys(map || {});
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var item = map[k];
    if (item && item.expiresAt && item.expiresAt > now) {
      cleaned[k] = item;
    }
  }
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.SESSIONS_JSON, JSON.stringify(cleaned));
}

function validateSession_(body) {
  var token = String(body.sessionToken || '').trim();
  if (token) {
    var sessions = loadSessionsMap_();
    var entry = sessions[token];
    if (entry && entry.expiresAt && entry.expiresAt > Date.now()) {
      return { ok: true, username: entry.username || CONFIG.AUTH_USER };
    }
  }

  // Fallback direto com username + password se enviado
  var user = String(body.username || '').trim();
  var pass = String(body.password || '').trim();
  if (user && pass && isAllowedUsername_(user) && pass === getEffectivePassword_()) {
    return { ok: true, username: user.toLowerCase() };
  }

  return { ok: false, error: 'Sessão expirada ou credenciais inválidas.' };
}

function handlePing_() {
  var folder = getOrCreateRootFolder_();
  var props = PropertiesService.getScriptProperties();
  return jsonResponse_({
    ok: true,
    version: CONFIG.APP_VERSION,
    serverVersion: Number(props.getProperty(PROP_KEYS.SERVER_VERSION) || '0'),
    lastUpdatedAt: props.getProperty(PROP_KEYS.LAST_UPDATED_AT) || null,
    folderId: folder.getId(),
    folderName: folder.getName(),
    folderUrl: folder.getUrl(),
    timestamp: new Date().toISOString(),
  });
}

function handleLogin_(body) {
  var username = String(body.username || '').trim();
  var password = String(body.password || '').trim();
  var deviceId = String(body.deviceId || 'web').trim();

  if (!isAllowedUsername_(username) || password !== getEffectivePassword_()) {
    appendAccessLog_(username || 'desconhecido', deviceId, 'login', 'ERROR', 'Credenciais inválidas');
    return jsonResponse_({
      ok: false,
      code: 'INVALID_CREDENTIALS',
      error: 'Usuário ou senha incorretos.',
    });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_WAIT_MS);
  try {
    var folder = getOrCreateRootFolder_();
    ensureSubfolders_(folder);
    ensureHiddenSpreadsheet_(folder);

    var token = Utilities.getUuid() + '_' + Utilities.getUuid().replace(/-/g, '');
    var expiresAt = Date.now() + CONFIG.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
    var sessions = loadSessionsMap_();
    sessions[token] = {
      username: username.toLowerCase(),
      deviceId: deviceId,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt,
    };
    saveSessionsMap_(sessions);

    appendAccessLog_(username.toLowerCase(), deviceId, 'login', 'OK', 'Autenticação concluída');

    var stateInfo = readCanonicalState_(folder);
    var postIt = readPostItInternal_(folder);
    var conflicts = readRecentConflicts_(25);

    return jsonResponse_({
      ok: true,
      version: CONFIG.APP_VERSION,
      sessionToken: token,
      expiresAt: expiresAt,
      username: username.toLowerCase(),
      displayName: username.indexOf('@') > -1 ? username.split('@')[0] : username,
      folderId: folder.getId(),
      folderName: folder.getName(),
      folderUrl: folder.getUrl(),
      serverVersion: stateInfo.serverVersion,
      updatedAt: stateInfo.updatedAt,
      contentHash: stateInfo.contentHash,
      controlSheetVersion: stateInfo.controlSheet ? stateInfo.controlSheet.version : stateInfo.serverVersion,
      controlSheetHash: stateInfo.controlSheet ? stateInfo.controlSheet.contentHash : stateInfo.contentHash,
      payload: stateInfo.payload,
      summary: stateInfo.summary,
      postIt: postIt,
      conflicts: conflicts,
    });
  } finally {
    lock.releaseLock();
  }
}

function handleLogout_(body, username) {
  var token = String(body.sessionToken || '').trim();
  var deviceId = String(body.deviceId || 'web').trim();
  if (token) {
    var sessions = loadSessionsMap_();
    delete sessions[token];
    saveSessionsMap_(sessions);
  }
  appendAccessLog_(username, deviceId, 'logout', 'OK', 'Sessão encerrada');
  return jsonResponse_({ ok: true });
}

function handleChangePassword_(body, username) {
  var currentPass = String(body.currentPassword || '').trim();
  var nextPass = String(body.newPassword || '').trim();
  if (currentPass !== getEffectivePassword_()) {
    return jsonResponse_({ ok: false, code: 'INVALID_PASSWORD', error: 'Senha atual incorreta.' });
  }
  if (nextPass.length < 4) {
    return jsonResponse_({ ok: false, code: 'WEAK_PASSWORD', error: 'A nova senha deve ter pelo menos 4 caracteres.' });
  }
  PropertiesService.getScriptProperties().setProperty(PROP_KEYS.AUTH_PASS_OVERRIDE, nextPass);
  appendAccessLog_(username, String(body.deviceId || 'web'), 'changePassword', 'OK', 'Senha alterada');
  return jsonResponse_({ ok: true });
}

// ============================================================================
// GOOGLE DRIVE: PASTA PADRÃO & SUBPASTAS
// ============================================================================

function getOrCreateRootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var savedId = String(props.getProperty(PROP_KEYS.ROOT_FOLDER_ID) || CONFIG.DEFAULT_ROOT_FOLDER_ID || '').trim();

  if (savedId) {
    try {
      var existingById = DriveApp.getFolderById(savedId);
      if (existingById && !existingById.isTrashed()) {
        return existingById;
      }
    } catch (e) {
      // Pasta antiga inacessível; segue para busca por nome
    }
  }

  var iter = DriveApp.getFoldersByName(CONFIG.DEFAULT_ROOT_FOLDER_NAME);
  while (iter.hasNext()) {
    var candidate = iter.next();
    if (!candidate.isTrashed()) {
      props.setProperty(PROP_KEYS.ROOT_FOLDER_ID, candidate.getId());
      return candidate;
    }
  }

  var created = DriveApp.createFolder(CONFIG.DEFAULT_ROOT_FOLDER_NAME);
  props.setProperty(PROP_KEYS.ROOT_FOLDER_ID, created.getId());
  return created;
}

function getOrCreateSubfolder_(rootFolder, subfolderName) {
  var clean = String(subfolderName || '').trim();
  if (!clean) return rootFolder;

  var parts = clean.split('/').filter(function (p) {
    return p && p.trim().length > 0;
  });
  var current = rootFolder;
  for (var i = 0; i < parts.length; i++) {
    var segment = parts[i].trim();
    var found = null;
    var iter = current.getFoldersByName(segment);
    while (iter.hasNext()) {
      var sub = iter.next();
      if (!sub.isTrashed()) {
        found = sub;
        break;
      }
    }
    current = found || current.createFolder(segment);
  }
  return current;
}

function ensureSubfolders_(rootFolder) {
  for (var i = 0; i < SUBFOLDERS.length; i++) {
    getOrCreateSubfolder_(rootFolder, SUBFOLDERS[i]);
  }
}

function handleSetStudyFolder_(body, username) {
  var rawId = String(body.folderId || '').trim();
  var folderName = String(body.folderName || '').trim();
  var deviceId = String(body.deviceId || 'web').trim();

  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_WAIT_MS);
  try {
    var targetFolder = null;
    if (rawId) {
      targetFolder = DriveApp.getFolderById(rawId);
      if (!targetFolder || targetFolder.isTrashed()) {
        return jsonResponse_({
          ok: false,
          code: 'FOLDER_NOT_FOUND',
          error: 'A pasta informada não foi encontrada ou está na lixeira do Google Drive.',
        });
      }
    } else if (folderName) {
      var iter = DriveApp.getFoldersByName(folderName);
      while (iter.hasNext()) {
        var f = iter.next();
        if (!f.isTrashed()) {
          targetFolder = f;
          break;
        }
      }
      if (!targetFolder) {
        targetFolder = DriveApp.createFolder(folderName);
      }
    } else {
      return jsonResponse_({ ok: false, code: 'MISSING_FOLDER', error: 'Informe o ID ou nome da pasta.' });
    }

    PropertiesService.getScriptProperties().setProperty(PROP_KEYS.ROOT_FOLDER_ID, targetFolder.getId());
    // Re-vincula planilha oculta dentro da nova pasta
    PropertiesService.getScriptProperties().deleteProperty(PROP_KEYS.SHEET_ID);
    ensureSubfolders_(targetFolder);
    ensureHiddenSpreadsheet_(targetFolder);

    appendAccessLog_(username, deviceId, 'setStudyFolder', 'OK', 'Pasta definida: ' + targetFolder.getName());

    return jsonResponse_({
      ok: true,
      folderId: targetFolder.getId(),
      folderName: targetFolder.getName(),
      folderUrl: targetFolder.getUrl(),
    });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// PLANILHA OCULTA ESTRUTURADA (BANCO RELACIONAL HEADLESS)
// ============================================================================

function ensureHiddenSpreadsheet_(rootFolder) {
  var props = PropertiesService.getScriptProperties();
  var savedSheetId = String(props.getProperty(PROP_KEYS.SHEET_ID) || '').trim();
  var ss = null;

  if (savedSheetId) {
    try {
      var fileCheck = DriveApp.getFileById(savedSheetId);
      if (fileCheck && !fileCheck.isTrashed()) {
        ss = SpreadsheetApp.openById(savedSheetId);
      }
    } catch (e) {
      ss = null;
    }
  }

  if (!ss) {
    var backupsFolder = getOrCreateSubfolder_(rootFolder, 'Backups');
    var iter = backupsFolder.getFilesByName(CONFIG.HIDDEN_SHEET_NAME);
    while (iter.hasNext()) {
      var f = iter.next();
      if (!f.isTrashed() && f.getMimeType() === MimeType.GOOGLE_SHEETS) {
        ss = SpreadsheetApp.openById(f.getId());
        props.setProperty(PROP_KEYS.SHEET_ID, ss.getId());
        break;
      }
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.create(CONFIG.HIDDEN_SHEET_NAME);
    var ssFile = DriveApp.getFileById(ss.getId());
    var backupsFolder2 = getOrCreateSubfolder_(rootFolder, 'Backups');
    backupsFolder2.addFile(ssFile);
    try {
      DriveApp.getRootFolder().removeFile(ssFile);
    } catch (e) {
      // Ignora em contas com Drive compartilhado
    }
    props.setProperty(PROP_KEYS.SHEET_ID, ss.getId());
  }

  ensureTableSheet_(ss, 'tb_estado', [
    'id',
    'versao',
    'atualizado_em_iso',
    'hash_conteudo',
    'dispositivo',
    'sync_file_id',
    'total_leis',
    'total_topicos_cronograma',
    'total_questoes',
    'total_anotacoes',
    'total_arquivos',
  ]);
  ensureTableSheet_(ss, 'tb_arquivos', [
    'id',
    'drive_file_id',
    'nome',
    'subpasta',
    'modulo',
    'mime_type',
    'tamanho_bytes',
    'atualizado_em_iso',
    'status',
    'link_drive',
  ]);
  ensureTableSheet_(ss, 'tb_conflitos', [
    'id',
    'data_iso',
    'dispositivo',
    'acao',
    'motivo',
    'versao_local',
    'versao_servidor',
    'status',
    'resolucao',
    'resolvido_em_iso',
  ]);
  ensureTableSheet_(ss, 'tb_logs_acesso', [
    'id',
    'data_iso',
    'usuario',
    'dispositivo',
    'acao',
    'status',
    'detalhes',
  ]);

  // Remove aba padrão vazia "Página1" / "Sheet1" se existir
  var defaultSheets = ['Sheet1', 'Página1', 'Folha1'];
  for (var i = 0; i < defaultSheets.length; i++) {
    var def = ss.getSheetByName(defaultSheets[i]);
    if (def && ss.getSheets().length > 1) {
      try {
        ss.deleteSheet(def);
      } catch (e) {
        // ignore
      }
    }
  }

  return ss;
}

function ensureTableSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    return sheet;
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendAccessLog_(username, deviceId, action, status, details) {
  try {
    var folder = getOrCreateRootFolder_();
    var ss = ensureHiddenSpreadsheet_(folder);
    var sheet = ss.getSheetByName('tb_logs_acesso');
    if (!sheet) return;
    sheet.appendRow([
      Utilities.getUuid(),
      new Date().toISOString(),
      String(username || ''),
      String(deviceId || 'web'),
      String(action || ''),
      String(status || 'OK'),
      String(details || '').slice(0, 500),
    ]);
    // Mantém tabela leve (últimas 500 linhas)
    if (sheet.getLastRow() > 550) {
      sheet.deleteRows(2, sheet.getLastRow() - 500);
    }
  } catch (e) {
    // Log nunca deve derrubar a operação principal
  }
}

function recordStateRow_(folder, version, updatedAtIso, contentHash, deviceId, syncFileId, summary) {
  try {
    var ss = ensureHiddenSpreadsheet_(folder);
    var sheet = ss.getSheetByName('tb_estado');
    if (!sheet) return;
    sheet.appendRow([
      Utilities.getUuid(),
      Number(version || 0),
      updatedAtIso,
      String(contentHash || ''),
      String(deviceId || 'web'),
      String(syncFileId || ''),
      Number(summary.laws || 0),
      Number(summary.scheduleTopics || 0),
      Number(summary.questions || 0),
      Number(summary.annotations || 0),
      Number(summary.pdfs || 0),
    ]);
    if (sheet.getLastRow() > 250) {
      sheet.deleteRows(2, sheet.getLastRow() - 200);
    }
  } catch (e) {
    // ignore
  }
}

function upsertFileCatalogRow_(folder, info, subfolder, moduleTag, status) {
  try {
    var ss = ensureHiddenSpreadsheet_(folder);
    var sheet = ss.getSheetByName('tb_arquivos');
    if (!sheet) return;
    var values = sheet.getDataRange().getValues();
    var nowIso = new Date().toISOString();
    var rowData = [
      Utilities.getUuid(),
      String(info.id || ''),
      String(info.name || ''),
      String(subfolder || ''),
      String(moduleTag || ''),
      String(info.mimeType || ''),
      Number(info.size || 0),
      info.modifiedTime || nowIso,
      String(status || 'ATIVO'),
      String(info.webViewLink || ''),
    ];
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][1]) === String(info.id)) {
        rowData[0] = values[i][0] || rowData[0];
        sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
        return;
      }
    }
    sheet.appendRow(rowData);
  } catch (e) {
    // ignore
  }
}

function recordConflictRow_(deviceId, action, reason, localVersion, serverVersion) {
  var id = Utilities.getUuid();
  try {
    var folder = getOrCreateRootFolder_();
    var ss = ensureHiddenSpreadsheet_(folder);
    var sheet = ss.getSheetByName('tb_conflitos');
    if (sheet) {
      sheet.appendRow([
        id,
        new Date().toISOString(),
        String(deviceId || 'web'),
        String(action || 'pushState'),
        String(reason || 'Divergência de versão entre dispositivo e nuvem'),
        Number(localVersion || 0),
        Number(serverVersion || 0),
        'pending',
        '',
        '',
      ]);
      if (sheet.getLastRow() > 200) {
        sheet.deleteRows(2, sheet.getLastRow() - 150);
      }
    }
  } catch (e) {
    // ignore
  }
  return id;
}

function readRecentConflicts_(limit) {
  var maxItems = Number(limit || 30);
  try {
    var folder = getOrCreateRootFolder_();
    var ss = ensureHiddenSpreadsheet_(folder);
    var sheet = ss.getSheetByName('tb_conflitos');
    if (!sheet || sheet.getLastRow() < 2) return [];
    var rows = sheet.getDataRange().getValues();
    var list = [];
    for (var i = rows.length - 1; i >= 1 && list.length < maxItems; i--) {
      var r = rows[i];
      list.push({
        id: String(r[0] || ''),
        timestamp: String(r[1] || ''),
        deviceId: String(r[2] || ''),
        action: String(r[3] || ''),
        reason: String(r[4] || ''),
        localVersion: Number(r[5] || 0),
        serverVersion: Number(r[6] || 0),
        status: String(r[7] || 'pending'),
        resolution: String(r[8] || ''),
        resolvedAt: String(r[9] || ''),
      });
    }
    return list;
  } catch (e) {
    return [];
  }
}

// ============================================================================
// ESTADO CANÔNICO + ARQUIVOS MODULARES + CONTROLE OTIMISTA DE CONFLITO
// ============================================================================

function computeSummaryFromPayload_(payload) {
  var data = payload && payload.data && typeof payload.data === 'object' ? payload.data : payload || {};
  var lawsCount = 0;
  if (Array.isArray(data.laws)) {
    lawsCount = data.laws.length;
  } else if (data.laws && typeof data.laws === 'object') {
    lawsCount = Object.keys(data.laws).length;
  }

  var scheduleTopics = 0;
  if (data.schedule && typeof data.schedule === 'object') {
    var days = Object.keys(data.schedule);
    for (var i = 0; i < days.length; i++) {
      var arr = data.schedule[days[i]];
      if (Array.isArray(arr)) scheduleTopics += arr.length;
    }
  }

  var questionsCount = Array.isArray(data.questions) ? data.questions.length : 0;
  var annotationsCount = Array.isArray(data.annotations) ? data.annotations.length : 0;

  var pdfsCount = 0;
  if (data.pdfFolders && typeof data.pdfFolders === 'object') {
    var pfKeys = Object.keys(data.pdfFolders);
    for (var j = 0; j < pfKeys.length; j++) {
      var list = data.pdfFolders[pfKeys[j]];
      if (Array.isArray(list)) pdfsCount += list.length;
    }
  }

  return {
    laws: lawsCount,
    scheduleTopics: scheduleTopics,
    questions: questionsCount,
    annotations: annotationsCount,
    pdfs: pdfsCount,
  };
}

function findLatestFileByName_(folder, filename) {
  var iter = folder.getFilesByName(filename);
  var best = null;
  var bestMs = 0;
  while (iter.hasNext()) {
    var f = iter.next();
    if (f.isTrashed()) continue;
    var ms = f.getLastUpdated().getTime();
    if (!best || ms > bestMs) {
      best = f;
      bestMs = ms;
    }
  }
  return best;
}

function upsertTextFile_(folder, filename, content, mimeType) {
  var iter = folder.getFilesByName(filename);
  var files = [];
  while (iter.hasNext()) {
    var f = iter.next();
    if (!f.isTrashed()) files.push(f);
  }
  files.sort(function (a, b) {
    return b.getLastUpdated().getTime() - a.getLastUpdated().getTime();
  });

  if (files.length > 0) {
    var primary = files[0];
    primary.setContent(content);
    // Limpa duplicatas antigas com o mesmo nome na mesma pasta
    for (var i = 1; i < files.length; i++) {
      try {
        files[i].setTrashed(true);
      } catch (e) {
        // ignore
      }
    }
    return primary;
  }

  return folder.createFile(filename, content, mimeType || MimeType.PLAIN_TEXT);
}

function readLatestControlSheetState_(rootFolder) {
  try {
    var ss = ensureHiddenSpreadsheet_(rootFolder);
    var sheet = ss.getSheetByName('tb_estado');
    if (!sheet) return null;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    var row = sheet.getRange(lastRow, 1, 1, 11).getValues()[0];
    return {
      rowId: String(row[0] || ''),
      version: Number(row[1] || 0),
      updatedAt: row[2] ? String(row[2]) : null,
      contentHash: String(row[3] || '').trim(),
      deviceId: String(row[4] || '').trim(),
      syncFileId: String(row[5] || '').trim(),
      summary: {
        laws: Number(row[6] || 0),
        scheduleTopics: Number(row[7] || 0),
        questions: Number(row[8] || 0),
        annotations: Number(row[9] || 0),
        pdfs: Number(row[10] || 0),
      },
    };
  } catch (e) {
    return null;
  }
}

function readCanonicalState_(rootFolder) {
  var props = PropertiesService.getScriptProperties();
  var serverVersion = Number(props.getProperty(PROP_KEYS.SERVER_VERSION) || '0');
  var controlRow = readLatestControlSheetState_(rootFolder);
  if (controlRow && controlRow.version > serverVersion) {
    serverVersion = controlRow.version;
    props.setProperty(PROP_KEYS.SERVER_VERSION, String(serverVersion));
  }

  var backupsFolder = getOrCreateSubfolder_(rootFolder, 'Backups');
  var syncFile = findLatestFileByName_(backupsFolder, CONFIG.SYNC_FILENAME);

  if (!syncFile) {
    return {
      serverVersion: serverVersion,
      updatedAt: (controlRow && controlRow.updatedAt) || props.getProperty(PROP_KEYS.LAST_UPDATED_AT) || null,
      contentHash:
        (controlRow && controlRow.contentHash) || props.getProperty(PROP_KEYS.LAST_CONTENT_HASH) || '',
      savedByDevice: (controlRow && controlRow.deviceId) || '',
      controlSheet: controlRow,
      fileId: null,
      fileName: CONFIG.SYNC_FILENAME,
      payload: null,
      summary: (controlRow && controlRow.summary) || {
        laws: 0,
        scheduleTopics: 0,
        questions: 0,
        annotations: 0,
        pdfs: 0,
      },
    };
  }

  var rawText = syncFile.getBlob().getDataAsString('UTF-8');
  var parsed = null;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    parsed = null;
  }

  var updatedAt =
    (controlRow && controlRow.version >= serverVersion && controlRow.updatedAt) ||
    (parsed && (parsed.updatedAt || parsed.exportedAt)) ||
    syncFile.getLastUpdated().toISOString();
  var contentHash =
    (controlRow && controlRow.version >= serverVersion && controlRow.contentHash) ||
    (parsed && parsed.contentHash) ||
    props.getProperty(PROP_KEYS.LAST_CONTENT_HASH) ||
    '';
  var savedByDevice =
    (controlRow && controlRow.deviceId) || (parsed && parsed.savedByDevice) || '';
  var fileVersion = Number((parsed && parsed.serverVersion) || serverVersion || 1);
  if (fileVersion > serverVersion) {
    serverVersion = fileVersion;
    props.setProperty(PROP_KEYS.SERVER_VERSION, String(serverVersion));
  }

  return {
    serverVersion: serverVersion,
    updatedAt: updatedAt,
    contentHash: contentHash,
    savedByDevice: savedByDevice,
    controlSheet: controlRow,
    fileId: syncFile.getId(),
    fileName: syncFile.getName(),
    payload: parsed,
    summary: computeSummaryFromPayload_(parsed),
  };
}

function writeModularMirrors_(backupsFolder, payload) {
  try {
    var data = payload && payload.data && typeof payload.data === 'object' ? payload.data : null;
    if (!data) return;
    var modFolder = getOrCreateSubfolder_(backupsFolder, 'Modulos');
    var updatedAt = (payload && payload.updatedAt) || new Date().toISOString();

    if (data.schedule || data.weeklySchedules) {
      upsertTextFile_(
        modFolder,
        'cronograma.json',
        JSON.stringify(
          {
            updatedAt: updatedAt,
            schedule: data.schedule || {},
            weeklySchedules: data.weeklySchedules || {},
            completedGoals: data.completedGoals || [],
            incompleteGoals: data.incompleteGoals || [],
          },
          null,
          2,
        ),
        'application/json',
      );
    }

    if (data.laws) {
      upsertTextFile_(
        modFolder,
        'leis.json',
        JSON.stringify({ updatedAt: updatedAt, laws: data.laws }, null, 2),
        'application/json',
      );
    }

    if (data.questions || data.annotations) {
      upsertTextFile_(
        modFolder,
        'questoes_e_erros.json',
        JSON.stringify(
          {
            updatedAt: updatedAt,
            questions: data.questions || [],
            annotations: data.annotations || [],
          },
          null,
          2,
        ),
        'application/json',
      );
    }

    if (data.contests) {
      upsertTextFile_(
        modFolder,
        'concursos_e_editais.json',
        JSON.stringify({ updatedAt: updatedAt, contests: data.contests }, null, 2),
        'application/json',
      );
    }
  } catch (e) {
    // Espelhos modulares são redundância; não devem abortar o salvamento principal
  }
}

function handlePullState_(body, username) {
  var folder = getOrCreateRootFolder_();
  var stateInfo = readCanonicalState_(folder);
  var postIt = readPostItInternal_(folder);
  return jsonResponse_({
    ok: true,
    folderId: folder.getId(),
    folderName: folder.getName(),
    folderUrl: folder.getUrl(),
    serverVersion: stateInfo.serverVersion,
    updatedAt: stateInfo.updatedAt,
    contentHash: stateInfo.contentHash,
    savedByDevice: stateInfo.savedByDevice || '',
    controlSheetVersion: stateInfo.controlSheet ? stateInfo.controlSheet.version : stateInfo.serverVersion,
    controlSheetHash: stateInfo.controlSheet ? stateInfo.controlSheet.contentHash : stateInfo.contentHash,
    fileId: stateInfo.fileId,
    fileName: stateInfo.fileName,
    payload: stateInfo.payload,
    summary: stateInfo.summary,
    postIt: postIt,
  });
}

function handleInspectVersion_() {
  var folder = getOrCreateRootFolder_();
  var stateInfo = readCanonicalState_(folder);
  var cs = stateInfo.controlSheet;
  return jsonResponse_({
    ok: true,
    serverVersion: stateInfo.serverVersion,
    updatedAt: stateInfo.updatedAt,
    contentHash: stateInfo.contentHash,
    savedByDevice: stateInfo.savedByDevice || '',
    controlSheetTable: 'tb_estado',
    controlSheetVersion: cs ? cs.version : stateInfo.serverVersion,
    controlSheetHash: cs ? cs.contentHash : stateInfo.contentHash,
    controlSheetDevice: cs ? cs.deviceId : stateInfo.savedByDevice || '',
    controlSheetUpdatedAt: cs ? cs.updatedAt : stateInfo.updatedAt,
    fileId: stateInfo.fileId,
    fileName: stateInfo.fileName,
    summary: stateInfo.summary,
    hasRemoteData: Boolean(stateInfo.payload || (cs && cs.version > 0)),
  });
}

function handlePushState_(body, username) {
  var payload = body.payload;
  if (!payload || typeof payload !== 'object') {
    return jsonResponse_({ ok: false, code: 'MISSING_PAYLOAD', error: 'Dados do estado não enviados.' });
  }

  var force = Boolean(body.force);
  var baseVersion = Number(body.baseVersion || 0);
  var expectedContentHash = String(body.expectedContentHash || '').trim();
  var deviceId = String(body.deviceId || 'web').trim();

  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_WAIT_MS);
  try {
    var folder = getOrCreateRootFolder_();
    var backupsFolder = getOrCreateSubfolder_(folder, 'Backups');
    var props = PropertiesService.getScriptProperties();
    var currentState = readCanonicalState_(folder);
    var currentVersion = currentState.serverVersion || 0;
    var currentHash = String(
      (currentState.controlSheet && currentState.controlSheet.contentHash) || currentState.contentHash || '',
    ).trim();
    var incomingHash = String(payload.contentHash || body.contentHash || '').trim();

    // Trava de Sincronização Ativa: valida versão e checksum contra a planilha de controle (tb_estado)
    // antes de gravar, evitando sobrescrita acidental quando outro dispositivo gravou mais recentemente.
    var versionMismatch =
      currentVersion > 0 &&
      ((baseVersion > 0 && currentVersion > baseVersion) ||
        (baseVersion === 0 && currentHash && expectedContentHash !== currentHash && incomingHash !== currentHash));
    var checksumMismatch = Boolean(
      expectedContentHash && currentHash && expectedContentHash !== currentHash,
    );

    if (!force && (versionMismatch || checksumMismatch)) {
      var conflictReason = checksumMismatch
        ? 'Checksum divergente na planilha de controle (tb_estado): esperado ' +
          expectedContentHash.slice(0, 12) +
          ', remoto ' +
          currentHash.slice(0, 12) +
          ' (v' +
          currentVersion +
          ').'
        : 'Outro dispositivo salvou a versão v' +
          currentVersion +
          ' enquanto este aparelho estava na v' +
          baseVersion +
          '.';
      var conflictId = recordConflictRow_(
        deviceId,
        'pushState',
        conflictReason,
        baseVersion,
        currentVersion,
      );
      return jsonResponse_({
        ok: false,
        code: 'VERSION_CONFLICT',
        conflictId: conflictId,
        error:
          'DRIVE_CONFLICT_NEWER_REMOTE: ' + conflictReason,
        serverVersion: currentVersion,
        remoteUpdatedAt: currentState.updatedAt,
        remoteContentHash: currentHash,
        remoteDevice: currentState.savedByDevice || '',
        controlSheetVersion: currentState.controlSheet ? currentState.controlSheet.version : currentVersion,
        controlSheetHash: currentHash,
        remoteSummary: currentState.summary,
      });
    }

    var nowIso = new Date().toISOString();
    var nextVersion = currentVersion + 1;
    var contentHash = incomingHash;

    var wrappedPayload = Object.assign({}, payload, {
      serverVersion: nextVersion,
      updatedAt: payload.updatedAt || nowIso,
      savedByAppsScriptAt: nowIso,
      savedByDevice: deviceId,
    });

    var jsonStr = JSON.stringify(wrappedPayload);
    var syncFile = upsertTextFile_(backupsFolder, CONFIG.SYNC_FILENAME, jsonStr, 'application/json');

    // Grava espelhos independentes por módulo (Cronograma, Leis, Questões, Editais)
    writeModularMirrors_(backupsFolder, wrappedPayload);

    props.setProperty(PROP_KEYS.SERVER_VERSION, String(nextVersion));
    props.setProperty(PROP_KEYS.LAST_UPDATED_AT, nowIso);
    if (contentHash) props.setProperty(PROP_KEYS.LAST_CONTENT_HASH, contentHash);

    var summary = computeSummaryFromPayload_(wrappedPayload);
    recordStateRow_(folder, nextVersion, nowIso, contentHash, deviceId, syncFile.getId(), summary);

    // Backup rotativo automático a cada 30 min (nunca sobrescreve anteriores)
    var lastAutoMs = Number(props.getProperty(PROP_KEYS.LAST_AUTO_BACKUP_MS) || '0');
    if (Date.now() - lastAutoMs >= CONFIG.AUTO_BACKUP_INTERVAL_MS) {
      createRotatingBackupFile_(backupsFolder, jsonStr, 'auto');
      props.setProperty(PROP_KEYS.LAST_AUTO_BACKUP_MS, String(Date.now()));
    }

    return jsonResponse_({
      ok: true,
      serverVersion: nextVersion,
      updatedAt: nowIso,
      contentHash: contentHash,
      savedByDevice: deviceId,
      summary: summary,
      file: serializeDriveFile_(syncFile, 'Backups'),
    });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// BACKUPS IMUTÁVEIS ROTATIVOS
// ============================================================================

function formatBackupStamp_(date) {
  var pad = function (n) {
    return n < 10 ? '0' + n : String(n);
  };
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    '_' +
    pad(date.getHours()) +
    'h' +
    pad(date.getMinutes()) +
    'm' +
    pad(date.getSeconds()) +
    's'
  );
}

function createRotatingBackupFile_(backupsFolder, jsonStr, prefix) {
  var tag = prefix === 'manual' ? 'backup_manual_central_estudos_' : 'backup_auto_central_estudos_';
  var filename = tag + formatBackupStamp_(new Date()) + '.json';
  var file = backupsFolder.createFile(filename, jsonStr, 'application/json');
  pruneRotatingBackupsInternal_(backupsFolder, CONFIG.MAX_ROTATING_BACKUPS);
  return file;
}

function pruneRotatingBackupsInternal_(backupsFolder, maxKeep) {
  var keep = Math.max(3, Number(maxKeep || CONFIG.MAX_ROTATING_BACKUPS));
  var iter = backupsFolder.getFiles();
  var list = [];
  while (iter.hasNext()) {
    var f = iter.next();
    if (f.isTrashed()) continue;
    var name = f.getName();
    if (name === CONFIG.SYNC_FILENAME || name === CONFIG.HIDDEN_SHEET_NAME || name === CONFIG.AUDIT_LOG_FILENAME) continue;
    if (name.toLowerCase().indexOf('.json') === name.length - 5) {
      list.push(f);
    }
  }
  list.sort(function (a, b) {
    return b.getLastUpdated().getTime() - a.getLastUpdated().getTime();
  });
  var removed = 0;
  for (var i = keep; i < list.length; i++) {
    try {
      list[i].setTrashed(true);
      removed++;
    } catch (e) {
      // ignore
    }
  }
  return removed;
}

function handleCreateBackup_(body, username) {
  var payload = body.payload;
  if (!payload) {
    return jsonResponse_({ ok: false, code: 'MISSING_PAYLOAD', error: 'Payload de backup ausente.' });
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_WAIT_MS);
  try {
    var folder = getOrCreateRootFolder_();
    var backupsFolder = getOrCreateSubfolder_(folder, 'Backups');
    var jsonStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    var file = createRotatingBackupFile_(backupsFolder, jsonStr, 'manual');
    appendAccessLog_(username, String(body.deviceId || 'web'), 'createBackup', 'OK', file.getName());
    return jsonResponse_({
      ok: true,
      file: serializeDriveFile_(file, 'Backups'),
    });
  } finally {
    lock.releaseLock();
  }
}

function handleListBackups_() {
  var folder = getOrCreateRootFolder_();
  var backupsFolder = getOrCreateSubfolder_(folder, 'Backups');
  var iter = backupsFolder.getFiles();
  var list = [];
  while (iter.hasNext()) {
    var f = iter.next();
    if (f.isTrashed()) continue;
    var name = f.getName();
    if (name === CONFIG.HIDDEN_SHEET_NAME) continue;
    if (name.toLowerCase().indexOf('.json') === name.length - 5) {
      list.push(serializeDriveFile_(f, 'Backups'));
    }
  }
  list.sort(function (a, b) {
    return Date.parse(b.modifiedTime || '') - Date.parse(a.modifiedTime || '');
  });
  return jsonResponse_({ ok: true, files: list });
}

function handleDownloadBackup_(body) {
  var fileId = String(body.fileId || '').trim();
  if (!fileId) {
    return jsonResponse_({ ok: false, code: 'MISSING_FILE_ID', error: 'ID do arquivo de backup não informado.' });
  }
  var file = DriveApp.getFileById(fileId);
  if (!file || file.isTrashed()) {
    return jsonResponse_({ ok: false, code: 'NOT_FOUND', error: 'Arquivo de backup não encontrado.' });
  }
  var text = file.getBlob().getDataAsString('UTF-8');
  return jsonResponse_({
    ok: true,
    file: serializeDriveFile_(file, 'Backups'),
    payload: JSON.parse(text),
  });
}

function handleDeleteBackup_(body, username) {
  return handleDeleteFile_(body, username);
}

function handlePruneBackups_(body, username) {
  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_WAIT_MS);
  try {
    var folder = getOrCreateRootFolder_();
    var backupsFolder = getOrCreateSubfolder_(folder, 'Backups');
    var removed = pruneRotatingBackupsInternal_(backupsFolder, Number(body.maxKeep || CONFIG.MAX_ROTATING_BACKUPS));
    appendAccessLog_(username, String(body.deviceId || 'web'), 'pruneBackups', 'OK', removed + ' backups removidos');
    return jsonResponse_({ ok: true, removed: removed });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// ARQUIVOS (PDFs, PROVAS, LEIS, RESUMOS — COM SUPORTE A CHUNKS PARA PDFs GRANDES)
// ============================================================================

function serializeDriveFile_(file, subfolderName, knownParentId) {
  var parents = [];
  if (knownParentId) {
    parents.push(knownParentId);
  } else {
    try {
      var pIter = file.getParents();
      while (pIter.hasNext()) {
        parents.push(pIter.next().getId());
      }
    } catch (e) {
      // ignore
    }
  }
  return {
    id: file.getId(),
    name: file.getName(),
    mimeType: file.getMimeType(),
    size: String(file.getSize()),
    webViewLink: file.getUrl(),
    createdTime: file.getDateCreated().toISOString(),
    modifiedTime: file.getLastUpdated().toISOString(),
    parents: parents,
    folderName: subfolderName || '',
    syncOrigin: 'internal',
    syncTagPresent: true,
  };
}

function handleUploadFile_(body, username) {
  var filename = String(body.filename || '').trim();
  var base64Data = String(body.base64Data || '').trim();
  var mimeType = String(body.mimeType || 'application/octet-stream').trim();
  var subfolder = String(body.subfolder || '').trim();
  var moduleTag = String(body.moduleTag || subfolder || 'Geral').trim();
  var replaceExisting = body.replaceExisting !== false;

  if (!filename || !base64Data) {
    return jsonResponse_({ ok: false, code: 'MISSING_FILE', error: 'Nome ou conteúdo do arquivo não enviado.' });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_WAIT_MS);
  try {
    var rootFolder = getOrCreateRootFolder_();
    var targetFolder = subfolder ? getOrCreateSubfolder_(rootFolder, subfolder) : rootFolder;
    var bytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(bytes, mimeType, filename);

    if (replaceExisting) {
      var existingIter = targetFolder.getFilesByName(filename);
      while (existingIter.hasNext()) {
        var oldFile = existingIter.next();
        if (!oldFile.isTrashed()) {
          oldFile.setTrashed(true);
        }
      }
    }

    var created = targetFolder.createFile(blob);
    var info = serializeDriveFile_(created, subfolder || rootFolder.getName());
    upsertFileCatalogRow_(rootFolder, info, subfolder, moduleTag, 'ATIVO');
    appendAccessLog_(username, String(body.deviceId || 'web'), 'uploadFile', 'OK', filename + ' (' + bytes.length + ' B)');

    return jsonResponse_({
      ok: true,
      file: info,
      verifiedBytes: created.getSize(),
    });
  } finally {
    lock.releaseLock();
  }
}

function handleUploadFileChunk_(body) {
  var uploadId = String(body.uploadId || '').trim();
  var chunkIndex = Number(body.chunkIndex);
  var chunkData = String(body.chunkData || '');

  if (!uploadId || isNaN(chunkIndex) || chunkIndex < 0 || !chunkData) {
    return jsonResponse_({ ok: false, code: 'INVALID_CHUNK', error: 'Parâmetros do pedaço de arquivo inválidos.' });
  }

  var rootFolder = getOrCreateRootFolder_();
  var tempFolder = getOrCreateSubfolder_(rootFolder, 'Backups/_tmp_chunks');
  var partName = uploadId + '_part_' + ('0000' + chunkIndex).slice(-4) + '.b64';
  upsertTextFile_(tempFolder, partName, chunkData, MimeType.PLAIN_TEXT);

  return jsonResponse_({ ok: true, uploadId: uploadId, chunkIndex: chunkIndex });
}

function handleFinalizeChunkedUpload_(body, username) {
  var uploadId = String(body.uploadId || '').trim();
  var totalChunks = Number(body.totalChunks || 0);
  var filename = String(body.filename || '').trim();
  var mimeType = String(body.mimeType || 'application/pdf').trim();
  var subfolder = String(body.subfolder || '').trim();
  var moduleTag = String(body.moduleTag || subfolder || 'Geral').trim();

  if (!uploadId || !filename || totalChunks <= 0) {
    return jsonResponse_({ ok: false, code: 'INVALID_FINALIZE', error: 'Dados incompletos para montar arquivo.' });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_WAIT_MS);
  try {
    var rootFolder = getOrCreateRootFolder_();
    var tempFolder = getOrCreateSubfolder_(rootFolder, 'Backups/_tmp_chunks');
    var base64Parts = [];
    var chunkFiles = [];

    for (var i = 0; i < totalChunks; i++) {
      var partName = uploadId + '_part_' + ('0000' + i).slice(-4) + '.b64';
      var partFile = findLatestFileByName_(tempFolder, partName);
      if (!partFile) {
        return jsonResponse_({
          ok: false,
          code: 'MISSING_CHUNK',
          error: 'Parte ' + i + ' do arquivo não encontrada no Drive.',
        });
      }
      base64Parts.push(partFile.getBlob().getDataAsString('UTF-8'));
      chunkFiles.push(partFile);
    }

    var fullBase64 = base64Parts.join('');
    var bytes = Utilities.base64Decode(fullBase64);
    var targetFolder = subfolder ? getOrCreateSubfolder_(rootFolder, subfolder) : rootFolder;

    var existingIter = targetFolder.getFilesByName(filename);
    while (existingIter.hasNext()) {
      var oldFile = existingIter.next();
      if (!oldFile.isTrashed()) oldFile.setTrashed(true);
    }

    var created = targetFolder.createFile(Utilities.newBlob(bytes, mimeType, filename));

    // Limpa chunks temporários
    for (var j = 0; j < chunkFiles.length; j++) {
      try {
        chunkFiles[j].setTrashed(true);
      } catch (e) {
        // ignore
      }
    }

    var info = serializeDriveFile_(created, subfolder || rootFolder.getName());
    upsertFileCatalogRow_(rootFolder, info, subfolder, moduleTag, 'ATIVO');
    appendAccessLog_(
      username,
      String(body.deviceId || 'web'),
      'finalizeChunkedUpload',
      'OK',
      filename + ' (' + bytes.length + ' B)',
    );

    return jsonResponse_({
      ok: true,
      file: info,
      verifiedBytes: created.getSize(),
    });
  } finally {
    lock.releaseLock();
  }
}

function collectFilesRecursive_(folder, pathPrefix, outFiles, outFolders, parentFolderId, deadlineMs, state) {
  if (deadlineMs && Date.now() >= deadlineMs) {
    if (state) state.truncated = true;
    return;
  }

  var folderId = folder.getId();
  var folderName = folder.getName();
  var fIter = folder.getFiles();
  var fileCount = 0;
  while (fIter.hasNext()) {
    if (deadlineMs && Date.now() >= deadlineMs) {
      if (state) state.truncated = true;
      break;
    }
    var f = fIter.next();
    if (f.isTrashed()) continue;
    var name = f.getName();
    if (name === CONFIG.HIDDEN_SHEET_NAME || name === CONFIG.AUDIT_LOG_FILENAME) continue;
    fileCount++;
    outFiles.push(serializeDriveFile_(f, pathPrefix || folderName, folderId));
  }

  outFolders.push({
    id: folderId,
    name: folderName,
    parentId: parentFolderId || '',
    fullPath: pathPrefix || folderName,
    fileCount: fileCount,
    webViewLink: folder.getUrl(),
  });

  var subIter = folder.getFolders();
  while (subIter.hasNext()) {
    if (deadlineMs && Date.now() >= deadlineMs) {
      if (state) state.truncated = true;
      break;
    }
    var sub = subIter.next();
    if (sub.isTrashed()) continue;
    var subName = sub.getName();
    if (subName === '_tmp_chunks') continue;
    var nextPath = pathPrefix ? pathPrefix + '/' + subName : subName;
    collectFilesRecursive_(sub, nextPath, outFiles, outFolders, folderId, deadlineMs, state);
  }
}

function handleListFiles_() {
  var rootFolder = getOrCreateRootFolder_();
  var files = [];
  var folders = [];
  var state = { truncated: false };
  var deadlineMs = Date.now() + 260000;
  collectFilesRecursive_(rootFolder, '', files, folders, '', deadlineMs, state);
  return jsonResponse_({
    ok: true,
    folderId: rootFolder.getId(),
    folderName: rootFolder.getName(),
    folderUrl: rootFolder.getUrl(),
    files: files,
    folders: folders,
    truncated: state.truncated,
  });
}

function handleDownloadFile_(body) {
  var fileId = String(body.fileId || '').trim();
  if (!fileId) {
    return jsonResponse_({ ok: false, code: 'MISSING_FILE_ID', error: 'ID do arquivo não informado.' });
  }
  var file = DriveApp.getFileById(fileId);
  if (!file || file.isTrashed()) {
    return jsonResponse_({ ok: false, code: 'NOT_FOUND', error: 'Arquivo não encontrado ou na lixeira.' });
  }
  var blob = file.getBlob();
  var base64 = Utilities.base64Encode(blob.getBytes());
  return jsonResponse_({
    ok: true,
    file: serializeDriveFile_(file, ''),
    mimeType: blob.getContentType() || file.getMimeType(),
    base64Data: base64,
  });
}

function isFileInsideFolderTree_(file, rootFolderId, maxDepth) {
  var depth = maxDepth || 8;
  var queue = [];
  var pIter = file.getParents();
  while (pIter.hasNext()) {
    queue.push({ folder: pIter.next(), level: 0 });
  }
  while (queue.length > 0) {
    var cur = queue.shift();
    if (cur.folder.getId() === rootFolderId) return true;
    if (cur.level >= depth) continue;
    var up = cur.folder.getParents();
    while (up.hasNext()) {
      queue.push({ folder: up.next(), level: cur.level + 1 });
    }
  }
  return false;
}

function handleDeleteFile_(body, username) {
  var fileId = String(body.fileId || '').trim();
  if (!fileId) {
    return jsonResponse_({ ok: false, code: 'MISSING_FILE_ID', error: 'ID do arquivo não informado.' });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_WAIT_MS);
  try {
    var rootFolder = getOrCreateRootFolder_();
    var file = DriveApp.getFileById(fileId);
    if (!file) {
      return jsonResponse_({ ok: true, alreadyDeleted: true });
    }
    if (file.isTrashed()) {
      return jsonResponse_({ ok: true, alreadyDeleted: true });
    }
    // Segurança: só permite apagar arquivos dentro da pasta de estudos configurada!
    if (!isFileInsideFolderTree_(file, rootFolder.getId(), 8)) {
      return jsonResponse_({
        ok: false,
        code: 'OUTSIDE_STUDY_FOLDER',
        error: 'Operação bloqueada por segurança: este arquivo está fora da pasta de estudos configurada.',
      });
    }

    var fileName = file.getName();
    var info = serializeDriveFile_(file, '');
    file.setTrashed(true);
    upsertFileCatalogRow_(rootFolder, info, '', '', 'LIXEIRA');
    appendAccessLog_(username, String(body.deviceId || 'web'), 'deleteFile', 'OK', 'Movido p/ lixeira: ' + fileName);

    return jsonResponse_({ ok: true, trashedId: fileId, name: fileName });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// POST-IT.TXT DEDICADO DIRETO NO GOOGLE DRIVE
// ============================================================================

function readPostItInternal_(rootFolder) {
  var file = findLatestFileByName_(rootFolder, CONFIG.POST_IT_FILENAME);
  if (!file) {
    return {
      exists: false,
      fileId: null,
      content: '',
      modifiedTime: null,
    };
  }
  return {
    exists: true,
    fileId: file.getId(),
    content: file.getBlob().getDataAsString('UTF-8'),
    modifiedTime: file.getLastUpdated().toISOString(),
  };
}

function handleReadPostIt_() {
  var rootFolder = getOrCreateRootFolder_();
  var info = readPostItInternal_(rootFolder);
  return jsonResponse_(Object.assign({ ok: true }, info));
}

function handleSavePostIt_(body, username) {
  var content = typeof body.content === 'string' ? body.content : '';
  var force = Boolean(body.force);
  var expectedModifiedTime = String(body.expectedModifiedTime || '').trim();

  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_WAIT_MS);
  try {
    var rootFolder = getOrCreateRootFolder_();
    var existing = findLatestFileByName_(rootFolder, CONFIG.POST_IT_FILENAME);
    if (existing && !force && expectedModifiedTime) {
      var remoteMs = existing.getLastUpdated().getTime();
      var expMs = Date.parse(expectedModifiedTime) || 0;
      if (expMs > 0 && remoteMs > expMs + 3000) {
        return jsonResponse_({
          ok: false,
          code: 'POST_IT_CONFLICT',
          error: 'O arquivo Post-it.txt foi alterado em outro dispositivo.',
          remoteContent: existing.getBlob().getDataAsString('UTF-8'),
          remoteModifiedTime: existing.getLastUpdated().toISOString(),
          fileId: existing.getId(),
        });
      }
    }

    var saved = upsertTextFile_(rootFolder, CONFIG.POST_IT_FILENAME, content, MimeType.PLAIN_TEXT);
    return jsonResponse_({
      ok: true,
      fileId: saved.getId(),
      modifiedTime: saved.getLastUpdated().toISOString(),
      size: saved.getSize(),
    });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// CONFLITOS & GATILHO AUTOMÁTICO DIÁRIO
// ============================================================================

function handleListConflicts_() {
  return jsonResponse_({
    ok: true,
    conflicts: readRecentConflicts_(40),
  });
}

function handleResolveConflict_(body, username) {
  var conflictId = String(body.conflictId || '').trim();
  var status = String(body.status || 'resolved-local').trim();
  var resolution = String(body.resolution || '').trim();
  var lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_WAIT_MS);
  try {
    var folder = getOrCreateRootFolder_();
    var ss = ensureHiddenSpreadsheet_(folder);
    var sheet = ss.getSheetByName('tb_conflitos');
    if (sheet && sheet.getLastRow() >= 2) {
      var rows = sheet.getDataRange().getValues();
      var nowIso = new Date().toISOString();
      for (var i = 1; i < rows.length; i++) {
        if (!conflictId || String(rows[i][0]) === conflictId || (conflictId === 'ALL_PENDING' && String(rows[i][7]) === 'pending')) {
          sheet.getRange(i + 1, 8, 1, 3).setValues([[status, resolution, nowIso]]);
        }
      }
    }
    appendAccessLog_(username, String(body.deviceId || 'web'), 'resolveConflict', 'OK', status + ' ' + resolution);
    return jsonResponse_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function handleSetupDailyBackupTrigger_(username) {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runDailyScheduledBackup') {
      return jsonResponse_({ ok: true, alreadyExists: true, message: 'Backup diário automático já está ativo (03h).' });
    }
  }
  ScriptApp.newTrigger('runDailyScheduledBackup').timeBased().everyDays(1).atHour(3).create();
  appendAccessLog_(username, 'server', 'setupDailyBackupTrigger', 'OK', 'Trigger diário 03h ativado');
  return jsonResponse_({ ok: true, created: true, message: 'Backup diário automático ativado às 03h!' });
}

function runDailyScheduledBackup() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return;
  try {
    var folder = getOrCreateRootFolder_();
    var backupsFolder = getOrCreateSubfolder_(folder, 'Backups');
    var syncFile = findLatestFileByName_(backupsFolder, CONFIG.SYNC_FILENAME);
    if (!syncFile) return;
    var jsonStr = syncFile.getBlob().getDataAsString('UTF-8');
    createRotatingBackupFile_(backupsFolder, jsonStr, 'auto');
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
// UTILITÁRIO DE RESPOSTA JSON
// ============================================================================

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
