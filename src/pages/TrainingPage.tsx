import React, { useMemo, useState } from 'react';
import {
  AlignLeft,
  Database,
  Eye,
  Filter,
  Pencil,
  Play,
  Printer,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { Question, QuestionAlternative, QuestionType } from '../types/study';
import { normalizeSearch, questionStatement, shuffled, uid, visibleName } from '../lib/parsers';
import {
  formatCorrectionTextStructured,
  insertFormattedPaste,
} from '../lib/legalTextFormatter';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';
import { StructuredLegalText } from '../components/ui/StructuredLegalText';
import { QuizRunner } from '../components/quiz/QuizRunner';
import { QuestionsOfficialPrintSheet } from '../components/print/QuestionsOfficialPrintSheet';

export const TrainingPage: React.FC = () => {
  const {
    db,
    disciplines,
    allQuestions,
    quiz,
    setQuiz,
    getCurrentTimerSeconds,
    ensureTimerRunning,
    updateQuestion,
    deleteQuestion,
    googleUser,
    requestConfirm,
    toast,
  } = useStudy();

  const availableSubjects = useMemo(() => {
    const extra = db.submittedSimulations.map((s) => s.materia).filter(Boolean);
    return [...new Set([...disciplines, ...extra])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [disciplines, db.submittedSimulations]);

  const [mode, setMode] = useState<'train' | 'manage'>('train');
  const [subject, setSubject] = useState<string>('Todas as Matérias');
  const [amount, setAmount] = useState<string>('20');
  const [typeFilter, setTypeFilter] = useState<'all' | QuestionType>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [printIncludeAnswers, setPrintIncludeAnswers] = useState<boolean>(true);
  const [showPrintPreview, setShowPrintPreview] = useState<boolean>(false);

  const [editingQuestion, setEditingQuestion] = useState<{
    id: string;
    materia: string;
    tipo: QuestionType;
    enunciado: string;
    alternativasText: string;
    gabarito: string;
    comentario: string;
  } | null>(null);
  const [rawEnunciadoBeforeFormat, setRawEnunciadoBeforeFormat] = useState<string | null>(null);
  const [enunciadoAutoFormatted, setEnunciadoAutoFormatted] = useState(false);
  const [rawComentarioBeforeFormat, setRawComentarioBeforeFormat] = useState<string | null>(null);
  const [comentarioAutoFormatted, setComentarioAutoFormatted] = useState(false);

  const matchingQuestionsCount = useMemo(() => {
    let pool = allQuestions(true, subject);
    if (typeFilter !== 'all') {
      pool = pool.filter((q) => q.tipo === typeFilter);
    }
    if (searchTerm.trim()) {
      const term = normalizeSearch(searchTerm);
      pool = pool.filter(
        (q) =>
          normalizeSearch(q.enunciado).includes(term) ||
          normalizeSearch(q.comentario || '').includes(term) ||
          q.alternativas?.some((a) => normalizeSearch(a.texto).includes(term)),
      );
    }
    return pool.length;
  }, [allQuestions, subject, typeFilter, searchTerm]);

  const bankFilteredQuestions = useMemo(() => {
    const term = normalizeSearch(searchTerm);
    return db.questions.filter((q) => {
      if (subject !== 'Todas as Matérias' && q.materia !== subject) return false;
      if (typeFilter !== 'all' && q.tipo !== typeFilter) return false;
      if (term) {
        const hay = normalizeSearch(
          `${q.materia} ${questionStatement(q)} ${q.comentario || ''} ${q.alternativas
            ?.map((a) => `${a.letra} ${a.texto}`)
            .join(' ')}`,
        );
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [db.questions, subject, typeFilter, searchTerm]);

  const startTraining = () => {
    let pool = allQuestions(true, subject);
    if (typeFilter !== 'all') {
      pool = pool.filter((q) => q.tipo === typeFilter);
    }
    if (searchTerm.trim()) {
      const term = normalizeSearch(searchTerm);
      pool = pool.filter(
        (q) =>
          normalizeSearch(q.enunciado).includes(term) ||
          normalizeSearch(q.comentario || '').includes(term) ||
          q.alternativas?.some((a) => normalizeSearch(a.texto).includes(term)),
      );
    }
    pool = shuffled(pool);

    if (!pool.length) {
      toast('Não há questões disponíveis para os filtros e busca informados.', true);
      return;
    }
    const count = amount === 'all' ? pool.length : Math.max(1, Number(amount) || 20);
    const chosen = pool.slice(0, count);
    ensureTimerRunning();
    setQuiz({
      id: uid(16),
      kind: 'training',
      materia: subject,
      questions: chosen,
      index: 0,
      answers: Array(chosen.length),
      studySeconds: 0,
      timerBaseline: getCurrentTimerSeconds(),
    });
  };

  const openEditor = (q: Question) => {
    const altsText = (q.alternativas || [])
      .map((a) => `${a.letra}) ${a.texto}`)
      .join('\n');
    setRawEnunciadoBeforeFormat(null);
    setEnunciadoAutoFormatted(false);
    setRawComentarioBeforeFormat(null);
    setComentarioAutoFormatted(false);
    setEditingQuestion({
      id: q.id,
      materia: q.materia,
      tipo: q.tipo === 'CE' ? 'CE' : 'ME',
      enunciado: questionStatement(q),
      alternativasText: altsText,
      gabarito: q.gabarito || '',
      comentario: q.comentario || '',
    });
  };

  const handlePasteField = (
    field: 'enunciado' | 'comentario',
    e: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    if (!editingQuestion) return;
    const pasted = e.clipboardData.getData('text/plain');
    if (!pasted || !pasted.trim()) return;
    e.preventDefault();
    const target = e.currentTarget;
    const current = editingQuestion[field];
    const start = target.selectionStart ?? current.length;
    const end = target.selectionEnd ?? current.length;
    const rawUnformatted = current.slice(0, start) + pasted + current.slice(end);
    const { nextValue, nextCursorPos, changed } = insertFormattedPaste(
      current,
      start,
      end,
      pasted,
    );
    if (field === 'enunciado') {
      setRawEnunciadoBeforeFormat(changed ? rawUnformatted : null);
      setEnunciadoAutoFormatted(changed);
    } else {
      setRawComentarioBeforeFormat(changed ? rawUnformatted : null);
      setComentarioAutoFormatted(changed);
    }
    setEditingQuestion({ ...editingQuestion, [field]: nextValue });
    requestAnimationFrame(() => {
      if (target && document.activeElement === target) {
        target.setSelectionRange(nextCursorPos, nextCursorPos);
      }
    });
  };

  const handleManualFormatField = (field: 'enunciado' | 'comentario') => {
    if (!editingQuestion || !editingQuestion[field].trim()) return;
    const current = editingQuestion[field];
    const formatted = formatCorrectionTextStructured(current);
    if (field === 'enunciado') {
      if (formatted !== current) setRawEnunciadoBeforeFormat(current);
      setEnunciadoAutoFormatted(true);
    } else {
      if (formatted !== current) setRawComentarioBeforeFormat(current);
      setComentarioAutoFormatted(true);
    }
    setEditingQuestion({ ...editingQuestion, [field]: formatted });
  };

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    const parsedAlts: QuestionAlternative[] = editingQuestion.alternativasText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^([A-Ea-e])[)\].:\s-]+(.+)$/);
        if (m) return { letra: m[1].toUpperCase(), texto: m[2].trim() };
        return null;
      })
      .filter((x): x is QuestionAlternative => Boolean(x));

    updateQuestion(editingQuestion.id, {
      materia: editingQuestion.materia.trim() || 'Geral',
      tipo: editingQuestion.tipo,
      enunciado: editingQuestion.enunciado.trim(),
      alternativas: editingQuestion.tipo === 'CE' ? [] : parsedAlts,
      gabarito: editingQuestion.gabarito.trim().toUpperCase(),
      comentario: editingQuestion.comentario.trim(),
    });
    setEditingQuestion(null);
  };

  const handleDeleteQuestion = async (q: Question) => {
    const ok = await requestConfirm({
      title: 'Excluir questão do banco?',
      description: `A questão de "${visibleName(q.materia)}" será removida permanentemente do banco de treino.`,
      confirmLabel: 'Excluir questão',
      danger: true,
    });
    if (!ok) return;
    deleteQuestion(q.id);
  };

  const activeTraining = quiz?.kind === 'training';

  const printableQuestions = useMemo(() => {
    if (mode === 'manage') return bankFilteredQuestions;
    if (activeTraining && quiz?.questions?.length) return quiz.questions;
    let pool = allQuestions(true, subject);
    if (typeFilter !== 'all') {
      pool = pool.filter((q) => q.tipo === typeFilter);
    }
    if (searchTerm.trim()) {
      const term = normalizeSearch(searchTerm);
      pool = pool.filter(
        (q) =>
          normalizeSearch(q.enunciado).includes(term) ||
          normalizeSearch(q.comentario || '').includes(term) ||
          q.alternativas?.some((a) => normalizeSearch(a.texto).includes(term)),
      );
    }
    if (amount === 'all') return pool;
    const count = Math.max(1, Number(amount) || 20);
    return pool.slice(0, count);
  }, [mode, bankFilteredQuestions, activeTraining, quiz, allQuestions, subject, typeFilter, searchTerm, amount]);

  const printFormatLabel =
    typeFilter === 'CE'
      ? 'Certo / Errado (Cebraspe)'
      : typeFilter === 'ME'
        ? 'Múltipla Escolha (A–E)'
        : 'Todos os formatos';

  const holderName = googleUser?.displayName || googleUser?.email || 'Cidadão-Estudante Federal';

  const handleTriggerPrint = () => {
    if (!printableQuestions.length) {
      toast('Não há questões disponíveis para imprimir com os filtros atuais.', true);
      return;
    }
    window.setTimeout(() => window.print(), 60);
  };

  return (
    <div>
      <div data-print-hide="true">
      <PageHeader
        eyebrow="BANCO OFICIAL · TREINO DIÁRIO"
        title="Bateria comentada e gestão do banco"
        description="Resolva questões homologadas com correção imediata ou edite e organize as questões cadastradas no seu banco oficial."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode('train')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-[12px] font-bold transition-colors ${
                mode === 'train'
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
                  : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              Modo Treino
            </button>
            <button
              type="button"
              onClick={() => setMode('manage')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-[12px] font-bold transition-colors tabular-nums ${
                mode === 'manage'
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
                  : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              Gerenciar Banco ({db.questions.length})
            </button>
          </div>
        }
      />

      <Panel className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label
              htmlFor="train-subject"
              className="block text-[11px] font-bold text-[var(--muted)] mb-1.5"
            >
              Disciplina
            </label>
            <select
              id="train-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="ce-select"
            >
              <option value="Todas as Matérias">Todas as Matérias</option>
              {availableSubjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="train-type"
              className="block text-[11px] font-bold text-[var(--muted)] mb-1.5"
            >
              Formato de questão
            </label>
            <select
              id="train-type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | QuestionType)}
              className="ce-select"
            >
              <option value="all">Todos os formatos</option>
              <option value="CE">Certo / Errado (Cebraspe)</option>
              <option value="ME">Múltipla Escolha (A, B, C, D, E)</option>
            </select>
          </div>

          {mode === 'train' && (
            <div>
              <label
                htmlFor="train-count"
                className="block text-[11px] font-bold text-[var(--muted)] mb-1.5"
              >
                Quantidade
              </label>
              <select
                id="train-count"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="ce-select"
              >
                <option value="10">10 questões</option>
                <option value="20">20 questões</option>
                <option value="50">50 questões</option>
                <option value="all">Todas disponíveis ({matchingQuestionsCount})</option>
              </select>
            </div>
          )}

          <div className={mode === 'manage' ? 'lg:col-span-2' : ''}>
            <label
              htmlFor="train-search"
              className="block text-[11px] font-bold text-[var(--muted)] mb-1.5"
            >
              Buscar termo / palavra-chave
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="train-search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ex.: prescrição, súmula..."
                className="ce-input pl-8"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-[var(--muted)]">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-[var(--accent)]" />
              {mode === 'train' ? (
                <span>
                  <strong className="text-[var(--text)]">{matchingQuestionsCount}</strong> questão(ões) encontrada(s) para treino.
                </span>
              ) : (
                <span>
                  <strong className="text-[var(--text)]">{bankFilteredQuestions.length}</strong> questão(ões) no banco pessoal com os filtros atuais.
                </span>
              )}
            </div>
            <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={printIncludeAnswers}
                onChange={(e) => setPrintIncludeAnswers(e.target.checked)}
                className="accent-[var(--accent)] w-3.5 h-3.5"
              />
              Incluir gabarito e comentários na impressão A4
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPrintPreview(true)}
              disabled={printableQuestions.length === 0}
              className="inline-flex items-center justify-center gap-1.5 h-[38px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-45 whitespace-nowrap cursor-pointer"
              title="Pré-visualizar caderno oficial de questões no padrão A4 do Governo Federal"
            >
              <Eye className="w-3.5 h-3.5 text-[var(--accent)]" />
              Pré-visualizar A4
            </button>
            <button
              type="button"
              onClick={handleTriggerPrint}
              disabled={printableQuestions.length === 0}
              className="inline-flex items-center justify-center gap-1.5 h-[38px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-45 whitespace-nowrap cursor-pointer"
              title="Imprimir caderno oficial de questões com brasão e rodapé numerado"
            >
              <Printer className="w-3.5 h-3.5 text-[var(--accent)]" />
              Imprimir Questões (A4)
            </button>
            {mode === 'train' && (
              <button
                type="button"
                onClick={startTraining}
                className="inline-flex items-center justify-center gap-1.5 h-[38px] px-5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[13px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                {activeTraining ? 'Reiniciar bateria' : 'Iniciar treino'}
              </button>
            )}
          </div>
        </div>
      </Panel>

      {mode === 'train' && activeTraining && (
        <QuizRunner simulation={false} onRestart={startTraining} />
      )}

      {mode === 'manage' && (
        <Panel
          title="Questões do Banco Pessoal"
          subtitle="Edite enunciados, alternativas, gabarito ou exclua questões duplicadas."
        >
          {editingQuestion && (
            <form
              onSubmit={handleSaveQuestion}
              className="mb-4 rounded-xl border border-[var(--accent)]/60 bg-[var(--panel-soft)] p-4 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <strong className="text-[13px] font-bold text-[var(--text)]">
                  Editando questão
                </strong>
                <button
                  type="button"
                  onClick={() => setEditingQuestion(null)}
                  className="text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                    Matéria
                  </label>
                  <input
                    type="text"
                    value={editingQuestion.materia}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, materia: e.target.value })
                    }
                    className="ce-input"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                    Formato
                  </label>
                  <select
                    value={editingQuestion.tipo}
                    onChange={(e) =>
                      setEditingQuestion({
                        ...editingQuestion,
                        tipo: e.target.value as QuestionType,
                      })
                    }
                    className="ce-select"
                  >
                    <option value="ME">Múltipla Escolha</option>
                    <option value="CE">Certo / Errado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                    Gabarito
                  </label>
                  <input
                    type="text"
                    value={editingQuestion.gabarito}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, gabarito: e.target.value })
                    }
                    placeholder="C, E ou A..E"
                    className="ce-input"
                  />
                </div>
              </div>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <label className="block text-[11px] font-bold text-[var(--muted)]">
                      Enunciado
                    </label>
                    {enunciadoAutoFormatted && (
                      <span className="text-[10.5px] font-bold text-[var(--good)]">
                        Organizado automaticamente
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {rawEnunciadoBeforeFormat !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQuestion({
                            ...editingQuestion,
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
                      onClick={() => handleManualFormatField('enunciado')}
                      disabled={!editingQuestion.enunciado.trim()}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[10.5px] font-bold text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-45 cursor-pointer"
                    >
                      <AlignLeft className="w-3 h-3" />
                      Organizar texto
                    </button>
                  </div>
                </div>
                <textarea
                  rows={5}
                  value={editingQuestion.enunciado}
                  onChange={(e) => {
                    setEditingQuestion({ ...editingQuestion, enunciado: e.target.value });
                    if (enunciadoAutoFormatted) setEnunciadoAutoFormatted(false);
                  }}
                  onPaste={(e) => handlePasteField('enunciado', e)}
                  className="ce-textarea leading-relaxed"
                />
              </div>
              {editingQuestion.tipo === 'ME' && (
                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                    Alternativas (uma por linha, ex.: A) Texto...)
                  </label>
                  <textarea
                    rows={4}
                    value={editingQuestion.alternativasText}
                    onChange={(e) =>
                      setEditingQuestion({
                        ...editingQuestion,
                        alternativasText: e.target.value,
                      })
                    }
                    className="ce-textarea font-mono text-[12px]"
                  />
                </div>
              )}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <label className="block text-[11px] font-bold text-[var(--muted)]">
                      Comentário
                    </label>
                    {comentarioAutoFormatted && (
                      <span className="text-[10.5px] font-bold text-[var(--good)]">
                        Organizado automaticamente
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {rawComentarioBeforeFormat !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQuestion({
                            ...editingQuestion,
                            comentario: rawComentarioBeforeFormat,
                          });
                          setRawComentarioBeforeFormat(null);
                          setComentarioAutoFormatted(false);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[10.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                      >
                        <Undo2 className="w-3 h-3" />
                        Desfazer ajuste
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleManualFormatField('comentario')}
                      disabled={!editingQuestion.comentario.trim()}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[10.5px] font-bold text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-45 cursor-pointer"
                    >
                      <AlignLeft className="w-3 h-3" />
                      Organizar texto
                    </button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={editingQuestion.comentario}
                  onChange={(e) => {
                    setEditingQuestion({ ...editingQuestion, comentario: e.target.value });
                    if (comentarioAutoFormatted) setComentarioAutoFormatted(false);
                  }}
                  onPaste={(e) => handlePasteField('comentario', e)}
                  className="ce-textarea leading-relaxed"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingQuestion(null)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--muted)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)]"
                >
                  Salvar alterações
                </button>
              </div>
            </form>
          )}

          {bankFilteredQuestions.length ? (
            <div className="flex flex-col gap-2.5 max-h-[620px] overflow-y-auto pr-1">
              {bankFilteredQuestions.slice(0, 80).map((q, idx) => (
                <div
                  key={q.id}
                  className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-num text-[11.5px] font-bold text-[var(--muted)]">
                        #{idx + 1}
                      </span>
                      <span className="px-2 py-0.5 rounded border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--accent)]">
                        {visibleName(q.materia)}
                      </span>
                      <span className="px-2 py-0.5 rounded border border-[var(--line)] bg-[var(--panel-raised)] text-[10.5px] font-bold text-[var(--muted)]">
                        {q.tipo === 'CE' ? 'Certo/Errado' : 'Múltipla Escolha'}
                      </span>
                      <span className="text-[11px] font-bold text-[var(--good)]">
                        Gabarito: {q.gabarito || '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditor(q)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)]"
                      >
                        <Pencil className="w-3 h-3" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteQuestion(q)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--bad)] hover:border-[var(--bad)]"
                      >
                        <Trash2 className="w-3 h-3" />
                        Excluir
                      </button>
                    </div>
                  </div>
                  <StructuredLegalText
                    text={questionStatement(q)}
                    compact
                    className="text-[12.5px] text-[var(--text)]"
                  />
                </div>
              ))}
              {bankFilteredQuestions.length > 80 && (
                <div className="text-center text-[11.5px] text-[var(--muted)] py-2">
                  Exibindo as primeiras 80 de {bankFilteredQuestions.length} questões. Refine os filtros acima para localizar itens específicos.
                </div>
              )}
            </div>
          ) : (
            <EmptyState message="Nenhuma questão no banco corresponde aos filtros aplicados." />
          )}
        </Panel>
      )}
      </div>

      {showPrintPreview && (
        <div
          data-print-hide="true"
          className="fixed inset-0 z-50 bg-[#071D41]/75 backdrop-blur-[2px] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Pré-visualização Oficial A4 — Caderno de Questões"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#071D41] text-white border-b border-white/15 shrink-0">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#FFCD07]">
                Caderno Oficial de Questões A4 · Padrão Governo Federal
              </div>
              <div className="text-[12.5px] text-white/85 truncate">
                Cabeçalho com Brasão (placeholder), questões alinhadas com separação de artigos e rodapé numerado automático
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleTriggerPrint}
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
              <QuestionsOfficialPrintSheet
                questions={printableQuestions}
                scopeLabel={subject}
                formatLabel={printFormatLabel}
                holderName={holderName}
                includeAnswersAndComments={printIncludeAnswers}
                previewMode
              />
            </div>
          </div>
        </div>
      )}

      <QuestionsOfficialPrintSheet
        questions={printableQuestions}
        scopeLabel={subject}
        formatLabel={printFormatLabel}
        holderName={holderName}
        includeAnswersAndComments={printIncludeAnswers}
      />
    </div>
  );
};

