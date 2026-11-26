import React, { useState } from 'react';
import {
  BookMarked,
  CheckCircle2,
  FileText,
  GitBranch,
  HelpCircle,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import {
  AiSummaryAnalysisMode,
  AiSummaryAnalysisResponse,
  AiSummaryMindMapPayload,
  analyzeSummaryStreamWithAi,
  analyzeSummaryWithAi,
} from '../../lib/aiApi';
import { getFileBlob } from '../../lib/fileStorage';
import { visibleName } from '../../lib/parsers';
import { readStudyBlobText } from '../../lib/pdfExtract';
import {
  flattenMindMapToOutline,
  getSummaryDisplayTitle,
  getSummaryItemKind,
} from '../../lib/summaryPdfExport';
import { MindMapNode, Question, SummaryFile } from '../../types/study';
import { StructuredLegalText } from '../ui/StructuredLegalText';
import { MINDMAP_COLORS } from './MindMapBuilder';

interface SummaryAiStudioModalProps {
  subjectKey: string;
  item: SummaryFile;
  onClose: () => void;
  onSaveAsNote: (title: string, content: string) => Promise<void>;
  onSaveQuestions: (questions: Question[], title: string) => Promise<void>;
  onSaveFlashcardsToNotebook: (cards: Array<{ front: string; back: string }>) => void;
  onOpenMindMapInBuilder: (title: string, tree: MindMapNode) => void;
  onNotify: (message: string, isError?: boolean) => void;
}

function convertAiMindMapToTree(payload: AiSummaryMindMapPayload): MindMapNode {
  const uid = () => `mm-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id: uid(),
    label: payload.rootLabel || 'Tema Central',
    color: '#1351B4',
    children: (payload.branches || []).map((branch, idx) => {
      const branchColor = MINDMAP_COLORS[idx % MINDMAP_COLORS.length].hex;
      return {
        id: uid(),
        label: branch.label,
        note: branch.note || undefined,
        color: branchColor,
        children: (branch.children || []).map((child) => ({
          id: uid(),
          label: child.label,
          note: child.note || undefined,
          color: branchColor,
          children: [],
        })),
      };
    }),
  };
}

export const SummaryAiStudioModal: React.FC<SummaryAiStudioModalProps> = ({
  subjectKey,
  item,
  onClose,
  onSaveAsNote,
  onSaveQuestions,
  onSaveFlashcardsToNotebook,
  onOpenMindMapInBuilder,
  onNotify,
}) => {
  const [mode, setMode] = useState<AiSummaryAnalysisMode>('summary');
  const [count, setCount] = useState<number>(5);
  const [banca, setBanca] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [streamingPreview, setStreamingPreview] = useState('');
  const [result, setResult] = useState<AiSummaryAnalysisResponse | null>(null);
  const [savingAction, setSavingAction] = useState(false);

  const subjectLabel = visibleName(subjectKey);
  const itemTitle = getSummaryDisplayTitle(item);

  const extractSourceText = async (): Promise<string> => {
    const kind = getSummaryItemKind(item);
    if (kind === 'note' && item.content?.trim()) {
      return item.content.trim();
    }
    if (kind === 'mindmap' && item.mindMap) {
      return flattenMindMapToOutline(item.mindMap).join('\n');
    }
    const blob = await getFileBlob(item.blobKey);
    if (!blob) {
      throw new Error('Arquivo não encontrado no armazenamento local.');
    }
    if (kind === 'image') {
      throw new Error(
        'Para gerar conteúdo com IA, selecione uma anotação de texto, um mapa mental criado no app ou um PDF com texto selecionável.',
      );
    }
    const extracted = await readStudyBlobText(blob, item.name, item.mimeType);
    if (!extracted.trim() || extracted.trim().length < 20) {
      throw new Error(
        'Não foi possível extrair texto suficiente deste PDF (pode ser um PDF escaneado como imagem).',
      );
    }
    return extracted;
  };

  const handleGenerate = async () => {
    setLoading(true);
    setStreamingPreview('');
    setResult(null);
    try {
      const sourceText = await extractSourceText();
      if (mode === 'summary') {
        try {
          const streamed = await analyzeSummaryStreamWithAi(
            {
              subject: subjectLabel,
              title: itemTitle,
              sourceText,
            },
            (_delta, accumulated) => {
              setStreamingPreview(accumulated);
            },
          );
          setResult(streamed);
          setStreamingPreview('');
          return;
        } catch {
          // Fallback transparently to non-streaming JSON route
          setStreamingPreview('');
        }
      }
      const res = await analyzeSummaryWithAi({
        mode,
        subject: subjectLabel,
        title: itemTitle,
        sourceText,
        count,
        banca: banca.trim() || undefined,
      });
      setResult(res);
    } catch (err) {
      onNotify((err as Error).message || 'Falha ao processar resumo com IA.', true);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeneratedNote = async () => {
    if (!result?.summary) return;
    setSavingAction(true);
    try {
      const parts = [result.summary.summaryText.trim()];
      if (result.summary.keyPoints?.length) {
        parts.push(`Pontos-chave para revisão:\n- ${result.summary.keyPoints.join('\n- ')}`);
      }
      await onSaveAsNote(result.summary.title || `Resumo IA — ${itemTitle}`, parts.join('\n\n'));
      onClose();
    } catch (err) {
      onNotify((err as Error).message, true);
    } finally {
      setSavingAction(false);
    }
  };

  const handleSaveGeneratedQuestions = async () => {
    if (!result?.questions?.length) return;
    setSavingAction(true);
    try {
      const parsed: Question[] = result.questions.map((q, idx) => ({
        id: `ai-sum-${Date.now()}-${idx}`,
        numero: idx + 1,
        materia: q.materia?.trim() || subjectLabel,
        enunciado: q.enunciado,
        alternativas: Object.entries(q.alternativas || {}).map(([letra, texto]) => ({
          letra,
          texto,
        })),
        gabarito: (q.gabarito || 'A').trim().toUpperCase().slice(0, 1),
        comentario: q.comentario || '',
        tipo: 'ME',
      }));
      await onSaveQuestions(parsed, `IA · ${itemTitle}`);
      onClose();
    } catch (err) {
      onNotify((err as Error).message, true);
    } finally {
      setSavingAction(false);
    }
  };

  const handleSaveGeneratedFlashcards = () => {
    if (!result?.flashcards?.length) return;
    onSaveFlashcardsToNotebook(result.flashcards);
    onClose();
  };

  const handleOpenGeneratedMindMap = () => {
    if (!result?.mindmap) return;
    const tree = convertAiMindMapToTree(result.mindmap);
    onOpenMindMapInBuilder(result.mindmap.rootLabel || `Mapa — ${itemTitle}`, tree);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-3">
      <div className="w-full max-w-[780px] max-h-[90vh] rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--line)] bg-[var(--panel-soft)] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--accent)]">
              <Sparkles className="w-3.5 h-3.5" />
              Gerador com IA · Dossiê de Resumos
            </div>
            <h3 className="m-0 mt-0.5 text-[15px] font-bold text-[var(--text)] truncate">
              {itemTitle} · {subjectLabel}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-lg border border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3.5">
          {/* Mode selector */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { id: 'summary', label: 'Resumo Estruturado', icon: FileText },
                { id: 'questions', label: 'Questões da Banca', icon: HelpCircle },
                { id: 'flashcards', label: 'Flashcards Ativos', icon: BookMarked },
                { id: 'mindmap', label: 'Mapa Mental', icon: GitBranch },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = mode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setMode(opt.id);
                    setResult(null);
                  }}
                  className={`px-3 py-2.5 rounded-xl border text-left transition-colors flex items-center gap-2 text-[12px] font-bold ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--line-strong)]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="leading-tight">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Options row */}
          <div className="flex flex-wrap items-end gap-2.5">
            {(mode === 'questions' || mode === 'flashcards') && (
              <div className="w-[140px]">
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Quantidade
                </label>
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value) || 5)}
                  className="ce-input font-mono-num"
                >
                  {mode === 'questions' ? (
                    <>
                      <option value={3}>3 questões</option>
                      <option value={5}>5 questões</option>
                      <option value={8}>8 questões</option>
                    </>
                  ) : (
                    <>
                      <option value={5}>5 flashcards</option>
                      <option value={8}>8 flashcards</option>
                      <option value={10}>10 flashcards</option>
                    </>
                  )}
                </select>
              </div>
            )}

            {mode === 'questions' && (
              <div className="flex-1 min-w-[180px]">
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Estilo de banca (opcional)
                </label>
                <input
                  type="text"
                  value={banca}
                  onChange={(e) => setBanca(e.target.value)}
                  placeholder="Ex.: FGV, Cebraspe, FCC..."
                  className="ce-input"
                />
              </div>
            )}

            <button
              type="button"
              disabled={loading}
              onClick={() => void handleGenerate()}
              className="inline-flex items-center gap-1.5 h-[38px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {loading ? 'Analisando material…' : 'Gerar agora'}
            </button>
          </div>

          {/* Live Streaming Preview */}
          {loading && streamingPreview && (
            <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--panel-soft)] p-3.5 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[11.5px] font-bold text-[var(--accent)]">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>Escrevendo resumo em tempo real…</span>
              </div>
              <pre className="m-0 whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-[var(--text)] max-h-[280px] overflow-y-auto">
                {streamingPreview}
              </pre>
            </div>
          )}

          {/* Result Area */}
          {result?.mode === 'summary' && result.summary && (
            <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3.5 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-[14px] font-bold text-[var(--text)]">
                  {result.summary.title}
                </strong>
                <button
                  type="button"
                  disabled={savingAction}
                  onClick={() => void handleSaveGeneratedNote()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[11.5px] font-bold hover:opacity-95"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Salvar como anotação na matéria
                </button>
              </div>

              <StructuredLegalText
                text={result.summary.summaryText}
                className="text-[12.5px] text-[var(--text)]"
              />

              {result.summary.keyPoints?.length > 0 && (
                <div className="pt-2 border-t border-[var(--line)]">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)] mb-1">
                    Pontos-chave destacados
                  </div>
                  <ul className="m-0 pl-4 flex flex-col gap-1 text-[12px] text-[var(--text)]">
                    {result.summary.keyPoints.map((kp, i) => (
                      <li key={i}>{kp}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {result?.mode === 'questions' && result.questions && (
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-[13px] font-bold text-[var(--text)]">
                  {result.questions.length} questão(ões) gerada(s) a partir do material
                </strong>
                <button
                  type="button"
                  disabled={savingAction}
                  onClick={() => void handleSaveGeneratedQuestions()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[11.5px] font-bold hover:opacity-95"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Salvar no Banco de Questões
                </button>
              </div>

              {result.questions.map((q, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 text-[12.5px] flex flex-col gap-1.5"
                >
                  <div className="font-bold text-[var(--text)]">
                    Q{idx + 1}. {q.enunciado}
                  </div>
                  <div className="flex flex-col gap-0.5 pl-2 text-[12px] text-[var(--text)]/90">
                    {Object.entries(q.alternativas || {}).map(([k, v]) => (
                      <div key={k}>
                        <strong className={k === q.gabarito ? 'text-[var(--good)]' : undefined}>
                          {k})
                        </strong>{' '}
                        {v}
                      </div>
                    ))}
                  </div>
                  <div className="pt-1 border-t border-[var(--line)] text-[11.5px] text-[var(--muted)]">
                    <strong className="text-[var(--good)]">Gabarito: {q.gabarito}</strong> ·{' '}
                    {q.comentario}
                  </div>
                </div>
              ))}
            </div>
          )}

          {result?.mode === 'flashcards' && result.flashcards && (
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-[13px] font-bold text-[var(--text)]">
                  {result.flashcards.length} flashcard(s) extraído(s)
                </strong>
                <button
                  type="button"
                  onClick={handleSaveGeneratedFlashcards}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[11.5px] font-bold hover:opacity-95"
                >
                  <BookMarked className="w-3.5 h-3.5" />
                  Enviar todos ao Caderno de Erros
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {result.flashcards.map((fc, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 text-[12px]"
                  >
                    <div className="font-bold text-[var(--text)] mb-1">
                      {idx + 1}. {fc.front}
                    </div>
                    <div className="text-[var(--muted)] leading-snug">{fc.back}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result?.mode === 'mindmap' && result.mindmap && (
            <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3.5 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-[14px] font-bold text-[var(--text)]">
                  Mapa estruturado: {result.mindmap.rootLabel}
                </strong>
                <button
                  type="button"
                  onClick={handleOpenGeneratedMindMap}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)]"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  Abrir no Construtor Visual de Mapas
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {result.mindmap.branches.map((br, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2.5 text-[12px]"
                  >
                    <div className="font-bold text-[var(--accent)]">{br.label}</div>
                    {br.note && <div className="text-[11px] text-[var(--muted)]">{br.note}</div>}
                    <ul className="m-0 mt-1.5 pl-4 flex flex-col gap-0.5 text-[11.5px] text-[var(--text)]">
                      {br.children.map((ch, cIdx) => (
                        <li key={cIdx}>
                          {ch.label}
                          {ch.note ? <span className="text-[var(--muted)]"> ({ch.note})</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
