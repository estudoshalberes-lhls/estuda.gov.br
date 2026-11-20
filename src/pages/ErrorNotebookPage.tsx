import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { List, type RowComponentProps, useDynamicRowHeight } from 'react-window';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  ExternalLink,
  Layers,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import {
  inferFixedSubjectFromTopic,
  localDateIso,
  normalizeSearch,
  visibleName,
} from '../lib/parsers';
import { exportErrorNotebookPdf } from '../lib/pdfExport';
import { clearFieldDraft, readFieldDraft, writeFieldDraft } from '../lib/draftStorage';
import { ErrorNotebookEntry, ModuleName } from '../types/study';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';
import { ErrorParetoD3Panel, ParetoDatum } from '../components/charts/ErrorParetoD3Panel';

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
    const isSelected = normalizeSearch(filterSubject) === normalizeSearch(row.subject);
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
  registeredSubjects: string[];
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
    registeredSubjects,
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
    if (!entry) return null;
    const isEditing = editingEntry?.id === entry.id;
    const isCorrected = Boolean(entry.corrigido);
    const selectedSubjectVal =
      registeredSubjects.find((s) => normalizeSearch(s) === normalizeSearch(entry.materia)) ||
      entry.materia;
    const editingSubjectVal = editingEntry
      ? registeredSubjects.find(
          (s) => normalizeSearch(s) === normalizeSearch(editingEntry.materia),
        ) || editingEntry.materia
      : '';

    return (
      <div style={style} {...ariaAttributes} className="pb-3">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-2.5 mb-2">
            <div className="flex flex-wrap items-center gap-2">
              {isCorrected ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border border-[var(--good)] bg-[var(--good)]/15 text-[11px] font-bold text-[var(--good)]">
                  <CheckCircle2 className="w-3 h-3" />
                  Já Corrigido {entry.corrigido_em ? `(${entry.corrigido_em})` : ''}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border border-[var(--warning)] bg-[var(--warning)]/15 text-[11px] font-bold text-[var(--warning)]">
                  <Clock className="w-3 h-3" />
                  Pendente de Correção
                </span>
              )}

              <span className="px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] font-bold text-[var(--accent)]">
                {visibleName(entry.tipo)}
              </span>
              <div className="inline-flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-[var(--muted)]">Matéria:</span>
                <select
                  aria-label={`Atribuir matéria fixada à questão ${entry.id}`}
                  value={selectedSubjectVal}
                  onChange={(e) => updateErrorEntrySubject(entry.id, e.target.value)}
                  className="ce-select !w-auto !min-h-[28px] !py-0.5 !px-2 !text-[12px] font-bold"
                  title="Alterar matéria da questão usando as mesmas matérias fixadas no cronômetro"
                >
                  {!registeredSubjects.some(
                    (s) => normalizeSearch(s) === normalizeSearch(selectedSubjectVal),
                  ) &&
                    selectedSubjectVal && (
                      <option value={selectedSubjectVal}>{visibleName(selectedSubjectVal)}</option>
                    )}
                  {registeredSubjects.map((subj) => (
                    <option key={subj} value={subj}>
                      {subj}
                    </option>
                  ))}
                </select>
              </div>
              {entry.origem && (
                <span className="px-2 py-0.5 rounded-md border border-[var(--line)] bg-[var(--panel-raised)] text-[10.5px] font-bold text-[var(--muted)]">
                  Origem: {entry.origem}
                </span>
              )}
              <span className="text-[11.5px] text-[var(--muted)] font-mono-num">
                · {entry.data}
              </span>
              {entry.proxima_revisao && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10.5px] font-bold ${
                    entry.proxima_revisao <= todayIso
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--muted)]'
                  }`}
                >
                  <CalendarClock className="w-3 h-3" />
                  {entry.proxima_revisao <= todayIso
                    ? `Revisar hoje (Nível ${entry.nivel_revisao ?? 1})`
                    : `Próx. revisão: ${formatBrDateStr(entry.proxima_revisao)} (Nível ${entry.nivel_revisao ?? 1})`}
                </span>
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
                    savedDraft || {
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
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Anotação / Correção
                </label>
                <textarea
                  value={editingEntry.texto}
                  onChange={(e) => setEditingEntry({ ...editingEntry, texto: e.target.value })}
                  onBlur={() => flushEditingDraft(true)}
                  rows={3}
                  className="ce-textarea"
                />
              </div>
              {entry.questao && (
                <>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                      Enunciado / Questão vinculada
                    </label>
                    <textarea
                      value={editingEntry.enunciado ?? ''}
                      onChange={(e) =>
                        setEditingEntry({ ...editingEntry, enunciado: e.target.value })
                      }
                      onBlur={() => flushEditingDraft(true)}
                      rows={2}
                      className="ce-textarea"
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
            <p className="m-0 text-[13.5px] leading-relaxed text-[var(--text)] whitespace-pre-wrap">
              {entry.texto}
            </p>
          )}

          {entry.questao && (
            <details className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-3">
              <summary className="text-[12px] font-bold text-[var(--muted)] cursor-pointer select-none">
                Ver questão vinculada
                {entry.arquivo_prova ? ` (${visibleName(entry.arquivo_prova)})` : ''}
              </summary>
              <div className="mt-2 pt-2 border-t border-[var(--line)] text-[12.5px] leading-relaxed text-[var(--text)]">
                <p className="m-0 whitespace-pre-wrap">{entry.questao.enunciado}</p>
                {entry.questao.alternativas?.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 text-[var(--muted)]">
                    {entry.questao.alternativas.map((alt) => (
                      <span key={alt.letra}>
                        <strong className="text-[var(--text)]">[{alt.letra}]</strong> {alt.texto}
                      </span>
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
    allErrorEntries,
    moduleVisibility,
    setActivePage,
    addAnnotation,
    updateAnnotation,
    updateErrorEntrySubject,
    deleteAnnotation,
    markAnnotationCorrected,
    reopenAnnotation,
    advanceErrorReview,
    startErrorNotebookQuiz,
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

  const [filterSubject, setFilterSubject] = useState('Todas as Matérias');
  const [filterMode, setFilterMode] = useState<'all' | 'errors' | 'notes'>('all');
  const [filterStatus, setFilterStatus] = useState<'pending' | 'corrected' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [flashcardMode, setFlashcardMode] = useState(false);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardRevealed, setFlashcardRevealed] = useState(false);

  const [exportSubject, setExportSubject] = useState('Todas as Matérias');
  const [includeQuestion, setIncludeQuestion] = useState(true);

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

  // Same registered subjects used in Cronômetro / Cronograma / Utilidades
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
    allErrorEntries.forEach((e) => push(e.materia));
    if (filterSubject !== 'Todas as Matérias') push(filterSubject);
    return list.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [allErrorEntries, filterSubject, registeredSubjects]);

  const resolveStatsSubject = useMemo(() => {
    const byNorm = new Map<string, string>();
    registeredSubjects.forEach((s) => byNorm.set(normalizeSearch(s), s));
    return (raw?: string): string => {
      const clean = visibleName(raw || '');
      if (!clean) return 'Geral';
      const exact = byNorm.get(normalizeSearch(clean));
      if (exact) return exact;
      const inferred = inferFixedSubjectFromTopic({ materia: clean }, registeredSubjects);
      if (inferred) {
        return byNorm.get(normalizeSearch(inferred)) || inferred;
      }
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
    const ensureRow = (rawSubject?: string): SubjectStatAcc => {
      const key = resolveStatsSubject(rawSubject);
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
      const row = ensureRow(entry.materia);
      row.notebookTotal += 1;
      const isErrorItem = Boolean(entry.questao || entry.correcao_prova || entry.tipo.includes('Erro'));
      if (isErrorItem) row.notebookErrors += 1;
      if (entry.corrigido) row.correctedCount += 1;
      else row.pendingCount += 1;
    });

    db.history.forEach((h) => {
      const row = ensureRow(h.subject);
      row.answeredQuestions += 1;
      if (!h.correct) row.wrongQuestions += 1;
    });

    db.completedSimulations.forEach((sim) => {
      (sim.questoes || []).forEach((q) => {
        if (!q.resposta) return;
        const row = ensureRow(q.materia || sim.materia);
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
      if (filterSubject !== 'Todas as Matérias') {
        const entryNorm = normalizeSearch(e.materia);
        const resolvedNorm = normalizeSearch(resolveStatsSubject(e.materia));
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
          `${e.materia} ${e.tipo} ${e.texto} ${e.questao?.enunciado || ''} ${
            e.arquivo_prova || ''
          }`,
        );
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [allErrorEntries, filterMode, filterStatus, filterSubject, resolveStatsSubject, search]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    addAnnotation(newSubject, newType, newText);
    clearFieldDraft('error_notebook_new_annotation');
    setNewText('');
  };

  const handleExportPdf = () => {
    try {
      exportErrorNotebookPdf(allErrorEntries, exportSubject, includeQuestion);
      toast('PDF do Caderno de Erros gerado com sucesso.');
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
    key: `err-entries-${filterSubject}-${filterMode}-${filterStatus}-${search}`,
  });

  const entryRowProps = useMemo<ErrorNotebookRowProps>(
    () => ({
      entries: filteredEntries,
      registeredSubjects,
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
    }),
    [
      filteredEntries,
      registeredSubjects,
      todayIso,
      editingEntry,
      flushEditingDraft,
      handleSaveEdit,
      updateErrorEntrySubject,
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
      <PageHeader
        eyebrow="OUVIDORIA ESTUDANTIL · CADERNO DE ERROS"
        title="Revisão direcionada de erros e anotações"
        description="Centraliza recursos de questões erradas nos treinos, apontamentos vinculados a provas e revisões espaçadas pendentes."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3.5 mb-4 items-start">
        <Panel title="Nova anotação manual">
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                Matéria (fixada no cronômetro)
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
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                Ponto para revisar
              </label>
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                rows={3}
                placeholder="Descreva a pegadinha, exceção legal ou prazo que precisa fixar..."
                className="ce-textarea"
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

        <Panel title="Exportar PDF de revisão" subtitle="Gera caderno organizado para impressão ou leitura offline.">
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                Filtrar matéria na exportação
              </label>
              <select
                value={exportSubject}
                onChange={(e) => setExportSubject(e.target.value)}
                className="ce-select"
              >
                <option value="Todas as Matérias">Todas as Matérias</option>
                {subjectOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <label className="inline-flex items-center gap-2 text-[12.5px] text-[var(--text)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeQuestion}
                onChange={(e) => setIncludeQuestion(e.target.checked)}
                className="accent-[var(--accent)] w-4 h-4"
              />
              Incluir enunciado, alternativas, gabarito e comentário
            </label>
            <div>
              <button
                type="button"
                onClick={handleExportPdf}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                Baixar PDF do caderno
              </button>
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
            : filterSubject !== 'Todas as Matérias'
              ? filterSubject
              : null
        }
        onSelectKey={(key) => {
          if (paretoMode === 'by_type') {
            setSearch((prev) => (normalizeSearch(prev) === normalizeSearch(key) ? '' : key));
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
          className="ce-select w-auto min-w-[190px]"
        >
          <option value="Todas as Matérias">Todas as Matérias</option>
          {subjectOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

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
              startErrorNotebookQuiz(filterSubject, filterStatus === 'pending')
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
                <p className="m-0 text-[14px] leading-relaxed text-[var(--text)] whitespace-pre-wrap">
                  {activeFlashcard.questao.enunciado}
                </p>
                {activeFlashcard.questao.alternativas?.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1 text-[12.5px] text-[var(--muted)]">
                    {activeFlashcard.questao.alternativas.map((alt) => (
                      <div key={alt.letra}>
                        <strong className="text-[var(--text)]">[{alt.letra}]</strong> {alt.texto}
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
                <p className="m-0 text-[13px] leading-relaxed text-[var(--text)] whitespace-pre-wrap">
                  {activeFlashcard.texto}
                </p>
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
  );
};
