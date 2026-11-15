import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  Eraser,
  Eye,
  ListChecks,
  Maximize2,
  Minimize2,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import {
  extractOptions,
  formatClock,
  isTrueFalseQuestion,
  questionStatement,
  visibleName,
} from '../../lib/parsers';
import { Panel } from '../ui/PageHeader';
import { WhiteboardCanvas } from './WhiteboardCanvas';

interface QuizRunnerProps {
  simulation?: boolean;
  onViewCompletedSimulations?: () => void;
  onRestart?: () => void;
}

export const QuizRunner: React.FC<QuizRunnerProps> = ({
  simulation = false,
  onViewCompletedSimulations,
  onRestart,
}) => {
  const {
    db,
    quiz,
    setActivePage,
    submitQuizAnswer,
    changeQuizAnswer,
    advanceQuizQuestion,
    previousQuizQuestion,
    goToQuizQuestion,
    finishQuizSession,
    cancelQuizSession,
    retryRecordStudyTime,
    retryArchiveSimulation,
    requestConfirm,
    examFocusMode,
    setExamFocusMode,
  } = useStudy();

  const [showReviewBoard, setShowReviewBoard] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'answered' | 'blank'>('all');

  const isCompleted = Boolean(quiz && (quiz.completed || quiz.index >= quiz.questions.length));

  useEffect(() => {
    if (!quiz || isCompleted) {
      setExamFocusMode(false);
    }
  }, [quiz, isCompleted, setExamFocusMode]);

  useEffect(() => {
    if (!examFocusMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExamFocusMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [examFocusMode, setExamFocusMode]);

  useEffect(() => () => setExamFocusMode(false), [setExamFocusMode]);

  if (!quiz) return null;

  const whiteboardEnabled = simulation && db.preferences.whiteboard_enabled !== false;

  if (isCompleted) {
    const isCeModel =
      quiz.questions.some(
        (q) => q.tipo === 'CE' || isTrueFalseQuestion(q, extractOptions(q)),
      ) ||
      quiz.answers.some((a) => a?.tipo === 'CE') ||
      Boolean(
        quiz.savedResult?.questoes?.some(
          (q) => q.tipo === 'CE' || isTrueFalseQuestion(q, extractOptions(q)),
        ),
      );

    const savedResult = quiz.savedResult;
    const totalCount = savedResult ? savedResult.total : quiz.questions.length;
    const correctCount = savedResult
      ? savedResult.acertos
      : quiz.answers.filter((a) => a?.correta).length;
    const wrongCount = savedResult
      ? savedResult.erros
      : quiz.answers.filter((a) => Boolean(a?.resposta) && !a?.correta).length;
    const blankCount =
      savedResult?.em_branco !== undefined
        ? savedResult.em_branco
        : Math.max(0, totalCount - (correctCount + wrongCount));

    // Pontos totais no modelo CESPE: quantidade de questões certas menos as erradas (uma certa anula uma errada)
    const pontosTotaisCespe =
      savedResult?.pontos_liquidos !== undefined
        ? savedResult.pontos_liquidos
        : correctCount - wrongCount;

    const evaluated = quiz.answers.filter((a) => typeof a?.correta === 'boolean');
    const netScore = evaluated.reduce(
      (sum, a) => sum + (a?.correta ? 1 : a?.tipo === 'CE' ? -1 : 0),
      0,
    );
    const accuracy = totalCount ? Math.round((correctCount / totalCount) * 100) : 0;

    return (
      <Panel className="mt-4">
        <div className="mb-3.5">
          <div className="text-[10px] font-extrabold tracking-[0.16em] uppercase text-[var(--accent)]">
            {simulation
              ? `${isCeModel ? 'SIMULADO FECHADO · MODELO CESPE / CEBRASPE' : 'SIMULADO FECHADO'}${
                  savedResult?.banca || quiz.banca ? ` · ${savedResult?.banca || quiz.banca}` : ''
                }`
              : 'TREINO DIÁRIO'}
          </div>
          <h3 className="mt-1 mb-0 font-display text-[18px] font-extrabold text-[var(--text)]">
            {simulation
              ? savedResult?.titulo || 'Simulado finalizado e registrado'
              : 'Sessão de treino finalizada'}
          </h3>
        </div>

        <div
          className={`grid gap-3 mb-4 ${
            simulation
              ? isCeModel
                ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
                : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
              : isCeModel
              ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
              : 'grid-cols-2 sm:grid-cols-4'
          }`}
        >
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
            <span className="block text-[10px] font-extrabold tracking-[0.14em] uppercase text-[var(--muted)]">
              {isCeModel ? 'ACERTOS (+1)' : 'ACERTOS'}
            </span>
            <strong className="block mt-1 font-mono-num text-[24px] font-extrabold text-[var(--good)]">
              {correctCount}
            </strong>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
            <span className="block text-[10px] font-extrabold tracking-[0.14em] uppercase text-[var(--muted)]">
              {isCeModel ? 'ERROS (-1)' : 'ERROS'}
            </span>
            <strong className="block mt-1 font-mono-num text-[24px] font-extrabold text-[var(--bad)]">
              {wrongCount}
            </strong>
          </div>

          {isCeModel ? (
            <div className="rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-3.5 shadow-xs">
              <span className="block text-[10px] font-extrabold tracking-[0.14em] uppercase text-[var(--accent)]">
                PONTOS TOTAIS (CESPE)
              </span>
              <strong
                className={`block mt-1 font-mono-num text-[24px] font-extrabold ${
                  pontosTotaisCespe > 0
                    ? 'text-[var(--good)]'
                    : pontosTotaisCespe < 0
                    ? 'text-[var(--bad)]'
                    : 'text-[var(--text)]'
                }`}
              >
                {pontosTotaisCespe > 0 ? `+${pontosTotaisCespe}` : pontosTotaisCespe}
              </strong>
              <small className="block text-[10px] text-[var(--muted)] mt-0.5 font-semibold">
                Certas ({correctCount}) - Erros ({wrongCount})
              </small>
            </div>
          ) : !simulation ? (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
              <span className="block text-[10px] font-extrabold tracking-[0.14em] uppercase text-[var(--muted)]">
                PONTUAÇÃO LÍQUIDA
              </span>
              <strong className="block mt-1 font-mono-num text-[24px] font-extrabold text-[var(--text)]">
                {netScore}
              </strong>
            </div>
          ) : null}

          {isCeModel && blankCount > 0 && (
            <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/10 p-3.5">
              <span className="block text-[10px] font-extrabold tracking-[0.14em] uppercase text-[var(--warning)]">
                EM BRANCO (0)
              </span>
              <strong className="block mt-1 font-mono-num text-[24px] font-extrabold text-[var(--warning)]">
                {blankCount}
              </strong>
              <small className="block text-[10px] text-[var(--muted)] mt-0.5">
                Não pontuam nem anulam
              </small>
            </div>
          )}

          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
            <span className="block text-[10px] font-extrabold tracking-[0.14em] uppercase text-[var(--muted)]">
              TOTAL
            </span>
            <strong className="block mt-1 font-mono-num text-[24px] font-extrabold text-[var(--text)]">
              {simulation ? quiz.questions.length : totalCount}
            </strong>
          </div>

          {simulation && (
            <>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
                <span className="block text-[10px] font-extrabold tracking-[0.14em] uppercase text-[var(--muted)]">
                  APROVEITAMENTO
                </span>
                <strong className="block mt-1 font-mono-num text-[24px] font-extrabold text-[var(--text)]">
                  {accuracy}%
                </strong>
              </div>

              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
                <span className="block text-[10px] font-extrabold tracking-[0.14em] uppercase text-[var(--muted)]">
                  TEMPO
                </span>
                <strong className="block mt-1 font-mono-num text-[24px] font-extrabold text-[var(--text)]">
                  {formatClock(savedResult?.tempo_segundos ?? quiz.elapsedSeconds ?? 0)}
                </strong>
                <small className="block text-[10px] text-[var(--muted)] mt-0.5 tabular-nums">
                  Média:{' '}
                  {formatClock(
                    Math.round(
                      (savedResult?.tempo_segundos ?? quiz.elapsedSeconds ?? 0) /
                        Math.max(1, totalCount),
                    ),
                  )}
                  /questão
                </small>
              </div>
            </>
          )}
        </div>

        {isCeModel && (
          <div className="ce-notice ce-notice-accent mb-3.5 flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <span>
              <strong className="text-[var(--text)]">Regra Padrão CESPE / Cebraspe:</strong> Cada questão certa soma 1 ponto e cada questão errada anula 1 questão certa ({correctCount} certas - {wrongCount} erradas = <strong>{pontosTotaisCespe} pontos totais</strong>). {blankCount > 0 ? `${blankCount} questão(ões) deixada(s) em branco não pontuaram nem anularam.` : 'Sem questões em branco.'}
            </span>
            <span className="font-mono-num font-extrabold text-[12.5px] px-3 py-1 rounded-md border border-[var(--accent)] bg-[var(--accent)] text-white whitespace-nowrap">
              Pontos Totais: {pontosTotaisCespe > 0 ? `+${pontosTotaisCespe}` : pontosTotaisCespe} pts
            </span>
          </div>
        )}

        {quiz.studySeconds > 0 && quiz.studyTimeRecorded && (
          <div className="ce-notice ce-notice-good mb-3">
            Tempo ativo registrado no cronograma de hoje:{' '}
            <strong className="font-mono-num text-[var(--text)]">
              {formatClock(quiz.studySeconds)}
            </strong>
            .
          </div>
        )}

        {quiz.studySeconds > 0 && !quiz.studyTimeRecorded && quiz.answers.some(Boolean) && (
          <div className="ce-notice ce-notice-warning mb-3 flex flex-wrap items-center justify-between gap-2">
            <span>
              Não foi possível registrar automaticamente o tempo ({formatClock(quiz.studySeconds)}).
            </span>
            <button
              type="button"
              onClick={() => retryRecordStudyTime(quiz)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Tentar novamente
            </button>
          </div>
        )}

        {simulation && !savedResult && (
          <div className="ce-notice ce-notice-warning mb-3 flex flex-wrap items-center justify-between gap-2">
            <span>Este simulado ainda não foi gravado no Boletim de Ocorrências.</span>
            <button
              type="button"
              onClick={() => retryArchiveSimulation(quiz)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
            >
              Gravar resultado
            </button>
          </div>
        )}

        {simulation && wrongCount > 0 && (
          <div className="ce-notice ce-notice-warning mb-3.5 flex flex-wrap items-center justify-between gap-3 text-[12px]">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--warning)]/20 text-[var(--warning)] font-extrabold text-[13px] shrink-0">
                {wrongCount}
              </span>
              <span>
                <strong className="text-[var(--text)]">Ouvidoria (Erros) Atualizada:</strong> As{' '}
                <strong>{wrongCount} questão(ões) respondida(s) com erro</strong> neste simulado foram enviadas automaticamente para a sua{' '}
                <strong>Ouvidoria (Erros)</strong> com o status <strong>"Pendente de Correção"</strong>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                cancelQuizSession();
                setActivePage('Caderno de Erros');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[var(--warning)] bg-[var(--warning)]/20 text-[var(--text)] text-[12px] font-bold hover:bg-[var(--warning)]/30 whitespace-nowrap cursor-pointer transition-colors shadow-xs"
            >
              <BookmarkCheck className="w-3.5 h-3.5 text-[var(--warning)]" />
              Revisar na Ouvidoria (Erros)
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            type="button"
            onClick={() => {
              cancelQuizSession();
              if (onRestart) onRestart();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
          >
            {simulation ? 'Novo simulado' : 'Novo treino'}
          </button>
          {simulation && wrongCount > 0 && (
            <button
              type="button"
              onClick={() => {
                cancelQuizSession();
                setActivePage('Caderno de Erros');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--warning)]/60 bg-[var(--warning)]/15 text-[var(--text)] text-[12.5px] font-bold hover:border-[var(--warning)] whitespace-nowrap shadow-xs"
            >
              <BookmarkCheck className="w-3.5 h-3.5 text-[var(--warning)]" />
              Ouvidoria (Erros) ({wrongCount} pendentes)
            </button>
          )}
          {simulation && savedResult && onViewCompletedSimulations && (
            <button
              type="button"
              onClick={() => {
                cancelQuizSession();
                onViewCompletedSimulations();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12.5px] font-bold hover:border-[var(--accent)] whitespace-nowrap"
            >
              Ver Boletim de Ocorrências
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              cancelQuizSession();
              setActivePage('Início');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12.5px] font-bold hover:border-[var(--accent)] whitespace-nowrap"
          >
            Voltar ao Meu Cadastro
          </button>
        </div>

        {simulation && savedResult?.questoes?.length ? (
          <div className="mt-5 pt-4 border-t border-[var(--line)]">
            <h4 className="m-0 mb-3 font-display text-[14px] font-bold text-[var(--text)]">
              Revisão das questões
            </h4>
            <div className="flex flex-col gap-2.5">
              {savedResult.questoes.map((q) => {
                const reviewOpts = extractOptions(q);
                return (
                  <div
                    key={`${q.id}-${q.numero}`}
                    className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <span className="text-[12px] font-bold text-[var(--text)] tabular-nums">
                        Questão {q.numero} · {visibleName(q.materia)}
                      </span>
                      <div className="flex items-center gap-2">
                        {!q.correta && Boolean(q.resposta) && (
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[var(--warning)] bg-[var(--warning)]/15 border border-[var(--warning)]/30 px-2 py-0.5 rounded">
                            <Clock className="w-3 h-3" />
                            Pendente na Ouvidoria (Erros)
                          </span>
                        )}
                        <span
                          className={`text-[11px] font-bold ${
                            q.correta ? 'text-[var(--good)]' : 'text-[var(--bad)]'
                          }`}
                        >
                          {q.correta ? 'Acertou' : q.resposta ? 'Errou' : 'Em branco'}
                        </span>
                      </div>
                    </div>
                    <p className="m-0 text-[13px] leading-relaxed text-[var(--text)] whitespace-pre-wrap">
                      {questionStatement(q)}
                    </p>
                    {reviewOpts.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1 pl-2 border-l border-[var(--line-strong)]">
                        {reviewOpts.map((opt) => (
                          <div key={opt.key} className="text-[12px] text-[var(--muted)]">
                            <strong className="text-[var(--text)]">{opt.key}.</strong> {opt.text}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-[var(--muted)]">
                      <span>
                        Marcada:{' '}
                        <strong className="text-[var(--text)]">{q.resposta || 'Em branco'}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        Gabarito: <strong className="text-[var(--text)]">{q.gabarito}</strong>
                      </span>
                    </div>
                    {q.comentario && (
                      <div className="ce-notice mt-2.5 text-[12px]">
                        <strong className="text-[var(--text)]">Comentário:</strong> {q.comentario}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Panel>
    );
  }

  const handleConfirmFinish = async () => {
    const answeredCount = quiz.answers.filter((a) => Boolean(a?.resposta)).length;
    const blankCount = quiz.questions.length - answeredCount;
    if (blankCount > 0) {
      const ok = await requestConfirm({
        title: 'Entregar com questões em branco?',
        description: `Você ainda possui ${blankCount} questão(ões) em branco sem resposta. Deseja realmente finalizar o simulado e gerar o resultado agora?`,
        confirmLabel: 'Sim, entregar simulado',
        danger: false,
      });
      if (!ok) return;
    }
    setShowReviewBoard(false);
    finishQuizSession();
  };

  if (simulation && showReviewBoard) {
    const answeredCount = quiz.answers.filter((a) => Boolean(a?.resposta)).length;
    const blankCount = quiz.questions.length - answeredCount;

    const questionList = quiz.questions.map((q, idx) => ({
      q,
      idx,
      ans: quiz.answers[idx],
    }));

    const filtered = questionList.filter(({ ans }) => {
      if (reviewFilter === 'answered') return Boolean(ans?.resposta);
      if (reviewFilter === 'blank') return !ans?.resposta;
      return true;
    });

    return (
      <Panel className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[var(--line)]">
          <div>
            <div className="text-[10px] font-extrabold tracking-[0.16em] uppercase text-[var(--accent)]">
              SIMULADO FECHADO · CONFERÊNCIA GERAL
            </div>
            <h3 className="mt-1 mb-0 font-display text-[18px] font-extrabold text-[var(--text)]">
              Gabarito das Questões Marcadas
            </h3>
            <p className="mt-1 mb-0 text-[12.5px] text-[var(--muted)]">
              Confira suas respostas abaixo. Você pode alterar a alternativa escolhida de qualquer questão diretamente aqui antes de entregar.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowReviewBoard(false)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao Simulado
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmFinish()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] transition-colors shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              Finalizar e Entregar Simulado
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
            <span className="block text-[10px] font-extrabold tracking-[0.14em] uppercase text-[var(--muted)]">
              TOTAL DE QUESTÕES
            </span>
            <strong className="block mt-1 font-mono-num text-[20px] font-extrabold text-[var(--text)]">
              {quiz.questions.length}
            </strong>
          </div>
          <div className="rounded-xl border border-[var(--good)]/30 bg-[var(--good)]/10 p-3">
            <span className="block text-[10px] font-extrabold tracking-[0.14em] uppercase text-[var(--good)]">
              RESPONDIDAS
            </span>
            <strong className="block mt-1 font-mono-num text-[20px] font-extrabold text-[var(--good)]">
              {answeredCount}
            </strong>
          </div>
          <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/10 p-3">
            <span className="block text-[10px] font-extrabold tracking-[0.14em] uppercase text-[var(--warning)]">
              EM BRANCO
            </span>
            <strong className="block mt-1 font-mono-num text-[20px] font-extrabold text-[var(--warning)]">
              {blankCount}
            </strong>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
            <span className="block text-[10px] font-extrabold tracking-[0.14em] uppercase text-[var(--muted)]">
              TEMPO DECORRIDO
            </span>
            <strong className="block mt-1 font-mono-num text-[20px] font-extrabold text-[var(--text)]">
              {formatClock(quiz.elapsedSeconds || 0)}
            </strong>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 pt-1">
          <div className="inline-flex p-1 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)]">
            <button
              type="button"
              onClick={() => setReviewFilter('all')}
              className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-colors ${
                reviewFilter === 'all'
                  ? 'bg-[var(--panel-raised)] text-[var(--text)] shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              Todas ({quiz.questions.length})
            </button>
            <button
              type="button"
              onClick={() => setReviewFilter('answered')}
              className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-colors ${
                reviewFilter === 'answered'
                  ? 'bg-[var(--panel-raised)] text-[var(--text)] shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              Respondidas ({answeredCount})
            </button>
            <button
              type="button"
              onClick={() => setReviewFilter('blank')}
              className={`px-3 py-1 rounded-lg text-[12px] font-bold transition-colors ${
                reviewFilter === 'blank'
                  ? 'bg-[var(--panel-raised)] text-[var(--text)] shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              Em branco ({blankCount})
            </button>
          </div>

          <span className="text-[11.5px] text-[var(--muted)]">
            Dica: clique em uma letra para alterar a resposta imediatamente.
          </span>
        </div>

        <div className="flex flex-col gap-2.5 max-h-[560px] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-[var(--muted)] rounded-xl border border-dashed border-[var(--line)]">
              Nenhuma questão neste filtro.
            </div>
          ) : (
            filtered.map(({ q, idx, ans }) => {
              const qOpts = extractOptions(q);
              const isTF = isTrueFalseQuestion(q, qOpts);
              const isMarked = Boolean(ans?.resposta);
              const preview = questionStatement(q);
              const letters = isTF
                ? ['C', 'E']
                : qOpts.length > 0
                ? qOpts.map((o) => o.key)
                : ['A', 'B', 'C', 'D', 'E'];

              return (
                <div
                  key={`${q.id || idx}-${idx}`}
                  className={`p-3.5 rounded-xl border transition-colors ${
                    isMarked
                      ? 'border-[var(--line)] bg-[var(--panel-soft)]'
                      : 'border-[var(--warning)]/40 bg-[var(--warning)]/5'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num text-[12.5px] font-extrabold text-[var(--text)]">
                        Questão {idx + 1}
                      </span>
                      <span className="text-[11px] font-semibold text-[var(--muted)]">
                        · {visibleName(q.materia)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isMarked ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)]">
                          Marcada: <strong>{ans?.resposta}</strong>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--warning)]/50 bg-[var(--warning)]/15 text-[11px] font-bold text-[var(--warning)]">
                          Em branco
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          goToQuizQuestion(idx);
                          setShowReviewBoard(false);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors"
                        title="Ir para a questão no simulado"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Abrir questão
                      </button>
                    </div>
                  </div>

                  <p className="m-0 mb-2.5 text-[12.5px] leading-relaxed text-[var(--muted)] line-clamp-2">
                    {preview}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--line)]/60">
                    <span className="text-[11px] font-bold text-[var(--muted)] mr-1">
                      Alterar alternativa:
                    </span>
                    {letters.map((letra) => {
                      const selected = ans?.resposta === letra;
                      return (
                        <button
                          key={letra}
                          type="button"
                          onClick={() => changeQuizAnswer(idx, letra)}
                          className={`min-w-[34px] h-7 px-2.5 rounded-lg border text-[11.5px] font-extrabold transition-all cursor-pointer ${
                            selected
                              ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-xs scale-105'
                              : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                          }`}
                          title={`Marcar alternativa ${letra}`}
                        >
                          {isTF ? (letra === 'C' ? 'C - Certo' : 'E - Errado') : letra}
                        </button>
                      );
                    })}

                    {isMarked && (
                      <button
                        type="button"
                        onClick={() => changeQuizAnswer(idx, '')}
                        className="inline-flex items-center gap-1 ml-auto px-2 py-1 rounded-md text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--bad)] transition-colors"
                        title="Deixar questão em branco"
                      >
                        <Eraser className="w-3 h-3" />
                        Desmarcar
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 border-t border-[var(--line)]">
          <button
            type="button"
            onClick={() => setShowReviewBoard(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Continuar Respondendo (Voltar ao Simulado)
          </button>

          <button
            type="button"
            onClick={() => void handleConfirmFinish()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[13px] font-extrabold hover:bg-[var(--accent-hover)] transition-colors shadow-xs"
          >
            <CheckCircle2 className="w-4 h-4" />
            Confirmar e Entregar Simulado
          </button>
        </div>
      </Panel>
    );
  }

  const question = quiz.questions[quiz.index];
  const answer = quiz.answers[quiz.index];
  const options = extractOptions(question);
  const isTrueFalse = isTrueFalseQuestion(question, options);
  const statement = questionStatement(question);
  const progressPercent = Math.round(((quiz.index + 1) / quiz.questions.length) * 100);
  const isTrainingAnswered = !simulation && Boolean(answer);
  const isSubmittedSimulation = Boolean(quiz.submittedSimulationId);
  const isBuilderSimulation = simulation && !quiz.submittedSimulationId;
  const allowSelection = isSubmittedSimulation || isBuilderSimulation || !answer;

  const remainingSeconds = quiz.timeLimitSeconds && quiz.timeLimitSeconds > 0
    ? Math.max(0, quiz.timeLimitSeconds - (quiz.elapsedSeconds || 0))
    : null;

  return (
    <Panel className={examFocusMode ? 'mt-0 border-[var(--accent)]/40 shadow-lg' : 'mt-4'}>
      {examFocusMode && (
        <div className="mb-3 pb-2.5 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
          <div className="flex items-center gap-2 font-extrabold uppercase tracking-[0.05em] text-[var(--accent)]">
            <Maximize2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Modo Sala de Prova · Ambiente Livre de Distrações</span>
          </div>
          <button
            type="button"
            onClick={() => setExamFocusMode(false)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
          >
            <Minimize2 className="w-3.5 h-3.5 text-[var(--accent)]" />
            Sair da Sala de Prova (Esc)
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 text-[12px] text-[var(--muted)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-[var(--text)] tabular-nums">
            Questão {quiz.index + 1} de {quiz.questions.length} · {visibleName(question.materia)}
          </span>
          {simulation && quiz.banca && (
            <span className="px-2 py-0.5 rounded border border-[var(--line)] bg-[var(--panel-soft)] text-[10.5px] font-bold text-[var(--accent)]">
              {quiz.banca}
            </span>
          )}
          {simulation && (
            <button
              type="button"
              onClick={() => setShowReviewBoard(true)}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11.5px] font-bold text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors cursor-pointer"
              title="Abrir gabarito e conferência de todas as questões marcadas"
            >
              <ListChecks className="w-3.5 h-3.5" />
              Revisar Gabarito ({quiz.answers.filter((a) => Boolean(a?.resposta)).length}/{quiz.questions.length})
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {remainingSeconds !== null && (
            <span
              className={`font-mono-num font-bold px-2 py-0.5 rounded-md border ${
                remainingSeconds <= 300
                  ? 'border-[var(--bad)]/50 bg-[var(--bad)]/15 text-[var(--bad)] animate-pulse'
                  : remainingSeconds <= 900
                  ? 'border-[var(--warning)]/60 bg-[var(--warning)]/15 text-[var(--warning)]'
                  : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)]'
              }`}
              title="Tempo limite restante"
            >
              Restante: {formatClock(remainingSeconds)}
              {remainingSeconds <= 900 && remainingSeconds > 0 ? ' (!)' : ''}
            </span>
          )}
          <span className="font-mono-num">
            {formatClock(quiz.studySeconds)} · {progressPercent}%
          </span>
          {!examFocusMode && (
            <button
              type="button"
              onClick={() => setExamFocusMode(true)}
              title="Ativar Modo Sala de Prova (oculta menus e barras para foco total)"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Sala de Prova</span>
            </button>
          )}
        </div>
      </div>

      {simulation && remainingSeconds !== null && remainingSeconds <= 900 && (
        <div
          className={`ce-notice mb-3 text-[12px] font-semibold ${
            remainingSeconds <= 300 ? 'ce-notice-bad' : 'ce-notice-warning'
          }`}
        >
          ⏰ Atenção ao tempo: restam apenas {formatClock(remainingSeconds)} para finalizar o simulado.
        </div>
      )}

      <div className="h-1.5 rounded-full bg-[var(--panel-soft)] border border-[var(--line)] overflow-hidden mb-4">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div
        className={
          whiteboardEnabled
            ? 'grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.92fr)] gap-4 items-start'
            : ''
        }
      >
        <div className="min-w-0">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4">
            <p className="m-0 text-[14.5px] leading-relaxed text-[var(--text)] whitespace-pre-wrap">
              {statement}
            </p>
          </div>

          <div className="mt-3.5">
            {isTrueFalse ? (
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { key: 'C', label: 'Certo' },
                  { key: 'E', label: 'Errado' },
                ].map((opt) => {
                  const chosen = answer?.resposta === opt.key;
                  const isRight = answer && !simulation && answer.gabarito === opt.key;
                  const isWrong = answer && !simulation && chosen && !answer.correta;
                  let cls =
                    'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]';
                  if (simulation && chosen) {
                    cls = 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]';
                  } else if (isRight) {
                    cls = 'border-[var(--good)] bg-[var(--good)]/15 text-[var(--text)]';
                  } else if (isWrong) {
                    cls = 'border-[var(--bad)] bg-[var(--bad)]/15 text-[var(--text)]';
                  }

                  return (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={!allowSelection}
                      onClick={() => submitQuizAnswer(opt.key)}
                      className={`px-4 py-3 rounded-xl border text-[13.5px] font-bold transition-colors whitespace-nowrap disabled:cursor-default ${cls}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            ) : options.length > 0 ? (
              <div className="flex flex-col gap-2">
                {options.map((opt) => {
                  const chosen = answer?.resposta === opt.key;
                  const isRight = answer && !simulation && answer.gabarito === opt.key;
                  const isWrong = answer && !simulation && chosen && !answer.correta;
                  let cls =
                    'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]';
                  if (simulation && chosen) {
                    cls = 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]';
                  } else if (isRight) {
                    cls = 'border-[var(--good)] bg-[var(--good)]/15 text-[var(--text)]';
                  } else if (isWrong) {
                    cls = 'border-[var(--bad)] bg-[var(--bad)]/15 text-[var(--text)]';
                  }

                  return (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={!allowSelection}
                      onClick={() => submitQuizAnswer(opt.key)}
                      className={`flex items-start gap-2.5 w-full px-3.5 py-2.5 rounded-xl border text-left text-[13px] leading-snug transition-colors disabled:cursor-default ${cls}`}
                    >
                      <span className="font-mono-num font-extrabold text-[var(--accent)] shrink-0 mt-0.5">
                        [{opt.key}]
                      </span>
                      <span className="flex-1 min-w-0">{opt.text}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-2">
                {['A', 'B', 'C', 'D', 'E'].map((letter) => {
                  const chosen = answer?.resposta === letter;
                  const isRight = answer && !simulation && answer.gabarito === letter;
                  const isWrong = answer && !simulation && chosen && !answer.correta;
                  let cls =
                    'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]';
                  if (simulation && chosen) {
                    cls = 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]';
                  } else if (isRight) {
                    cls = 'border-[var(--good)] bg-[var(--good)]/15 text-[var(--text)]';
                  } else if (isWrong) {
                    cls = 'border-[var(--bad)] bg-[var(--bad)]/15 text-[var(--text)]';
                  }

                  return (
                    <button
                      key={letter}
                      type="button"
                      disabled={!allowSelection}
                      onClick={() => submitQuizAnswer(letter)}
                      className={`py-2.5 rounded-xl border font-mono-num text-[13px] font-bold transition-colors disabled:cursor-default ${cls}`}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {isTrainingAnswered && answer && (
            <div
              className={`ce-notice mt-3.5 ${
                answer.correta ? 'ce-notice-good' : 'ce-notice-bad'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-[var(--text)] mb-1">
                {answer.correta ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[var(--good)]" />
                    Resposta correta (Gabarito: {answer.gabarito})
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-[var(--bad)]" />
                    Resposta incorreta — Gabarito: {answer.gabarito} (registrada na Ouvidoria de Erros)
                  </>
                )}
              </div>
              {question.comentario && (
                <p className="m-0 text-[12.5px] leading-relaxed text-[var(--muted)]">
                  {question.comentario}
                </p>
              )}
            </div>
          )}

          {isSubmittedSimulation && (
            <div className="ce-notice ce-notice-accent mt-3.5 text-[12px]">
              {answer?.resposta
                ? `Resposta marcada: ${answer.resposta}. A correção completa será exibida ao finalizar o simulado.`
                : 'Simulado em andamento: gabarito e comentários ficam ocultos até a entrega.'}
            </div>
          )}

          {isBuilderSimulation && answer?.resposta && (
            <div className="ce-notice ce-notice-accent mt-3.5 text-[12px]">
              Resposta selecionada: <strong className="text-[var(--text)]">{answer.resposta}</strong>.
              Você ainda pode alterar antes de avançar.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-[var(--line)]">
            <button
              type="button"
              onClick={cancelQuizSession}
              className="px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap transition-colors"
            >
              Cancelar sessão
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {simulation && quiz.index > 0 && (
                <button
                  type="button"
                  onClick={previousQuizQuestion}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Questão anterior
                </button>
              )}

              {simulation && (
                <button
                  type="button"
                  onClick={() => {
                    changeQuizAnswer(quiz.index, '');
                    if (quiz.index + 1 >= quiz.questions.length) {
                      setShowReviewBoard(true);
                    } else {
                      advanceQuizQuestion();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--warning)]/50 bg-[var(--warning)]/10 text-[var(--warning)] text-[12px] font-bold hover:bg-[var(--warning)]/20 whitespace-nowrap transition-colors"
                  title="Deixar esta questão sem resposta (não pontua nem anula na regra CESPE) e avançar"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  Deixar em branco
                </button>
              )}

              {simulation && (
                <button
                  type="button"
                  onClick={() => setShowReviewBoard(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap transition-colors"
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  Gabarito ({quiz.answers.filter((a) => Boolean(a?.resposta)).length}/{quiz.questions.length})
                </button>
              )}

              {(answer || simulation) && (
                <button
                  type="button"
                  onClick={
                    simulation && quiz.index + 1 >= quiz.questions.length
                      ? () => setShowReviewBoard(true)
                      : advanceQuizQuestion
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap transition-colors shadow-xs"
                >
                  {simulation && quiz.index + 1 >= quiz.questions.length
                    ? 'Visualizar e revisar todas as questões'
                    : quiz.index + 1 >= quiz.questions.length
                    ? 'Finalizar e corrigir'
                    : 'Avançar'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              {!simulation && quiz.index + 1 < quiz.questions.length && (
                <button
                  type="button"
                  onClick={finishQuizSession}
                  className="px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                >
                  Encerrar treino agora
                </button>
              )}
            </div>
          </div>
        </div>

        {whiteboardEnabled && (
          <WhiteboardCanvas sessionKey={`${quiz.id}-${quiz.index}`} />
        )}
      </div>
    </Panel>
  );
};
