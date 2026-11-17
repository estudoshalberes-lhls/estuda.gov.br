import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DIST_DIR = path.join(__dirname, 'dist');
const LOCAL_DATA_ROOT = path.join(__dirname, process.env.LOCAL_STUDY_DATA_DIR || 'Dados_Estudo_Local');
const LOCAL_BACKUP_DIR = path.join(LOCAL_DATA_ROOT, 'Backup_Automatico');
const LOCAL_BLOBS_DIR = path.join(LOCAL_DATA_ROOT, '.blobs');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

function sanitizeDiskSegment(input) {
  return (
    String(input || '')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\.+$/g, '')
      .trim()
      .slice(0, 140) || 'item'
  );
}

function encodeBlobFilename(key) {
  return Buffer.from(String(key || ''), 'utf-8').toString('base64url');
}

function ensureLocalDiskDirs() {
  const dirs = [
    LOCAL_DATA_ROOT,
    LOCAL_BACKUP_DIR,
    LOCAL_BLOBS_DIR,
    path.join(LOCAL_DATA_ROOT, 'PDFs Pessoais'),
    path.join(LOCAL_DATA_ROOT, 'Lei Seca'),
    path.join(LOCAL_DATA_ROOT, 'Provas'),
    path.join(LOCAL_DATA_ROOT, 'Resumos'),
    path.join(LOCAL_DATA_ROOT, 'Discursivas'),
    path.join(LOCAL_DATA_ROOT, 'Editais'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function readRequestBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

ensureLocalDiskDirs();

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, {
        status: 'ok',
        aiConfigured: false,
        localOfflineMode: true,
        dataDir: LOCAL_DATA_ROOT,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (pathname === '/api/local-disk/status' && req.method === 'GET') {
      ensureLocalDiskDirs();
      const canonicalFile = path.join(LOCAL_BACKUP_DIR, 'estuda-gov-db-atual.json');
      let updatedAt = null;
      if (fs.existsSync(canonicalFile)) {
        updatedAt = fs.statSync(canonicalFile).mtime.toISOString();
      }
      sendJson(res, 200, {
        enabled: true,
        dataDir: LOCAL_DATA_ROOT,
        hasDb: fs.existsSync(canonicalFile),
        updatedAt,
      });
      return;
    }

    if (pathname === '/api/local-disk/db' && req.method === 'GET') {
      ensureLocalDiskDirs();
      const scope = sanitizeDiskSegment(parsedUrl.searchParams.get('scope') || 'offline_guest');
      const scopedFile = path.join(LOCAL_BACKUP_DIR, `db-${scope}.json`);
      const canonicalFile = path.join(LOCAL_BACKUP_DIR, 'estuda-gov-db-atual.json');
      const candidates = [scopedFile, canonicalFile].filter((f) => fs.existsSync(f));

      if (candidates.length === 0) {
        sendJson(res, 404, { found: false });
        return;
      }

      let bestRecord = null;
      for (const file of candidates) {
        try {
          const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
          const rawStr =
            typeof parsed.raw === 'string'
              ? parsed.raw
              : parsed.db
                ? JSON.stringify(parsed.db)
                : '';
          const ts = parsed.updatedAt || fs.statSync(file).mtime.toISOString();
          if (rawStr && (!bestRecord || ts > bestRecord.updatedAt)) {
            bestRecord = {
              raw: rawStr,
              updatedAt: ts,
              byteLength: rawStr.length,
            };
          }
        } catch {
          // ignore
        }
      }

      if (!bestRecord) {
        sendJson(res, 404, { found: false });
        return;
      }
      sendJson(res, 200, { found: true, snapshot: bestRecord });
      return;
    }

    if (pathname === '/api/local-disk/db' && req.method === 'POST') {
      ensureLocalDiskDirs();
      const buf = await readRequestBuffer(req);
      const body = JSON.parse(buf.toString('utf-8') || '{}');
      const raw = body.raw;
      if (!raw || typeof raw !== 'string') {
        sendJson(res, 400, { error: 'Snapshot vazio.' });
        return;
      }
      const cleanScope = sanitizeDiskSegment(body.scope || 'offline_guest');
      const nowIso = body.updatedAt || new Date().toISOString();
      const payload = JSON.stringify({ scope: cleanScope, updatedAt: nowIso, raw }, null, 2);

      const scopedFile = path.join(LOCAL_BACKUP_DIR, `db-${cleanScope}.json`);
      const canonicalFile = path.join(LOCAL_BACKUP_DIR, 'estuda-gov-db-atual.json');

      fs.writeFileSync(`${scopedFile}.tmp`, payload, 'utf-8');
      fs.renameSync(`${scopedFile}.tmp`, scopedFile);

      fs.writeFileSync(`${canonicalFile}.tmp`, payload, 'utf-8');
      fs.renameSync(`${canonicalFile}.tmp`, canonicalFile);

      sendJson(res, 200, { ok: true, updatedAt: nowIso });
      return;
    }

    if (pathname === '/api/local-disk/blob' && req.method === 'POST') {
      ensureLocalDiskDirs();
      const key = String(parsedUrl.searchParams.get('key') || req.headers['x-blob-key'] || '').trim();
      if (!key) {
        sendJson(res, 400, { error: 'Chave ausente.' });
        return;
      }
      const bodyBuf = await readRequestBuffer(req);
      const mimeType = String(req.headers['content-type'] || 'application/octet-stream');
      const safeName = encodeBlobFilename(key);
      const binPath = path.join(LOCAL_BLOBS_DIR, `${safeName}.bin`);
      const metaPath = path.join(LOCAL_BLOBS_DIR, `${safeName}.meta.json`);

      fs.writeFileSync(`${binPath}.tmp`, bodyBuf);
      fs.renameSync(`${binPath}.tmp`, binPath);
      fs.writeFileSync(
        metaPath,
        JSON.stringify({ key, mimeType, size: bodyBuf.length, updatedAt: new Date().toISOString() }),
        'utf-8',
      );
      sendJson(res, 200, { ok: true, size: bodyBuf.length });
      return;
    }

    if (pathname === '/api/local-disk/blob' && req.method === 'GET') {
      const key = String(parsedUrl.searchParams.get('key') || '').trim();
      if (!key) {
        res.writeHead(400);
        res.end();
        return;
      }
      const safeName = encodeBlobFilename(key);
      let binPath = path.join(LOCAL_BLOBS_DIR, `${safeName}.bin`);
      let metaPath = path.join(LOCAL_BLOBS_DIR, `${safeName}.meta.json`);

      if (!fs.existsSync(binPath)) {
        const idx = key.indexOf('::');
        const rawKey = idx >= 0 ? key.slice(idx + 2) : key;
        const altName = encodeBlobFilename(`offline_guest::${rawKey}`);
        binPath = path.join(LOCAL_BLOBS_DIR, `${altName}.bin`);
        metaPath = path.join(LOCAL_BLOBS_DIR, `${altName}.meta.json`);
      }

      if (!fs.existsSync(binPath)) {
        res.writeHead(404);
        res.end();
        return;
      }

      let mimeType = 'application/pdf';
      if (fs.existsSync(metaPath)) {
        try {
          mimeType = JSON.parse(fs.readFileSync(metaPath, 'utf-8')).mimeType || mimeType;
        } catch {
          // ignore
        }
      }
      res.writeHead(200, { 'Content-Type': mimeType, 'Cache-Control': 'no-store' });
      fs.createReadStream(binPath).pipe(res);
      return;
    }

    if (pathname === '/api/local-disk/blob' && req.method === 'DELETE') {
      const key = String(parsedUrl.searchParams.get('key') || '').trim();
      if (key) {
        const safeName = encodeBlobFilename(key);
        const binPath = path.join(LOCAL_BLOBS_DIR, `${safeName}.bin`);
        const metaPath = path.join(LOCAL_BLOBS_DIR, `${safeName}.meta.json`);
        if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/local-disk/readable-file' && req.method === 'POST') {
      ensureLocalDiskDirs();
      const rawFileName = decodeURIComponent(String(req.headers['x-file-name'] || 'arquivo.pdf'));
      const rawSubfolders = decodeURIComponent(String(req.headers['x-subfolders'] || 'PDFs Pessoais'));
      const parts = rawSubfolders
        .split('/')
        .map((p) => sanitizeDiskSegment(p))
        .filter(Boolean);
      const targetDir = path.join(LOCAL_DATA_ROOT, ...parts);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const filePath = path.join(targetDir, sanitizeDiskSegment(rawFileName));
      const bodyBuf = await readRequestBuffer(req);
      fs.writeFileSync(`${filePath}.tmp`, bodyBuf);
      fs.renameSync(`${filePath}.tmp`, filePath);
      sendJson(res, 200, { ok: true, filePath });
      return;
    }

    // Serve static files from ./dist
    const cleanPath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const safeRelPath = path.normalize(cleanPath).replace(/^(\.\.(\/|\\|$))+/, '');
    let filePath = path.join(DIST_DIR, safeRelPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo dist/index.html nao encontrado.');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[Servidor Offline] Erro:', err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Erro interno no servidor local.' });
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('====================================================================');
  console.log(`  estuda.gov.br - Servidor Portatil 100% Offline Ativo!`);
  console.log(`  Acesse: http://127.0.0.1:${PORT}`);
  console.log(`  Dados salvos automaticamente em: ${LOCAL_DATA_ROOT}`);
  console.log('====================================================================');
});
