import { CompletedSimulation, SimulationQuestionResult } from '../types/study';
import { visibleName } from './parsers';

export interface SubjectTimeStat {
  materia: string;
  count: number;
  correct: number;
  wrong: number;
  blank: number;
  totalSeconds: number;
  avgSeconds: number;
  sharePercent: number;
  aboveAvg: boolean;
}

export interface SimulationTimeAnalysis {
  hasPerQuestionTiming: boolean;
  totalRecordedSeconds: number;
  avgSecondsPerQuestion: number;
  bySubject: SubjectTimeStat[];
  slowestQuestions: Array<{
    numero: number;
    materia: string;
    tempo_segundos: number;
    correta: boolean;
    resposta: string;
  }>;
  slowestSubject: SubjectTimeStat | null;
}

export function analyzeSimulationTiming(
  sim: Pick<CompletedSimulation, 'tempo_segundos' | 'questoes'>,
): SimulationTimeAnalysis {
  const questions: SimulationQuestionResult[] = sim.questoes || [];
  const recordedSum = questions.reduce(
    (sum, q) => sum + Math.max(0, Number(q.tempo_segundos || 0)),
    0,
  );
  const hasPerQuestionTiming = recordedSum > 0;
  const totalBase = hasPerQuestionTiming
    ? recordedSum
    : Math.max(0, Number(sim.tempo_segundos || 0));
  const avgSecondsPerQuestion = questions.length
    ? Math.round(totalBase / questions.length)
    : 0;

  const subjectMap = new Map<
    string,
    {
      materia: string;
      count: number;
      correct: number;
      wrong: number;
      blank: number;
      totalSeconds: number;
    }
  >();

  questions.forEach((q) => {
    const label = visibleName(q.materia || 'Geral') || 'Geral';
    const cur = subjectMap.get(label) || {
      materia: label,
      count: 0,
      correct: 0,
      wrong: 0,
      blank: 0,
      totalSeconds: 0,
    };
    cur.count += 1;
    if (q.correta) cur.correct += 1;
    else if (q.resposta) cur.wrong += 1;
    else cur.blank += 1;
    cur.totalSeconds += Math.max(0, Number(q.tempo_segundos || 0));
    subjectMap.set(label, cur);
  });

  const bySubject: SubjectTimeStat[] = [...subjectMap.values()]
    .map((entry) => {
      const avgSeconds = entry.count ? Math.round(entry.totalSeconds / entry.count) : 0;
      const sharePercent =
        recordedSum > 0 ? Math.round((entry.totalSeconds / recordedSum) * 100) : 0;
      return {
        ...entry,
        avgSeconds,
        sharePercent,
        aboveAvg: hasPerQuestionTiming && avgSecondsPerQuestion > 0 && avgSeconds > avgSecondsPerQuestion * 1.15,
      };
    })
    .sort((a, b) => b.avgSeconds - a.avgSeconds || b.totalSeconds - a.totalSeconds);

  const slowestQuestions = [...questions]
    .filter((q) => Number(q.tempo_segundos || 0) > 0)
    .sort((a, b) => Number(b.tempo_segundos || 0) - Number(a.tempo_segundos || 0))
    .slice(0, 5)
    .map((q) => ({
      numero: q.numero,
      materia: visibleName(q.materia || 'Geral') || 'Geral',
      tempo_segundos: Math.max(0, Number(q.tempo_segundos || 0)),
      correta: Boolean(q.correta),
      resposta: q.resposta || '',
    }));

  return {
    hasPerQuestionTiming,
    totalRecordedSeconds: recordedSum,
    avgSecondsPerQuestion,
    bySubject,
    slowestQuestions,
    slowestSubject: bySubject.length > 0 && hasPerQuestionTiming ? bySubject[0] : null,
  };
}
