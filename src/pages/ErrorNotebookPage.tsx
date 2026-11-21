import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { List, type RowComponentProps, useDynamicRowHeight } from 'react-window';
import {
  AlertTriangle,
  AlignLeft,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ClipboardPaste,
  Clock,
  Download,
  ExternalLink,
  Eye,
  Layers,
  Pencil,
  Play,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import {
  inferFixedSubjectFromTopic,
  localDateIso,
  normalizeSearch,
  visibleName,
} from '../lib/parsers';
import {
  formatCorrectionTextStructured,
  insertFormattedPaste,
} from '../lib/legalTextFormatter';
import { exportErrorNotebookPdf } from '../lib/pdfExport';
import { clearFieldDraft, readFieldDraft, writeFieldDraft } from '../lib/draftStorage';
import { CompletedSimulation, ErrorNotebookEntry, ModuleName } from '../types/study';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';
import { StructuredLegalText } from '../components/ui/StructuredLegalText';
import { ErrorParetoD3Panel, ParetoDatum } from '../components/charts/ErrorParetoD3Panel';
import { ErrorNotebookOfficialPrintSheet } from '../components/errors/ErrorNotebookOfficialPrintSheet';
import { FlashcardsReviewModal } from '../components/study/FlashcardsReviewModal';

const UNASSIGNED_SUBJECT_FILTER = '__UNASSIGNED__';
const SIMULADOS_FILTER = '__SIMULADOS__';
const SIMULADOS_STATS_KEY = 'Simulados';

function isClosedSimulationEntry(entry: ErrorNotebookEntry): boolean {
  return (
    Boolean(entry.simulado_id || entry.simulado_titulo) ||
    entry.id.startsWith('sim-err-') ||
    normalizeSearch(entry.origem || '') === 'simulado fechado' ||
    normalizeSearch(entry.tipo || '') === 'erro em simulado fechado'
  );
}

function resolveSimulationExamMeta(
  entry: ErrorNotebookEntry,
  completedSimulations: CompletedSimulation[],
): { key: string; label: string } {
  if (entry.simulado_id) {
    const matched = completedSimulations.find((s) => s.id === entry.simulado_id);
    const label = visibleName(
      entry.simulado_titulo || matched?.titulo || entry.arquivo_prova || 'Simulado Fechado',
    );
    return { key: entry.simulado_id, label: label || 'Simulado Fechado' };
  }
  if (entry.id.startsWith('sim-err-')) {
    const matched = completedSimulations.find((s) => entry.id.startsWith(`sim-err-${s.id}-`));
    if (matched) {
      return {
        key: matched.id,
        label: visibleName(entry.simulado_titulo || matched.titulo || matched.arquivo || 'Simulado Fechado'),
      };
    }
  }
  const fallbackLabel = visibleName(
    entry.simulado_titulo || entry.arquivo_prova || entry.materia || 'Simulado Fechado',
  );
  return {
    key: `title:${normalizeSearch(fallbackLabel || 'simulado-fechado')}`,
    label: fallbackLabel || 'Simulado Fechado',
  };
}

const NOTE_TYPES = [
  'Erro Frequente',
  'Pegadinha de Banca',
  'Prazos',
  'Regra x Exceção',
  'Ponto Importante',
  'Nota Complementar',
];

interface EditingErrorEntryState {
  id: string;
  materia: string;
  tipo: string;
  texto: string;
  hasQuestion?: boolean;
  enunciado?: string;
  gabarito?: string;
  resposta?: string;
  comentario?: string;
}

interface SubjectStatItem {
  subject: string;
  wrongQuestions: number;
  answeredQuestions: number;
  errorRatePct: number | null;
  notebookTotal: number;
  pendingCount: number;
  notebookSharePct: number;
}

interface SubjectStatListRowProps {
  rows: SubjectStatItem[];
  filterSubject: string;
  onToggleSubject: (subject: string) => void;
}

const SubjectStatListRow = React.memo(
  ({ index, style, ariaAttributes, rows, filterSubject, onToggleSubject }: RowComponentProps<SubjectStatListRowProps>) => {
    const row = rows[index];
    if (!row) return null;
    const isSelected =
      (row.subject === SIMULADOS_STATS_KEY && filterSubject === SIMULADOS_FILTER) ||
      normalizeSearch(filterSubject) === normalizeSearch(row.subject);
    const barPercent = row.errorRatePct !== null ? row.errorRatePct : row.notebookSharePct;
    const barColor =
      barPercent >= 50
        ? 'var(--bad)'
        : barPercent >= 25
          ? 'var(--warning)'
          : 'var(--accent)';
    return (
      <div style={style} {...ariaAttributes} className="pb-1.5 pr-1">
        <button
          type="button"
          onClick={() => onToggleSubject(row.subject)}
          className={`w-full text-left rounded-lg border px-3 py-2 transition-colors cursor-pointer ${
            isSelected
              ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
              : 'border-[var(--line)] bg-[var(--panel-soft)] hover:border-[var(--line-strong)]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono-num text-[11.5px] font-extrabold text-[var(--muted)] w-6 shrink-0">
                {index + 1}º
              </span>
              <strong className="text-[13px] font-bold text-[var(--text)] truncate">
                {visibleName(row.subject)}
              </strong>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11.5px] font-mono-num shrink-0">
              {row.errorRatePct !== null && (
                <span
                  className="font-extrabold"
                  style={{ color: barColor }}
                  title="Percentual de erros sobre questões respondidas"
                >
                  {row.errorRatePct}% de erro ({row.wrongQuestions}/{row.answeredQuestions})
                </span>
              )}
              <span className="text-[var(--muted)]">
                <strong className="text-[var(--text)]">{row.notebookTotal}</strong>{' '}
                no caderno ({row.notebookSharePct}%)
                {row.pendingCount > 0 ? ` · ${row.pendingCount} pend.` : ''}
              </span>
            </div>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--panel-raised)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(4, Math.min(100, barPercent))}%`,
                backgroundColor: barColor,
              }}
            />
          </div>
        </button>
      </div>
    );
  },
) as (props: RowComponentProps<SubjectStatListRowProps>) => React.ReactElement | null;

function formatBrDateStr(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

interface ErrorNotebookRowProps {
  entries: ErrorNotebookEntry[];
  completedSimulations: CompletedSimulation[];
  registeredSubjects: string[];
  registeredSubjectNorms: Set<string>;
  selectedEntryIds: Set<string>;
  onToggleSelectEntry: (id: string) => void;
  todayIso: string;
  editingEntry: EditingErrorEntryState | null;
  setEditingEntry: React.Dispatch<React.SetStateAction<EditingErrorEntryState | null>>;
  flushEditingDraft: (silent?: boolean) => void;
  handleSaveEdit: (entry: ErrorNotebookEntry) => void;
  updateErrorEntrySubject: (id: string, subject: string) => void;
  markAnnotationCorrected: (id: string) => void;
  advanceErrorReview: (id: string) => void;
  reopenAnnotation: (id: string) => void;
  deleteAnnotation: (id: string) => void;
  setActivePage: (page: ModuleName) => void;
}

const ErrorNotebookEntryRow = React.memo(
  ({
    index,
    style,
    ariaAttributes,
    entries,
    completedSimulations,
    registeredSubjects,
    registeredSubjectNorms,
    selectedEntryIds,
    onToggleSelectEntry,
    todayIso,
    editingEntry,
    setEditingEntry,
    flushEditingDraft,
    handleSaveEdit,
    updateErrorEntrySubject,
    markAnnotationCorrected,
    advanceErrorReview,
    reopenAnnotation,
    deleteAnnotation,
    setActivePage,
  }: RowComponentProps<ErrorNotebookRowProps>) => {
    const entry = entries[index];
    const isEditing = Boolean(entry && editingEntry?.id === entry.id);
    const [rawTextBeforeFormat, setRawTextBeforeFormat] = useState<string | null>(null);
    const [justAutoFormatted, setJustAutoFormatted] = useState(false);
    const [rawEnunciadoBeforeFormat, setRawEnunciadoBeforeFormat] = useState<string | null>(null);
    const [enunciadoAutoFormatted, setEnunciadoAutoFormatted] = useState(false);

    useEffect(() => {
      if (!isEditing) {
        setRawTextBeforeFormat(null);
        setJustAutoFormatted(false);
        setRawEnunciadoBeforeFormat(null);
        setEnunciadoAutoFormatted(false);
      }
    }, [isEditing, entry?.id]);

    if (!entry) return null;
    const isCorrected = Boolean(entry.corrigido);
    const isSelected = selectedEntryIds.has(entry.id);
    const isSimEntry = isClosedSimulationEntry(entry);
    const simExamMeta = isSimEntry
      ? resolveSimulationExamMeta(entry, completedSimulations)
      : null;
    const entryMateriaNorm = normalizeSearch(visibleName(entry.materia));
    const isRegisteredMatch = Boolean(entryMateriaNorm && registeredSubjectNorms.has(entryMateriaNorm));
    const selectedSubjectVal =
      registeredSubjects.find((s) => normalizeSearch(s) === entryMateriaNorm) ||
      entry.materia;
    const editingSubjectVal = editingEntry
      ? registeredSubjects.find(
          (s) => normalizeSearch(s) === normalizeSearch(editingEntry.materia),
        ) || editingEntry.materia
      : '';

    const handlePasteCorrection = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!editingEntry) return;
      const pasted = e.clipboardData.getData('text/plain');
      if (!pasted || !pasted.trim()) return;
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart ?? editingEntry.texto.length;
      const end = target.selectionEnd ?? editingEntry.texto.length;
      const rawUnformatted =
        editingEntry.texto.slice(0, start) + pasted + editingEntry.texto.slice(end);
      const { nextValue, nextCursorPos, changed } = insertFormattedPaste(
        editingEntry.texto,
        start,
        end,
        pasted,
      );
      setRawTextBeforeFormat(changed ? rawUnformatted : null);
      setJustAutoFormatted(changed);
      setEditingEntry({ ...editingEntry, texto: nextValue });
      requestAnimationFrame(() => {
        if (target && document.activeElement === target) {
          target.setSelectionRange(nextCursorPos, nextCursorPos);
        }
      });
    };

    const handleManualFormatCorrection = () => {
      if (!editingEntry || !editingEntry.texto.trim()) return;
      const formatted = formatCorrectionTextStructured(editingEntry.texto);
      if (formatted === editingEntry.texto) {
        setJustAutoFormatted(true);
        return;
      }
      setRawTextBeforeFormat(editingEntry.texto);
      setJustAutoFormatted(true);
      setEditingEntry({ ...editingEntry, texto: formatted });
    };

    const handleCopyQuestionComment = () => {
      if (!editingEntry || !entry.questao?.comentario?.trim()) return;
      const formatted = formatCorrectionTextStructured(entry.questao.comentario);
      setRawTextBeforeFormat(editingEntry.texto);
      setJustAutoFormatted(true);
      setEditingEntry({ ...editingEntry, texto: formatted });
    };

    const handlePasteEnunciado = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!editingEntry) return;
      const pasted = e.clipboardData.getData('text/plain');
      if (!pasted || !pasted.trim()) return;
      e.preventDefault();
      const target = e.currentTarget;
      const current = editingEntry.enunciado ?? '';
      const start = target.selectionStart ?? current.length;
      const end = target.selectionEnd ?? current.length;
      const rawUnformatted = current.slice(0, start) + pasted + current.slice(end);
      const { nextValue, nextCursorPos, changed } = insertFormattedPaste(
        current,
        start,
        end,
        pasted,
      );
      setRawEnunciadoBeforeFormat(changed ? rawUnformatted : null);
      setEnunciadoAutoFormatted(changed);
      setEditingEntry({ ...editingEntry, enunciado: nextValue });
      requestAnimationFrame(() => {
        if (target && document.activeElement === target) {
          target.setSelectionRange(nextCursorPos, nextCursorPos);
        }
      });
    };

    const handleManualFormatEnunciado = () => {
      if (!editingEntry || !(editingEntry.enunciado ?? '').trim()) return;
      const current = editingEntry.enunciado ?? '';
      const formatted = formatCorrectionTextStructured(current);
      if (formatted === current) {
        setEnunciadoAutoFormatted(true);
        return;
      }
      setRawEnunciadoBeforeFormat(current);
      setEnunciadoAutoFormatted(true);
      setEditingEntry({ ...editingEntry, enunciado: formatted });
    };

    return (
      <div style={style} {...ariaAttributes} className="pb-3">
        <Panel className={isSelected ? 'border-[var(--accent)] bg-[var(--accent-soft)]/30' : undefined}>
          <div className="flex flex-wrap items-start justify-between gap-2.5 mb-2">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              {!isCorrected && (
                <label
                  className="inline-flex items-center cursor-pointer select-none"
                  title="Selecionar questão pendente para associar em lote a uma matéria"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelectEntry(entry.id)}
                    aria-label={`Selecionar questão pendente ${entry.id}`}
                    className="accent-[var(--accent)] w-4 h-4 cursor-pointer"
                  />
                </label>
              )}

              {isCorrected ? (
                <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--good)]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Já Corrigido {entry.corrigido_em ? `(${entry.corrigido_em})` : ''}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--warning)]">
                  <Clock className="w-3.5 h-3.5" />
                  Pendente de Correção
                </span>
              )}

              <span className="text-[var(--line-strong)]">·</span>
              <span className="text-[11.5px] font-bold text-[var(--accent)]">
                {visibleName(entry.tipo)}
              </span>

              <div className="inline-flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-[var(--muted)]">Matéria:</span>
                <select
                  aria-label={`Associar matéria cadastrada à questão ${entry.id}`}
                  value={selectedSubjectVal}
                  onChange={(e) => updateErrorEntrySubject(entry.id, e.target.value)}
                  className={`ce-select !w-auto !min-h-[28px] !py-0.5 !px-2 !text-[12px] font-bold ${
                    !isCorrected && !isRegisteredMatch ? '!border-[var(--warning)]' : ''
                  }`}
                  title="Associar questão a uma matéria cadastrada"
                >
                  {!isRegisteredMatch && selectedSubjectVal && (
                    <option value={selectedSubjectVal}>
                      {isSimEntry
                        ? 'Selecionar matéria cadastrada...'
                        : `${visibleName(selectedSubjectVal)} (não cadastrada)`}
                    </option>
                  )}
                  {registeredSubjects.map((subj) => (
                    <option key={subj} value={subj}>
                      {subj}
                    </option>
                  ))}
                </select>
                {!isCorrected && !isRegisteredMatch && (
                  <span className="text-[10.5px] font-bold text-[var(--warning)]">
                    Associar
                  </span>
                )}
                {isSimEntry && isRegisteredMatch && (
                  <span className="inline-flex items-center gap-0.5 text-[10.5px] font-bold text-[var(--good)]">
                    <Check className="w-3 h-3" />
                    Associada
                  </span>
                )}
              </div>

              {simExamMeta && (
                <>
                  <span className="text-[var(--line-strong)]">·</span>
                  <span className="text-[11px] font-semibold text-[var(--muted)]">
                    Simulado: <strong className="text-[var(--text)]">{simExamMeta.label}</strong>
                  </span>
                </>
              )}
              {!simExamMeta && entry.origem && (
                <>
                  <span className="text-[var(--line-strong)]">·</span>
                  <span className="text-[11px] font-semibold text-[var(--muted)]">
                    Origem: {entry.origem}
                  </span>
                </>
              )}
              <span className="text-[11.5px] text-[var(--muted)] font-mono-num">
                · {entry.data}
              </span>
              {entry.proxima_revisao && (
                <>
                  <span className="text-[var(--line-strong)]">·</span>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                      entry.proxima_revisao <= todayIso
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    <CalendarClock className="w-3 h-3" />
                    {entry.proxima_revisao <= todayIso
                      ? `Revisar hoje (Nível ${entry.nivel_revisao ?? 1})`
                      : `Próx. revisão: ${formatBrDateStr(entry.proxima_revisao)} (Nível ${entry.nivel_revisao ?? 1})`}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {!isCorrected ? (
                <button
                  type="button"
                  onClick={() => markAnnotationCorrected(entry.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[11.5px] font-bold hover:opacity-90 transition-opacity shadow-xs"
                  title="Marcar como revisado e agendar revisão espaçada (+1 dia)"
                >
                  <Check className="w-3.5 h-3.5" />
                  Marcar como Corrigido
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => advanceErrorReview(entry.id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] text-[11.5px] font-bold hover:bg-[var(--accent)] hover:text-white transition-colors"
                    title="Registrar revisão concluída e avançar intervalo (1d → 7d → 15d → 30d)"
                  >
                    <CalendarClock className="w-3.5 h-3.5" />
                    Concluir revisão
                  </button>
                  <button
                    type="button"
                    onClick={() => reopenAnnotation(entry.id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
                    title="Reabrir questão para Pendentes de Correção"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reabrir
                  </button>
                </>
              )}

              {entry.correcao_prova && (
                <button
                  type="button"
                  onClick={() => setActivePage('Provas')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                >
                  <ExternalLink className="w-3 h-3" />
                  Ver em Provas
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (isEditing) {
                    flushEditingDraft(true);
                    setEditingEntry(null);
                    return;
                  }
                  const savedDraft = readFieldDraft<EditingErrorEntryState>(
                    `error_notebook_edit_${entry.id}`,
                  );
                  setEditingEntry(
                    savedDraft
                      ? { ...savedDraft, materia: selectedSubjectVal }
                      : {
                          id: entry.id,
                          materia: selectedSubjectVal,
                          tipo: entry.tipo,
                          texto: entry.texto,
                          hasQuestion: Boolean(entry.questao),
                          enunciado: entry.questao?.enunciado ?? '',
                          gabarito: entry.questao?.gabarito ?? '',
                          resposta: entry.questao?.resposta ?? '',
                          comentario: entry.questao?.comentario ?? '',
                        },
                  );
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
              >
                <Pencil className="w-3 h-3" />
                {isEditing ? 'Fechar' : 'Editar'}
              </button>
              <button
                type="button"
                onClick={() => deleteAnnotation(entry.id)}
                aria-label="Excluir anotação"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap"
              >
                <Trash2 className="w-3 h-3" />
                Excluir
              </button>
            </div>
          </div>

          {isEditing && editingEntry ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2 pt-2 border-t border-[var(--line)]">
              <select
                aria-label="Matéria da anotação"
                value={editingSubjectVal}
                onChange={(e) => setEditingEntry({ ...editingEntry, materia: e.target.value })}
                className="ce-select"
              >
                {!registeredSubjects.some(
                  (s) => normalizeSearch(s) === normalizeSearch(editingSubjectVal),
                ) &&
                  editingSubjectVal && (
                    <option value={editingSubjectVal}>{visibleName(editingSubjectVal)}</option>
                  )}
                {registeredSubjects.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={editingEntry.tipo}
                onChange={(e) => setEditingEntry({ ...editingEntry, tipo: e.target.value })}
                placeholder="Tipo de apontamento"
                className="ce-input"
              />
              <div className="sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="block text-[11px] font-bold text-[var(--muted)]">
                      Anotação / Correção
                    </label>
                    {justAutoFormatted && (
                      <span className="text-[10.5px] font-bold text-[var(--good)]">
                        Texto organizado automaticamente
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {rawTextBeforeFormat !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingEntry({ ...editingEntry, texto: rawTextBeforeFormat });
                          setRawTextBeforeFormat(null);
                          setJustAutoFormatted(false);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[10.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
                        title="Restaurar o texto original exatamente como estava antes do ajuste"
                      >
                        <Undo2 className="w-3 h-3" />
                        Desfazer ajuste
                      </button>
                    )}
                    {entry.questao?.comentario?.trim() && (
                      <button
                        type="button"
                        onClick={handleCopyQuestionComment}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[10.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
                        title="Copiar o comentário da questão já estruturado para a correção"
                      >
                        <ClipboardPaste className="w-3 h-3" />
                        Copiar comentário
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleManualFormatCorrection}
                      disabled={!editingEntry.texto.trim()}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[10.5px] font-bold text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-45 cursor-pointer"
                      title="Separar artigos, parágrafos, incisos, alíneas e parágrafos automaticamente"
                    >
                      <AlignLeft className="w-3 h-3" />
                      Organizar texto
                    </button>
                  </div>
                </div>
                <textarea
                  value={editingEntry.texto}
                  onChange={(e) => {
                    setEditingEntry({ ...editingEntry, texto: e.target.value });
                    if (justAutoFormatted) setJustAutoFormatted(false);
                  }}
                  onPaste={handlePasteCorrection}
                  onBlur={() => flushEditingDraft(true)}
                  rows={6}
                  placeholder="Cole a correção, comentário ou fundamentação legal aqui — artigos, incisos e parágrafos serão estruturados automaticamente..."
                  className="ce-textarea leading-relaxed"
                />
              </div>
              {entry.questao && (
                <>
                  <div className="sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="block text-[11px] font-bold text-[var(--muted)]">
                          Enunciado / Questão vinculada
                        </label>
                        {enunciadoAutoFormatted && (
                          <span className="text-[10.5px] font-bold text-[var(--good)]">
                            Texto organizado automaticamente
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {rawEnunciadoBeforeFormat !== null && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEntry({
                                ...editingEntry,
                                enunciado: rawEnunciadoBeforeFormat,
                              });
                              setRawEnunciadoBeforeFormat(null);
                              setEnunciadoAutoFormatted(false);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[10.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                          >
                            <Undo2 className="w-3 h-3" />
                            Desfazer ajuste
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleManualFormatEnunciado}
                          disabled={!(editingEntry.enunciado ?? '').trim()}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[10.5px] font-bold text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-45 cursor-pointer"
                        >
                          <AlignLeft className="w-3 h-3" />
                          Organizar texto
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={editingEntry.enunciado ?? ''}
                      onChange={(e) => {
                        setEditingEntry({ ...editingEntry, enunciado: e.target.value });
                        if (enunciadoAutoFormatted) setEnunciadoAutoFormatted(false);
                      }}
                      onPaste={handlePasteEnunciado}
                      onBlur={() => flushEditingDraft(true)}
                      rows={4}
                      className="ce-textarea leading-relaxed"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                      Alternativa marcada
                    </label>
                    <input
                      type="text"
                      value={editingEntry.resposta ?? ''}
                      onChange={(e) =>
                        setEditingEntry({ ...editingEntry, resposta: e.target.value })
                      }
                      onBlur={() => flushEditingDraft(true)}
                      placeholder="Ex.: C, E, A..."
                      className="ce-input"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                      Gabarito oficial
                    </label>
                    <input
                      type="text"
                      value={editingEntry.gabarito ?? ''}
                      onChange={(e) =>
                        setEditingEntry({ ...editingEntry, gabarito: e.target.value })
                      }
                      onBlur={() => flushEditingDraft(true)}
                      placeholder="Ex.: C, E, A..."
                      className="ce-input"
                    />
                  </div>
                </>
              )}
              <div className="sm:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    clearFieldDraft(`error_notebook_edit_${entry.id}`);
                    setEditingEntry(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] text-[12px] font-bold hover:text-[var(--text)] whitespace-nowrap"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveEdit(entry)}
                  className="px-3.5 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                >
                  Salvar alterações
                </button>
              </div>
            </div>
          ) : (
            <StructuredLegalText
              text={entry.texto}
              className="text-[13.5px] text-[var(--text)]"
            />
          )}

          {entry.questao && (
            <details className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-3">
              <summary className="text-[12px] font-bold text-[var(--muted)] cursor-pointer select-none">
                Ver questão vinculada
                {entry.arquivo_prova ? ` (${visibleName(entry.arquivo_prova)})` : ''}
              </summary>
              <div className="mt-2 pt-2 border-t border-[var(--line)] text-[12.5px] text-[var(--text)]">
                <StructuredLegalText
                  text={entry.questao.enunciado}
                  compact
                  className="text-[12.5px] text-[var(--text)]"
                />
                {entry.questao.alternativas?.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 text-[var(--muted)]">
                    {entry.questao.alternativas.map((alt) => (
                      <div
                        key={alt.letra}
                        className="flex items-start gap-1.5 leading-relaxed"
                      >
                        <strong className="font-mono-num text-[var(--text)] shrink-0">
                          [{alt.letra}]
                        </strong>
                        <span className="flex-1 text-justify">{alt.texto}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(entry.questao.resposta || entry.questao.gabarito) && (
                  <div className="mt-2 text-[12px] text-[var(--muted)]">
                    {entry.questao.resposta && (
                      <>
                        Marcada: <strong className="text-[var(--bad)]">{entry.questao.resposta}</strong>
                        {' · '}
                      </>
                    )}
                    {entry.questao.gabarito && (
                      <>
                        Gabarito: <strong className="text-[var(--good)]">{entry.questao.gabarito}</strong>
                      </>
                    )}
                  </div>
                )}
              </div>
            </details>
          )}
        </Panel>
      </div>
    );
  },
) as (props: RowComponentProps<ErrorNotebookRowProps>) => React.ReactElement | null;

export const ErrorNotebookPage: React.FC = () => {
  const {
    db,
    fixedSubjects,
    addFixedSubject,
    removeFixedSubject,
    allErrorEntries,
    moduleVisibility,
    setActivePage,
    addAnnotation,
    updateAnnotation,
    updateErrorEntrySubject,
    bulkUpdateErrorEntriesSubject,
    deleteAnnotation,
    markAnnotationCorrected,
    reopenAnnotation,
    advanceErrorReview,
    startErrorNotebookQuiz,
    googleUser,
    requestConfirm,
    toast,
  } = useStudy();

  const hideSearch = moduleVisibility('Caderno de Erros').hide_search;

  const savedNewDraft = readFieldDraft<{ materia?: string; tipo?: string; texto?: string }>(
    'error_notebook_new_annotation',
  );
  const [newSubject, setNewSubject] = useState(
    savedNewDraft?.materia || fixedSubjects[0] || 'Direito Constitucional',
  );
  const [newType, setNewType] = useState(savedNewDraft?.tipo || NOTE_TYPES[0]);
  const [newText, setNewText] = useState(savedNewDraft?.texto || '');
  const [newTextRawBeforeFormat, setNewTextRawBeforeFormat] = useState<string | null>(null);
  const [newTextAutoFormatted, setNewTextAutoFormatted] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [srsFlashcardsOpen, setSrsFlashcardsOpen] = useState(false);

  const handlePasteNewText = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text/plain');
    if (!pasted || !pasted.trim()) return;
    e.preventDefault();
    const target = e.currentTarget;
    const start = target.selectionStart ?? newText.length;
    const end = target.selectionEnd ?? newText.length;
    const rawUnformatted = newText.slice(0, start) + pasted + newText.slice(end);
    const { nextValue, nextCursorPos, changed } = insertFormattedPaste(
      newText,
      start,
      end,
      pasted,
    );
    setNewTextRawBeforeFormat(changed ? rawUnformatted : null);
    setNewTextAutoFormatted(changed);
    setNewText(nextValue);
    requestAnimationFrame(() => {
      if (target && document.activeElement === target) {
        target.setSelectionRange(nextCursorPos, nextCursorPos);
      }
    });
  };

  const handleManualFormatNewText = () => {
    if (!newText.trim()) return;
    const formatted = formatCorrectionTextStructured(newText);
    if (formatted === newText) {
      setNewTextAutoFormatted(true);
      return;
    }
    setNewTextRawBeforeFormat(newText);
    setNewTextAutoFormatted(true);
    setNewText(formatted);
  };

  useEffect(() => {
    if (!newText.trim()) {
      clearFieldDraft('error_notebook_new_annotation');
    } else {
      writeFieldDraft('error_notebook_new_annotation', {
        materia: newSubject,
        tipo: newType,
        texto: newText,
      });
    }
  }, [newSubject, newText, newType]);

  // Subject registration & bulk assignment state
  const [newSubjectName, setNewSubjectName] = useState('');
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [bulkTargetSubject, setBulkTargetSubject] = useState(fixedSubjects[0] || '');

  const [filterSubject, setFilterSubject] = useState('Todas as Matérias');
  const [selectedSimulationKey, setSelectedSimulationKey] = useState<string>('all');
  const [simOnlyUnassigned, setSimOnlyUnassigned] = useState<boolean>(false);
  const [filterMode, setFilterMode] = useState<'all' | 'errors' | 'notes'>('all');
  const [filterStatus, setFilterStatus] = useState<'pending' | 'corrected' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [flashcardMode, setFlashcardMode] = useState(false);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardRevealed, setFlashcardRevealed] = useState(false);

  // Print & PDF export configuration (combined or separate by subject)
  const [exportMode, setExportMode] = useState<'all' | 'multi' | 'single'>('all');
  const [exportSingleSubject, setExportSingleSubject] = useState(fixedSubjects[0] || '');
  const [exportMultiSubjects, setExportMultiSubjects] = useState<string[]>([]);
  const [exportStatus, setExportStatus] = useState<'pending' | 'corrected' | 'all'>('all');
  const [includeQuestion, setIncludeQuestion] = useState(true);
  const [pageBreakBySubject, setPageBreakBySubject] = useState(true);

  const [printOverride, setPrintOverride] = useState<{
    mode: 'all' | 'multi' | 'single' | 'simulation';
    singleSubject: string;
    multiSubjects: string[];
    simuladoKey?: string;
    simuladoLabel?: string;
    statusFilter: 'pending' | 'corrected' | 'all';
  } | null>(null);
  const [printTriggerTick, setPrintTriggerTick] = useState(0);

  const [statsExpanded, setStatsExpanded] = useState(true);
  const [statsShowAll, setStatsShowAll] = useState(false);
  const [statsSortBy, setStatsSortBy] = useState<'rate' | 'count'>('rate');
  const [paretoMode, setParetoMode] = useState<'notebook' | 'wrong_questions' | 'by_type'>('notebook');

  const [editingEntry, setEditingEntry] = useState<EditingErrorEntryState | null>(null);
  const editingEntryRef = useRef(editingEntry);
  editingEntryRef.current = editingEntry;
  const allErrorEntriesRef = useRef(allErrorEntries);
  allErrorEntriesRef.current = allErrorEntries;

  const todayIso = localDateIso();

  const pendingCount = useMemo(() => {
    return allErrorEntries.filter((e) => !e.corrigido).length;
  }, [allErrorEntries]);

  const correctedCount = useMemo(() => {
    return allErrorEntries.filter((e) => Boolean(e.corrigido)).length;
  }, [allErrorEntries]);

  // Same registered subjects used across Cronômetro / Cronograma / Caderno de Erros
  const registeredSubjects = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    fixedSubjects.forEach((raw) => {
      const clean = visibleName(raw);
      const norm = normalizeSearch(clean);
      if (clean && norm && !seen.has(norm)) {
        seen.add(norm);
        list.push(clean);
      }
    });
    return list;
  }, [fixedSubjects]);

  const registeredSubjectNorms = useMemo(
    () => new Set(registeredSubjects.map((s) => normalizeSearch(s))),
    [registeredSubjects],
  );

  // Keep bulkTargetSubject and exportSingleSubject synced with registeredSubjects
  useEffect(() => {
    if (!bulkTargetSubject && registeredSubjects.length > 0) {
      setBulkTargetSubject(registeredSubjects[0]);
    } else if (
      bulkTargetSubject &&
      registeredSubjects.length > 0 &&
      !registeredSubjectNorms.has(normalizeSearch(bulkTargetSubject))
    ) {
      setBulkTargetSubject(registeredSubjects[0]);
    }
  }, [bulkTargetSubject, registeredSubjectNorms, registeredSubjects]);

  // Unified directory of closed simulations (grouped inside single "Simulados" selector)
  const simulationDirectory = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        total: number;
        pending: number;
        corrected: number;
        unassigned: number;
      }
    >();

    let totalEntries = 0;
    let totalPending = 0;
    let totalUnassigned = 0;

    allErrorEntries.forEach((e) => {
      if (!isClosedSimulationEntry(e)) return;
      totalEntries += 1;
      const isCorr = Boolean(e.corrigido);
      if (!isCorr) totalPending += 1;
      const matNorm = normalizeSearch(visibleName(e.materia));
      const isUnassigned = !matNorm || !registeredSubjectNorms.has(matNorm);
      if (isUnassigned) totalUnassigned += 1;

      const meta = resolveSimulationExamMeta(e, db.completedSimulations);
      const cur = map.get(meta.key) || {
        key: meta.key,
        label: meta.label,
        total: 0,
        pending: 0,
        corrected: 0,
        unassigned: 0,
      };
      cur.total += 1;
      if (isCorr) cur.corrected += 1;
      else cur.pending += 1;
      if (isUnassigned) cur.unassigned += 1;
      map.set(meta.key, cur);
    });

    const exams = [...map.values()].sort((a, b) => {
      if (b.pending !== a.pending) return b.pending - a.pending;
      return a.label.localeCompare(b.label, 'pt-BR');
    });

    return { exams, totalEntries, totalPending, totalUnassigned };
  }, [allErrorEntries, db.completedSimulations, registeredSubjectNorms]);

  // Reset selectedSimulationKey if that exam no longer exists
  useEffect(() => {
    if (
      selectedSimulationKey !== 'all' &&
      !simulationDirectory.exams.some((ex) => ex.key === selectedSimulationKey)
    ) {
      setSelectedSimulationKey('all');
    }
  }, [selectedSimulationKey, simulationDirectory.exams]);

  const subjectOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    const push = (raw?: string) => {
      const clean = visibleName(raw || '');
      const norm = normalizeSearch(clean);
      if (!clean || !norm || seen.has(norm)) return;
      seen.add(norm);
      list.push(clean);
    };
    registeredSubjects.forEach(push);
    // Only include non-simulation subjects (closed simulation raw titles stay inside "Simulados")
    allErrorEntries.forEach((e) => {
      if (isClosedSimulationEntry(e)) {
        const norm = normalizeSearch(visibleName(e.materia));
        if (norm && registeredSubjectNorms.has(norm)) push(e.materia);
      } else {
        push(e.materia);
      }
    });
    if (
      filterSubject !== 'Todas as Matérias' &&
      filterSubject !== UNASSIGNED_SUBJECT_FILTER &&
      filterSubject !== SIMULADOS_FILTER
    ) {
      push(filterSubject);
    }
    return list.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allErrorEntries, filterSubject, registeredSubjectNorms, registeredSubjects]);

  useEffect(() => {
    if (!exportSingleSubject && subjectOptions.length > 0) {
      setExportSingleSubject(subjectOptions[0]);
    }
  }, [exportSingleSubject, subjectOptions]);

  // Counts per subject (exact normalized match) + non-simulation unassigned counts
  const subjectDirectoryMetrics = useMemo(() => {
    const byNorm = new Map<string, { pending: number; corrected: number; total: number }>();
    let unassignedPending = 0;
    let unassignedTotal = 0;

    allErrorEntries.forEach((e) => {
      const norm = normalizeSearch(visibleName(e.materia));
      const isCorr = Boolean(e.corrigido);
      if (norm) {
        const cur = byNorm.get(norm) || { pending: 0, corrected: 0, total: 0 };
        cur.total += 1;
        if (isCorr) cur.corrected += 1;
        else cur.pending += 1;
        byNorm.set(norm, cur);
      }
      if (!isClosedSimulationEntry(e) && (!norm || !registeredSubjectNorms.has(norm))) {
        unassignedTotal += 1;
        if (!isCorr) unassignedPending += 1;
      }
    });

    return { byNorm, unassignedPending, unassignedTotal };
  }, [allErrorEntries, registeredSubjectNorms]);

  const resolveStatsSubject = useMemo(() => {
    const byNorm = new Map<string, string>();
    registeredSubjects.forEach((s) => byNorm.set(normalizeSearch(s), s));
    return (raw?: string, isFromSimulation = false): string => {
      const clean = visibleName(raw || '');
      if (!clean) return isFromSimulation ? SIMULADOS_STATS_KEY : 'Geral';
      const exact = byNorm.get(normalizeSearch(clean));
      if (exact) return exact;
      const inferred = inferFixedSubjectFromTopic({ materia: clean }, registeredSubjects);
      if (inferred) {
        const matchedRegistered = byNorm.get(normalizeSearch(inferred));
        if (matchedRegistered) return matchedRegistered;
      }
      // Never spawn a separate subject row for each closed simulation exam name
      if (isFromSimulation) return SIMULADOS_STATS_KEY;
      return clean;
    };
  }, [registeredSubjects]);

  const subjectErrorStats = useMemo(() => {
    interface SubjectStatAcc {
      subject: string;
      notebookTotal: number;
      notebookErrors: number;
      pendingCount: number;
      correctedCount: number;
      answeredQuestions: number;
      wrongQuestions: number;
    }

    const map = new Map<string, SubjectStatAcc>();
    const ensureRow = (rawSubject?: string, isFromSimulation = false): SubjectStatAcc => {
      const key = resolveStatsSubject(rawSubject, isFromSimulation);
      const norm = normalizeSearch(key);
      const existing = [...map.values()].find((r) => normalizeSearch(r.subject) === norm);
      if (existing) return existing;
      const created: SubjectStatAcc = {
        subject: key,
        notebookTotal: 0,
        notebookErrors: 0,
        pendingCount: 0,
        correctedCount: 0,
        answeredQuestions: 0,
        wrongQuestions: 0,
      };
      map.set(key, created);
      return created;
    };

    allErrorEntries.forEach((entry) => {
      const row = ensureRow(entry.materia, isClosedSimulationEntry(entry));
      row.notebookTotal += 1;
      const isErrorItem = Boolean(entry.questao || entry.correcao_prova || entry.tipo.includes('Erro'));
      if (isErrorItem) row.notebookErrors += 1;
      if (entry.corrigido) row.correctedCount += 1;
      else row.pendingCount += 1;
    });

    db.history.forEach((h) => {
      const row = ensureRow(h.subject, false);
      row.answeredQuestions += 1;
      if (!h.correct) row.wrongQuestions += 1;
    });

    db.completedSimulations.forEach((sim) => {
      (sim.questoes || []).forEach((q) => {
        if (!q.resposta) return;
        const row = ensureRow(q.materia || sim.materia, true);
        row.answeredQuestions += 1;
        if (!q.correta) row.wrongQuestions += 1;
      });
    });

    const totalNotebookAll = allErrorEntries.length;
    const rows = [...map.values()]
      .filter((r) => r.notebookTotal > 0 || r.wrongQuestions > 0)
      .map((r) => {
        const errorRatePct =
          r.answeredQuestions > 0
            ? Math.round((r.wrongQuestions / r.answeredQuestions) * 100)
            : null;
        const notebookSharePct =
          totalNotebookAll > 0 ? Math.round((r.notebookTotal / totalNotebookAll) * 100) : 0;
        const effectiveScore = errorRatePct !== null ? errorRatePct : notebookSharePct;
        return {
          ...r,
          errorRatePct,
          notebookSharePct,
          effectiveScore,
        };
      });

    const hasAttemptData = rows.some((r) => r.errorRatePct !== null);
    const activeMode = statsSortBy === 'rate' && hasAttemptData ? 'rate' : 'count';

    rows.sort((a, b) => {
      if (activeMode === 'rate') {
        const aRate = a.errorRatePct ?? -1;
        const bRate = b.errorRatePct ?? -1;
        if (bRate !== aRate) return bRate - aRate;
        if (b.notebookTotal !== a.notebookTotal) return b.notebookTotal - a.notebookTotal;
        return b.wrongQuestions - a.wrongQuestions;
      }
      if (b.notebookTotal !== a.notebookTotal) return b.notebookTotal - a.notebookTotal;
      if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
      return (b.errorRatePct ?? 0) - (a.errorRatePct ?? 0);
    });

    const highestRateRow =
      [...rows]
        .filter((r) => r.errorRatePct !== null && r.wrongQuestions > 0)
        .sort(
          (a, b) =>
            (b.errorRatePct ?? 0) - (a.errorRatePct ?? 0) ||
            b.wrongQuestions - a.wrongQuestions,
        )[0] || null;

    const highestVolumeRow =
      [...rows].sort(
        (a, b) => b.notebookTotal - a.notebookTotal || b.pendingCount - a.pendingCount,
      )[0] || null;

    return {
      rows,
      hasAttemptData,
      activeMode,
      highestRateRow,
      highestVolumeRow,
      totalNotebookAll,
    };
  }, [allErrorEntries, db.completedSimulations, db.history, resolveStatsSubject, statsSortBy]);

  const paretoItems = useMemo<ParetoDatum[]>(() => {
    if (paretoMode === 'by_type') {
      const byType = new Map<string, { count: number; pending: number }>();
      allErrorEntries.forEach((e) => {
        const key = visibleName(e.tipo || 'Outros') || 'Outros';
        const cur = byType.get(key) || { count: 0, pending: 0 };
        cur.count += 1;
        if (!e.corrigido) cur.pending += 1;
        byType.set(key, cur);
      });
      return [...byType.entries()].map(([label, stats]) => ({
        key: label,
        label,
        count: stats.count,
        pendingCount: stats.pending,
      }));
    }

    if (paretoMode === 'wrong_questions') {
      return subjectErrorStats.rows
        .filter((r) => r.wrongQuestions > 0)
        .map((r) => ({
          key: r.subject,
          label: visibleName(r.subject),
          count: r.wrongQuestions,
          pendingCount: r.pendingCount,
          ratePct: r.errorRatePct,
          rateDetail: `${r.wrongQuestions}/${r.answeredQuestions}`,
        }));
    }

    return subjectErrorStats.rows
      .filter((r) => r.notebookTotal > 0)
      .map((r) => ({
        key: r.subject,
        label: visibleName(r.subject),
        count: r.notebookTotal,
        pendingCount: r.pendingCount,
        ratePct: r.errorRatePct,
        rateDetail: r.answeredQuestions ? `${r.wrongQuestions}/${r.answeredQuestions}` : undefined,
      }));
  }, [allErrorEntries, paretoMode, subjectErrorStats.rows]);

  const filteredEntries = useMemo(() => {
    const term = normalizeSearch(search);
    const filterNorm = normalizeSearch(filterSubject);
    return allErrorEntries.filter((e) => {
      if (filterSubject === SIMULADOS_FILTER) {
        if (!isClosedSimulationEntry(e)) return false;
        if (selectedSimulationKey !== 'all') {
          const meta = resolveSimulationExamMeta(e, db.completedSimulations);
          if (meta.key !== selectedSimulationKey) return false;
        }
        if (simOnlyUnassigned) {
          const entryNorm = normalizeSearch(visibleName(e.materia));
          if (entryNorm && registeredSubjectNorms.has(entryNorm)) return false;
        }
      } else if (filterSubject === UNASSIGNED_SUBJECT_FILTER) {
        if (isClosedSimulationEntry(e)) return false;
        const entryNorm = normalizeSearch(visibleName(e.materia));
        if (entryNorm && registeredSubjectNorms.has(entryNorm)) return false;
      } else if (filterSubject !== 'Todas as Matérias') {
        const entryNorm = normalizeSearch(visibleName(e.materia));
        const resolvedNorm = normalizeSearch(
          resolveStatsSubject(e.materia, isClosedSimulationEntry(e)),
        );
        if (entryNorm !== filterNorm && resolvedNorm !== filterNorm) return false;
      }
      const isErrorItem = Boolean(e.questao || e.correcao_prova || e.tipo.includes('Erro'));
      if (filterMode === 'errors' && !isErrorItem) return false;
      if (filterMode === 'notes' && isErrorItem) return false;

      // Status: Pendentes vs Já Corrigidos vs Todos
      const isCorrected = Boolean(e.corrigido);
      if (filterStatus === 'pending' && isCorrected) return false;
      if (filterStatus === 'corrected' && !isCorrected) return false;

      if (term) {
        const hay = normalizeSearch(
          `${e.materia} ${e.simulado_titulo || ''} ${e.tipo} ${e.texto} ${e.questao?.enunciado || ''} ${
            e.arquivo_prova || ''
          }`,
        );
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [
    allErrorEntries,
    db.completedSimulations,
    filterMode,
    filterStatus,
    filterSubject,
    registeredSubjectNorms,
    resolveStatsSubject,
    search,
    selectedSimulationKey,
    simOnlyUnassigned,
  ]);

  // Selection helpers for bulk association of pending questions
  const filteredPendingIds = useMemo(
    () => filteredEntries.filter((e) => !e.corrigido).map((e) => e.id),
    [filteredEntries],
  );

  const selectedEntryIdSet = useMemo(() => new Set(selectedEntryIds), [selectedEntryIds]);

  // Keep selectedEntryIds valid when entries are deleted or corrected
  useEffect(() => {
    const validPending = new Set(allErrorEntries.filter((e) => !e.corrigido).map((e) => e.id));
    setSelectedEntryIds((prev) => {
      const next = prev.filter((id) => validPending.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [allErrorEntries]);

  const handleToggleSelectEntry = useCallback((id: string) => {
    setSelectedEntryIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);

  const allFilteredPendingSelected =
    filteredPendingIds.length > 0 &&
    filteredPendingIds.every((id) => selectedEntryIdSet.has(id));

  const handleToggleSelectAllFilteredPending = () => {
    if (allFilteredPendingSelected) {
      const toRemove = new Set(filteredPendingIds);
      setSelectedEntryIds((prev) => prev.filter((id) => !toRemove.has(id)));
    } else {
      setSelectedEntryIds((prev) => Array.from(new Set([...prev, ...filteredPendingIds])));
    }
  };

  const handleRegisterSubject = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = visibleName(newSubjectName).trim();
    if (!clean) {
      toast('Digite o nome da matéria para cadastrar.', true);
      return;
    }
    if (registeredSubjectNorms.has(normalizeSearch(clean))) {
      toast(`A matéria "${clean}" já está cadastrada.`, true);
      setNewSubjectName('');
      return;
    }
    addFixedSubject(clean);
    setNewSubjectName('');
    setNewSubject(clean);
    setBulkTargetSubject(clean);
    if (!exportSingleSubject) setExportSingleSubject(clean);
  };

  const handleRemoveRegisteredSubject = async (subj: string) => {
    const ok = await requestConfirm({
      title: 'Remover matéria cadastrada',
      description: `Deseja remover "${subj}" da lista de matérias cadastradas? As anotações e questões já existentes não serão apagadas.`,
      confirmLabel: 'Remover matéria',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!ok) return;
    removeFixedSubject(subj);
    if (normalizeSearch(filterSubject) === normalizeSearch(subj)) {
      setFilterSubject('Todas as Matérias');
    }
    setExportMultiSubjects((prev) =>
      prev.filter((item) => normalizeSearch(item) !== normalizeSearch(subj)),
    );
  };

  // Safe subject update: clears stale edit drafts and syncs open editor so autosave never reverts materia
  const handleSafeUpdateEntrySubject = useCallback(
    (id: string, subject: string) => {
      clearFieldDraft(`error_notebook_edit_${id}`);
      setEditingEntry((prev) => (prev && prev.id === id ? { ...prev, materia: subject } : prev));
      updateErrorEntrySubject(id, subject);
    },
    [updateErrorEntrySubject],
  );

  const handleBulkAssociatePending = () => {
    if (!selectedEntryIds.length) {
      toast('Selecione ao menos uma questão pendente para associar.', true);
      return;
    }
    if (!bulkTargetSubject.trim()) {
      toast('Cadastre ou selecione uma matéria de destino primeiro.', true);
      return;
    }
    const idSet = new Set(selectedEntryIds);
    selectedEntryIds.forEach((id) => clearFieldDraft(`error_notebook_edit_${id}`));
    setEditingEntry((prev) =>
      prev && idSet.has(prev.id) ? { ...prev, materia: bulkTargetSubject } : prev,
    );
    bulkUpdateErrorEntriesSubject(selectedEntryIds, bulkTargetSubject);
    setSelectedEntryIds([]);
  };

  // Resolve entries & labels for Print Sheet and PDF Export
  const computeBundleForConfig = useCallback(
    (cfg: {
      mode: 'all' | 'multi' | 'single' | 'simulation';
      singleSubject: string;
      multiSubjects: string[];
      simuladoKey?: string;
      simuladoLabel?: string;
      statusFilter: 'pending' | 'corrected' | 'all';
    }) => {
      if (cfg.mode === 'simulation') {
        const entries = allErrorEntries.filter((row) => {
          if (!isClosedSimulationEntry(row)) return false;
          const isCorr = Boolean(row.corrigido);
          if (cfg.statusFilter === 'pending' && isCorr) return false;
          if (cfg.statusFilter === 'corrected' && !isCorr) return false;
          if (cfg.simuladoKey && cfg.simuladoKey !== 'all') {
            const meta = resolveSimulationExamMeta(row, db.completedSimulations);
            if (meta.key !== cfg.simuladoKey) return false;
          }
          return true;
        });
        const distinctSubjectsCount = new Set(
          entries.map((e) => normalizeSearch(visibleName(e.materia || 'Geral'))),
        ).size;
        const scopeLabel =
          cfg.simuladoKey && cfg.simuladoKey !== 'all'
            ? `Simulado: ${cfg.simuladoLabel || 'Prova selecionada'}`
            : 'Todos os Simulados (em conjunto)';
        return {
          entries,
          distinctSubjectsCount,
          scopeLabel,
          targetSubjects: 'Todas as Matérias' as string | string[],
        };
      }

      const targetSubjects: string | string[] =
        cfg.mode === 'all'
          ? 'Todas as Matérias'
          : cfg.mode === 'single'
            ? cfg.singleSubject
            : cfg.multiSubjects;

      const selectedList = Array.isArray(targetSubjects)
        ? targetSubjects.filter(Boolean)
        : targetSubjects && targetSubjects !== 'Todas as Matérias'
          ? [targetSubjects]
          : [];

      const isAll = cfg.mode === 'all';
      const selectedNorms = new Set(selectedList.map((s) => normalizeSearch(visibleName(s))));

      const entries = allErrorEntries.filter((row) => {
        const isCorr = Boolean(row.corrigido);
        if (cfg.statusFilter === 'pending' && isCorr) return false;
        if (cfg.statusFilter === 'corrected' && !isCorr) return false;
        if (!isAll) {
          if (!selectedNorms.size) return false;
          const rowNorm = normalizeSearch(visibleName(row.materia));
          if (!selectedNorms.has(rowNorm)) return false;
        }
        return true;
      });

      const distinctSubjectsCount = new Set(
        entries.map((e) => normalizeSearch(visibleName(e.materia || 'Geral'))),
      ).size;

      const scopeLabel = isAll
        ? 'Todas as matérias (em conjunto)'
        : cfg.mode === 'single'
          ? `${visibleName(cfg.singleSubject || 'Geral')} (separado)`
          : selectedList.length === 1
            ? `${visibleName(selectedList[0])} (separado)`
            : `${selectedList.length} matérias selecionadas (em conjunto)`;

      return {
        entries,
        distinctSubjectsCount,
        scopeLabel,
        targetSubjects,
      };
    },
    [allErrorEntries, db.completedSimulations],
  );

  const exportPreview = useMemo(
    () =>
      computeBundleForConfig({
        mode: exportMode,
        singleSubject: exportSingleSubject,
        multiSubjects: exportMultiSubjects,
        statusFilter: exportStatus,
      }),
    [computeBundleForConfig, exportMode, exportMultiSubjects, exportSingleSubject, exportStatus],
  );

  const activePrintConfig = printOverride ?? {
    mode: exportMode,
    singleSubject: exportSingleSubject,
    multiSubjects: exportMultiSubjects,
    statusFilter: exportStatus,
  };

  const activePrintBundle = useMemo(
    () => computeBundleForConfig(activePrintConfig),
    [activePrintConfig, computeBundleForConfig],
  );

  useEffect(() => {
    if (printTriggerTick === 0) return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        window.print();
      });
    });
    const handleAfterPrint = () => {
      setPrintOverride(null);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [printTriggerTick]);

  const handlePrintFromPanel = () => {
    if (exportMode === 'multi' && exportMultiSubjects.length === 0) {
      toast('Marque ao menos uma matéria para imprimir em conjunto.', true);
      return;
    }
    if (exportPreview.entries.length === 0) {
      toast('Não há registros para imprimir com os filtros selecionados.', true);
      return;
    }
    setPrintOverride(null);
    setPrintTriggerTick((t) => t + 1);
  };

  const handlePrintSimulationDirect = () => {
    const selectedExam = simulationDirectory.exams.find((ex) => ex.key === selectedSimulationKey);
    const preferredStatus = filterStatus;
    const checkPreferred = computeBundleForConfig({
      mode: 'simulation',
      singleSubject: '',
      multiSubjects: [],
      simuladoKey: selectedSimulationKey,
      simuladoLabel: selectedExam?.label,
      statusFilter: preferredStatus,
    });
    const fallbackAll =
      checkPreferred.entries.length > 0
        ? checkPreferred
        : computeBundleForConfig({
            mode: 'simulation',
            singleSubject: '',
            multiSubjects: [],
            simuladoKey: selectedSimulationKey,
            simuladoLabel: selectedExam?.label,
            statusFilter: 'all',
          });

    if (fallbackAll.entries.length === 0) {
      toast('Não há registros de simulado para imprimir.', true);
      return;
    }

    setPrintOverride({
      mode: 'simulation',
      singleSubject: '',
      multiSubjects: [],
      simuladoKey: selectedSimulationKey,
      simuladoLabel: selectedExam?.label,
      statusFilter: checkPreferred.entries.length > 0 ? preferredStatus : 'all',
    });
    setPrintTriggerTick((t) => t + 1);
  };

  const handlePrintSingleSubjectDirect = (subj: string) => {
    const preferredStatus = filterStatus;
    const checkPreferred = computeBundleForConfig({
      mode: 'single',
      singleSubject: subj,
      multiSubjects: [],
      statusFilter: preferredStatus,
    });
    const fallbackAll =
      checkPreferred.entries.length > 0
        ? checkPreferred
        : computeBundleForConfig({
            mode: 'single',
            singleSubject: subj,
            multiSubjects: [],
            statusFilter: 'all',
          });

    if (fallbackAll.entries.length === 0) {
      toast(`Não há registros no caderno para a matéria "${subj}".`, true);
      return;
    }

    setPrintOverride({
      mode: 'single',
      singleSubject: subj,
      multiSubjects: [],
      statusFilter: checkPreferred.entries.length > 0 ? preferredStatus : 'all',
    });
    setPrintTriggerTick((t) => t + 1);
  };

  const handleToggleMultiExportSubject = (subj: string) => {
    const norm = normalizeSearch(subj);
    setExportMultiSubjects((prev) =>
      prev.some((s) => normalizeSearch(s) === norm)
        ? prev.filter((s) => normalizeSearch(s) !== norm)
        : [...prev, subj],
    );
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    addAnnotation(newSubject, newType, newText);
    clearFieldDraft('error_notebook_new_annotation');
    setNewText('');
    setNewTextRawBeforeFormat(null);
    setNewTextAutoFormatted(false);
  };

  const handleExportPdf = () => {
    if (exportMode === 'multi' && exportMultiSubjects.length === 0) {
      toast('Marque ao menos uma matéria para baixar o PDF em conjunto.', true);
      return;
    }
    try {
      exportErrorNotebookPdf(
        allErrorEntries,
        exportPreview.targetSubjects,
        includeQuestion,
        {
          statusFilter: exportStatus,
          pageBreakBySubject,
          scopeLabel: exportPreview.scopeLabel,
          holderName:
            googleUser?.displayName || googleUser?.email || 'Cidadão-Estudante Federal',
        },
      );
      toast('PDF do Caderno de Erros gerado com sucesso.');
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const handleExportAllPendingPdf = () => {
    if (pendingCount === 0) {
      toast('Não há pendências de correção para exportar em PDF.', true);
      return;
    }
    try {
      exportErrorNotebookPdf(
        allErrorEntries,
        'Todas as Matérias',
        includeQuestion,
        {
          statusFilter: 'pending',
          pageBreakBySubject,
          scopeLabel: 'Todas as Pendências (Todas as Matérias)',
          holderName:
            googleUser?.displayName || googleUser?.email || 'Cidadão-Estudante Federal',
          fileNameOverride: `caderno_erros_todas_pendencias_${localDateIso()}.pdf`,
        },
      );
      toast(`PDF com todas as ${pendingCount} pendência(s) gerado com sucesso.`);
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const flushEditingDraft = useCallback(
    (silent = true) => {
      const current = editingEntryRef.current;
      if (!current) return;
      const source = allErrorEntriesRef.current.find((e) => e.id === current.id);
      if (!source) return;
      const changed =
        source.materia !== current.materia ||
        source.tipo !== current.tipo ||
        source.texto !== current.texto ||
        (source.questao &&
          ((source.questao.enunciado ?? '') !== (current.enunciado ?? '') ||
            (source.questao.gabarito ?? '') !== (current.gabarito ?? '') ||
            (source.questao.resposta ?? '') !== (current.resposta ?? '') ||
            (source.questao.comentario ?? '') !== (current.comentario ?? '')));
      if (!changed) {
        clearFieldDraft(`error_notebook_edit_${current.id}`);
        return;
      }
      updateAnnotation(
        current.id,
        current.materia,
        current.tipo,
        current.texto,
        source.questao || current.hasQuestion
          ? {
              enunciado: current.enunciado,
              gabarito: current.gabarito,
              resposta: current.resposta,
              comentario: current.comentario,
            }
          : undefined,
        silent,
      );
      clearFieldDraft(`error_notebook_edit_${current.id}`);
    },
    [updateAnnotation],
  );

  useEffect(() => {
    if (!editingEntry) return;
    writeFieldDraft(`error_notebook_edit_${editingEntry.id}`, editingEntry);
    const timer = window.setTimeout(() => flushEditingDraft(true), 1000);
    return () => window.clearTimeout(timer);
  }, [editingEntry, flushEditingDraft]);

  useEffect(() => {
    const handleFlush = () => flushEditingDraft(true);
    window.addEventListener('central-estudos:flush-drafts', handleFlush);
    window.addEventListener('beforeunload', handleFlush);
    window.addEventListener('pagehide', handleFlush);
    return () => {
      window.removeEventListener('central-estudos:flush-drafts', handleFlush);
      window.removeEventListener('beforeunload', handleFlush);
      window.removeEventListener('pagehide', handleFlush);
      handleFlush();
    };
  }, [flushEditingDraft]);

  const handleSaveEdit = useCallback(
    (entry: ErrorNotebookEntry) => {
      const current = editingEntryRef.current;
      if (!current || current.id !== entry.id) return;
      updateAnnotation(
        entry.id,
        current.materia,
        current.tipo,
        current.texto,
        entry.questao
          ? {
              enunciado: current.enunciado,
              gabarito: current.gabarito,
              resposta: current.resposta,
              comentario: current.comentario,
            }
          : undefined,
      );
      clearFieldDraft(`error_notebook_edit_${entry.id}`);
      setEditingEntry(null);
    },
    [updateAnnotation],
  );

  const linkedQuestionsCount = useMemo(
    () => filteredEntries.filter((e) => Boolean(e.questao?.enunciado)).length,
    [filteredEntries],
  );

  const dueReviewsCount = useMemo(
    () =>
      allErrorEntries.filter(
        (e) => e.proxima_revisao && e.proxima_revisao <= todayIso,
      ).length,
    [allErrorEntries, todayIso],
  );

  const safeFlashcardIdx = filteredEntries.length
    ? Math.min(flashcardIndex, filteredEntries.length - 1)
    : 0;
  const activeFlashcard = filteredEntries[safeFlashcardIdx];

  const handleToggleStatsSubject = useCallback((subject: string) => {
    if (normalizeSearch(subject) === normalizeSearch(SIMULADOS_STATS_KEY)) {
      setFilterSubject((prev) =>
        prev === SIMULADOS_FILTER ? 'Todas as Matérias' : SIMULADOS_FILTER,
      );
      return;
    }
    setFilterSubject((prev) =>
      normalizeSearch(prev) === normalizeSearch(subject) ? 'Todas as Matérias' : subject,
    );
  }, []);

  const displayedStatsRows = useMemo(
    () => (statsShowAll ? subjectErrorStats.rows : subjectErrorStats.rows.slice(0, 5)),
    [statsShowAll, subjectErrorStats.rows],
  );

  const statsRowProps = useMemo<SubjectStatListRowProps>(
    () => ({
      rows: displayedStatsRows,
      filterSubject,
      onToggleSubject: handleToggleStatsSubject,
    }),
    [displayedStatsRows, filterSubject, handleToggleStatsSubject],
  );

  const statsDynamicHeight = useDynamicRowHeight({
    defaultRowHeight: 62,
    key: `err-stats-${displayedStatsRows.length}-${statsSortBy}`,
  });

  const statsRowKey = useCallback(
    (index: number, data: SubjectStatListRowProps) => data.rows[index]?.subject ?? index,
    [],
  );

  const entriesDynamicHeight = useDynamicRowHeight({
    defaultRowHeight: 220,
    key: `err-entries-${filterSubject}-${selectedSimulationKey}-${simOnlyUnassigned}-${filterMode}-${filterStatus}-${search}`,
  });

  const entryRowProps = useMemo<ErrorNotebookRowProps>(
    () => ({
      entries: filteredEntries,
      completedSimulations: db.completedSimulations,
      registeredSubjects,
      registeredSubjectNorms,
      selectedEntryIds: selectedEntryIdSet,
      onToggleSelectEntry: handleToggleSelectEntry,
      todayIso,
      editingEntry,
      setEditingEntry,
      flushEditingDraft,
      handleSaveEdit,
      updateErrorEntrySubject: handleSafeUpdateEntrySubject,
      markAnnotationCorrected,
      advanceErrorReview,
      reopenAnnotation,
      deleteAnnotation,
      setActivePage,
    }),
    [
      filteredEntries,
      db.completedSimulations,
      registeredSubjects,
      registeredSubjectNorms,
      selectedEntryIdSet,
      handleToggleSelectEntry,
      todayIso,
      editingEntry,
      flushEditingDraft,
      handleSaveEdit,
      handleSafeUpdateEntrySubject,
      markAnnotationCorrected,
      advanceErrorReview,
      reopenAnnotation,
      deleteAnnotation,
      setActivePage,
    ],
  );

  const entryRowKey = useCallback(
    (index: number, data: ErrorNotebookRowProps) => data.entries[index]?.id ?? index,
    [],
  );

  return (
    <div>
      <div className="print:hidden">
      <PageHeader
        eyebrow="OUVIDORIA ESTUDANTIL · CADERNO DE ERROS"
        title="Revisão direcionada de erros e anotações"
        description="Cadastre suas matérias, associe questões pendentes de correção, filtre por disciplina e imprima o caderno de erros em conjunto ou separadamente."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportAllPendingPdf}
              disabled={pendingCount === 0}
              title="Baixar em PDF todas as questões e anotações pendentes de correção (todas as matérias)"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-45 transition-colors whitespace-nowrap cursor-pointer tabular-nums"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar PDF de Pendências ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setSrsFlashcardsOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] text-[12px] font-bold hover:bg-[var(--accent)] hover:text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              Estudar em Flashcards (SRS)
            </button>
          </div>
        }
      />

      {/* Cadastro de Matérias & Filtro Rápido com Impressão Individual */}
      <Panel
        className="mb-4"
        title="Matérias Cadastradas · Filtrar e Imprimir"
        subtitle="Cadastre novas matérias para associar às questões pendentes, clique em uma matéria para filtrar ou use o botão de impressão para gerar o caderno separado."
        action={
          <form onSubmit={handleRegisterSubject} className="flex items-center gap-2">
            <input
              type="text"
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="Nova matéria (ex.: Direito Penal)..."
              aria-label="Nome da nova matéria"
              className="ce-input !min-h-[34px] !py-1 w-[210px] sm:w-[240px]"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Cadastrar matéria
            </button>
          </form>
        }
      >
        <div className="flex flex-wrap items-center gap-2 mb-3 pb-2.5 border-b border-[var(--line)]">
          <button
            type="button"
            onClick={() => setFilterSubject('Todas as Matérias')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
              filterSubject === 'Todas as Matérias'
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Todas as Matérias
            <span className="font-mono-num text-[11px] opacity-85">
              {pendingCount} pend. · {allErrorEntries.length} total
            </span>
          </button>

          {simulationDirectory.totalEntries > 0 && (
            <button
              type="button"
              onClick={() =>
                setFilterSubject((prev) =>
                  prev === SIMULADOS_FILTER ? 'Todas as Matérias' : SIMULADOS_FILTER,
                )
              }
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                filterSubject === SIMULADOS_FILTER
                  ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                  : 'border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--accent)] hover:border-[var(--accent)]'
              }`}
              title="Todas as provas fechadas agrupadas em um único seletor para escolher qual prova corrigir"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              Simulados
              <span className="font-mono-num text-[11px] opacity-90">
                {simulationDirectory.exams.length}{' '}
                {simulationDirectory.exams.length === 1 ? 'prova' : 'provas'} ·{' '}
                {simulationDirectory.totalPending} pend.
              </span>
            </button>
          )}

          {subjectDirectoryMetrics.unassignedTotal > 0 && (
            <button
              type="button"
              onClick={() =>
                setFilterSubject((prev) =>
                  prev === UNASSIGNED_SUBJECT_FILTER
                    ? 'Todas as Matérias'
                    : UNASSIGNED_SUBJECT_FILTER,
                )
              }
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                filterSubject === UNASSIGNED_SUBJECT_FILTER
                  ? 'border-[var(--warning)] bg-[var(--warning)] text-white'
                  : 'border-[var(--warning)]/60 bg-[var(--warning)]/10 text-[var(--warning)] hover:border-[var(--warning)]'
              }`}
              title="Isolar questões cuja matéria ainda não pertence à sua lista cadastrada"
            >
              <Tag className="w-3.5 h-3.5" />
              Sem matéria cadastrada
              <span className="font-mono-num text-[11px]">
                {subjectDirectoryMetrics.unassignedPending} pend. · {subjectDirectoryMetrics.unassignedTotal} total
              </span>
            </button>
          )}
        </div>

        {/* Seletor interno de provas fechadas dentro de Simulados */}
        {filterSubject === SIMULADOS_FILTER && simulationDirectory.exams.length > 0 && (
          <div className="mb-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)]/50 p-3 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[var(--text)] whitespace-nowrap">
                  <ClipboardCheck className="w-4 h-4 text-[var(--accent)]" />
                  Prova de Simulado para corrigir:
                </span>
                <select
                  aria-label="Escolher prova fechada dentro de Simulados"
                  value={selectedSimulationKey}
                  onChange={(e) => setSelectedSimulationKey(e.target.value)}
                  className="ce-select !w-auto min-w-[260px] max-w-full flex-1 font-bold"
                >
                  <option value="all">
                    Todos os simulados ({simulationDirectory.exams.length} prova(s) ·{' '}
                    {simulationDirectory.totalPending} pend. · {simulationDirectory.totalEntries}{' '}
                    total)
                  </option>
                  {simulationDirectory.exams.map((ex) => (
                    <option key={ex.key} value={ex.key}>
                      {ex.label} ({ex.pending} pend. · {ex.total} total)
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handlePrintSimulationDirect}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap shrink-0 cursor-pointer"
                title="Imprimir em folha A4 os erros do simulado selecionado"
              >
                <Printer className="w-3.5 h-3.5 text-[var(--accent)]" />
                Imprimir simulado (A4)
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--muted)]">
              <span>
                Ao associar a matéria de uma questão abaixo, ela permanece visível nesta prova com a nova matéria salva para facilitar sua correção.
              </span>
              <label className="inline-flex items-center gap-1.5 font-semibold text-[var(--text)] cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={simOnlyUnassigned}
                  onChange={(e) => setSimOnlyUnassigned(e.target.checked)}
                  className="accent-[var(--accent)] w-3.5 h-3.5 cursor-pointer"
                />
                Mostrar apenas ainda sem matéria cadastrada
              </label>
            </div>
          </div>
        )}

        {registeredSubjects.length === 0 ? (
          <div className="text-[12.5px] text-[var(--muted)] py-1">
            Nenhuma matéria cadastrada ainda. Use o campo acima para cadastrar sua primeira matéria.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {registeredSubjects.map((subj) => {
              const norm = normalizeSearch(subj);
              const counts = subjectDirectoryMetrics.byNorm.get(norm) || {
                pending: 0,
                corrected: 0,
                total: 0,
              };
              const isSelected = normalizeSearch(filterSubject) === norm;

              return (
                <div
                  key={subj}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--line)] bg-[var(--panel-soft)] hover:border-[var(--line-strong)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setFilterSubject((prev) =>
                        normalizeSearch(prev) === norm ? 'Todas as Matérias' : subj,
                      )
                    }
                    className="min-w-0 flex-1 text-left cursor-pointer"
                    title={`Filtrar caderno por ${subj}`}
                  >
                    <div className="text-[12.5px] font-bold text-[var(--text)] truncate">
                      {subj}
                    </div>
                    <div className="text-[11px] font-mono-num text-[var(--muted)] mt-0.5">
                      <span className={counts.pending > 0 ? 'font-bold text-[var(--warning)]' : ''}>
                        {counts.pending} pend.
                      </span>
                      {' · '}
                      <span>{counts.total} total</span>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handlePrintSingleSubjectDirect(subj)}
                      disabled={counts.total === 0}
                      title={`Imprimir caderno de ${subj} separadamente (A4)`}
                      aria-label={`Imprimir caderno de ${subj}`}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-35 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemoveRegisteredSubject(subj)}
                      title={`Remover ${subj} do cadastro`}
                      aria-label={`Remover matéria ${subj}`}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[var(--line)] bg-transparent text-[var(--muted)] hover:border-[var(--bad)] hover:text-[var(--bad)] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.1fr] gap-3.5 mb-4 items-start">
        <Panel title="Nova anotação manual">
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                Matéria cadastrada
              </label>
              <select
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                className="ce-select"
              >
                {!registeredSubjects.some(
                  (s) => normalizeSearch(s) === normalizeSearch(newSubject),
                ) &&
                  newSubject && (
                    <option value={newSubject}>{newSubject}</option>
                  )}
                {registeredSubjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                Tipo de apontamento
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="ce-select"
              >
                {NOTE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="block text-[11px] font-bold text-[var(--muted)]">
                    Ponto para revisar
                  </label>
                  {newTextAutoFormatted && (
                    <span className="text-[10.5px] font-bold text-[var(--good)]">
                      Texto organizado automaticamente
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {newTextRawBeforeFormat !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewText(newTextRawBeforeFormat);
                        setNewTextRawBeforeFormat(null);
                        setNewTextAutoFormatted(false);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[10.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
                    >
                      <Undo2 className="w-3 h-3" />
                      Desfazer ajuste
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleManualFormatNewText}
                    disabled={!newText.trim()}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[10.5px] font-bold text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-45 cursor-pointer"
                    title="Separar artigos, parágrafos, incisos e tópicos automaticamente"
                  >
                    <AlignLeft className="w-3 h-3" />
                    Organizar texto
                  </button>
                </div>
              </div>
              <textarea
                value={newText}
                onChange={(e) => {
                  setNewText(e.target.value);
                  if (newTextAutoFormatted) setNewTextAutoFormatted(false);
                }}
                onPaste={handlePasteNewText}
                rows={5}
                placeholder="Cole ou descreva a pegadinha, artigo de lei, exceção ou prazo que precisa fixar (o texto colado é organizado automaticamente)..."
                className="ce-textarea leading-relaxed"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Salvar anotação
              </button>
            </div>
          </form>
        </Panel>

        <Panel
          title="Imprimir e Exportar Caderno de Erros"
          subtitle="Imprima em folha oficial A4 ou baixe em PDF todas as matérias juntas, um grupo selecionado ou cada matéria separadamente."
        >
          <div className="flex flex-col gap-3">
            <div>
              <span className="block text-[11px] font-bold text-[var(--muted)] mb-1.5">
                Modo de emissão
              </span>
              <div className="inline-flex flex-wrap rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5 gap-0.5">
                {(
                  [
                    { id: 'all', label: 'Todas em conjunto' },
                    { id: 'multi', label: 'Selecionar em conjunto' },
                    { id: 'single', label: 'Separadamente (1 matéria)' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setExportMode(opt.id)}
                    className={`px-2.5 py-1.5 rounded-md text-[11.5px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                      exportMode === opt.id
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {exportMode === 'single' && (
              <div>
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Matéria para emissão separada
                </label>
                <select
                  value={exportSingleSubject}
                  onChange={(e) => setExportSingleSubject(e.target.value)}
                  className="ce-select"
                >
                  {subjectOptions.map((s) => {
                    const cnt = subjectDirectoryMetrics.byNorm.get(normalizeSearch(s))?.total ?? 0;
                    return (
                      <option key={s} value={s}>
                        {s} ({cnt})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {exportMode === 'multi' && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-bold text-[var(--muted)]">
                    Selecione as matérias ({exportMultiSubjects.length} marcada(s))
                  </span>
                  <div className="flex items-center gap-2 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setExportMultiSubjects(subjectOptions)}
                      className="text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      Marcar todas
                    </button>
                    <span className="text-[var(--line-strong)]">·</span>
                    <button
                      type="button"
                      onClick={() => setExportMultiSubjects([])}
                      className="text-[var(--muted)] hover:text-[var(--text)] hover:underline cursor-pointer"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
                <div className="max-h-[124px] overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {subjectOptions.map((s) => {
                    const checked = exportMultiSubjects.some(
                      (item) => normalizeSearch(item) === normalizeSearch(s),
                    );
                    const cnt = subjectDirectoryMetrics.byNorm.get(normalizeSearch(s))?.total ?? 0;
                    return (
                      <label
                        key={s}
                        className="inline-flex items-center justify-between gap-2 px-2 py-1 rounded-md hover:bg-[var(--panel-raised)] text-[12px] text-[var(--text)] cursor-pointer select-none"
                      >
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleMultiExportSubject(s)}
                            className="accent-[var(--accent)] w-3.5 h-3.5 shrink-0"
                          />
                          <span className="truncate">{s}</span>
                        </span>
                        <span className="font-mono-num text-[11px] text-[var(--muted)] shrink-0">
                          {cnt}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-[var(--muted)]">Status incluído:</span>
              <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
                {(
                  [
                    { id: 'pending', label: 'Pendentes' },
                    { id: 'corrected', label: 'Corrigidos' },
                    { id: 'all', label: 'Todos' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setExportStatus(opt.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                      exportStatus === opt.id
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="inline-flex items-center gap-2 text-[12px] text-[var(--text)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeQuestion}
                  onChange={(e) => setIncludeQuestion(e.target.checked)}
                  className="accent-[var(--accent)] w-4 h-4"
                />
                Incluir enunciado, alternativas, gabarito e comentário
              </label>

              {exportMode !== 'single' && (
                <label className="inline-flex items-center gap-2 text-[12px] text-[var(--text)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={pageBreakBySubject}
                    onChange={(e) => setPageBreakBySubject(e.target.checked)}
                    className="accent-[var(--accent)] w-4 h-4"
                  />
                  Iniciar cada matéria em uma nova página A4
                </label>
              )}
            </div>

            <div className="pt-2 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2.5">
              <span className="text-[11.5px] font-mono-num text-[var(--muted)]">
                Pronto:{' '}
                <strong className="text-[var(--text)]">{exportPreview.entries.length}</strong>{' '}
                registro(s) em{' '}
                <strong className="text-[var(--text)]">{exportPreview.distinctSubjectsCount}</strong>{' '}
                matéria(s)
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (exportMode === 'multi' && exportMultiSubjects.length === 0) {
                      toast('Marque ao menos uma matéria para pré-visualizar o caderno.', true);
                      return;
                    }
                    setPrintOverride(null);
                    setShowPrintPreview(true);
                  }}
                  disabled={exportPreview.entries.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-45 whitespace-nowrap cursor-pointer"
                  title="Visualizar o documento oficial A4 com brasão e rodapé numerado antes de imprimir"
                >
                  <Eye className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Pré-visualizar A4
                </button>
                <button
                  type="button"
                  onClick={handlePrintFromPanel}
                  disabled={exportPreview.entries.length === 0}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-45 whitespace-nowrap cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir Caderno (A4)
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={exportPreview.entries.length === 0}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-45 whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Baixar PDF
                </button>
                <button
                  type="button"
                  onClick={handleExportAllPendingPdf}
                  disabled={pendingCount === 0}
                  title="Baixar PDF completo reunindo todas as pendências de todas as matérias"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--warning)]/60 bg-[var(--warning)]/12 text-[12px] font-bold text-[var(--text)] hover:border-[var(--warning)] hover:bg-[var(--warning)]/20 disabled:opacity-45 whitespace-nowrap cursor-pointer tabular-nums"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--warning)]" />
                  PDF Todas as Pendências ({pendingCount})
                </button>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* D3 Pareto 80/20 + Tabela Analítica de Concentração de Erros */}
      <ErrorParetoD3Panel
        title="Análise de Pareto 80/20 · Concentração de Erros"
        subtitle="Identifique rapidamente as poucas matérias ou tipos de falha que geram ~80% dos seus erros. Clique em uma barra ou linha para filtrar."
        items={paretoItems}
        unitLabel={paretoMode === 'wrong_questions' ? 'erros' : 'registros'}
        selectedKey={
          paretoMode === 'by_type'
            ? search || null
            : filterSubject === SIMULADOS_FILTER
              ? SIMULADOS_STATS_KEY
              : filterSubject !== 'Todas as Matérias' && filterSubject !== UNASSIGNED_SUBJECT_FILTER
                ? filterSubject
                : null
        }
        onSelectKey={(key) => {
          if (paretoMode === 'by_type') {
            setSearch((prev) => (normalizeSearch(prev) === normalizeSearch(key) ? '' : key));
          } else if (normalizeSearch(key) === normalizeSearch(SIMULADOS_STATS_KEY)) {
            setFilterSubject((prev) =>
              prev === SIMULADOS_FILTER ? 'Todas as Matérias' : SIMULADOS_FILTER,
            );
          } else {
            setFilterSubject((prev) =>
              normalizeSearch(prev) === normalizeSearch(key) ? 'Todas as Matérias' : key,
            );
          }
        }}
        showRateColumn={paretoMode !== 'by_type' && subjectErrorStats.hasAttemptData}
        showPendingColumn
        headerExtra={
          <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
            {(
              [
                { id: 'notebook', label: 'No caderno' },
                { id: 'wrong_questions', label: 'Questões erradas' },
                { id: 'by_type', label: 'Por tipo' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setParetoMode(opt.id)}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                  paretoMode === opt.id
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Subject Error Rate Statistics Panel */}
      <Panel
        className="mb-4"
        title="Estatísticas por Matéria · Maiores Índices de Erros"
        subtitle="Identifique rapidamente em quais matérias fixadas você erra mais questões e concentra mais registros no caderno. Clique em uma matéria para filtrar."
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            {subjectErrorStats.hasAttemptData && (
              <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
                <button
                  type="button"
                  onClick={() => setStatsSortBy('rate')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                    statsSortBy === 'rate'
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  Maior % de erro
                </button>
                <button
                  type="button"
                  onClick={() => setStatsSortBy('count')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                    statsSortBy === 'count'
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  Mais erros no caderno
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setStatsExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
            >
              {statsExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Ocultar
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Mostrar ({subjectErrorStats.rows.length})
                </>
              )}
            </button>
          </div>
        }
      >
        {statsExpanded && (
          <>
            {subjectErrorStats.rows.length === 0 ? (
              <div className="text-[12.5px] text-[var(--muted)] py-2">
                Nenhum erro ou questão respondida registrada ainda para gerar o ranking por matéria.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-[var(--bad)]" />
                      Maior índice de erro
                    </div>
                    {subjectErrorStats.highestRateRow ? (
                      <>
                        <strong className="block text-[14px] font-bold text-[var(--text)] truncate">
                          {visibleName(subjectErrorStats.highestRateRow.subject)}
                        </strong>
                        <span className="block text-[12px] font-mono-num text-[var(--bad)] font-bold mt-0.5">
                          {subjectErrorStats.highestRateRow.errorRatePct}% de erro (
                          {subjectErrorStats.highestRateRow.wrongQuestions}/
                          {subjectErrorStats.highestRateRow.answeredQuestions} questões)
                        </span>
                      </>
                    ) : subjectErrorStats.highestVolumeRow ? (
                      <>
                        <strong className="block text-[14px] font-bold text-[var(--text)] truncate">
                          {visibleName(subjectErrorStats.highestVolumeRow.subject)}
                        </strong>
                        <span className="block text-[12px] font-mono-num text-[var(--warning)] font-bold mt-0.5">
                          {subjectErrorStats.highestVolumeRow.notebookSharePct}% do caderno (
                          {subjectErrorStats.highestVolumeRow.notebookTotal} registro(s))
                        </span>
                      </>
                    ) : (
                      <span className="text-[12px] text-[var(--muted)]">—</span>
                    )}
                  </div>

                  <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                      <BarChart3 className="w-3.5 h-3.5 text-[var(--warning)]" />
                      Maior volume no caderno
                    </div>
                    {subjectErrorStats.highestVolumeRow ? (
                      <>
                        <strong className="block text-[14px] font-bold text-[var(--text)] truncate">
                          {visibleName(subjectErrorStats.highestVolumeRow.subject)}
                        </strong>
                        <span className="block text-[12px] font-mono-num text-[var(--muted)] mt-0.5">
                          <strong className="text-[var(--text)]">
                            {subjectErrorStats.highestVolumeRow.notebookTotal}
                          </strong>{' '}
                          registro(s) · {subjectErrorStats.highestVolumeRow.pendingCount} pendente(s)
                        </span>
                      </>
                    ) : (
                      <span className="text-[12px] text-[var(--muted)]">—</span>
                    )}
                  </div>

                  <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                      <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
                      Matérias impactadas
                    </div>
                    <strong className="block text-[18px] font-extrabold font-mono-num text-[var(--text)]">
                      {subjectErrorStats.rows.length}
                    </strong>
                    <span className="block text-[12px] font-mono-num text-[var(--muted)] mt-0.5">
                      {pendingCount} pendente(s) · {correctedCount} corrigido(s)
                    </span>
                  </div>
                </div>

                <List
                  rowComponent={SubjectStatListRow}
                  rowCount={displayedStatsRows.length}
                  rowHeight={statsDynamicHeight}
                  rowKey={statsRowKey}
                  rowProps={statsRowProps}
                  overscanCount={3}
                  style={{
                    height: Math.min(360, Math.max(64, displayedStatsRows.length * 64)),
                    width: '100%',
                  }}
                />

                {subjectErrorStats.rows.length > 5 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setStatsShowAll((prev) => !prev)}
                      className="text-[12px] font-bold text-[var(--accent)] hover:underline cursor-pointer"
                    >
                      {statsShowAll
                        ? 'Mostrar apenas top 5'
                        : `Ver todas as ${subjectErrorStats.rows.length} matérias`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Panel>

      {/* Correction Status Tabs Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3.5">
        <button
          type="button"
          onClick={() => setFilterStatus('pending')}
          className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
            filterStatus === 'pending'
              ? 'border-[var(--warning)] bg-[var(--warning)]/15 shadow-xs'
              : 'border-[var(--line)] bg-[var(--panel-soft)] hover:border-[var(--warning)]/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className={`w-4 h-4 ${filterStatus === 'pending' ? 'text-[var(--warning)]' : 'text-[var(--muted)]'}`} />
            <div>
              <strong className="block text-[12.5px] font-bold text-[var(--text)]">
                Pendentes de Correção
              </strong>
              <span className="block text-[11px] text-[var(--muted)]">
                Erros que aguardam revisão
              </span>
            </div>
          </div>
          <span className="font-mono-num font-extrabold text-[15px] px-2 py-0.5 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/20 text-[var(--warning)]">
            {pendingCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus('corrected')}
          className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
            filterStatus === 'corrected'
              ? 'border-[var(--good)] bg-[var(--good)]/15 shadow-xs'
              : 'border-[var(--line)] bg-[var(--panel-soft)] hover:border-[var(--good)]/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-4 h-4 ${filterStatus === 'corrected' ? 'text-[var(--good)]' : 'text-[var(--muted)]'}`} />
            <div>
              <strong className="block text-[12.5px] font-bold text-[var(--text)]">
                Já Corrigidos
              </strong>
              <span className="block text-[11px] text-[var(--muted)]">
                Questões revistas e superadas
              </span>
            </div>
          </div>
          <span className="font-mono-num font-extrabold text-[15px] px-2 py-0.5 rounded-md border border-[var(--good)]/40 bg-[var(--good)]/20 text-[var(--good)]">
            {correctedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus('all')}
          className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
            filterStatus === 'all'
              ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-xs'
              : 'border-[var(--line)] bg-[var(--panel-soft)] hover:border-[var(--accent)]/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border border-[var(--line-strong)] grid place-items-center text-[10px] font-bold text-[var(--muted)]">
              Σ
            </div>
            <div>
              <strong className="block text-[12.5px] font-bold text-[var(--text)]">
                Todos os Registros
              </strong>
              <span className="block text-[11px] text-[var(--muted)]">
                Visão completa do acervo
              </span>
            </div>
          </div>
          <span className="font-mono-num font-extrabold text-[15px] px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)]">
            {allErrorEntries.length}
          </span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <select
          aria-label="Filtrar caderno por matéria"
          value={filterSubject}
          onChange={(e) => setFilterSubject(e.target.value)}
          className="ce-select w-auto min-w-[200px]"
        >
          <option value="Todas as Matérias">Todas as Matérias</option>
          {simulationDirectory.totalEntries > 0 && (
            <option value={SIMULADOS_FILTER}>
              Simulados ({simulationDirectory.exams.length}{' '}
              {simulationDirectory.exams.length === 1 ? 'prova' : 'provas'} ·{' '}
              {simulationDirectory.totalEntries})
            </option>
          )}
          {subjectDirectoryMetrics.unassignedTotal > 0 && (
            <option value={UNASSIGNED_SUBJECT_FILTER}>
              Sem matéria cadastrada ({subjectDirectoryMetrics.unassignedTotal})
            </option>
          )}
          {subjectOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {filterSubject === SIMULADOS_FILTER && simulationDirectory.exams.length > 0 && (
          <select
            aria-label="Escolher prova fechada dentro de Simulados"
            value={selectedSimulationKey}
            onChange={(e) => setSelectedSimulationKey(e.target.value)}
            className="ce-select w-auto min-w-[220px] max-w-[360px] !border-[var(--accent)]"
          >
            <option value="all">
              Todas as provas ({simulationDirectory.exams.length})
            </option>
            {simulationDirectory.exams.map((ex) => (
              <option key={ex.key} value={ex.key}>
                {ex.label} ({ex.pending} pend.)
              </option>
            ))}
          </select>
        )}

        <select
          aria-label="Filtrar por tipo de registro"
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value as 'all' | 'errors' | 'notes')}
          className="ce-select w-auto min-w-[180px]"
        >
          <option value="all">Todas as categorias</option>
          <option value="errors">Questões erradas</option>
          <option value="notes">Anotações manuais</option>
        </select>

        {!hideSearch && (
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setFlashcardIndex(0);
                setFlashcardRevealed(false);
              }}
              placeholder="Buscar no texto, enunciado ou prova..."
              className="ce-input pl-8"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {dueReviewsCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[11.5px] font-bold text-[var(--accent)]">
              <CalendarClock className="w-3.5 h-3.5" />
              {dueReviewsCount} revisão(ões) programada(s) para hoje
            </span>
          )}
          <button
            type="button"
            onClick={() =>
              startErrorNotebookQuiz(
                filterSubject,
                filterStatus === 'pending',
                filterSubject === SIMULADOS_FILTER ? selectedSimulationKey : undefined,
              )
            }
            disabled={linkedQuestionsCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-45 whitespace-nowrap"
            title="Iniciar bateria de treino com as questões vinculadas aos erros filtrados"
          >
            <Play className="w-3.5 h-3.5" />
            Refazer erros ({linkedQuestionsCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setFlashcardMode((prev) => !prev);
              setFlashcardIndex(0);
              setFlashcardRevealed(false);
            }}
            disabled={!filteredEntries.length}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[12px] font-bold transition-colors disabled:opacity-45 whitespace-nowrap ${
              flashcardMode
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            {flashcardMode ? 'Sair do Flashcard' : 'Modo Flashcard'}
          </button>
        </div>
      </div>

      {flashcardMode && activeFlashcard && (
        <Panel
          title={`Flashcard de Revisão (${safeFlashcardIdx + 1} de ${filteredEntries.length})`}
          subtitle={`${visibleName(activeFlashcard.materia)} · ${visibleName(activeFlashcard.tipo)}`}
          className="mb-4 border-[var(--accent)]/50"
          action={
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setFlashcardIndex((i) => Math.max(0, i - 1));
                  setFlashcardRevealed(false);
                }}
                disabled={safeFlashcardIdx === 0}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] disabled:opacity-40"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Anterior
              </button>
              <button
                type="button"
                onClick={() => {
                  setFlashcardIndex((i) => Math.min(filteredEntries.length - 1, i + 1));
                  setFlashcardRevealed(false);
                }}
                disabled={safeFlashcardIdx >= filteredEntries.length - 1}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] disabled:opacity-40"
              >
                Próximo
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          }
        >
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4">
            {activeFlashcard.questao?.enunciado ? (
              <>
                <StructuredLegalText
                  text={activeFlashcard.questao.enunciado}
                  className="text-[14px] text-[var(--text)]"
                />
                {activeFlashcard.questao.alternativas?.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5 text-[12.5px] text-[var(--muted)]">
                    {activeFlashcard.questao.alternativas.map((alt) => (
                      <div
                        key={alt.letra}
                        className="flex items-start gap-1.5 leading-relaxed"
                      >
                        <strong className="font-mono-num text-[var(--text)] shrink-0">
                          [{alt.letra}]
                        </strong>
                        <span className="flex-1 text-justify">{alt.texto}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-[13.5px] text-[var(--muted)]">
                Lembrete / Erro registrado em <strong className="text-[var(--text)]">{visibleName(activeFlashcard.materia)}</strong> ({activeFlashcard.data}). Tente recordar a regra antes de revelar a resposta.
              </div>
            )}

            {flashcardRevealed ? (
              <div className="mt-4 pt-3 border-t border-[var(--line)]">
                {activeFlashcard.questao?.gabarito && (
                  <div className="mb-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg border border-[var(--good)]/40 bg-[var(--good)]/15 text-[12.5px] font-bold text-[var(--good)]">
                    Gabarito oficial: {activeFlashcard.questao.gabarito}
                    {activeFlashcard.questao.resposta ? ` (Você marcou: ${activeFlashcard.questao.resposta})` : ''}
                  </div>
                )}
                <StructuredLegalText
                  text={activeFlashcard.texto}
                  className="text-[13px] text-[var(--text)]"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      advanceErrorReview(activeFlashcard.id);
                      if (safeFlashcardIdx < filteredEntries.length - 1) {
                        setFlashcardIndex((i) => i + 1);
                        setFlashcardRevealed(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[12px] font-bold hover:opacity-90"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Acertei · Agendar próxima revisão
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlashcardRevealed(false)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--muted)]"
                  >
                    Ocultar resposta
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setFlashcardRevealed(true)}
                  className="px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)]"
                >
                  Mostrar resposta e comentário
                </button>
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Barra de Associação em Lote para Questões Pendentes */}
      {(filteredPendingIds.length > 0 || selectedEntryIds.length > 0) && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] px-3.5 py-2.5 mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            {filteredPendingIds.length > 0 && (
              <label className="inline-flex items-center gap-2 text-[12px] font-bold text-[var(--text)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allFilteredPendingSelected}
                  onChange={handleToggleSelectAllFilteredPending}
                  className="accent-[var(--accent)] w-4 h-4 cursor-pointer"
                />
                Selecionar pendentes visíveis ({filteredPendingIds.length})
              </label>
            )}
            <span className="text-[11.5px] font-mono-num text-[var(--muted)]">
              <strong className="text-[var(--text)]">{selectedEntryIds.length}</strong> selecionada(s)
            </span>
            {selectedEntryIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedEntryIds([])}
                className="text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:underline cursor-pointer"
              >
                Limpar seleção
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] font-bold text-[var(--muted)] whitespace-nowrap">
              Associar pendentes à matéria:
            </span>
            <select
              aria-label="Matéria de destino para associação em lote"
              value={bulkTargetSubject}
              onChange={(e) => setBulkTargetSubject(e.target.value)}
              disabled={registeredSubjects.length === 0}
              className="ce-select !w-auto !min-h-[32px] !py-1 min-w-[180px]"
            >
              {registeredSubjects.length === 0 ? (
                <option value="">Cadastre uma matéria acima</option>
              ) : (
                registeredSubjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={handleBulkAssociatePending}
              disabled={selectedEntryIds.length === 0 || !bulkTargetSubject}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-45 whitespace-nowrap cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5" />
              Associar ({selectedEntryIds.length})
            </button>
          </div>
        </div>
      )}

      <div>
        {filteredEntries.length ? (
          <List
            scrollElement="window"
            rowComponent={ErrorNotebookEntryRow}
            rowCount={filteredEntries.length}
            rowHeight={entriesDynamicHeight}
            rowKey={entryRowKey}
            rowProps={entryRowProps}
            overscanCount={4}
            defaultHeight={680}
          />
        ) : (
          <EmptyState message="Nenhum registro encontrado para os filtros aplicados." />
        )}
      </div>
      </div>

      {showPrintPreview && (
        <div
          data-print-hide="true"
          className="fixed inset-0 z-50 bg-[#071D41]/75 backdrop-blur-[2px] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Pré-visualização de Impressão Oficial A4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#071D41] text-white border-b border-white/15 shrink-0">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#FFCD07]">
                Modelo Oficial A4 · Padrão Governo Federal
              </div>
              <div className="text-[12.5px] text-white/85 truncate">
                Cabeçalho com Brasão (placeholder), texto jurídico estruturado e rodapé numerado automático na impressão
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handlePrintFromPanel()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1351B4] border border-white/25 text-white text-[12px] font-bold hover:bg-[#1b63d6] cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir agora (A4)
              </button>
              <button
                type="button"
                onClick={() => setShowPrintPreview(false)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/25 bg-white/10 text-white text-[12px] font-bold hover:bg-white/20 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Fechar
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="max-w-[210mm] mx-auto bg-white shadow-2xl border border-[#CBD5E1] p-6 sm:p-[13mm]">
              <ErrorNotebookOfficialPrintSheet
                entries={activePrintBundle.entries}
                selectedSubjectsLabel={activePrintBundle.scopeLabel}
                statusFilter={activePrintConfig.statusFilter}
                includeQuestion={includeQuestion}
                pageBreakBySubject={
                  activePrintConfig.mode === 'single' ? false : pageBreakBySubject
                }
                holderName={
                  googleUser?.displayName || googleUser?.email || 'Cidadão-Estudante Federal'
                }
                previewMode
              />
            </div>
          </div>
        </div>
      )}

      <ErrorNotebookOfficialPrintSheet
        entries={activePrintBundle.entries}
        selectedSubjectsLabel={activePrintBundle.scopeLabel}
        statusFilter={activePrintConfig.statusFilter}
        includeQuestion={includeQuestion}
        pageBreakBySubject={
          activePrintConfig.mode === 'single' ? false : pageBreakBySubject
        }
        holderName={googleUser?.displayName || googleUser?.email || 'Cidadão-Estudante Federal'}
      />

      <FlashcardsReviewModal
        open={srsFlashcardsOpen}
        onClose={() => setSrsFlashcardsOpen(false)}
        initialSources={['errors']}
      />
    </div>
  );
};
