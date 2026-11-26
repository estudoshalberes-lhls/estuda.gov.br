import { getGasSession } from './appsScriptBackend';

export interface AiExtractedEditalTopic {
  materia: string;
  titulo: string;
  observacao?: string;
}

export interface AiEssayReviewResult {
  feedback: string;
  scoreEstimate?: string;
  strengths?: string[];
  improvements?: string[];
}

export interface AiGeneratedQuestion {
  materia: string;
  enunciado: string;
  alternativas: Record<string, string>;
  gabarito: string;
  comentario: string;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = getGasSession();
  return {
    'Content-Type': 'application/json',
    'x-study-client': 'central-estudos',
    ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
  };
}

async function postAiRoute<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data?.error || `Falha na requisição de IA (HTTP ${res.status}).`);
  }
  return data;
}

async function postAiSseRoute<T>(
  endpoint: string,
  body: Record<string, unknown>,
  onChunk?: (delta: string, accumulated: string) => void,
  signal?: AbortSignal,
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...headers,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData?.error || `Falha no streaming de IA (HTTP ${res.status}).`);
  }

  if (!res.body) {
    throw new Error('Navegador sem suporte a leitura de fluxo SSE.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';
  let finalResult: T | null = null;
  let streamError: string | null = null;

  const processEventBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (!dataLines.length) return;
    const rawData = dataLines.join('\n');
    try {
      const parsed = JSON.parse(rawData) as Record<string, unknown>;
      if (eventName === 'chunk') {
        const piece = typeof parsed.text === 'string' ? parsed.text : '';
        if (piece) {
          accumulated += piece;
          onChunk?.(piece, accumulated);
        }
      } else if (eventName === 'done') {
        finalResult = parsed as unknown as T;
      } else if (eventName === 'error') {
        streamError = typeof parsed.error === 'string' ? parsed.error : 'Erro durante a transmissão com IA.';
      }
    } catch {
      // Ignore malformed partial SSE frame
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      if (part.trim()) processEventBlock(part);
    }
  }

  if (buffer.trim()) {
    processEventBlock(buffer);
  }

  if (streamError) {
    throw new Error(streamError);
  }
  if (!finalResult) {
    throw new Error('A transmissão da IA encerrou sem retornar o resultado final.');
  }
  return finalResult;
}

export async function analyzeEditalWithAi(params: {
  text: string;
  defaultSubject?: string;
  contestName?: string;
}): Promise<{ topics: AiExtractedEditalTopic[] }> {
  return postAiRoute<{ topics: AiExtractedEditalTopic[] }>('/api/ai/analyze-edital', params);
}

export async function reviewEssayWithAi(params: {
  title: string;
  essayText: string;
  banca?: string;
}): Promise<AiEssayReviewResult> {
  return postAiRoute<AiEssayReviewResult>('/api/ai/review-essay', params);
}

export async function reviewEssayStreamWithAi(
  params: {
    title: string;
    essayText: string;
    banca?: string;
  },
  onChunk?: (delta: string, accumulated: string) => void,
  signal?: AbortSignal,
): Promise<AiEssayReviewResult> {
  return postAiSseRoute<AiEssayReviewResult>('/api/ai/review-essay/stream', params, onChunk, signal);
}

export async function generateQuestionsWithAi(params: {
  subject: string;
  topic: string;
  count?: number;
  banca?: string;
}): Promise<{ questions: AiGeneratedQuestion[] }> {
  return postAiRoute<{ questions: AiGeneratedQuestion[] }>('/api/ai/generate-questions', params);
}

export type AiSummaryAnalysisMode = 'summary' | 'questions' | 'flashcards' | 'mindmap';

export interface AiSummaryFlashcard {
  front: string;
  back: string;
}

export interface AiSummaryMindMapPayload {
  rootLabel: string;
  branches: Array<{
    label: string;
    note?: string;
    children: Array<{
      label: string;
      note?: string;
    }>;
  }>;
}

export interface AiSummaryAnalysisResponse {
  mode: AiSummaryAnalysisMode;
  summary?: {
    title: string;
    summaryText: string;
    keyPoints: string[];
  };
  questions?: AiGeneratedQuestion[];
  flashcards?: AiSummaryFlashcard[];
  mindmap?: AiSummaryMindMapPayload;
}

export async function analyzeSummaryWithAi(params: {
  mode: AiSummaryAnalysisMode;
  subject: string;
  title: string;
  sourceText: string;
  count?: number;
  banca?: string;
}): Promise<AiSummaryAnalysisResponse> {
  return postAiRoute<AiSummaryAnalysisResponse>('/api/ai/analyze-summary', params);
}

export async function analyzeSummaryStreamWithAi(
  params: {
    subject: string;
    title: string;
    sourceText: string;
  },
  onChunk?: (delta: string, accumulated: string) => void,
  signal?: AbortSignal,
): Promise<AiSummaryAnalysisResponse> {
  return postAiSseRoute<AiSummaryAnalysisResponse>(
    '/api/ai/analyze-summary/stream',
    { ...params, mode: 'summary' },
    onChunk,
    signal,
  );
}
