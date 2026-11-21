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

