import {
  CaseLawItem,
  CompletedSimulation,
  ContestItem,
  CriticalPoint,
  ErrorNotebookEntry,
  LawItem,
  Question,
  StudyDatabase,
} from '../types/study';
import {
  localDateIso,
  normalizeSearch,
  paymentDateValue,
  questionStatement,
  visibleName,
} from './parsers';

// ============================================================================
// 1. Leitura Ativa da Lei Seca — Cloze (Prazos, Quóruns e Exceções de Prova)
// ============================================================================

export type ClozeCategory = 'deadline' | 'quorum' | 'exception' | 'rule';

export interface LawClozeToken {
  type: 'text' | 'cloze';
  text: string;
  category?: ClozeCategory;
  hint?: string;
  tokenIndex?: number;
}

const LAW_CLOZE_REGEX =
  /(\b(?:\d+(?:[.,]\d+)?\s*(?:%|por\s+cento)|\d+\s*\/\s*\d+|\d+(?:\s*\([^)]+\))?\s*(?:dias?(?:\s+[úu]teis|\s+corridos)?|meses|m[êe]s|anos?|horas?|minutos?)|(?:dois\s+ter[çc]os|tr[êe]s\s+quintos|um\s+ter[çc]o|um\s+quarto|maioria\s+(?:absoluta|simples|relativa)|unanimidade)|(?:salvo|exceto|excepcionalmente|ressalvad[oa]s?|vedad[oa]s?|proibid[oa]s?|defeso|n[ãa]o\s+se\s+aplica(?:m)?|imprescrit[íi]ve(?:l|is)|inafian[çc][áa]ve(?:l|is)|insuscet[íi]ve(?:l|is)|nul[oa]s?|anul[áa]ve(?:l|is)|independe(?:m|ntemente)?|prescinde(?:m)?)|(?:exclusivamente|privativamente|compet[êe]ncia\s+(?:exclusiva|privativa|comum|concorrente)|obrigatoriamente|facultativ[oa]|de\s+of[íi]cio|sempre|nunca|somente|apenas))\b)/gi;

export function classifyClozeTerm(term: string): { category: ClozeCategory; hint: string } {
  const lower = term.toLowerCase();
  if (/^\d+(?:\s*\([^)]+\))?\s*(?:dias?|meses|m[êe]s|anos?|horas?|minutos?)/.test(lower)) {
    return { category: 'deadline', hint: 'Prazo' };
  }
  if (
    /^\d+(?:[.,]\d+)?\s*(?:%|por\s+cento)/.test(lower) ||
    /^\d+\s*\/\s*\d+$/.test(lower) ||
    /^(?:dois\s+ter|tr[êe]s\s+quint|um\s+ter|um\s+quart|maioria|unanimidade)/.test(lower)
  ) {
    return { category: 'quorum', hint: 'Quórum / %' };
  }
  if (
    /^(?:salvo|exceto|excepcionalmente|ressalvad|vedad|proibid|defeso|n[ãa]o\s+se|imprescrit|inafian|insuscet|nul|anul|independe|prescinde)/.test(
      lower,
    )
  ) {
    return { category: 'exception', hint: 'Exceção / Vedação' };
  }
  return { category: 'rule', hint: 'Termo-chave' };
}

export function tokenizeLawCloze(text: string): { tokens: LawClozeToken[]; clozeCount: number } {
  if (!text) return { tokens: [], clozeCount: 0 };
  const parts = text.split(LAW_CLOZE_REGEX);
  if (parts.length <= 1) {
    return { tokens: [{ type: 'text', text }], clozeCount: 0 };
  }
  const tokens: LawClozeToken[] = [];
  let clozeIdx = 0;
  parts.forEach((part, idx) => {
    if (!part) return;
    if (idx % 2 === 1) {
      const { category, hint } = classifyClozeTerm(part);
      tokens.push({
        type: 'cloze',
        text: part,
        category,
        hint,
        tokenIndex: clozeIdx,
      });
      clozeIdx += 1;
    } else {
      tokens.push({ type: 'text', text: part });
    }
  });
  return { tokens, clozeCount: clozeIdx };
}

export function maskLawTextForFlashcard(text: string): string {
  const { tokens } = tokenizeLawCloze(text);
  return tokens
    .map((tk) => (tk.type === 'cloze' ? `[ ${tk.hint || '___'} ]` : tk.text))
    .join('');
}

// ============================================================================
// 2. Treino Inteligente "Cirúrgico" (Foco nas Fraquezas do Edital)
// ============================================================================

export interface SurgicalSubjectDiagnostic {
  subject: string;
  accuracyPct: number | null;
  attempts: number;
  dueErrors: number;
  highIncidenceMatches: number;
  selectedCount: number;
  reason: string;
}

export interface SurgicalTrainingPlan {
  questions: Question[];
  diagnostics: SurgicalSubjectDiagnostic[];
  totalCandidates: number;
}

export function buildSurgicalTrainingPlan(
  db: StudyDatabase,
  requestedCount = 20,
): SurgicalTrainingPlan {
  const todayIso = localDateIso();
  const count = Math.max(5, Math.min(100, requestedCount));

  // Collect all unique questions across bank + submitted simulations
  const seen = new Set<string>();
  const allPool: Question[] = [];
  const pushQ = (q: Question) => {
    const key = q.id || `${normalizeSearch(q.materia)}::${normalizeSearch(q.enunciado).slice(0, 120)}`;
    if (seen.has(key)) return;
    seen.add(key);
    allPool.push(q);
  };
  (db.questions || []).forEach(pushQ);
  (db.submittedSimulations || []).forEach((sim) => {
    (sim.questoes || []).forEach((q) => {
      pushQ({
        ...q,
        materia: q.materia || sim.materia || sim.titulo || 'Geral',
      });
    });
  });

  if (!allPool.length) {
    return { questions: [], diagnostics: [], totalCandidates: 0 };
  }

  // 1. Accuracy per subject from db.history
  const subjectAccuracy = new Map<string, { attempts: number; correct: number; label: string }>();
  (db.history || []).forEach((h) => {
    const key = normalizeSearch(h.subject || 'Geral');
    if (!key) return;
    const cur = subjectAccuracy.get(key) || {
      attempts: 0,
      correct: 0,
      label: visibleName(h.subject || 'Geral'),
    };
    cur.attempts += 1;
    if (h.correct) cur.correct += 1;
    subjectAccuracy.set(key, cur);
  });

  // 2. Pending / due errors per subject from db.annotations
  const dueErrorsBySubject = new Map<string, number>();
  const errorSnippets: string[] = [];
  (db.annotations || []).forEach((err) => {
    const isDue =
      (!err.corrigido && !err.correcao_prova) ||
      Boolean(err.proxima_revisao && err.proxima_revisao <= todayIso);
    if (!isDue) return;
    const key = normalizeSearch(err.materia || 'Geral');
    dueErrorsBySubject.set(key, (dueErrorsBySubject.get(key) || 0) + 1);
    const snippet = normalizeSearch(err.questao?.enunciado || err.texto || '').slice(0, 80);
    if (snippet.length >= 20) errorSnippets.push(snippet);
  });

  // 3. Very-High / High incidence keywords from db.laws
  const highIncidenceFolders = new Map<string, number>();
  const highIncidenceKeywords = new Set<string>();
  Object.entries(db.laws || {}).forEach(([folder, data]) => {
    const folderNorm = normalizeSearch(visibleName(folder));
    let veryHighCount = 0;
    (data?.items || []).forEach((item) => {
      if (item.grau === 'Muito Alto' || item.grau === 'Alto') {
        veryHighCount += item.grau === 'Muito Alto' ? 2 : 1;
        const art = normalizeSearch(item.artigo_base || item.dispositivo || '');
        if (art.length >= 4) highIncidenceKeywords.add(art);
      }
    });
    if (veryHighCount > 0) {
      highIncidenceFolders.set(folderNorm, veryHighCount);
    }
  });

  // 4. Score each question
  const scored = allPool.map((q) => {
    const subjNorm = normalizeSearch(q.materia || 'Geral');
    const stat = subjectAccuracy.get(subjNorm);
    const accuracyPct = stat && stat.attempts > 0 ? Math.round((stat.correct / stat.attempts) * 100) : null;
    const dueErrs = dueErrorsBySubject.get(subjNorm) || 0;

    let score = 20; // baseline
    // Weakness boost: lower accuracy -> much higher priority
    if (accuracyPct !== null) {
      score += Math.max(0, 100 - accuracyPct) * 1.15;
      if (accuracyPct < 60) score += 25;
      else if (accuracyPct < 75) score += 12;
    } else {
      // Untested subject gets mild exploration boost
      score += 22;
    }

    // Due error notebook boost
    score += Math.min(45, dueErrs * 12);

    // Direct match with an unresolved error snippet
    const stmtNorm = normalizeSearch(questionStatement(q));
    if (errorSnippets.some((sn) => stmtNorm.includes(sn.slice(0, 45)))) {
      score += 40;
    }

    // High-incidence law match boost
    let incidenceHits = 0;
    for (const [folderNorm, weight] of highIncidenceFolders.entries()) {
      if (folderNorm && (subjNorm.includes(folderNorm) || folderNorm.includes(subjNorm))) {
        incidenceHits += weight;
      }
    }
    if (incidenceHits > 0) {
      score += Math.min(24, incidenceHits * 3);
    }

    // Mild deterministic-free jitter so consecutive runs vary nicely while preserving priority
    score += Math.random() * 14;

    return { q, subjNorm, accuracyPct, dueErrs, incidenceHits, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Pick top N with mild cap per subject when multiple subjects exist so the set stays balanced
  const distinctSubjects = new Set(scored.map((s) => s.subjNorm)).size;
  const maxPerSubject = distinctSubjects >= 3 ? Math.max(3, Math.ceil(count * 0.45)) : count;
  const picked: typeof scored = [];
  const countBySubj = new Map<string, number>();

  for (const item of scored) {
    if (picked.length >= count) break;
    const used = countBySubj.get(item.subjNorm) || 0;
    if (used >= maxPerSubject) continue;
    picked.push(item);
    countBySubj.set(item.subjNorm, used + 1);
  }
  // Fill remaining slots if cap left room
  if (picked.length < count) {
    const pickedIds = new Set(picked.map((p) => p.q.id));
    for (const item of scored) {
      if (picked.length >= count) break;
      if (pickedIds.has(item.q.id)) continue;
      picked.push(item);
    }
  }

  // Build diagnostics summary by subject
  const diagMap = new Map<string, SurgicalSubjectDiagnostic>();
  picked.forEach((item) => {
    const label = visibleName(item.q.materia || 'Geral');
    const stat = subjectAccuracy.get(item.subjNorm);
    const existing = diagMap.get(item.subjNorm);
    if (existing) {
      existing.selectedCount += 1;
      return;
    }
    const reasons: string[] = [];
    if (item.accuracyPct !== null) {
      reasons.push(`${item.accuracyPct}% de acerto`);
    } else {
      reasons.push('pouco treinada');
    }
    if (item.dueErrs > 0) {
      reasons.push(`${item.dueErrs} erro(s) pendente(s)`);
    }
    if (item.incidenceHits > 0) {
      reasons.push('alta incidência na Lei Seca');
    }
    diagMap.set(item.subjNorm, {
      subject: label,
      accuracyPct: item.accuracyPct,
      attempts: stat?.attempts || 0,
      dueErrors: item.dueErrs,
      highIncidenceMatches: item.incidenceHits,
      selectedCount: 1,
      reason: reasons.join(' · '),
    });
  });

  const diagnostics = [...diagMap.values()].sort((a, b) => b.selectedCount - a.selectedCount);

  return {
    questions: picked.map((p) => p.q),
    diagnostics,
    totalCandidates: allPool.length,
  };
}

// ============================================================================
// 3. Simulador de Nota de Corte & Análise "E se eu não chutasse?"
// ============================================================================

export interface SubjectGuessingInsight {
  subject: string;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  answeredAccuracyPct: number;
  netCespeScore: number;
  /** Positive means guessing hurt net score (accuracy < 50% on answered items) */
  pointsLostToNegativeGuessing: number;
  recommendation: 'manter' | 'cautela' | 'deixar-em-branco';
}

export interface SimulationGuessingAnalysis {
  isCespeStyle: boolean;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  currentNetScore: number;
  currentNetPct: number;
  cutoffPoints: number;
  currentApproved: boolean;
  /** Counterfactual: leaving `avoidedWrongCount` wrong answers blank */
  avoidedWrongCount: number;
  simulatedNetScore: number;
  simulatedNetPct: number;
  simulatedGainPoints: number;
  simulatedApproved: boolean;
  pointsLostToPenalties: number;
  subjectInsights: SubjectGuessingInsight[];
  dangerSubjectsCount: number;
}

export function analyzeSimulationGuessingAndCutoff(
  sim: CompletedSimulation,
  cutoffPercent: number,
  leaveBlankWrongPct = 50,
): SimulationGuessingAnalysis {
  const questions = sim.questoes || [];
  const ceCount = questions.filter((q) => q.tipo === 'CE').length;
  const bancaNorm = normalizeSearch(sim.banca || '');
  const isCespeStyle =
    sim.pontos_liquidos !== undefined ||
    bancaNorm.includes('cebraspe') ||
    bancaNorm.includes('cespe') ||
    (questions.length > 0 && ceCount >= questions.length * 0.5);

  const total = Math.max(1, sim.total || questions.length || sim.acertos + sim.erros);
  const correct = sim.acertos || 0;
  const wrong = sim.erros || 0;
  const blank =
    sim.em_branco !== undefined ? sim.em_branco : Math.max(0, total - correct - wrong);

  const currentNetScore = isCespeStyle
    ? sim.pontos_liquidos !== undefined
      ? sim.pontos_liquidos
      : correct - wrong
    : correct;
  const currentNetPct = Math.round((Math.max(0, currentNetScore) / total) * 100);
  const cutoffPoints = Math.ceil((cutoffPercent / 100) * total);
  const currentApproved = isCespeStyle
    ? currentNetScore >= cutoffPoints
    : sim.aproveitamento >= cutoffPercent;

  const clampedPct = Math.max(0, Math.min(100, leaveBlankWrongPct));
  const avoidedWrongCount = Math.round((wrong * clampedPct) / 100);
  // In Cebraspe (1 errada anula 1 certa), every wrong answer converted to blank saves +1 net point!
  const simulatedGainPoints = isCespeStyle ? avoidedWrongCount : 0;
  const simulatedNetScore = currentNetScore + simulatedGainPoints;
  const simulatedNetPct = Math.round((Math.max(0, simulatedNetScore) / total) * 100);
  const simulatedApproved = isCespeStyle
    ? simulatedNetScore >= cutoffPoints
    : currentApproved;

  // Per-subject breakdown
  const bySubj = new Map<
    string,
    { subject: string; total: number; correct: number; wrong: number; blank: number }
  >();
  questions.forEach((q) => {
    const label = visibleName(q.materia || sim.materia || 'Geral') || 'Geral';
    const key = normalizeSearch(label) || 'geral';
    const cur = bySubj.get(key) || { subject: label, total: 0, correct: 0, wrong: 0, blank: 0 };
    cur.total += 1;
    if (!q.resposta || !String(q.resposta).trim()) {
      cur.blank += 1;
    } else if (q.correta) {
      cur.correct += 1;
    } else {
      cur.wrong += 1;
    }
    bySubj.set(key, cur);
  });

  const subjectInsights: SubjectGuessingInsight[] = [...bySubj.values()]
    .map((s) => {
      const answered = s.correct + s.wrong;
      const answeredAccuracyPct = answered > 0 ? Math.round((s.correct / answered) * 100) : 0;
      const netCespeScore = s.correct - s.wrong;
      const pointsLostToNegativeGuessing = netCespeScore < 0 ? Math.abs(netCespeScore) : 0;
      let recommendation: SubjectGuessingInsight['recommendation'] = 'manter';
      if (answered >= 2 && answeredAccuracyPct < 50) {
        recommendation = 'deixar-em-branco';
      } else if (answered >= 2 && answeredAccuracyPct < 65) {
        recommendation = 'cautela';
      }
      return {
        ...s,
        answeredAccuracyPct,
        netCespeScore,
        pointsLostToNegativeGuessing,
        recommendation,
      };
    })
    .sort((a, b) => a.netCespeScore - b.netCespeScore || b.wrong - a.wrong);

  const dangerSubjectsCount = subjectInsights.filter(
    (s) => s.recommendation === 'deixar-em-branco',
  ).length;

  return {
    isCespeStyle,
    total,
    correct,
    wrong,
    blank,
    currentNetScore,
    currentNetPct,
    cutoffPoints,
    currentApproved,
    avoidedWrongCount,
    simulatedNetScore,
    simulatedNetPct,
    simulatedGainPoints,
    simulatedApproved,
    pointsLostToPenalties: isCespeStyle ? wrong : 0,
    subjectInsights,
    dangerSubjectsCount,
  };
}

// ============================================================================
// 4. Modo Flashcards / Revisão Ativa (SRS) — Erros, Súmulas, Pontos e Lei Seca
// ============================================================================

export type FlashcardSource = 'errors' | 'caselaw' | 'critical' | 'laws';
export type FlashcardRating = 'hard' | 'medium' | 'easy';

export interface StudyFlashcard {
  id: string;
  source: FlashcardSource;
  sourceLabel: string;
  subject: string;
  title: string;
  front: string;
  frontMeta?: string;
  back: string;
  backExtra?: string;
  errorEntryId?: string;
  srsLevel: number;
  nextReviewIso?: string;
  isDue: boolean;
}

export function addDaysToIso(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateIso(d);
}

export function computeNextSrsSchedule(
  currentLevel: number,
  rating: FlashcardRating,
  todayIso = localDateIso(),
): { nextLevel: number; nextReviewIso: string; daysAdded: number } {
  const intervals = [1, 3, 7, 15, 30, 45];
  if (rating === 'hard') {
    return {
      nextLevel: 0,
      nextReviewIso: addDaysToIso(todayIso, 1),
      daysAdded: 1,
    };
  }
  if (rating === 'medium') {
    const nextLevel = Math.min(intervals.length - 1, Math.max(1, currentLevel + 1));
    const daysAdded = intervals[nextLevel];
    return {
      nextLevel,
      nextReviewIso: addDaysToIso(todayIso, daysAdded),
      daysAdded,
    };
  }
  const nextLevel = Math.min(intervals.length - 1, Math.max(2, currentLevel + 2));
  const daysAdded = intervals[nextLevel];
  return {
    nextLevel,
    nextReviewIso: addDaysToIso(todayIso, daysAdded),
    daysAdded,
  };
}

export function buildFlashcardDeck(
  db: StudyDatabase,
  sources: FlashcardSource[],
  subjectFilter = 'Todas',
  onlyDue = false,
): StudyFlashcard[] {
  const todayIso = localDateIso();
  const srsMap = db.preferences?.flashcard_srs || {};
  const srcSet = new Set(sources);
  const subjFilterNorm = subjectFilter !== 'Todas' ? normalizeSearch(subjectFilter) : '';
  const cards: StudyFlashcard[] = [];

  const matchesSubject = (subj: string) =>
    !subjFilterNorm || normalizeSearch(subj).includes(subjFilterNorm);

  if (srcSet.has('errors')) {
    (db.annotations || []).forEach((e: ErrorNotebookEntry) => {
      const subj = visibleName(e.materia || 'Geral') || 'Geral';
      if (!matchesSubject(subj)) return;
      const frontText =
        e.questao?.enunciado?.trim() ||
        `${e.tipo || 'Erro'} em ${subj}${e.origem ? ` (${e.origem})` : ''}`;
      const backParts: string[] = [];
      if (e.questao?.gabarito) {
        backParts.push(`Gabarito Oficial: ${e.questao.gabarito}`);
      }
      if (e.texto?.trim()) {
        backParts.push(e.texto.trim());
      }
      if (e.questao?.comentario?.trim()) {
        backParts.push(`Comentário: ${e.questao.comentario.trim()}`);
      }
      const nextRev = e.proxima_revisao || '';
      const isDue = !e.corrigido || !nextRev || nextRev <= todayIso;
      if (onlyDue && !isDue) return;
      cards.push({
        id: `err:${e.id}`,
        source: 'errors',
        sourceLabel: 'Caderno de Erros',
        subject: subj,
        title: e.tipo || 'Revisão de Erro',
        front: frontText,
        frontMeta: e.questao?.resposta ? `Sua resposta anterior: ${e.questao.resposta}` : e.origem,
        back: backParts.join('\n\n') || 'Sem anotação registrada.',
        errorEntryId: e.id,
        srsLevel: e.nivel_revisao || 0,
        nextReviewIso: nextRev || undefined,
        isDue,
      });
    });
  }

  if (srcSet.has('caselaw')) {
    (db.caseLaw || []).forEach((item: CaseLawItem) => {
      const subj = visibleName(item.categoria || item.tribunal || 'Jurisprudência') || 'Jurisprudência';
      if (!matchesSubject(subj)) return;
      const cardId = `lawcase:${item.id}`;
      const srs = srsMap[cardId];
      const isDue = !srs || srs.nextReviewIso <= todayIso;
      if (onlyDue && !isDue) return;
      cards.push({
        id: cardId,
        source: 'caselaw',
        sourceLabel: 'Súmulas & Jurisprudência',
        subject: subj,
        title: `${item.tribunal} · ${item.identificador}`,
        front: `${item.tribunal} — ${item.identificador}\n${item.titulo || 'Enuncie o entendimento consolidado'}`,
        frontMeta: item.fonte || undefined,
        back: item.texto || '',
        srsLevel: srs?.level || 0,
        nextReviewIso: srs?.nextReviewIso,
        isDue,
      });
    });
  }

  if (srcSet.has('critical')) {
    (db.criticalPoints || []).forEach((pt: CriticalPoint) => {
      const subj = visibleName(pt.materia || 'Geral') || 'Geral';
      if (!matchesSubject(subj)) return;
      const cardId = `crit:${pt.id}`;
      const srs = srsMap[cardId];
      const isDue = !srs || srs.nextReviewIso <= todayIso;
      if (onlyDue && !isDue) return;
      cards.push({
        id: cardId,
        source: 'critical',
        sourceLabel: 'Pontos Críticos',
        subject: subj,
        title: pt.titulo || 'Ponto Crítico',
        front: `Explique o ponto crítico / pegadinha:\n${pt.titulo}`,
        frontMeta: pt.data || undefined,
        back: pt.texto || '',
        srsLevel: srs?.level || 0,
        nextReviewIso: srs?.nextReviewIso,
        isDue,
      });
    });
  }

  if (srcSet.has('laws')) {
    Object.entries(db.laws || {}).forEach(([folder, data]) => {
      const subj = visibleName(folder);
      if (!matchesSubject(subj)) return;
      (data?.items || []).forEach((it: LawItem) => {
        if (it.grau !== 'Muito Alto' && it.grau !== 'Alto') return;
        const cardId = `law:${folder}:${it.id}`;
        const srs = srsMap[cardId];
        const isDue = !srs || srs.nextReviewIso <= todayIso;
        if (onlyDue && !isDue) return;
        const masked = maskLawTextForFlashcard(it.texto || '');
        cards.push({
          id: cardId,
          source: 'laws',
          sourceLabel: `Lei Seca (${it.grau})`,
          subject: subj,
          title: it.dispositivo || it.artigo_base || 'Dispositivo',
          front: `${subj} · ${it.dispositivo || it.artigo_base}\n\n${masked}`,
          frontMeta: 'Complete mentalmente os prazos, quóruns e exceções ocultos',
          back: it.texto || '',
          backExtra: [it.dica ? `Dica: ${it.dica}` : '', it.observacao ? `Obs.: ${it.observacao}` : '']
            .filter(Boolean)
            .join('\n'),
          srsLevel: srs?.level || 0,
          nextReviewIso: srs?.nextReviewIso,
          isDue,
        });
      });
    });
  }

  // Sort due cards first, then by lowest SRS level
  return cards.sort((a, b) => {
    if (a.isDue !== b.isDue) return a.isDue ? -1 : 1;
    return a.srsLevel - b.srsLevel;
  });
}

// ============================================================================
// 5. Meta Diária de Horas/Questões + Alerta de Ritmo até a Prova
// ============================================================================

export interface DailyGoalAndExamPaceSummary {
  todaySeconds: number;
  todayQuestions: number;
  dailyHoursGoal: number;
  dailyQuestionsGoal: number;
  hoursPct: number;
  questionsPct: number;
  avg7dHours: number;
  avg7dQuestions: number;
  marginDays: number;
  upcomingContests: Array<{ id: string; name: string; examDateBr: string; daysLeft: number }>;
  trackedContest: ContestItem | null;
  daysUntilExam: number | null;
  effectiveStudyDaysBeforeReview: number | null;
  totalEditalTopics: number;
  studiedEditalTopics: number;
  remainingEditalTopics: number;
  requiredTopicsPerDay: number;
  paceStatus: 'no-exam' | 'on-track' | 'attention' | 'final-sprint';
  paceHeadline: string;
  paceDetail: string;
}

export function computeDailyGoalAndExamPace(db: StudyDatabase): DailyGoalAndExamPaceSummary {
  const todayIso = localDateIso();
  const prefs = db.preferences;
  const dailyHoursGoal = Math.max(0.5, Number(prefs?.daily_hours_goal) || 3);
  const dailyQuestionsGoal = Math.max(5, Number(prefs?.daily_questions_goal) || 30);
  const marginDays = Math.max(0, Math.min(45, Number(prefs?.final_review_margin_days ?? 14)));

  // Today + last 7 days totals
  const last7Isos = new Set<string>();
  for (let i = 0; i < 7; i += 1) {
    last7Isos.add(addDaysToIso(todayIso, -i));
  }

  let todaySeconds = 0;
  let last7Seconds = 0;
  (db.studyTimeRecords || []).forEach((rec) => {
    const sec = (rec.allocations || []).reduce((s, a) => s + (a.seconds || 0), 0);
    if (rec.date === todayIso) todaySeconds += sec;
    if (last7Isos.has(rec.date)) last7Seconds += sec;
  });

  let todayQuestions = 0;
  let last7Questions = 0;
  (db.history || []).forEach((h) => {
    if (h.date === todayIso) todayQuestions += 1;
    if (last7Isos.has(h.date)) last7Questions += 1;
  });

  const hoursPct = Math.min(100, Math.round((todaySeconds / (dailyHoursGoal * 3600)) * 100));
  const questionsPct = Math.min(100, Math.round((todayQuestions / dailyQuestionsGoal) * 100));
  const avg7dHours = Number((last7Seconds / 3600 / 7).toFixed(1));
  const avg7dQuestions = Math.round(last7Questions / 7);

  // Upcoming exams from db.contests
  const todayMidnight = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const upcomingWithMeta = (db.contests || [])
    .map((c) => {
      const ts = paymentDateValue(c.data_abertura);
      return { contest: c, ts };
    })
    .filter((item): item is { contest: ContestItem; ts: number } =>
      item.ts !== null && item.ts >= todayMidnight,
    )
    .sort((a, b) => a.ts - b.ts)
    .map((item) => ({
      contest: item.contest,
      daysLeft: Math.max(0, Math.round((item.ts - todayMidnight) / 86400000)),
    }));

  const upcomingContests = upcomingWithMeta.map((u) => ({
    id: u.contest.id,
    name: u.contest.concurso,
    examDateBr: u.contest.data_abertura,
    daysLeft: u.daysLeft,
  }));

  const preferredId = prefs?.target_exam_contest_id;
  const chosen =
    (preferredId ? upcomingWithMeta.find((u) => u.contest.id === preferredId) : null) ||
    upcomingWithMeta[0] ||
    null;

  if (!chosen) {
    return {
      todaySeconds,
      todayQuestions,
      dailyHoursGoal,
      dailyQuestionsGoal,
      hoursPct,
      questionsPct,
      avg7dHours,
      avg7dQuestions,
      marginDays,
      upcomingContests,
      trackedContest: null,
      daysUntilExam: null,
      effectiveStudyDaysBeforeReview: null,
      totalEditalTopics: 0,
      studiedEditalTopics: 0,
      remainingEditalTopics: 0,
      requiredTopicsPerDay: 0,
      paceStatus: 'no-exam',
      paceHeadline: 'Cadastre a data da sua prova em Datas & Locais',
      paceDetail:
        'Com a data da prova e o Edital Verticalizado vinculados, o portal calcula automaticamente quantos tópicos e horas/dia faltam com margem para revisão final.',
    };
  }

  const pts = chosen.contest.edital_pontos || [];
  const totalEditalTopics = pts.length;
  const studiedEditalTopics = pts.filter((p) => p.estudado).length;
  const remainingEditalTopics = Math.max(0, totalEditalTopics - studiedEditalTopics);
  const daysUntilExam = chosen.daysLeft;
  const effectiveStudyDaysBeforeReview = Math.max(1, daysUntilExam - marginDays);
  const requiredTopicsPerDay =
    remainingEditalTopics > 0
      ? Number((remainingEditalTopics / effectiveStudyDaysBeforeReview).toFixed(1))
      : 0;

  let paceStatus: DailyGoalAndExamPaceSummary['paceStatus'] = 'on-track';
  let paceHeadline = 'Ritmo consistente dentro da meta';
  let paceDetail = '';

  if (daysUntilExam <= marginDays) {
    paceStatus = 'final-sprint';
    paceHeadline = `Reta Final ativada (faltam ${daysUntilExam} dia${daysUntilExam === 1 ? '' : 's'})`;
    paceDetail =
      'Priorize Revisão de Véspera, Caderno de Erros, Lei Seca de incidência Muito Alta e Súmulas recentes.';
  } else if (avg7dHours < dailyHoursGoal * 0.8) {
    const gapMin = Math.round((dailyHoursGoal - avg7dHours) * 60);
    paceStatus = 'attention';
    paceHeadline = `Atenção ao ritmo: acelere +${gapMin}min/dia`;
    paceDetail =
      remainingEditalTopics > 0
        ? `Sua média de 7 dias está em ${avg7dHours}h/dia (meta ${dailyHoursGoal}h/dia). Faltam ${remainingEditalTopics} tópico(s) para fechar o edital antes dos ${marginDays}d de revisão (${requiredTopicsPerDay} tópico(s)/dia).`
        : `Sua média de 7 dias está em ${avg7dHours}h/dia frente à meta de ${dailyHoursGoal}h/dia até a prova (${chosen.contest.data_abertura}).`;
  } else {
    paceStatus = 'on-track';
    paceHeadline = `Ritmo em dia (${avg7dHours}h/dia nos últimos 7 dias)`;
    paceDetail =
      remainingEditalTopics > 0
        ? `Restam ${remainingEditalTopics} tópico(s) do edital para concluir em ${effectiveStudyDaysBeforeReview} dias úteis antes da margem de ${marginDays}d de revisão (${requiredTopicsPerDay} tópico(s)/dia).`
        : `Edital verticalizado concluído ou pronto para revisões intensivas até ${chosen.contest.data_abertura}.`;
  }

  return {
    todaySeconds,
    todayQuestions,
    dailyHoursGoal,
    dailyQuestionsGoal,
    hoursPct,
    questionsPct,
    avg7dHours,
    avg7dQuestions,
    marginDays,
    upcomingContests,
    trackedContest: chosen.contest,
    daysUntilExam,
    effectiveStudyDaysBeforeReview,
    totalEditalTopics,
    studiedEditalTopics,
    remainingEditalTopics,
    requiredTopicsPerDay,
    paceStatus,
    paceHeadline,
    paceDetail,
  };
}

// ============================================================================
// 6. Caderno de Revisão de Véspera (Reta Final — Consolidado A4)
// ============================================================================

export interface FinalSprintLawEntry {
  folder: string;
  folderLabel: string;
  item: LawItem;
}

export interface FinalSprintBundle {
  criticalPoints: CriticalPoint[];
  caseLaw: CaseLawItem[];
  unresolvedErrors: ErrorNotebookEntry[];
  veryHighLaws: FinalSprintLawEntry[];
  availableSubjects: string[];
}

export function buildFinalSprintBundle(
  db: StudyDatabase,
  subjectFilter = 'Todas',
  search = '',
  caseLawLimit = 30,
): FinalSprintBundle {
  const subjNorm = subjectFilter !== 'Todas' ? normalizeSearch(subjectFilter) : '';
  const queryNorm = normalizeSearch(search);

  const subjectSet = new Set<string>();
  const addSubj = (s?: string) => {
    const clean = visibleName(s || '').trim();
    if (clean) subjectSet.add(clean);
  };

  (db.criticalPoints || []).forEach((p) => addSubj(p.materia));
  (db.caseLaw || []).forEach((c) => addSubj(c.categoria));
  (db.annotations || []).forEach((e) => addSubj(e.materia));
  Object.keys(db.laws || {}).forEach((f) => addSubj(f));

  const matches = (subj: string, haystack: string) => {
    if (subjNorm && !normalizeSearch(subj).includes(subjNorm)) return false;
    if (queryNorm && !normalizeSearch(haystack).includes(queryNorm)) return false;
    return true;
  };

  const criticalPoints = (db.criticalPoints || []).filter((p) =>
    matches(visibleName(p.materia || ''), `${p.materia} ${p.titulo} ${p.texto}`),
  );

  const caseLaw = [...(db.caseLaw || [])]
    .sort((a, b) => (b.atualizado_em || b.criado_em || '').localeCompare(a.atualizado_em || a.criado_em || ''))
    .filter((c) =>
      matches(
        visibleName(c.categoria || c.tribunal || ''),
        `${c.categoria} ${c.tribunal} ${c.identificador} ${c.titulo} ${c.texto}`,
      ),
    )
    .slice(0, caseLawLimit);

  const unresolvedErrors = (db.annotations || []).filter((e) => {
    if (e.corrigido) return false;
    return matches(
      visibleName(e.materia || ''),
      `${e.materia} ${e.tipo} ${e.texto} ${e.questao?.enunciado || ''} ${e.questao?.comentario || ''}`,
    );
  });

  const veryHighLaws: FinalSprintLawEntry[] = [];
  Object.entries(db.laws || {}).forEach(([folder, data]) => {
    const folderLabel = visibleName(folder);
    (data?.items || []).forEach((item) => {
      if (item.grau !== 'Muito Alto') return;
      if (
        !matches(
          folderLabel,
          `${folderLabel} ${item.dispositivo} ${item.artigo_base} ${item.texto} ${item.dica} ${item.observacao}`,
        )
      ) {
        return;
      }
      veryHighLaws.push({ folder, folderLabel, item });
    });
  });

  return {
    criticalPoints,
    caseLaw,
    unresolvedErrors,
    veryHighLaws,
    availableSubjects: [...subjectSet].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  };
}
