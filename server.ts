import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8')) as {
  apiKey?: string;
  projectId?: string;
};

const AUTHORIZED_EMAILS = new Set([
  'estudos.halberes@gmail.com',
  'ayla.tayna22@gmail.com',
]);

const GEMINI_MODEL = 'gemini-4-hydrogen';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no ambiente do servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

type AuthenticatedRequest = Request & { authUser?: VerifiedFirebaseUser };

async function requireAuthorizedFirebaseUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) {
      res.status(401).json({ error: 'Token de autenticação ausente.' });
      return;
    }

    const idToken = match[1].trim();
    const apiKey = String(firebaseConfig.apiKey || '').trim();
    if (!apiKey) {
      res.status(500).json({ error: 'Configuração do Firebase ausente no servidor.' });
      return;
    }

    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );

    if (!lookupRes.ok) {
      res.status(401).json({ error: 'Sessão Firebase inválida ou expirada. Reconecte sua conta Google.' });
      return;
    }

    const lookupData = (await lookupRes.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = lookupData.users?.[0];
    const email = String(user?.email || '').trim().toLowerCase();
    const emailVerified = Boolean(user?.emailVerified);

    if (!user?.localId || !emailVerified || !AUTHORIZED_EMAILS.has(email)) {
      res.status(403).json({
        error: 'Acesso negado: apenas contas verificadas e autorizadas podem utilizar os serviços de IA.',
      });
      return;
    }

    req.authUser = {
      uid: user.localId,
      email,
      emailVerified,
    };
    next();
  } catch (err) {
    console.error('[Server Auth] Erro ao validar token Firebase:', err);
    res.status(500).json({ error: 'Falha ao verificar credenciais de acesso.' });
  }
}

function sanitizeDiskSegment(input: string): string {
  return String(input || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.+$/g, '')
    .trim()
    .slice(0, 140) || 'item';
}

function encodeBlobFilename(key: string): string {
  return Buffer.from(String(key || ''), 'utf-8').toString('base64url');
}

function isLocalOfflineAllowed(req: Request): boolean {
  if (process.env.LOCAL_OFFLINE_MODE === 'true') return true;
  if (req.headers['x-forwarded-for']) return false;
  const host = String(req.headers.host || '').toLowerCase();
  return host.startsWith('localhost:') || host === 'localhost' || host.startsWith('127.0.0.1:') || host === '127.0.0.1';
}

const LOCAL_DATA_ROOT = path.resolve(
  process.cwd(),
  process.env.LOCAL_STUDY_DATA_DIR || 'Dados_Estudo_Local',
);
const LOCAL_BACKUP_DIR = path.join(LOCAL_DATA_ROOT, 'Backup_Automatico');
const LOCAL_BLOBS_DIR = path.join(LOCAL_DATA_ROOT, '.blobs');

function ensureLocalDiskDirs(): void {
  const subfolders = [
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
  for (const dir of subfolders) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  if (process.env.LOCAL_OFFLINE_MODE === 'true') {
    try {
      ensureLocalDiskDirs();
      console.log(`[estuda.gov.br] Pasta de dados local ativa em: ${LOCAL_DATA_ROOT}`);
    } catch (err) {
      console.warn('[estuda.gov.br] Aviso ao criar pasta local:', err);
    }
  }

  // Rotas de gravação binária direta no disco local (Opção 2 - Modo Portátil/Offline)
  app.post(
    '/api/local-disk/blob',
    express.raw({ type: '*/*', limit: '150mb' }),
    (req: Request, res: Response) => {
      if (!isLocalOfflineAllowed(req)) {
        res.status(403).json({ error: 'Disponível apenas em execução local.' });
        return;
      }
      try {
        ensureLocalDiskDirs();
        const key = String(req.query.key || req.headers['x-blob-key'] || '').trim();
        if (!key) {
          res.status(400).json({ error: 'Chave do arquivo ausente.' });
          return;
        }
        const mimeType = String(req.headers['content-type'] || 'application/octet-stream');
        const safeName = encodeBlobFilename(key);
        const binPath = path.join(LOCAL_BLOBS_DIR, `${safeName}.bin`);
        const metaPath = path.join(LOCAL_BLOBS_DIR, `${safeName}.meta.json`);
        const bodyBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

        const tmpBin = `${binPath}.tmp`;
        fs.writeFileSync(tmpBin, bodyBuf);
        fs.renameSync(tmpBin, binPath);
        fs.writeFileSync(
          metaPath,
          JSON.stringify({ key, mimeType, size: bodyBuf.length, updatedAt: new Date().toISOString() }),
          'utf-8',
        );

        res.json({ ok: true, size: bodyBuf.length });
      } catch (err: any) {
        console.error('[Local Disk Blob Save] Erro:', err);
        res.status(500).json({ error: err?.message || 'Erro ao gravar arquivo no disco local.' });
      }
    },
  );

  app.post(
    '/api/local-disk/readable-file',
    express.raw({ type: '*/*', limit: '150mb' }),
    (req: Request, res: Response) => {
      if (!isLocalOfflineAllowed(req)) {
        res.status(403).json({ error: 'Disponível apenas em execução local.' });
        return;
      }
      try {
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
        const bodyBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
        const tmpFile = `${filePath}.tmp`;
        fs.writeFileSync(tmpFile, bodyBuf);
        fs.renameSync(tmpFile, filePath);

        res.json({ ok: true, filePath });
      } catch (err: any) {
        console.error('[Local Disk Readable File] Erro:', err);
        res.status(500).json({ error: err?.message || 'Erro ao salvar arquivo na pasta local.' });
      }
    },
  );

  app.get('/api/local-disk/blob', (req: Request, res: Response) => {
    if (!isLocalOfflineAllowed(req)) {
      res.status(403).end();
      return;
    }
    try {
      const key = String(req.query.key || '').trim();
      if (!key) {
        res.status(400).end();
        return;
      }
      const safeName = encodeBlobFilename(key);
      const binPath = path.join(LOCAL_BLOBS_DIR, `${safeName}.bin`);
      const metaPath = path.join(LOCAL_BLOBS_DIR, `${safeName}.meta.json`);
      if (!fs.existsSync(binPath)) {
        // Tenta também sem escopo caso tenha sido salvo com outro prefixo
        const idx = key.indexOf('::');
        const rawKey = idx >= 0 ? key.slice(idx + 2) : key;
        const altName = encodeBlobFilename(`offline_guest::${rawKey}`);
        const altBin = path.join(LOCAL_BLOBS_DIR, `${altName}.bin`);
        const altMeta = path.join(LOCAL_BLOBS_DIR, `${altName}.meta.json`);
        if (!fs.existsSync(altBin)) {
          res.status(404).end();
          return;
        }
        let mime = 'application/pdf';
        if (fs.existsSync(altMeta)) {
          try {
            mime = JSON.parse(fs.readFileSync(altMeta, 'utf-8')).mimeType || mime;
          } catch {
            // ignore
          }
        }
        res.setHeader('Content-Type', mime);
        res.sendFile(altBin);
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
      res.setHeader('Content-Type', mimeType);
      res.sendFile(binPath);
    } catch {
      res.status(500).end();
    }
  });

  app.delete('/api/local-disk/blob', (req: Request, res: Response) => {
    if (!isLocalOfflineAllowed(req)) {
      res.status(403).end();
      return;
    }
    try {
      const key = String(req.query.key || '').trim();
      if (!key) {
        res.status(400).end();
        return;
      }
      const safeName = encodeBlobFilename(key);
      const binPath = path.join(LOCAL_BLOBS_DIR, `${safeName}.bin`);
      const metaPath = path.join(LOCAL_BLOBS_DIR, `${safeName}.meta.json`);
      if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
      if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false });
    }
  });

  app.use(express.json({ limit: '50mb' }));

  app.get('/api/local-disk/status', (req: Request, res: Response) => {
    const allowed = isLocalOfflineAllowed(req);
    if (!allowed) {
      res.json({ enabled: false });
      return;
    }
    try {
      ensureLocalDiskDirs();
      const canonicalFile = path.join(LOCAL_BACKUP_DIR, 'estuda-gov-db-atual.json');
      let updatedAt: string | null = null;
      if (fs.existsSync(canonicalFile)) {
        const stat = fs.statSync(canonicalFile);
        updatedAt = stat.mtime.toISOString();
      }
      res.json({
        enabled: true,
        dataDir: LOCAL_DATA_ROOT,
        hasDb: fs.existsSync(canonicalFile),
        updatedAt,
      });
    } catch {
      res.json({ enabled: false });
    }
  });

  app.get('/api/local-disk/db', (req: Request, res: Response) => {
    if (!isLocalOfflineAllowed(req)) {
      res.status(403).json({ error: 'Disponível apenas em execução local.' });
      return;
    }
    try {
      ensureLocalDiskDirs();
      const scope = sanitizeDiskSegment(String(req.query.scope || 'offline_guest'));
      const scopedFile = path.join(LOCAL_BACKUP_DIR, `db-${scope}.json`);
      const canonicalFile = path.join(LOCAL_BACKUP_DIR, 'estuda-gov-db-atual.json');

      const candidates = [scopedFile, canonicalFile].filter((f) => fs.existsSync(f));
      if (candidates.length === 0) {
        res.status(404).json({ found: false });
        return;
      }

      // Escolhe o arquivo com updatedAt mais recente
      let bestRecord: { raw: string; updatedAt: string; byteLength: number } | null = null;
      for (const file of candidates) {
        try {
          const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
            raw?: string;
            updatedAt?: string;
            db?: unknown;
          };
          const rawStr = typeof parsed.raw === 'string' ? parsed.raw : parsed.db ? JSON.stringify(parsed.db) : '';
          const ts = parsed.updatedAt || fs.statSync(file).mtime.toISOString();
          if (rawStr && (!bestRecord || ts > bestRecord.updatedAt)) {
            bestRecord = {
              raw: rawStr,
              updatedAt: ts,
              byteLength: rawStr.length,
            };
          }
        } catch {
          // ignore corrupted candidate
        }
      }

      if (!bestRecord) {
        res.status(404).json({ found: false });
        return;
      }
      res.json({ found: true, snapshot: bestRecord });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erro ao ler banco local.' });
    }
  });

  app.post('/api/local-disk/db', (req: Request, res: Response) => {
    if (!isLocalOfflineAllowed(req)) {
      res.status(403).json({ error: 'Disponível apenas em execução local.' });
      return;
    }
    try {
      ensureLocalDiskDirs();
      const { scope, raw, updatedAt } = (req.body || {}) as {
        scope?: string;
        raw?: string;
        updatedAt?: string;
      };
      if (!raw || typeof raw !== 'string') {
        res.status(400).json({ error: 'Snapshot vazio.' });
        return;
      }
      const cleanScope = sanitizeDiskSegment(scope || 'offline_guest');
      const nowIso = updatedAt || new Date().toISOString();
      const payload = JSON.stringify({ scope: cleanScope, updatedAt: nowIso, raw }, null, 2);

      const scopedFile = path.join(LOCAL_BACKUP_DIR, `db-${cleanScope}.json`);
      const canonicalFile = path.join(LOCAL_BACKUP_DIR, 'estuda-gov-db-atual.json');

      const tmpScoped = `${scopedFile}.tmp`;
      fs.writeFileSync(tmpScoped, payload, 'utf-8');
      fs.renameSync(tmpScoped, scopedFile);

      const tmpCanonical = `${canonicalFile}.tmp`;
      fs.writeFileSync(tmpCanonical, payload, 'utf-8');
      fs.renameSync(tmpCanonical, canonicalFile);

      res.json({ ok: true, updatedAt: nowIso });
    } catch (err: any) {
      console.error('[Local Disk DB Save] Erro:', err);
      res.status(500).json({ error: err?.message || 'Erro ao gravar banco no disco local.' });
    }
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      localOfflineMode: process.env.LOCAL_OFFLINE_MODE === 'true',
      projectId: firebaseConfig.projectId || null,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/ai/analyze-edital', requireAuthorizedFirebaseUser, async (req: Request, res: Response) => {
    try {
      const { text, defaultSubject, contestName } = (req.body || {}) as {
        text?: string;
        defaultSubject?: string;
        contestName?: string;
      };
      const cleanText = String(text || '').trim();
      if (cleanText.length < 10) {
        res.status(400).json({ error: 'Cole o conteúdo programático do edital para analisar.' });
        return;
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          `Extraia todos os pontos programáticos deste edital${contestName ? ` (${contestName})` : ''} organizados por matéria/disciplina.`,
          `Se algum bloco não indicar explicitamente a matéria, use "${defaultSubject?.trim() || 'Geral'}".`,
          'Preserve a numeração e nomenclatura fiel dos tópicos sem inventar conteúdo fora do texto.',
          '',
          cleanText.slice(0, 60_000),
        ].join('\n'),
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    materia: { type: Type.STRING },
                    titulo: { type: Type.STRING },
                    observacao: { type: Type.STRING },
                  },
                  required: ['materia', 'titulo'],
                },
              },
            },
            required: ['topics'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{"topics":[]}') as {
        topics?: Array<{ materia?: string; titulo?: string; observacao?: string }>;
      };
      const topics = Array.isArray(parsed.topics)
        ? parsed.topics
            .filter((t) => t?.titulo && String(t.titulo).trim())
            .map((t) => ({
              materia: String(t.materia || defaultSubject || 'Geral').trim(),
              titulo: String(t.titulo || '').trim(),
              ...(t.observacao ? { observacao: String(t.observacao).trim() } : {}),
            }))
        : [];

      res.json({ topics });
    } catch (err: any) {
      console.error('[API /api/ai/analyze-edital] Erro:', err);
      res.status(500).json({
        error: err?.message || 'Erro ao analisar o edital com Gemini.',
      });
    }
  });

  app.post('/api/ai/review-essay', requireAuthorizedFirebaseUser, async (req: Request, res: Response) => {
    try {
      const { title, essayText, banca } = (req.body || {}) as {
        title?: string;
        essayText?: string;
        banca?: string;
      };
      const cleanEssay = String(essayText || '').trim();
      if (cleanEssay.length < 30) {
        res.status(400).json({ error: 'Texto da dissertação/peça insuficiente para correção.' });
        return;
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          'Atue como examinador rigoroso de concursos públicos jurídicos brasileiros.',
          `Tema/Título: ${title?.trim() || 'Não informado'}`,
          banca ? `Banca de referência: ${banca}` : 'Critérios padrão CEBRASPE/FGV (conteúdo técnico-jurídico, coesão, coerência e norma culta).',
          'Avalie a resposta abaixo apontando acertos técnicos, lacunas de fundamentação legal/jurisprudencial, desvios gramaticais objetivos e nota estimada de 0 a 10.',
          '',
          cleanEssay.slice(0, 40_000),
        ].join('\n'),
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              feedback: { type: Type.STRING },
              scoreEstimate: { type: Type.STRING },
              strengths: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              improvements: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['feedback'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}') as {
        feedback?: string;
        scoreEstimate?: string;
        strengths?: string[];
        improvements?: string[];
      };

      res.json({
        feedback: String(parsed.feedback || '').trim(),
        scoreEstimate: parsed.scoreEstimate ? String(parsed.scoreEstimate) : undefined,
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
      });
    } catch (err: any) {
      console.error('[API /api/ai/review-essay] Erro:', err);
      res.status(500).json({
        error: err?.message || 'Erro ao corrigir a redação com Gemini.',
      });
    }
  });

  app.post('/api/ai/generate-questions', requireAuthorizedFirebaseUser, async (req: Request, res: Response) => {
    try {
      const { subject, topic, count, banca } = (req.body || {}) as {
        subject?: string;
        topic?: string;
        count?: number;
        banca?: string;
      };
      const cleanTopic = String(topic || '').trim();
      if (!cleanTopic) {
        res.status(400).json({ error: 'Informe o tópico jurídico para gerar questões.' });
        return;
      }

      const safeCount = Math.min(10, Math.max(1, Number(count) || 5));
      const cleanSubject = String(subject || 'Direito').trim();

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          `Crie ${safeCount} questões objetivas inéditas de concurso público em português sobre "${cleanSubject} - ${cleanTopic}"${banca ? ` no estilo ${banca}` : ''}.`,
          'Cada questão deve ter alternativas A, B, C, D, E, gabarito exato (A-E) e comentário fundamentado na legislação/jurisprudência.',
        ].join('\n'),
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    materia: { type: Type.STRING },
                    enunciado: { type: Type.STRING },
                    alternativas: {
                      type: Type.OBJECT,
                      properties: {
                        A: { type: Type.STRING },
                        B: { type: Type.STRING },
                        C: { type: Type.STRING },
                        D: { type: Type.STRING },
                        E: { type: Type.STRING },
                      },
                      required: ['A', 'B', 'C', 'D', 'E'],
                    },
                    gabarito: { type: Type.STRING },
                    comentario: { type: Type.STRING },
                  },
                  required: ['materia', 'enunciado', 'alternativas', 'gabarito', 'comentario'],
                },
              },
            },
            required: ['questions'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{"questions":[]}') as { questions?: unknown[] };
      res.json({ questions: Array.isArray(parsed.questions) ? parsed.questions : [] });
    } catch (err: any) {
      console.error('[API /api/ai/generate-questions] Erro:', err);
      res.status(500).json({
        error: err?.message || 'Erro ao gerar questões com Gemini.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[estuda.gov.br] Servidor rodando na porta ${port}`);
  });
}

void startServer();
