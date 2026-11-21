import {
  EssayRecord,
  EssayRubricMode,
  EssayRubricScores,
  EssayType,
} from '../types/study';

export const ESSAY_BANKS = [
  'Cebraspe (CESPE)',
  'FGV',
  'FCC',
  'Vunesp',
  'CESGRANRIO',
  'IBFC',
  'AOCP',
  'Outra',
] as const;

export const ESSAY_TYPES: EssayType[] = [
  'Dissertação',
  'Estudo de Caso',
  'Questão Discursiva',
  'Peça / Parecer',
];

export const LINE_LIMIT_OPTIONS = [20, 30, 60] as const;

export const ESSAY_ERROR_TAGS = [
  'Crase',
  'Regência',
  'Concordância',
  'Pontuação',
  'Ortografia / Acentuação',
  'Coesão / Conectivos',
  'Fuga parcial ao tópico',
  'Falta de fundamentação legal',
  'Argumentação superficial',
  'Repetição vocabular',
  'Estouro / Falta de linhas',
  'Legibilidade / Margem',
] as const;

export interface SheetMetrics {
  estimatedLines: number;
  paragraphs: number;
  words: number;
  chars: number;
}

/**
 * Estimates physical exam sheet lines (roughly 74 characters per handwritten A4 line,
 * respecting explicit paragraph breaks).
 */
export function estimateSheetMetrics(text: string, charsPerLine = 74): SheetMetrics {
  const normalized = (text || '').replace(/\r\n/g, '\n');
  const trimmed = normalized.trim();
  if (!trimmed) {
    return { estimatedLines: 0, paragraphs: 0, words: 0, chars: 0 };
  }
  const rawLines = normalized.split('\n');
  let estimatedLines = 0;
  let paragraphs = 0;
  for (const raw of rawLines) {
    const clean = raw.trim();
    if (!clean) continue;
    paragraphs += 1;
    estimatedLines += Math.max(1, Math.ceil(clean.length / charsPerLine));
  }
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  return {
    estimatedLines,
    paragraphs,
    words,
    chars: trimmed.length,
  };
}

export function roundScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function computeRubricFinalScore(input: {
  mode: EssayRubricMode;
  notaMaxima: number;
  notaConteudo?: number;
  notaEstrutura?: number;
  notaGramatica?: number;
  numErrosGramaticais?: number;
  totalLinhas?: number;
  notaFinal?: number;
}): EssayRubricScores {
  const max = Math.max(1, Number(input.notaMaxima) || 30);

  if (input.mode === 'cebraspe') {
    const nc = Math.min(max, Math.max(0, Number(input.notaConteudo) || 0));
    const ne = Math.max(0, Math.round(Number(input.numErrosGramaticais) || 0));
    const tl = Math.max(1, Math.round(Number(input.totalLinhas) || 30));
    const penalty = (2 * ne) / tl;
    const final = roundScore(Math.max(0, nc - penalty));
    return {
      mode: 'cebraspe',
      notaMaxima: max,
      notaConteudo: roundScore(nc),
      numErrosGramaticais: ne,
      totalLinhas: tl,
      notaFinal: final,
    };
  }

  if (input.mode === 'criteria') {
    const c = Math.max(0, Number(input.notaConteudo) || 0);
    const e = Math.max(0, Number(input.notaEstrutura) || 0);
    const g = Math.max(0, Number(input.notaGramatica) || 0);
    const sum = roundScore(Math.min(max, c + e + g));
    return {
      mode: 'criteria',
      notaMaxima: max,
      notaConteudo: roundScore(c),
      notaEstrutura: roundScore(e),
      notaGramatica: roundScore(g),
      notaFinal: sum,
    };
  }

  const direct = roundScore(Math.min(max, Math.max(0, Number(input.notaFinal) || 0)));
  return {
    mode: 'simple',
    notaMaxima: max,
    notaFinal: direct,
  };
}

export function getEssayScorePct(essay: EssayRecord): number | null {
  if (!essay.rubrica || essay.rubrica.notaMaxima <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((essay.rubrica.notaFinal / essay.rubrica.notaMaxima) * 100)));
}

export function isEssayCorrected(essay: EssayRecord): boolean {
  return Boolean(
    essay.feedback.trim() ||
      essay.corrigido_arquivo ||
      (essay.rubrica && essay.rubrica.notaMaxima > 0 && essay.corrigida_em),
  );
}

export interface DiscursiveEvolutionPoint {
  id: string;
  label: string;
  dateShort: string;
  pct: number;
  score: number;
  max: number;
  rewritePct?: number;
}

export interface DiscursiveAnalytics {
  total: number;
  correctedCount: number;
  pendingCount: number;
  rewrittenCount: number;
  gradedCount: number;
  avgPct: number | null;
  bestPct: number | null;
  avgCebraspeErrorRate: number | null;
  totalTimedSeconds: number;
  evolution: DiscursiveEvolutionPoint[];
  errorTagCounts: Array<{ tag: string; count: number }>;
}

export function computeDiscursiveAnalytics(essays: EssayRecord[]): DiscursiveAnalytics {
  let correctedCount = 0;
  let rewrittenCount = 0;
  let totalTimedSeconds = 0;
  const pctList: number[] = [];
  const cebraspeRates: number[] = [];
  const tagMap = new Map<string, number>();

  for (const e of essays) {
    if (isEssayCorrected(e)) correctedCount += 1;
    if (e.reescrita && (e.reescrita.texto?.trim() || e.reescrita.arquivo)) {
      rewrittenCount += 1;
    }
    if (typeof e.tempo_segundos === 'number' && e.tempo_segundos > 0) {
      totalTimedSeconds += e.tempo_segundos;
    }
    const pct = getEssayScorePct(e);
    if (pct !== null) {
      pctList.push(pct);
    }
    if (
      e.rubrica?.mode === 'cebraspe' &&
      typeof e.rubrica.numErrosGramaticais === 'number' &&
      typeof e.rubrica.totalLinhas === 'number' &&
      e.rubrica.totalLinhas > 0
    ) {
      cebraspeRates.push(e.rubrica.numErrosGramaticais / e.rubrica.totalLinhas);
    }
    for (const tag of e.erros_tags || []) {
      const clean = tag.trim();
      if (!clean) continue;
      tagMap.set(clean, (tagMap.get(clean) || 0) + 1);
    }
  }

  const gradedChrono = essays
    .filter((e) => getEssayScorePct(e) !== null)
    .slice()
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    .slice(-12);

  const evolution: DiscursiveEvolutionPoint[] = gradedChrono.map((e, idx) => {
    const pct = getEssayScorePct(e) ?? 0;
    const max = e.rubrica?.notaMaxima || 30;
    const rewritePct =
      typeof e.reescrita?.notaFinal === 'number' && max > 0
        ? Math.min(100, Math.max(0, Math.round((e.reescrita.notaFinal / max) * 100)))
        : undefined;
    const datePart = (e.data || e.created_at || '').slice(0, 5) || `#${idx + 1}`;
    return {
      id: e.id,
      label: e.titulo,
      dateShort: datePart,
      pct,
      score: e.rubrica?.notaFinal ?? 0,
      max,
      rewritePct,
    };
  });

  const errorTagCounts = [...tagMap.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'pt-BR'));

  return {
    total: essays.length,
    correctedCount,
    pendingCount: essays.length - correctedCount,
    rewrittenCount,
    gradedCount: pctList.length,
    avgPct: pctList.length ? Math.round(pctList.reduce((s, v) => s + v, 0) / pctList.length) : null,
    bestPct: pctList.length ? Math.max(...pctList) : null,
    avgCebraspeErrorRate: cebraspeRates.length
      ? roundScore(cebraspeRates.reduce((s, v) => s + v, 0) / cebraspeRates.length)
      : null,
    totalTimedSeconds,
    evolution,
    errorTagCounts,
  };
}

export const CONNECTIVES_BANK: Array<{
  category: string;
  items: string[];
}> = [
  {
    category: 'Introdução & Contextualização',
    items: [
      'No ordenamento jurídico brasileiro,',
      'Sob a égide da Constituição Federal de 1988,',
      'No cenário contemporâneo da Administração Pública,',
      'Diante da relevância institucional do tema,',
      'Em análise inicial, impõe-se destacar que',
    ],
  },
  {
    category: 'Desenvolvimento & Continuidade',
    items: [
      'Em primeiro plano, cumpre observar que',
      'Outrossim, revela-se indispensável analisar',
      'Ademais, sob a perspectiva normativa,',
      'Nessa mesma linha de entendimento,',
      'Soma-se a isso o fato de que',
    ],
  },
  {
    category: 'Fundamentação Jurídica & Jurisprudencial',
    items: [
      'Nos termos expressos do art. [X] da [Norma],',
      'Conforme jurisprudência consolidada do STF/STJ,',
      'À luz dos princípios da legalidade e da eficiência,',
      'Segundo a doutrina administrativista majoritária,',
      'Em consonância com a Súmula [Nº] do [Tribunal],',
    ],
  },
  {
    category: 'Contraposição & Ressalva',
    items: [
      'Entretanto, não obstante a regra geral,',
      'Por outro lado, impende ressalvar que',
      'Contudo, a legislação excepciona os casos em que',
      'Ainda que se reconheça a relevância de tal medida,',
      'Todavia, a aplicação irrestrita desse critério',
    ],
  },
  {
    category: 'Causa, Consequência & Conclusão',
    items: [
      'Por conseguinte, evidencia-se que',
      'Dessa forma, conclui-se que',
      'Em síntese, diante dos fundamentos expostos,',
      'Portanto, faz-se imperioso que o Poder Público',
      'Logo, mostra-se juridicamente incabível/cabível',
    ],
  },
];

export const ESSAY_SKELETONS: Array<{
  id: string;
  name: string;
  description: string;
  template: string;
}> = [
  {
    id: 'dissertacao-cebraspe',
    name: 'Dissertação Padrão (4 parágrafos · 30 linhas)',
    description: 'Introdução com tese + 2 ou 3 parágrafos respondendo diretamente aos quesitos da banca + fechamento objetivo.',
    template: `No âmbito da Administração Pública brasileira, [contextualização direta do tema central], de modo que [tese / síntese dos quesitos exigidos pela banca].

Em primeiro plano, no que tange a [Quesito 1 do comando], cumpre destacar que [fundamentação legal/doutrinária]. Nesse sentido, [desenvolvimento prático ou jurisprudencial que responda integralmente ao tópico].

Ademais, quanto a [Quesito 2 do comando], verifica-se que [regra jurídica ou política pública aplicável]. Contudo, [exceção, limite ou mecanismo de controle relevante para a banca].

Por fim, acerca de [Quesito 3 / conclusão], conclui-se que [síntese objetiva das medidas ou efeitos jurídicos], assegurando-se o pleno atendimento aos princípios constitucionais aplicáveis.`,
  },
  {
    id: 'estudo-de-caso',
    name: 'Estudo de Caso Jurídico (Fato → Norma → Solução)',
    description: 'Estrutura objetiva para bancas como FCC, FGV e Cebraspe: resposta direta já na primeira frase de cada item.',
    template: `A pretensão/conduta descrita na situação hipotética apresenta-se [juridicamente cabível / incabível], com fundamento no art. [X] da [Lei/CF] e na jurisprudência dominante do [STF/STJ].

No tocante ao primeiro questionamento, [resposta afirmativa ou negativa direta]. Isso porque [exposição da regra legal, requisitos e eventuais exceções pertinentes ao caso concreto].

Quanto ao segundo ponto suscitado, [definição das consequências jurídicas, responsabilidades ou prazos aplicáveis]. Ressalte-se que [distinção relevante ou entendimento sumulado].

Diante do exposto, conclui-se que a medida juridicamente adequada consiste em [solução objetiva e completa para a situação apresentada].`,
  },
  {
    id: 'parecer-tecnico',
    name: 'Parecer / Peça Técnica (Relatório → Análise → Conclusão)',
    description: 'Ideal para carreiras de controle, tribunais e advocacia pública.',
    template: `1. RELATÓRIO E OBJETO DA CONSULTA
Trata-se de análise técnica acerca de [objeto da demanda], visando verificar a conformidade do ato/procedimento com o ordenamento jurídico vigente.

2. FUNDAMENTAÇÃO TÉCNICO-JURÍDICA
Preliminarmente, observa-se que [competência e enquadramento normativo principal]. No mérito, [análise detalhada dos requisitos legais, precedentes e riscos identificados].

3. CONCLUSÃO E ENCAMINHAMENTO
Ante o exposto, opina-se pela [aprovação / rejeição / saneamento com ressalvas], recomendando-se [providências concretas e prazo/responsável].`,
  },
];

export const FINAL_REVIEW_CHECKLIST = [
  'Todos os quesitos do comando da banca foram respondidos explicitamente?',
  'Cada parágrafo tem tópico frasal claro e início alinhado (recuo uniforme)?',
  'O texto respeita o limite mínimo e máximo de linhas (ex.: 20 a 30 linhas)?',
  'Foram citados artigos de lei, princípios ou súmulas pertinentes ao caso?',
  'Houve revisão de crase, regência verbal/nominal e concordância?',
  'As vírgulas não separam sujeito de verbo nem verbo de complemento?',
  'Foram eliminadas repetições de palavras próximas usando sinônimos/pronomes?',
  'A conclusão retoma a ideia central sem introduzir argumento novo solto?',
] as const;

export function formatTimerClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
