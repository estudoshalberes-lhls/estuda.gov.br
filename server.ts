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

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
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
      server: { middlewareMode: true },
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
