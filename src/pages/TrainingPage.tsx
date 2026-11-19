import React, { useMemo, useState } from 'react';
import { Database, Filter, Pencil, Play, Search, Trash2, X } from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { Question, QuestionAlternative, QuestionType } from '../types/study';
import { normalizeSearch, questionStatement, shuffled, uid, visibleName } from '../lib/parsers';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';
import { QuizRunner } from '../components/quiz/QuizRunner';

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

  const [editingQuestion, setEditingQuestion] = useState<{
    id: string;
    materia: string;
    tipo: QuestionType;
    enunciado: string;
    alternativasText: string;
    gabarito: string;
    comentario: string;
  } | null>(null);

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

  return (
    <div>
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
          <div className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
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

          {mode === 'train' && (
            <button
              type="button"
              onClick={startTraining}
              className="inline-flex items-center justify-center gap-1.5 h-[38px] px-5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[13px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              {activeTraining ? 'Reiniciar bateria' : 'Iniciar treino'}
            </button>
          )}
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
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Enunciado
                </label>
                <textarea
                  rows={3}
                  value={editingQuestion.enunciado}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, enunciado: e.target.value })
                  }
                  className="ce-textarea"
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
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Comentário
                </label>
                <textarea
                  rows={2}
                  value={editingQuestion.comentario}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, comentario: e.target.value })
                  }
                  className="ce-textarea"
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
                  <p className="m-0 text-[12.5px] leading-relaxed text-[var(--text)] line-clamp-3 whitespace-pre-wrap">
                    {questionStatement(q)}
                  </p>
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
  );
};

