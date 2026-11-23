import 'dotenv/config';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

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

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      backendMode: 'google-apps-script',
      timestamp: new Date().toISOString(),
    });
  });

  // Web Push subscription registry (VAPID optional; SW local/scheduled alerts work without secrets)
  const pushSubscriptions = new Map<string, { endpoint: string; keys?: Record<string, string>; updatedAt: string }>();

  app.get('/api/push/status', requireAuthorizedStudyClient, (_req: Request, res: Response) => {
    const vapidPublicKey =
      String(process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '').trim() || null;
    res.json({
      ok: true,
      vapidPublicKey,
      activeSubscriptions: pushSubscriptions.size,
    });
  });

  app.post('/api/push/subscribe', requireAuthorizedStudyClient, (req: Request, res: Response) => {
    const sub = req.body?.subscription as
      | { endpoint?: string; keys?: Record<string, string> }
      | undefined;
    const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint.trim() : '';
    if (!endpoint || !/^https?:\/\//i.test(endpoint)) {
      res.status(400).json({ error: 'Inscrição Push inválida (endpoint ausente).' });
      return;
    }
    pushSubscriptions.set(endpoint, {
      endpoint,
      keys: sub?.keys && typeof sub.keys === 'object' ? sub.keys : undefined,
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true, activeSubscriptions: pushSubscriptions.size });
  });

  app.post('/api/push/unsubscribe', requireAuthorizedStudyClient, (req: Request, res: Response) => {
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : '';
    if (endpoint) {
      pushSubscriptions.delete(endpoint);
    }
    res.json({ ok: true, activeSubscriptions: pushSubscriptions.size });
  });

  app.post('/api/ai/analyze-edital', requireAuthorizedStudyClient, async (req: Request, res: Response) => {
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

  app.post('/api/ai/review-essay', requireAuthorizedStudyClient, async (req: Request, res: Response) => {
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

  app.post('/api/ai/generate-questions', requireAuthorizedStudyClient, async (req: Request, res: Response) => {
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

  app.post('/api/ai/analyze-summary', requireAuthorizedStudyClient, async (req: Request, res: Response) => {
    try {
      const { mode, subject, title, sourceText, count, banca } = (req.body || {}) as {
        mode?: 'summary' | 'questions' | 'flashcards' | 'mindmap';
        subject?: string;
        title?: string;
        sourceText?: string;
        count?: number;
        banca?: string;
      };

      const cleanText = String(sourceText || '').trim();
      if (cleanText.length < 20) {
        res.status(400).json({
          error: 'Conteúdo muito curto para análise com IA (mínimo de 20 caracteres).',
        });
        return;
      }

      const safeMode = mode || 'summary';
      const cleanSubject = String(subject || 'Geral').trim();
      const cleanTitle = String(title || 'Material de Estudo').trim();
      const truncated = cleanText.slice(0, 32000);
      const ai = getAiClient();

      if (safeMode === 'questions') {
        const safeCount = Math.min(8, Math.max(2, Number(count) || 5));
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            `Com base EXCLUSIVAMENTE no resumo/material abaixo sobre "${cleanSubject} — ${cleanTitle}", crie ${safeCount} questões objetivas inéditas de concurso público em português${banca ? ` no estilo da banca ${banca}` : ''}.`,
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
        });
        const parsed = JSON.parse(response.text || '{"questions":[]}') as { questions?: unknown[] };
        res.json({ mode: 'questions', questions: Array.isArray(parsed.questions) ? parsed.questions : [] });
        return;
      }

      if (safeMode === 'flashcards') {
        const safeCount = Math.min(12, Math.max(3, Number(count) || 6));
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            `A partir do material de estudo abaixo sobre "${cleanSubject} — ${cleanTitle}", extraia ${safeCount} flashcards de revisão ativa (pergunta direta na frente, resposta concisa com fundamento/exceção no verso) focados no que mais cai em provas.`,
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
        });
        const parsed = JSON.parse(response.text || '{"flashcards":[]}') as { flashcards?: unknown[] };
        res.json({ mode: 'flashcards', flashcards: Array.isArray(parsed.flashcards) ? parsed.flashcards : [] });
        return;
      }

      if (safeMode === 'mindmap') {
        const response = await ai.models.generateContent({
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
        });
        const parsed = JSON.parse(response.text || '{"rootLabel":"","branches":[]}') as {
          rootLabel?: string;
          branches?: unknown[];
        };
        res.json({
          mode: 'mindmap',
          mindmap: {
            rootLabel: parsed.rootLabel || cleanTitle,
            branches: Array.isArray(parsed.branches) ? parsed.branches : [],
          },
        });
        return;
      }

      // Default mode: 'summary'
      const response = await ai.models.generateContent({
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
      });
      const parsed = JSON.parse(response.text || '{"title":"","summaryText":"","keyPoints":[]}') as {
        title?: string;
        summaryText?: string;
        keyPoints?: string[];
      };
      res.json({
        mode: 'summary',
        summary: {
          title: parsed.title || `Resumo — ${cleanTitle}`,
          summaryText: parsed.summaryText || '',
          keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
        },
      });
    } catch (err: any) {
      console.error('[API /api/ai/analyze-summary] Erro:', err);
      res.status(500).json({
        error: err?.message || 'Erro ao processar resumo com Gemini.',
      });
    }
  });

  const ALLOWED_TTS_VOICES = new Set(['Kore', 'Zephyr', 'Charon', 'Puck', 'Fenrir']);
  const GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts';

  app.options('/api/ai/tts', (_req: Request, res: Response) => {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(204).end();
  });

  app.post('/api/ai/tts', requireAuthorizedStudyClient, async (req: Request, res: Response) => {
    try {
      const { text, voiceName, style } = (req.body || {}) as {
        text?: string;
        voiceName?: string;
        style?: string;
      };
      const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
      if (!cleanText) {
        res.status(400).json({ error: 'Texto vazio para síntese de voz.' });
        return;
      }

      const safeVoice =
        typeof voiceName === 'string' && ALLOWED_TTS_VOICES.has(voiceName.trim())
          ? voiceName.trim()
          : 'Kore';

      const safeStyle =
        typeof style === 'string' && style.trim()
          ? style.trim().slice(0, 300)
          : 'Narração em português do Brasil clara, natural, cadenciada e fluida, como um professor experiente lendo legislação em voz alta, com pausas orgânicas em vírgulas e pontos finais.';

      const apiKey = (
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.API_KEY ||
        process.env.VITE_GEMINI_API_KEY ||
        ''
      ).trim();
      if (!apiKey) {
        res.status(503).json({
          error:
            'GEMINI_API_KEY não encontrada no servidor. Na Vercel, salve em Settings → Environment Variables e clique em Deployments → Redeploy.',
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        apiVersion: 'v1beta',
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const requestTts = (model: string) =>
        ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: cleanText.slice(0, 3200),
                  speechMetadata: {
                    style: safeStyle,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: safeVoice },
              },
            },
          },
        });

      let response;
      try {
        response = await requestTts(GEMINI_TTS_MODEL);
      } catch (primaryErr: any) {
        if (primaryErr?.status === 503 || primaryErr?.status === 404) {
          response = await requestTts('gemini-3.8-flash-tts');
        } else {
          throw primaryErr;
        }
      }

      const parts = response.candidates?.[0]?.content?.parts || [];
      const audioPart = parts.find((p: any) => p?.inlineData?.data);
      const base64Audio = audioPart?.inlineData?.data;
      const mimeType = audioPart?.inlineData?.mimeType || 'audio/wav';

      if (!base64Audio) {
        res.status(502).json({
          error: 'O serviço de voz neural não retornou áudio para este trecho.',
        });
        return;
      }

      const wavBuffer = Buffer.from(base64Audio, 'base64');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', String(wavBuffer.length));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(wavBuffer);
    } catch (err: any) {
      console.error('[API /api/ai/tts] Erro:', err);
      const status =
        typeof err?.status === 'number' && err.status >= 400 && err.status < 600
          ? err.status
          : 500;
      res.status(status).json({
        error: err?.message || 'Erro ao gerar áudio neural com Gemini.',
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
