import 'dotenv/config';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { PersistentPushStore } from './server/pushStore';
import {
  AiResponseCache,
  initSseResponse,
  validateEditalPayload,
  validateEssayPayload,
  validateQuestionsPayload,
  validateSummaryPayload,
  withTimeoutAndRetry,
  writeSseEvent,
} from './server/aiHelpers';
import {
  globalErrorMiddleware,
  httpCompressionMiddleware,
  requestLoggerAndIdMiddleware,
} from './server/httpMiddleware';

const GEMINI_MODEL = 'gemini-4-hydrogen';
const SERVER_BOOT_TIME_MS = Date.now();

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

function requireAuthorizedStudyClient(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const clientHeader = String(req.headers['x-study-client'] || '').trim();
  const authHeader = String(req.headers.authorization || '').trim();
  if (clientHeader === 'central-estudos' || /^Bearer\s+.+/i.test(authHeader)) {
    next();
    return;
  }
  res.status(401).json({ error: 'Requisição não autorizada.' });
}

function parseEssayStreamSections(rawText: string): {
  feedback: string;
  scoreEstimate?: string;
  strengths: string[];
  improvements: string[];
} {
  const clean = rawText.trim();
  const scoreMatch = clean.match(/(?:nota\s*estimada|nota\s*sugerida|nota)\s*[:\-]\s*([^\n]+)/i);
  const scoreEstimate = scoreMatch?.[1]?.trim();

  const extractBullets = (headingPattern: RegExp): string[] => {
    const match = clean.match(headingPattern);
    if (!match?.[1]) return [];
    return match[1]
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*•\d.)]+\s*/, '').trim())
      .filter((line) => line.length > 2)
      .slice(0, 8);
  };

  const strengths = extractBullets(
    /pontos\s+fortes\s*:?\s*\n([\s\S]*?)(?:\n\s*(?:pontos\s+a\s+melhorar|sugest[õo]es|recomenda[çc][õo]es|conclus[ãa]o)\s*:?|$)/i,
  );
  const improvements = extractBullets(
    /pontos\s+a\s+melhorar\s*:?\s*\n([\s\S]*?)(?:\n\s*(?:nota\s+estimada|conclus[ãa]o|parecer\s+final)\s*:?|$)/i,
  );

  return {
    feedback: clean,
    ...(scoreEstimate ? { scoreEstimate } : {}),
    strengths,
    improvements,
  };
}

function parseSummaryStreamSections(rawText: string, fallbackTitle: string): {
  title: string;
  summaryText: string;
  keyPoints: string[];
} {
  const clean = rawText.trim();
  const lines = clean.split(/\r?\n/);
  let title = `Resumo — ${fallbackTitle}`;
  if (lines[0]?.trim().startsWith('#')) {
    title = lines[0].replace(/^#+\s*/, '').trim() || title;
  } else if (/^t[íi]tulo\s*:/i.test(lines[0] || '')) {
    title = lines[0].replace(/^t[íi]tulo\s*:\s*/i, '').trim() || title;
  }

  const keyPoints = lines
    .filter((l) => /^\s*[-•*]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-•*]\s+/, '').trim())
    .filter((l) => l.length > 6)
    .slice(0, 8);

  return {
    title,
    summaryText: clean,
    keyPoints,
  };
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  const pushStore = new PersistentPushStore();
  const aiCache = new AiResponseCache(80, 15 * 60 * 1000);

  const pushJsonParser = express.json({ limit: '64kb' });
  const aiJsonParser = express.json({ limit: '2mb' });

  app.use(requestLoggerAndIdMiddleware);
  app.use(httpCompressionMiddleware);

  app.get('/api/health', (_req: Request, res: Response) => {
    const mem = process.memoryUsage();
    const pushStats = pushStore.getStats();
    const cacheStats = aiCache.getStats();
    res.json({
      status: 'ok',
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      backendMode: 'google-apps-script',
      uptimeSeconds: Math.floor((Date.now() - SERVER_BOOT_TIME_MS) / 1000),
      memoryMb: {
        rss: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      },
      pushStore: pushStats,
      aiCache: cacheStats,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/push/status', requireAuthorizedStudyClient, (_req: Request, res: Response) => {
    const vapidPublicKey =
      String(process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim() || null;
    const stats = pushStore.getStats();
    res.json({
      ok: true,
      vapidPublicKey,
      activeSubscriptions: stats.activeSubscriptions,
      persisted: stats.persisted,
      lastSavedAt: stats.lastSavedAt,
    });
  });

  app.post('/api/push/subscribe', requireAuthorizedStudyClient, pushJsonParser, (req: Request, res: Response) => {
    const sub = req.body?.subscription as
      | { endpoint?: string; keys?: Record<string, unknown> }
      | undefined;
    const result = pushStore.upsert({
      endpoint: typeof sub?.endpoint === 'string' ? sub.endpoint : '',
      keys: sub?.keys,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      reminderHours: req.body?.reminderHours,
    });
    if (result.ok === false) {
      res.status(400).json({ error: result.error });
      return;
    }
    const stats = pushStore.getStats();
    res.json({
      ok: true,
      activeSubscriptions: stats.activeSubscriptions,
      persisted: stats.persisted,
      lastSavedAt: stats.lastSavedAt,
    });
  });

  app.post('/api/push/unsubscribe', requireAuthorizedStudyClient, pushJsonParser, (req: Request, res: Response) => {
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : '';
    if (endpoint) {
      pushStore.remove(endpoint);
    }
    const stats = pushStore.getStats();
    res.json({
      ok: true,
      activeSubscriptions: stats.activeSubscriptions,
      persisted: stats.persisted,
    });
  });

  app.post('/api/ai/analyze-edital', requireAuthorizedStudyClient, aiJsonParser, async (req: Request, res: Response) => {
    try {
      const validation = validateEditalPayload(req.body);
      if (validation.ok === false) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const { text, defaultSubject, contestName } = validation.data;

      const cacheKey = aiCache.buildKey('analyze-edital', validation.data);
      const cached = aiCache.get<{ topics: unknown[] }>(cacheKey);
      if (cached) {
        res.setHeader('X-AI-Cache', 'HIT');
        res.json(cached);
        return;
      }

      const ai = getAiClient();
      const response = await withTimeoutAndRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            `Extraia todos os pontos programáticos deste edital${contestName ? ` (${contestName})` : ''} organizados por matéria/disciplina.`,
            `Se algum bloco não indicar explicitamente a matéria, use "${defaultSubject}".`,
            'Preserve a numeração e nomenclatura fiel dos tópicos sem inventar conteúdo fora do texto.',
            '',
            text,
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
        }),
      );

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

      const payload = { topics };
      aiCache.set(cacheKey, payload);
      res.setHeader('X-AI-Cache', 'MISS');
      res.json(payload);
    } catch (err: any) {
      console.error('[API /api/ai/analyze-edital] Erro:', err);
      res.status(500).json({
        error: err?.message || 'Erro ao analisar o edital com Gemini.',
      });
    }
  });

  app.post('/api/ai/review-essay', requireAuthorizedStudyClient, aiJsonParser, async (req: Request, res: Response) => {
    try {
      const validation = validateEssayPayload(req.body);
      if (validation.ok === false) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const { title, essayText, banca } = validation.data;

      const cacheKey = aiCache.buildKey('review-essay', validation.data);
      const cached = aiCache.get<Record<string, unknown>>(cacheKey);
      if (cached) {
        res.setHeader('X-AI-Cache', 'HIT');
        res.json(cached);
        return;
      }

      const ai = getAiClient();
      const response = await withTimeoutAndRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            'Atue como examinador rigoroso de concursos públicos jurídicos brasileiros.',
            `Tema/Título: ${title}`,
            banca
              ? `Banca de referência: ${banca}`
              : 'Critérios padrão CEBRASPE/FGV (conteúdo técnico-jurídico, coesão, coerência e norma culta).',
            'Avalie a resposta abaixo apontando acertos técnicos, lacunas de fundamentação legal/jurisprudencial, desvios gramaticais objetivos e nota estimada de 0 a 10.',
            '',
            essayText,
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
        }),
      );

      const parsed = JSON.parse(response.text || '{}') as {
        feedback?: string;
        scoreEstimate?: string;
        strengths?: string[];
        improvements?: string[];
      };

      const payload = {
        feedback: String(parsed.feedback || '').trim(),
        scoreEstimate: parsed.scoreEstimate ? String(parsed.scoreEstimate) : undefined,
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
      };
      aiCache.set(cacheKey, payload);
      res.setHeader('X-AI-Cache', 'MISS');
      res.json(payload);
    } catch (err: any) {
      console.error('[API /api/ai/review-essay] Erro:', err);
      res.status(500).json({
        error: err?.message || 'Erro ao corrigir a redação com Gemini.',
      });
    }
  });

  app.post(
    '/api/ai/review-essay/stream',
    requireAuthorizedStudyClient,
    aiJsonParser,
    async (req: Request, res: Response) => {
      const validation = validateEssayPayload(req.body);
      if (validation.ok === false) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const { title, essayText, banca } = validation.data;
      const cacheKey = aiCache.buildKey('review-essay-stream', validation.data);
      const cached = aiCache.get<{
        feedback: string;
        scoreEstimate?: string;
        strengths: string[];
        improvements: string[];
      }>(cacheKey);

      initSseResponse(res);

      if (cached) {
        writeSseEvent(res, 'chunk', { text: cached.feedback, cached: true });
        writeSseEvent(res, 'done', cached);
        res.end();
        return;
      }

      try {
        const ai = getAiClient();
        const stream = await withTimeoutAndRetry(() =>
          ai.models.generateContentStream({
            model: GEMINI_MODEL,
            contents: [
              'Atue como examinador rigoroso de concursos públicos jurídicos brasileiros.',
              `Tema/Título: ${title}`,
              banca
                ? `Banca de referência: ${banca}`
                : 'Critérios padrão CEBRASPE/FGV (conteúdo técnico-jurídico, coesão, coerência e norma culta).',
              'Responda em texto limpo e objetivo seguindo exatamente esta estrutura:',
              'Nota estimada: X,X / 10',
              '',
              'Parecer técnico detalhado (conteúdo jurídico, fundamentação legal/jurisprudencial, coesão e norma culta).',
              '',
              'Pontos fortes:',
              '- item 1',
              '- item 2',
              '',
              'Pontos a melhorar:',
              '- item 1',
              '- item 2',
              '',
              essayText,
            ].join('\n'),
          }),
        );

        let accumulated = '';
        for await (const chunk of stream) {
          if (res.writableEnded) break;
          const piece = chunk.text || '';
          if (piece) {
            accumulated += piece;
            writeSseEvent(res, 'chunk', { text: piece });
          }
        }

        const result = parseEssayStreamSections(accumulated);
        if (result.feedback) {
          aiCache.set(cacheKey, result);
        }
        writeSseEvent(res, 'done', result);
        res.end();
      } catch (err: any) {
        console.error('[API /api/ai/review-essay/stream] Erro:', err);
        writeSseEvent(res, 'error', {
          error: err?.message || 'Erro ao transmitir correção com Gemini.',
        });
        res.end();
      }
    },
  );

  app.post('/api/ai/generate-questions', requireAuthorizedStudyClient, aiJsonParser, async (req: Request, res: Response) => {
    try {
      const validation = validateQuestionsPayload(req.body);
      if (validation.ok === false) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const { subject, topic, count, banca } = validation.data;

      const cacheKey = aiCache.buildKey('generate-questions', validation.data);
      const cached = aiCache.get<{ questions: unknown[] }>(cacheKey);
      if (cached) {
        res.setHeader('X-AI-Cache', 'HIT');
        res.json(cached);
        return;
      }

      const ai = getAiClient();
      const response = await withTimeoutAndRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            `Crie ${count} questões objetivas inéditas de concurso público em português sobre "${subject} - ${topic}"${banca ? ` no estilo ${banca}` : ''}.`,
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
        }),
      );

      const parsed = JSON.parse(response.text || '{"questions":[]}') as { questions?: unknown[] };
      const payload = { questions: Array.isArray(parsed.questions) ? parsed.questions : [] };
      aiCache.set(cacheKey, payload);
      res.setHeader('X-AI-Cache', 'MISS');
      res.json(payload);
    } catch (err: any) {
      console.error('[API /api/ai/generate-questions] Erro:', err);
      res.status(500).json({
        error: err?.message || 'Erro ao gerar questões com Gemini.',
      });
    }
  });

  app.post('/api/ai/analyze-summary', requireAuthorizedStudyClient, aiJsonParser, async (req: Request, res: Response) => {
    try {
      const validation = validateSummaryPayload(req.body);
      if (validation.ok === false) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const { mode: safeMode, subject: cleanSubject, title: cleanTitle, sourceText: truncated, count, banca } =
        validation.data;

      const cacheKey = aiCache.buildKey('analyze-summary', validation.data);
      const cached = aiCache.get<Record<string, unknown>>(cacheKey);
      if (cached) {
        res.setHeader('X-AI-Cache', 'HIT');
        res.json(cached);
        return;
      }

      const ai = getAiClient();

      if (safeMode === 'questions') {
        const response = await withTimeoutAndRetry(() =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [
              `Com base EXCLUSIVAMENTE no resumo/material abaixo sobre "${cleanSubject} — ${cleanTitle}", crie ${count} questões objetivas inéditas de concurso público em português${banca ? ` no estilo da banca ${banca}` : ''}.`,
              'Cada questão deve ter 5 alternativas (A, B, C, D, E), gabarito exato (A-E) e comentário objetivo explicando por que a correta está certa e o erro principal das pegadinhas.',
              '',
              'MATERIAL BASE:',
              truncated,
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
          }),
        );
        const parsed = JSON.parse(response.text || '{"questions":[]}') as { questions?: unknown[] };
        const payload = { mode: 'questions', questions: Array.isArray(parsed.questions) ? parsed.questions : [] };
        aiCache.set(cacheKey, payload);
        res.setHeader('X-AI-Cache', 'MISS');
        res.json(payload);
        return;
      }

      if (safeMode === 'flashcards') {
        const response = await withTimeoutAndRetry(() =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [
              `A partir do material de estudo abaixo sobre "${cleanSubject} — ${cleanTitle}", extraia ${count} flashcards de revisão ativa (pergunta direta na frente, resposta concisa com fundamento/exceção no verso) focados no que mais cai em provas.`,
              '',
              'MATERIAL BASE:',
              truncated,
            ].join('\n'),
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  flashcards: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        front: { type: Type.STRING },
                        back: { type: Type.STRING },
                      },
                      required: ['front', 'back'],
                    },
                  },
                },
                required: ['flashcards'],
              },
            },
          }),
        );
        const parsed = JSON.parse(response.text || '{"flashcards":[]}') as { flashcards?: unknown[] };
        const payload = {
          mode: 'flashcards',
          flashcards: Array.isArray(parsed.flashcards) ? parsed.flashcards : [],
        };
        aiCache.set(cacheKey, payload);
        res.setHeader('X-AI-Cache', 'MISS');
        res.json(payload);
        return;
      }

      if (safeMode === 'mindmap') {
        const response = await withTimeoutAndRetry(() =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [
              `Transforme o material de estudo abaixo sobre "${cleanSubject} — ${cleanTitle}" em uma estrutura de Mapa Mental hierárquico para concursos públicos em português.`,
              'Crie 1 tema central curto (rootLabel), de 3 a 6 ramos principais (branches) e de 2 a 4 subtópicos concisos em cada ramo (children), com pequenas notas objetivas (artigos, prazos ou exceções) quando útil.',
              '',
              'MATERIAL BASE:',
              truncated,
            ].join('\n'),
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  rootLabel: { type: Type.STRING },
                  branches: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        note: { type: Type.STRING },
                        children: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              label: { type: Type.STRING },
                              note: { type: Type.STRING },
                            },
                            required: ['label'],
                          },
                        },
                      },
                      required: ['label', 'children'],
                    },
                  },
                },
                required: ['rootLabel', 'branches'],
              },
            },
          }),
        );
        const parsed = JSON.parse(response.text || '{"rootLabel":"","branches":[]}') as {
          rootLabel?: string;
          branches?: unknown[];
        };
        const payload = {
          mode: 'mindmap',
          mindmap: {
            rootLabel: parsed.rootLabel || cleanTitle,
            branches: Array.isArray(parsed.branches) ? parsed.branches : [],
          },
        };
        aiCache.set(cacheKey, payload);
        res.setHeader('X-AI-Cache', 'MISS');
        res.json(payload);
        return;
      }

      const response = await withTimeoutAndRetry(() =>
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            `Você é um professor especialista em concursos públicos. Transforme o material abaixo sobre "${cleanSubject} — ${cleanTitle}" em uma anotação de resumo clara, objetiva e pronta para revisão rápida.`,
            'Organize o texto em seções curtas com títulos em linha própria (ex.: "Conceito:", "Regras principais:", "Exceções e Pegadinhas:", "Base legal / Jurisprudência:") e itens com hífen (- ). Destaque prazos, exceções e artigos relevantes.',
            '',
            'MATERIAL BASE:',
            truncated,
          ].join('\n'),
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                summaryText: { type: Type.STRING },
                keyPoints: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['title', 'summaryText', 'keyPoints'],
            },
          },
        }),
      );
      const parsed = JSON.parse(response.text || '{"title":"","summaryText":"","keyPoints":[]}') as {
        title?: string;
        summaryText?: string;
        keyPoints?: string[];
      };
      const payload = {
        mode: 'summary',
        summary: {
          title: parsed.title || `Resumo — ${cleanTitle}`,
          summaryText: parsed.summaryText || '',
          keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        },
      };
      aiCache.set(cacheKey, payload);
      res.setHeader('X-AI-Cache', 'MISS');
      res.json(payload);
    } catch (err: any) {
      console.error('[API /api/ai/analyze-summary] Erro:', err);
      res.status(500).json({
        error: err?.message || 'Erro ao processar resumo com Gemini.',
      });
    }
  });

  app.post(
    '/api/ai/analyze-summary/stream',
    requireAuthorizedStudyClient,
    aiJsonParser,
    async (req: Request, res: Response) => {
      const validation = validateSummaryPayload(req.body);
      if (validation.ok === false) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const { subject: cleanSubject, title: cleanTitle, sourceText: truncated } = validation.data;
      const cacheKey = aiCache.buildKey('analyze-summary-stream', {
        subject: cleanSubject,
        title: cleanTitle,
        sourceText: truncated,
      });
      const cached = aiCache.get<{
        mode: 'summary';
        summary: { title: string; summaryText: string; keyPoints: string[] };
      }>(cacheKey);

      initSseResponse(res);

      if (cached) {
        writeSseEvent(res, 'chunk', { text: cached.summary.summaryText, cached: true });
        writeSseEvent(res, 'done', cached);
        res.end();
        return;
      }

      try {
        const ai = getAiClient();
        const stream = await withTimeoutAndRetry(() =>
          ai.models.generateContentStream({
            model: GEMINI_MODEL,
            contents: [
              `Você é um professor especialista em concursos públicos. Transforme o material abaixo sobre "${cleanSubject} — ${cleanTitle}" em uma anotação de resumo clara, objetiva e pronta para revisão rápida.`,
              'Comece com "Título: <título curto>" na primeira linha. Depois organize em seções curtas (Conceito:, Regras principais:, Exceções e Pegadinhas:, Base legal / Jurisprudência:) usando itens com hífen (- ). Destaque prazos, exceções e artigos relevantes.',
              '',
              'MATERIAL BASE:',
              truncated,
            ].join('\n'),
          }),
        );

        let accumulated = '';
        for await (const chunk of stream) {
          if (res.writableEnded) break;
          const piece = chunk.text || '';
          if (piece) {
            accumulated += piece;
            writeSseEvent(res, 'chunk', { text: piece });
          }
        }

        const summary = parseSummaryStreamSections(accumulated, cleanTitle);
        const payload = { mode: 'summary' as const, summary };
        if (summary.summaryText) {
          aiCache.set(cacheKey, payload);
        }
        writeSseEvent(res, 'done', payload);
        res.end();
      } catch (err: any) {
        console.error('[API /api/ai/analyze-summary/stream] Erro:', err);
        writeSseEvent(res, 'error', {
          error: err?.message || 'Erro ao transmitir resumo com Gemini.',
        });
        res.end();
      }
    },
  );

  app.use(globalErrorMiddleware);

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
