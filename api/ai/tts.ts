import { GoogleGenAI } from '@google/genai';

const ALLOWED_TTS_VOICES = new Set(['Kore', 'Zephyr', 'Charon', 'Puck', 'Fenrir']);
const GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts';

interface ServerlessReq {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ServerlessRes {
  status: (code: number) => ServerlessRes;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
  send: (body: unknown) => void;
  end: () => void;
}

function getHeader(req: ServerlessReq, key: string): string {
  const val = req.headers[key] ?? req.headers[key.toLowerCase()];
  if (Array.isArray(val)) return String(val[0] || '').trim();
  return String(val || '').trim();
}

export default async function handler(req: ServerlessReq, res: ServerlessRes): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    res.status(405).json({ error: 'Método não permitido. Use POST em /api/ai/tts.' });
    return;
  }

  const clientHeader = getHeader(req, 'x-study-client');
  const authHeader = getHeader(req, 'authorization');
  if (clientHeader !== 'central-estudos' && !/^Bearer\s+.+/i.test(authHeader)) {
    res.status(401).json({ error: 'Requisição não autorizada.' });
    return;
  }

  try {
    const rawBody =
      typeof req.body === 'string'
        ? (JSON.parse(req.body || '{}') as Record<string, unknown>)
        : ((req.body || {}) as Record<string, unknown>);

    const text = typeof rawBody.text === 'string' ? rawBody.text : '';
    const voiceName = typeof rawBody.voiceName === 'string' ? rawBody.voiceName : '';
    const style = typeof rawBody.style === 'string' ? rawBody.style : '';

    const cleanText = text.replace(/\s+/g, ' ').trim();
    if (!cleanText) {
      res.status(400).json({ error: 'Texto vazio para síntese de voz.' });
      return;
    }

    const safeVoice = ALLOWED_TTS_VOICES.has(voiceName.trim()) ? voiceName.trim() : 'Kore';
    const safeStyle = style.trim()
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
    } catch (primaryErr: unknown) {
      const pe = primaryErr as { status?: number };
      if (pe?.status === 503 || pe?.status === 404) {
        response = await requestTts('gemini-3.8-flash-tts');
      } else {
        throw primaryErr;
      }
    }

    const parts = response.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find((p: { inlineData?: { data?: string; mimeType?: string } }) =>
      Boolean(p?.inlineData?.data),
    );
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
    res.status(200).send(wavBuffer);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    const status =
      typeof e?.status === 'number' && e.status >= 400 && e.status < 600 ? e.status : 500;
    res.status(status).json({
      error: e?.message || 'Erro ao gerar áudio neural com Gemini.',
    });
  }
}
