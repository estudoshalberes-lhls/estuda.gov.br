import {
  ContestEditalPoint,
  ContestItem,
  EditalLawLink,
  IncidenceGrade,
  LawItem,
  Question,
  QuestionAlternative,
  QuestionType,
  ScheduleMap,
  ScheduleTopic,
  WeekdayName,
  WeeklyScheduleFileRecord,
} from '../types/study';

export const WEEKDAYS: WeekdayName[] = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
];

export const INCIDENCE_GRADES: IncidenceGrade[] = [
  'Não Classificado',
  'Muito Alto',
  'Alto',
  'Médio',
  'Baixo',
];

export const DEFAULT_FIXED_SUBJECTS: string[] = [
  'Direito Constitucional',
  'Direito Administrativo',
  'Direito Penal',
  'Direito Processual Penal',
  'Legislação Penal Especial',
  'Direitos Humanos',
  'Língua Portuguesa',
  'Raciocínio Lógico e Matemático',
  'Informática',
  'Contabilidade Geral',
  'Estatística',
  'Arquivologia',
  'Medicina Legal',
  'Criminologia',
  'Redação / Discursiva',
];

export function inferFixedSubjectFromTopic(
  topic: Pick<ScheduleTopic, 'disciplina_fixa' | 'materia'>,
  knownSubjects: string[] = DEFAULT_FIXED_SUBJECTS,
): string {
  const explicit = String(topic.disciplina_fixa || '').trim();
  if (explicit) return explicit;
  const raw = visibleName(topic.materia || '');
  if (!raw) return '';
  const normRaw = normalizeSearch(raw);
  for (const subj of knownSubjects) {
    const normSubj = normalizeSearch(subj);
    if (!normSubj) continue;
    if (
      normRaw === normSubj ||
      normRaw.startsWith(`${normSubj} -`) ||
      normRaw.startsWith(`${normSubj} —`) ||
      normRaw.startsWith(`${normSubj}:`) ||
      normRaw.startsWith(`${normSubj} (`)
    ) {
      return visibleName(subj);
    }
  }
  const splitPrefix = raw.split(/\s*(?:—|–|:|\s-\s)\s*/)[0]?.trim() || '';
  if (splitPrefix && splitPrefix.length <= 42 && splitPrefix !== raw) {
    return splitPrefix;
  }
  return '';
}

export function uid(length = 16): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, length);
  }
  return Math.random().toString(36).slice(2, 2 + length).padEnd(length, '0');
}

export function visibleName(name: string): string {
  return String(name || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function displayBaseName(name: string): string {
  return visibleName(String(name || '').replace(/\.[^.]+$/, ''));
}

export function normalizeSearch(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanSafeName(value: string, fallback = 'Item'): string {
  const cleaned = String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

const RESERVED_BACKUP_FOLDER_KEYS = new Set([
  'backups',
  'backup',
  'backup geral',
  'central de estudos materiais',
  'central de estudos sigma verce',
  'central de estudos',
]);

function normalizeFolderKeyForComparison(value: string): string {
  return normalizeSearch(visibleName(value))
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isReservedBackupFolderName(
  folderName: string,
  extraBaseNames: Array<string | null | undefined> = [],
  files?: Array<{ name?: string; blobKey?: string }>,
): boolean {
  const norm = normalizeFolderKeyForComparison(folderName);
  if (!norm) return false;
  if (RESERVED_BACKUP_FOLDER_KEYS.has(norm)) return true;

  for (const extra of extraBaseNames) {
    const extraNorm = normalizeFolderKeyForComparison(extra || '');
    if (extraNorm && norm === extraNorm) return true;
  }

  if (files && files.length > 0) {
    const hasBackupArtifacts = files.some((f) => {
      const n = String(f.name || '').toLowerCase();
      return (
        n === 'central_estudos_sync_latest.json' ||
        n.startsWith('backup_central_estudos') ||
        n.startsWith('backup_incremental_central_estudos') ||
        n.includes('central_estudos_sync') ||
        n.startsWith('.central_estudos_')
      );
    });
    if (hasBackupArtifacts) return true;
  }

  return false;
}

export function incidenceColorClass(grade: string): string {
  const map: Record<string, string> = {
    'Muito Alto': 'very-high',
    Alto: 'high',
    Médio: 'medium',
    Baixo: 'low',
  };
  return map[grade] || 'unclassified';
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  return [hours, minutes, remaining].map((p) => String(p).padStart(2, '0')).join(':');
}

export function formatUploadSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
}

export function localDateIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localDateBrazilian(date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function localDateTimeBrazilian(date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${localDateBrazilian(date)} ${hh}:${mm}`;
}

export function goalDateIso(value: string): string {
  const date = String(value || '').trim();
  const br = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

export function dateInputToBrazilian(value: string): string {
  const date = String(value || '').trim();
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : date;
}

export function paymentDateValue(value: string): number | null {
  const text = String(value || '').trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  match = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime();
  match = text.match(/^(\d{1,2})[/. -](\d{1,2})$/);
  if (match) return new Date(new Date().getFullYear(), Number(match[2]) - 1, Number(match[1])).getTime();
  return null;
}

export function weekStartIso(value?: string): string {
  const date = new Date(`${value || localDateIso()}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return localDateIso(date);
}

export function isoWeekInputValue(value: string): string {
  const monday = new Date(`${weekStartIso(value)}T12:00:00`);
  const thursday = new Date(monday);
  thursday.setDate(thursday.getDate() + 3);
  const weekYear = thursday.getFullYear();
  const januaryFourth = new Date(weekYear, 0, 4, 12);
  const firstMonday = new Date(januaryFourth);
  firstMonday.setDate(firstMonday.getDate() - ((firstMonday.getDay() + 6) % 7));
  const weekNumber = Math.round((monday.getTime() - firstMonday.getTime()) / 604800000) + 1;
  return `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
}

export function isoWeekStartDate(value: string): string {
  const match = String(value || '').match(/^(\d{4})-W(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return '';
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const weekday = (januaryFourth.getUTCDay() + 6) % 7;
  januaryFourth.setUTCDate(januaryFourth.getUTCDate() - weekday + (week - 1) * 7);
  const thursday = new Date(januaryFourth);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  if (thursday.getUTCFullYear() !== year) return '';
  return `${januaryFourth.getUTCFullYear()}-${String(januaryFourth.getUTCMonth() + 1).padStart(2, '0')}-${String(januaryFourth.getUTCDate()).padStart(2, '0')}`;
}

export function getWeekDatesFromMondayIso(mondayIso: string): Record<WeekdayName, string> {
  const startIso = weekStartIso(mondayIso || localDateIso());
  const base = new Date(`${startIso}T12:00:00`);
  const result = {} as Record<WeekdayName, string>;
  WEEKDAYS.forEach((day, index) => {
    const d = new Date(base);
    d.setDate(base.getDate() + index);
    result[day] = localDateBrazilian(d);
  });
  return result;
}

export function getWeekDatesForIsoWeek(weekValue: string): Record<WeekdayName, string> | null {
  const startIso = isoWeekStartDate(weekValue);
  if (!startIso) return null;
  return getWeekDatesFromMondayIso(startIso);
}

export function getCurrentWeekDates(): Record<WeekdayName, string> {
  return getWeekDatesFromMondayIso(weekStartIso(localDateIso()));
}

export function scheduleDurationSeconds(value: string): number {
  const text = String(value || '').trim().toLowerCase();
  const clock = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (clock) {
    return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] || 0);
  }
  const hours = text.match(/(\d+)\s*h/);
  const minutes = text.match(/(\d+)\s*(?:min|m)\b/);
  const seconds = text.match(/(\d+)\s*(?:s|seg)\b/);
  return (
    (hours ? Number(hours[1]) * 3600 : 0) +
    (minutes ? Number(minutes[1]) * 60 : 0) +
    (seconds ? Number(seconds[1]) : 0)
  );
}

export function formatScheduleDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}min`);
  if (remaining) parts.push(`${remaining}s`);
  return parts.join(' ') || '0min';
}

export function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function normalizeAnswer(raw: string): string {
  const answer = String(raw || '').trim().toUpperCase();
  if (answer.startsWith('E') && (answer.includes('ERRADO') || answer === 'E')) return 'E';
  if (answer.startsWith('C') && (answer.includes('CERTO') || answer === 'C')) return 'C';
  const match = answer.match(/\b([A-E])\b/);
  return match ? match[1] : answer;
}

export function normalizeQuestionOptions(prompt: string): string {
  const marker = /(?:^|[^\w])(?:\(([A-E])\)|([A-E])[).:\-])\s+/gi;
  const matches = [...prompt.matchAll(marker)];
  const labels = new Set(matches.map((m) => (m[1] || m[2]).toUpperCase()));
  if (labels.size >= 2) {
    return prompt.replace(/(?<!\w)(?:\(([A-E])\)|([A-E])[).:\-])\s+/gi, (_, g1, g2) => `[${(g1 || g2).toUpperCase()}] `);
  }

  const bareMarker = /^[ \t]*([A-E])(?=[ \t]+)/gm;
  const bareMatches = [...prompt.matchAll(bareMarker)];
  for (let index = 0; index <= bareMatches.length - 5; index++) {
    const seq = bareMatches.slice(index, index + 5);
    if (seq.map((m) => m[1]).join('') !== 'ABCDE') continue;
    let emptyGap = false;
    for (let o = 0; o < 4; o++) {
      const start = (seq[o].index ?? 0) + seq[o][0].length;
      const end = seq[o + 1].index ?? prompt.length;
      if (!prompt.slice(start, end).trim()) {
        emptyGap = true;
        break;
      }
    }
    if (emptyGap) continue;
    let normalized = prompt;
    for (let o = seq.length - 1; o >= 0; o--) {
      const idx = seq[o].index ?? 0;
      const full = seq[o][0];
      const letterPos = idx + full.indexOf(seq[o][1]);
      normalized = `${normalized.slice(0, letterPos)}[${seq[o][1]}]${normalized.slice(letterPos + 1)}`;
    }
    return normalized;
  }
  return prompt;
}

export function findExamOptionMatches(text: string): RegExpMatchArray[] {
  const lineBracket = [...text.matchAll(/^[ \t]*\[([A-E])\][ \t]*/gim)];
  if (lineBracket.length >= 2) {
    const keys = lineBracket.map((m) => m[1].toUpperCase()).join('');
    if (keys.endsWith('ABCDE')) return lineBracket.slice(-5);
    if (keys.endsWith('ABCD')) return lineBracket.slice(-4);
  }
  const lineParen = [...text.matchAll(/^[ \t]*\(([A-E])\)[ \t]*/gim)];
  if (lineParen.length >= 2) {
    const keys = lineParen.map((m) => m[1].toUpperCase()).join('');
    if (keys.endsWith('ABCDE')) return lineParen.slice(-5);
    if (keys.endsWith('ABCD')) return lineParen.slice(-4);
  }
  const inlineBracket = [...text.matchAll(/(?:^|(?<=\s))\[([A-E])\][ \t]*/gi)];
  if (inlineBracket.length >= 2) {
    const keys = inlineBracket.map((m) => m[1].toUpperCase()).join('');
    if (keys.endsWith('ABCDE')) return inlineBracket.slice(-5);
    if (keys.endsWith('ABCD')) return inlineBracket.slice(-4);
  }
  const optPattern = /(?<!\w)(?:\(([A-E])\)|\[([A-E])\]|([A-E])[).\-\u2013\u2014])[ \t]*/gi;
  return [...text.matchAll(optPattern)];
}

export function splitExamQuestion(promptInput: string): { statement: string; alternatives: QuestionAlternative[] } {
  if (!promptInput) return { statement: '', alternatives: [] };

  const buildFromMatches = (
    matches: RegExpMatchArray[],
    content: string,
    targetSeq: string,
  ): { statement: string; alternatives: QuestionAlternative[] } => {
    const alternatives: QuestionAlternative[] = [];
    for (let i = 0; i < matches.length; i++) {
      const start = (matches[i].index ?? 0) + matches[i][0].length;
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? content.length) : content.length;
      const text = content.slice(start, end).replace(/\s+/g, ' ').trim();
      alternatives.push({ letra: targetSeq[i], texto: text });
    }
    const firstIdx = matches[0].index ?? 0;
    const statement = content.slice(0, firstIdx).trim();
    return { statement, alternatives };
  };

  // Strategy 1: Line-start bracketed [A] ... [E]
  const lineBracket = [...promptInput.matchAll(/^[ \t]*\[([A-E])\][ \t]*/gim)];
  if (lineBracket.length >= 2) {
    for (const len of [5, 4, 3]) {
      const targetSeq = 'ABCDE'.slice(0, len);
      for (let i = lineBracket.length - len; i >= 0; i--) {
        const slice = lineBracket.slice(i, i + len);
        if (slice.map((m) => m[1].toUpperCase()).join('') === targetSeq) {
          return buildFromMatches(slice, promptInput, targetSeq);
        }
      }
    }
  }

  // Strategy 2: Line-start parentheses (A) ... (E)
  const lineParen = [...promptInput.matchAll(/^[ \t]*\(([A-E])\)[ \t]*/gim)];
  if (lineParen.length >= 2) {
    for (const len of [5, 4, 3]) {
      const targetSeq = 'ABCDE'.slice(0, len);
      for (let i = lineParen.length - len; i >= 0; i--) {
        const slice = lineParen.slice(i, i + len);
        if (slice.map((m) => m[1].toUpperCase()).join('') === targetSeq) {
          return buildFromMatches(slice, promptInput, targetSeq);
        }
      }
    }
  }

  // Strategy 3: Line-start letter with delimiter A) / A. / A- / A:
  const lineLetter = [...promptInput.matchAll(/^[ \t]*([A-E])[).:\-–—][ \t]+/gim)];
  if (lineLetter.length >= 2) {
    for (const len of [5, 4, 3]) {
      const targetSeq = 'ABCDE'.slice(0, len);
      for (let i = lineLetter.length - len; i >= 0; i--) {
        const slice = lineLetter.slice(i, i + len);
        if (slice.map((m) => m[1].toUpperCase()).join('') === targetSeq) {
          return buildFromMatches(slice, promptInput, targetSeq);
        }
      }
    }
  }

  // Strategy 4: Inline bracketed [A] ... [E]
  const inlineBracket = [...promptInput.matchAll(/(?:^|(?<=\s))\[([A-E])\][ \t]*/gi)];
  if (inlineBracket.length >= 2) {
    for (const len of [5, 4, 3]) {
      const targetSeq = 'ABCDE'.slice(0, len);
      for (let i = inlineBracket.length - len; i >= 0; i--) {
        const slice = inlineBracket.slice(i, i + len);
        if (slice.map((m) => m[1].toUpperCase()).join('') === targetSeq) {
          return buildFromMatches(slice, promptInput, targetSeq);
        }
      }
    }
  }

  // Strategy 5: Inline parentheses (A) ... (E)
  const inlineParen = [...promptInput.matchAll(/(?:^|(?<=\s))\(([A-E])\)[ \t]*/gi)];
  if (inlineParen.length >= 2) {
    for (const len of [5, 4, 3]) {
      const targetSeq = 'ABCDE'.slice(0, len);
      for (let i = inlineParen.length - len; i >= 0; i--) {
        const slice = inlineParen.slice(i, i + len);
        if (slice.map((m) => m[1].toUpperCase()).join('') === targetSeq) {
          return buildFromMatches(slice, promptInput, targetSeq);
        }
      }
    }
  }

  return { statement: promptInput.trim(), alternatives: [] };
}

export function normalizeAlternatives(value: unknown): QuestionAlternative[] {
  if (!Array.isArray(value)) return [];
  const list: QuestionAlternative[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const key = String(record.letra || record.key || record.letter || '').trim().toUpperCase();
    const text = String(record.texto || record.text || '').trim();
    if (/^[A-E]$/.test(key) && text) {
      list.push({ letra: key, texto: text });
    }
  }
  return list;
}

export function extractOptions(question: Pick<Question, 'alternativas' | 'enunciado'> | string): Array<{ key: string; text: string }> {
  if (typeof question !== 'string' && Array.isArray(question?.alternativas) && question.alternativas.length) {
    return question.alternativas
      .map((opt) => ({
        key: String(opt.letra || '').toUpperCase(),
        text: String(opt.texto || '').trim(),
      }))
      .filter((opt) => /^[A-E]$/.test(opt.key) && opt.text);
  }
  const prompt = typeof question === 'string' ? question : String(question?.enunciado || '');
  const split = splitExamQuestion(prompt);
  if (split.alternatives.length >= 2) {
    return split.alternatives.map((a) => ({ key: a.letra, text: a.texto }));
  }
  const matches = [...prompt.matchAll(/\[([A-E])\]\s*/gi)];
  if (!matches.length) return [];
  const seen = new Set<string>();
  return matches
    .map((m, idx) => {
      const start = (m.index ?? 0) + m[0].length;
      const end = idx + 1 < matches.length ? (matches[idx + 1].index ?? prompt.length) : prompt.length;
      return { key: m[1].toUpperCase(), text: prompt.slice(start, end).trim() };
    })
    .filter((opt) => {
      if (seen.has(opt.key)) return false;
      seen.add(opt.key);
      return true;
    });
}

export function questionStatement(question: Pick<Question, 'alternativas' | 'enunciado'>): string {
  const prompt = String(question?.enunciado || '');
  if (Array.isArray(question?.alternativas) && question.alternativas.length) return prompt.trim();
  const split = splitExamQuestion(prompt);
  if (split.alternatives.length >= 2) {
    return split.statement;
  }
  const idx = prompt.search(/\[[A-E]\]\s*/i);
  return idx >= 0 ? prompt.slice(0, idx).trim() : prompt.trim();
}

export function isTrueFalseQuestion(
  question: Partial<Question>,
  options = extractOptions({ alternativas: question.alternativas || [], enunciado: question.enunciado || '' }),
): boolean {
  if (options.length >= 3) return false;
  if (String(question?.tipo || '').toUpperCase() === 'CE' && options.length === 0) return true;
  if (options.length === 2 && options[0].key === 'C' && options[1].key === 'E') {
    const labels = options.map((o) => o.text.trim().toLocaleLowerCase('pt-BR'));
    return /^(?:certo|correto|verdadeiro)$/.test(labels[0]) && /^(?:errado|incorreto|falso)$/.test(labels[1]);
  }
  return options.length === 0 && !(['A', 'B', 'D'].includes(String(question?.gabarito || '').toUpperCase()));
}

function detectQuestionType(prompt: string, answer: string, explicit = ''): QuestionType {
  if (explicit.toUpperCase() === 'ME' || explicit.toUpperCase() === 'CE') {
    return explicit.toUpperCase() as QuestionType;
  }
  const split = splitExamQuestion(prompt);
  if (split.alternatives.length >= 3 || ['A', 'B', 'D'].includes(answer.toUpperCase())) {
    return 'ME';
  }
  return 'CE';
}

function normalizeKeyAnswer(value: string): string {
  const upper = value.trim().toUpperCase();
  if (upper === 'CERTO') return 'C';
  if (upper === 'ERRADO') return 'E';
  return upper;
}

export function parseAnswerKeyWithMode(input: string): { answers: Record<number, string>; positional: boolean } {
  const text = String(input || '').replace(/[\u00a0\u2007\u202f]/g, ' ');
  const explicitPattern =
    /(?<!\w)(?:quest(?:ão|ao)?[ \t]*(?:n[º°o]?[.]?[ \t]*)?)?(\d{1,4})[ \t]*(?:[.,:)|\-–—][ \t]*|[ \t]+)(?:\(|\[|letra[ \t]+)?(CERTO|ERRADO|[A-E])\b(?:\)|\])?(?![a-zA-ZÀ-ÿ0-9])/gi;
  const explicit: Record<number, string> = {};
  for (const match of text.matchAll(explicitPattern)) {
    const number = Number(match[1]);
    const answer = normalizeKeyAnswer(match[2]);
    const previous = explicit[number];
    if (previous !== undefined && previous !== answer) {
      throw new Error(`O gabarito informa respostas diferentes para a questão ${number}.`);
    }
    explicit[number] = answer;
  }
  if (Object.keys(explicit).length > 0) {
    return { answers: explicit, positional: false };
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headingPattern = /^(?:gabarito|respostas?)(?:[ \t]+(?:oficial|definitivo|preliminar|da[ \t]+prova|das?[ \t]+questões?))*[ \t]*:?[ \t]*(.*)$/i;
  const seqLines: string[] = [];
  for (const line of lines) {
    const heading = line.match(headingPattern);
    if (heading) {
      if (heading[1].trim()) seqLines.push(heading[1].trim());
      continue;
    }
    seqLines.push(line);
  }

  const numberRow = /^\d{1,4}(?:[ \t,;|/]+\d{1,4})*$/;
  const answerRow = /^(?:CERTO|ERRADO|[A-E])(?:[ \t,;|/]+(?:CERTO|ERRADO|[A-E]))*$/i;
  for (let i = 0; i < seqLines.length - 1; i++) {
    if (!numberRow.test(seqLines[i]) || !answerRow.test(seqLines[i + 1])) continue;
    const nums = (seqLines[i].match(/\d{1,4}/g) || []).map(Number);
    const vals = seqLines[i + 1].match(/CERTO|ERRADO|[A-E]/gi) || [];
    if (nums.length === vals.length && new Set(nums).size === nums.length) {
      const mapped: Record<number, string> = {};
      nums.forEach((n, idx) => {
        mapped[n] = normalizeKeyAnswer(vals[idx]);
      });
      return { answers: mapped, positional: false };
    }
  }

  const sequence = seqLines.join(' ').trim();
  if (answerRow.test(sequence)) {
    const vals = sequence.match(/CERTO|ERRADO|[A-E]/gi) || [];
    const positionalMap: Record<number, string> = {};
    vals.forEach((val, idx) => {
      positionalMap[idx + 1] = normalizeKeyAnswer(val);
    });
    return { answers: positionalMap, positional: true };
  }

  return { answers: {}, positional: false };
}

function parsePipeLine(line: string, minFields: number): string[] | null {
  const parts = (line.includes('|||') ? line.split('|||') : line.split('|')).map((p) => p.trim());
  return parts.length >= minFields ? parts : null;
}

export function questionHeaderCount(prompt: string): number {
  return (prompt.match(/^[ \t]*(?:quest(?:ão|ao)|question)[ \t]+(?:n[º°o]?[.]?[ \t]*)?\d{1,4}\b/gim) || []).length;
}

function stripStructuredExamArtifacts(rawContent: string): string {
  return rawContent
    .replace(/^[ \t]*(?:enunciado|pergunta)\s*:\s*/i, '')
    .replace(/^[ \t]*alternativas\s*:\s*$/gim, '')
    .replace(/^[ \t]*tipo\s*:\s*(?:certo\s*\/\s*errado|m[úu]ltipla\s*escolha|ce|me)\s*$/gim, '')
    .replace(/^\s*\(n[úu]mero extra[íi]do:\s*\d+\)\s*/i, '')
    .trim();
}

function normalizeDescriptorText(value?: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isScheduleTxtDescriptor(
  fileName?: string,
  pathOrFolder?: string,
  content?: string,
): boolean {
  const cleanName = String(fileName || '')
    .trim()
    .replace(/^(?:LEI|PROVA|GABARITO|RESUMO|DISCURSIVA|CORRECAO)\s*-\s*/i, '')
    .trim();
  const normName = normalizeDescriptorText(cleanName);

  if (
    /^cronograma(?:\b|\s|[-–—_.:]|$)/i.test(normName) ||
    /\bcronograma\s*[-–—]\s*semana\b/i.test(normName) ||
    /\bcronograma\s+semanal\b/i.test(normName) ||
    /^semana\s+\d{1,2}\s*[-/]\s*\d{4}\b/i.test(normName)
  ) {
    return true;
  }

  if (pathOrFolder) {
    const folderParts = String(pathOrFolder)
      .split(/[/\\]/)
      .map((p) => normalizeDescriptorText(p))
      .filter(Boolean);
    if (folderParts.some((p) => p === 'cronogramas' || p === 'cronograma')) {
      return true;
    }
  }

  if (content) {
    const head = content.slice(0, 2500);
    if (
      /#\s*CRONOGRAMA SEMANAL\b/i.test(head) ||
      (/#\s*SEMANA:/i.test(head) && /#\s*DATAS_DIAS:/i.test(head)) ||
      /#\s*Formato:\s*Dia\s*\|\s*Data\s*\|\s*Assunto\s*\|\s*Tempo\b/i.test(head) ||
      /^(?:Segunda|Terça|Terca|Quarta|Quinta|Sexta|Sábado|Sabado|Domingo)-feira\s*\|\s*\d{2}\/\d{2}\/\d{4}\s*\|/im.test(
        head,
      )
    ) {
      return true;
    }
  }

  return false;
}

export function isContestOrEditalTxtDescriptor(
  fileName?: string,
  pathOrFolder?: string,
  content?: string,
): boolean {
  const cleanName = String(fileName || '')
    .trim()
    .replace(/^(?:LEI|PROVA|GABARITO|RESUMO|DISCURSIVA|CORRECAO)\s*-\s*/i, '')
    .trim();
  const normName = normalizeDescriptorText(cleanName);

  if (
    /^datas\s*(?:e|&)\s*locais(?:\b|\s|[-–—_.:]|$)/i.test(normName) ||
    /^edital(?:\b|\s|[-–—_.:]|$)/i.test(normName) ||
    normName.includes('controle geral de inscricoes') ||
    normName.includes('inscricoes boletos e locais') ||
    normName.includes('edital verticalizado')
  ) {
    return true;
  }

  if (pathOrFolder) {
    const folderParts = String(pathOrFolder)
      .split(/[/\\]/)
      .map((p) => normalizeDescriptorText(p))
      .filter(Boolean);
    if (
      folderParts.some(
        (p) =>
          p === 'datas e locais' ||
          p === 'datas & locais' ||
          p === 'editais' ||
          p === 'edital' ||
          p === 'inscricoes',
      )
    ) {
      return true;
    }
  }

  if (content) {
    const head = content.slice(0, 2500);
    if (
      /#\s*EDITAL VERTICALIZADO\b/i.test(head) ||
      /#\s*CONTROLE DE INSCRICOES\b/i.test(head) ||
      /#\s*PASTA DATAS\s*&\s*LOCAIS\b/i.test(head) ||
      /^[ \t]*(?:#\s*)?DATA_INSCRICAO_PROVA:/im.test(head) ||
      /^[ \t]*(?:#\s*)?VENCIMENTO_BOLETO:/im.test(head) ||
      /^[ \t]*(?:#\s*)?EDITAL_ARQUIVO:/im.test(head) ||
      (/^[ \t]*(?:#\s*)?LOCAL_PROVA:/im.test(head) &&
        /^[ \t]*(?:#\s*)?STATUS_PAGAMENTO:/im.test(head))
    ) {
      return true;
    }
  }

  return false;
}

export function parseUploadedQuestions(
  rawText: string,
  subject: string,
  externalAnswerMap?: Record<number, string>,
): Question[] {
  const text = rawText.replace(/^\ufeff/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (
    isScheduleTxtDescriptor(undefined, undefined, text) ||
    isContestOrEditalTxtDescriptor(undefined, undefined, text)
  ) {
    return [];
  }
  const validAnswers = new Set(['A', 'B', 'C', 'D', 'E']);
  const parsed: Question[] = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('{')) {
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        const rawPrompt = String(record.enunciado || '').trim();
        let alternatives = normalizeAlternatives(record.alternativas);
        let statement = rawPrompt;
        if (!alternatives.length) {
          const split = splitExamQuestion(normalizeQuestionOptions(rawPrompt));
          statement = split.statement;
          alternatives = split.alternatives;
        }
        const answer = normalizeAnswer(String(record.gabarito || ''));
        const explicit = String(record.tipo || '');
        if (statement && validAnswers.has(answer)) {
          parsed.push({
            id: uid(20),
            numero: parsed.length + 1,
            materia: subject,
            enunciado: statement,
            alternativas: alternatives,
            gabarito: answer,
            comentario: String(record.comentario || '').trim(),
            tipo:
              explicit.toUpperCase() === 'ME' || explicit.toUpperCase() === 'CE'
                ? (explicit.toUpperCase() as QuestionType)
                : alternatives.length
                  ? 'ME'
                  : detectQuestionType(statement, answer),
          });
        }
      } catch {
        continue;
      }
      continue;
    }

    const parts = parsePipeLine(line, 2);
    if (!parts) continue;
    const normPrompt = normalizeQuestionOptions(parts[0]);
    const { statement, alternatives } = splitExamQuestion(normPrompt);
    const answer = normalizeAnswer(parts[1]);
    if (statement && validAnswers.has(answer)) {
      const lastUpper = parts.length >= 4 ? parts[parts.length - 1].toUpperCase() : '';
      const explicit = lastUpper === 'ME' || lastUpper === 'CE' ? lastUpper : '';
      const comment = explicit
        ? parts.slice(2, -1).join(' | ').trim()
        : parts.slice(2).join(' | ').trim();
      parsed.push({
        id: uid(20),
        numero: parsed.length + 1,
        materia: subject,
        enunciado: statement,
        alternativas: alternatives,
        gabarito: answer,
        comentario: comment,
        tipo: explicit ? (explicit as QuestionType) : alternatives.length ? 'ME' : detectQuestionType(statement, answer),
      });
    }
  }
  if (parsed.length) return parsed;

  const uncommentedText = text
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n');

  let answerMap: Record<number, string> = externalAnswerMap ? { ...externalAnswerMap } : {};
  let questionText = uncommentedText;
  const answerSectionMatch = uncommentedText.match(
    /^[ \t]*(?:gabarito(?:\s+(?:oficial|definitivo|preliminar|da\s+prova|associado\s+[àa]\s+prova))?|respostas?)[ \t]*:?[ \t]*(.*)$/im,
  );
  if (answerSectionMatch && answerSectionMatch.index !== undefined) {
    const inlineKey = answerSectionMatch[1].trim();
    const afterSection = uncommentedText.slice(answerSectionMatch.index + answerSectionMatch[0].length);
    let parsedSectionMap: Record<number, string> = {};
    let hasNumberedKey = false;
    let isNotInformed = /^n[ãa]o informado\.?$/i.test(afterSection.trim());

    if (inlineKey) {
      try {
        parsedSectionMap = parseAnswerKeyWithMode(inlineKey).answers;
      } catch {
        parsedSectionMap = {};
      }
      hasNumberedKey = /(?<!\w)\d{1,4}\s*[-.):]?\s*(?:CERTO|ERRADO|[A-E])\b/i.test(inlineKey);
    }

    if (!Object.keys(parsedSectionMap).length && afterSection.trim() && !isNotInformed) {
      const afterLines: string[] = [];
      for (const line of afterSection.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        if (/^(?:quest(?:ão|ao)|question)[ \t]+\d{1,4}\b/i.test(t)) break;
        if (/^[-=_*]{3,}$/.test(t)) continue;
        afterLines.push(t);
      }
      const candidateText = afterLines.join('\n');
      if (candidateText) {
        try {
          parsedSectionMap = parseAnswerKeyWithMode(candidateText).answers;
        } catch {
          parsedSectionMap = {};
        }
        hasNumberedKey =
          Object.keys(parsedSectionMap).length > 0 &&
          /(?<!\w)\d{1,4}\s*(?:[-.):]|\s)+\s*(?:CERTO|ERRADO|[A-E])\b/i.test(candidateText);
      }
    }

    if (Object.keys(parsedSectionMap).length > 0) {
      answerMap = { ...answerMap, ...parsedSectionMap };
    }
    if ((Object.keys(parsedSectionMap).length > 0 && hasNumberedKey) || isNotInformed) {
      questionText = uncommentedText.slice(0, answerSectionMatch.index);
    }
  }

  // Strip buildStructuredExamTxt preamble lines if present
  questionText = questionText
    .replace(/^[ \t]*PROVA:[ \t]*.*$/gim, '')
    .replace(/^[ \t]*AVISO:[ \t]*foram encontradas numera[cç][õo]es repetidas.*$/gim, '')
    .replace(/^[ \t]*QUEST[ÕO]ES[ \t]*$/gim, '');

  const explicitQuestRegex =
    /^[ \t]*(?:quest(?:ão|ao)|question|q\.?)[ \t]*(?:n[º°o]?[.]?[ \t]*)?#?[ \t]*(\d{1,4})(?:[ \t]*\([^)]*extra[ií]do[^)]*\))?(?=[ \t.)\-:–—]|$)[ \t]*[.)\-:–—]?[ \t]*/gim;
  const hasQuestHeaders = explicitQuestRegex.test(questionText);
  explicitQuestRegex.lastIndex = 0;

  const starts = hasQuestHeaders
    ? [...questionText.matchAll(explicitQuestRegex)]
    : [...questionText.matchAll(/^[ \t]*(\d{1,3})(?:[.)\-:](?!\d)[ \t]*|[ \t]*$)/gim)];

  const blocks: Array<{ number: number; content: string }> = starts.length
    ? starts.map((s, idx) => {
        const startPos = (s.index ?? 0) + s[0].length;
        const endPos = idx + 1 < starts.length ? (starts[idx + 1].index ?? questionText.length) : questionText.length;
        return { number: Number(s[1]), content: questionText.slice(startPos, endPos).trim() };
      })
    : questionText.trim()
      ? [{ number: 1, content: questionText.trim() }]
      : [];

  for (const block of blocks) {
    const answerMatch = block.content.match(
      /^[ \t]*(?:gabarito(?:\s+(?:oficial|definitivo|preliminar))?|resposta(?:\s+correta)?|answer)\s*[:=-]\s*(?:\(|\[|letra\s+)?(CERTO|ERRADO|[A-E])(?:\)|\])?(?![a-zA-ZÀ-ÿ0-9])/im,
    );
    const answer = answerMatch ? normalizeAnswer(answerMatch[1]) : answerMap[block.number] || '';
    if (!validAnswers.has(answer)) continue;

    let content = block.content
      .replace(/^[ \t]*(?:gabarito(?:\s+(?:oficial|definitivo|preliminar))?|resposta(?:\s+correta)?|answer)\s*[:=-].*$/gim, '')
      .trim();
    let comment = '';
    const commentMatch = content.match(/^[ \t]*(?:coment[aá]rio|justificativa|explica[cç][aã]o)\s*[:=-]\s*(.*)$/im);
    if (commentMatch && commentMatch.index !== undefined) {
      comment = content
        .slice(commentMatch.index)
        .replace(/^[ \t]*(?:coment[aá]rio|justificativa|explica[cç][aã]o)\s*[:=-]\s*/i, '')
        .trim();
      content = content.slice(0, commentMatch.index).trim();
    }

    content = stripStructuredExamArtifacts(content);
    const { statement, alternatives } = splitExamQuestion(content);
    const cleanStatement = stripStructuredExamArtifacts(statement);
    if (cleanStatement) {
      parsed.push({
        id: uid(20),
        numero: block.number,
        materia: subject,
        enunciado: cleanStatement,
        alternativas: alternatives,
        gabarito: answer,
        comentario: comment,
        tipo: alternatives.length >= 2 ? 'ME' : detectQuestionType(cleanStatement, answer),
      });
    }
  }
  return parsed;
}

export function cleanRepeatedExamPageMargins(text: string): string {
  const pages = text.split('\f');
  if (pages.length < 2) return text;
  const norm = (line: string) => line.replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
  const marginCounts = new Map<string, number>();

  for (const page of pages) {
    const lines = page.split(/\r?\n/).filter((l) => l.trim());
    const margins = new Set([...lines.slice(0, 3), ...lines.slice(-3)].map(norm).filter(Boolean));
    for (const line of margins) {
      marginCounts.set(line, (marginCounts.get(line) || 0) + 1);
    }
  }
  const repeated = new Set([...marginCounts.entries()].filter(([, c]) => c >= 2).map(([k]) => k));
  const qHeader = /^[ \t]*(?:(?:quest(?:ão|ao)|question)[ \t]*(?:n[º°o]?[.]?[ \t]*)?#?[ \t]*\d{1,4}(?=[ \t.)\-:–—]|$)[ \t]*[.)\-:–—]?[ \t]*|\d{1,3}[ \t]*[.)\-:–—][ \t]+)/i;
  const keptHeaders = new Set<string>();

  return pages
    .map((page) => {
      const lines = page.split(/\r?\n/);
      const nonEmpty = lines.map((l, idx) => (l.trim() ? idx : -1)).filter((idx) => idx >= 0);
      const marginIndexes = new Set([...nonEmpty.slice(0, 3), ...nonEmpty.slice(-3)]);
      const kept: string[] = [];
      lines.forEach((line, idx) => {
        const key = norm(line);
        if (!marginIndexes.has(idx)) {
          kept.push(line);
          return;
        }
        if (/^(?:p[aá]gina\s*)?\d{1,4}$/i.test(key)) return;
        if (!repeated.has(key)) {
          kept.push(line);
          return;
        }
        if (qHeader.test(line) && !keptHeaders.has(key)) {
          keptHeaders.add(key);
          kept.push(line);
        }
      });
      return kept.join('\n');
    })
    .join('\n');
}

export interface ExtractedExamBlock {
  numero: number;
  enunciado: string;
  alternativas: QuestionAlternative[];
  gabarito: string;
  comentario: string;
  tipo: QuestionType;
}

export function extractExamQuestionBlocks(rawText: string, subject = 'Geral'): ExtractedExamBlock[] {
  let text = cleanRepeatedExamPageMargins(rawText);
  const answerSection = text.match(/^[ \t]*(?:gabarito|respostas?)(?:[ \t]+(?:oficial|preliminar|definitivo))?[ \t]*[:\-–—]?[ \t]*(?:(?=\d{1,4}[ \t]*[-:.)][ \t]*[A-E]\b|[A-E](?:[ \t]*[,;/][ \t]*[A-E]){2,}\b|[A-E](?:[ \t]+[A-E]){2,}\b).*)?$/im);
  if (answerSection && answerSection.index !== undefined) {
    text = text.slice(0, answerSection.index);
  }

  const headersPattern = /(?:^[ \t]*|(?<=[.!?]))(?:(?:quest(?:ão|ao)|question)[ \t]*(?:n[º°o]?[.]?[ \t]*)?#?[ \t]*(\d{1,4})(?=[ \t.)\-:–—]|$)[ \t]*[.)\-:–—]?[ \t]*|(\d{1,4})[ \t]*[.)\-:–—][ \t]*)/gim;
  const candidates = [...text.matchAll(headersPattern)];

  const hasQuestionStructure = (block: string) => {
    const { alternatives } = splitExamQuestion(block);
    return (
      alternatives.length >= 2 ||
      /\b(?:julgue|certo ou errado|certo\/errado)\b/i.test(block)
    );
  };

  const explicitStarts: RegExpMatchArray[] = [];
  for (const candidate of candidates) {
    if (!candidate[1]) continue;
    const pos = candidate.index ?? 0;
    const isLineHeader = pos === 0 || text.lastIndexOf('\n', pos - 1) === pos - 1;
    if (
      isLineHeader ||
      (explicitStarts.length &&
        hasQuestionStructure(
          text.slice((explicitStarts[explicitStarts.length - 1].index ?? 0) + explicitStarts[explicitStarts.length - 1][0].length, pos),
        ))
    ) {
      explicitStarts.push(candidate);
    }
  }

  let starts: RegExpMatchArray[] = explicitStarts;
  if (!starts.length) {
    const numberedStarts: number[] = [];
    const chainsByNumber = new Map<number, number[]>();
    const bestPathTo = new Map<number, { length: number; score: number; chain: number[] }>();

    candidates.forEach((cand, idx) => {
      const number = Number(cand[2]);
      if (!number || number < 1 || number > 300) return;
      let best = { length: 1, score: 0, chain: [idx] };
      for (const prevIdx of chainsByNumber.get(number - 1) || []) {
        const prev = bestPathTo.get(prevIdx)!;
        const prevEnd = (candidates[prevIdx].index ?? 0) + candidates[prevIdx][0].length;
        const segment = text.slice(prevEnd, cand.index ?? 0);
        const candPath = {
          length: prev.length + 1,
          score: prev.score + (hasQuestionStructure(segment) ? 1 : 0),
          chain: [...prev.chain, idx],
        };
        if (candPath.length > best.length || (candPath.length === best.length && candPath.score > best.score)) {
          best = candPath;
        }
      }
      bestPathTo.set(idx, best);
      const list = chainsByNumber.get(number) || [];
      list.push(idx);
      chainsByNumber.set(number, list);
      numberedStarts.push(idx);
    });

    let bestOverall = { length: 0, score: 0, chain: [] as number[] };
    for (const [idx, val] of bestPathTo.entries()) {
      const rem = text.slice((candidates[idx].index ?? 0) + candidates[idx][0].length);
      const finalScore = val.score + (hasQuestionStructure(rem) ? 1 : 0);
      if (val.length > bestOverall.length || (val.length === bestOverall.length && finalScore > bestOverall.score)) {
        bestOverall = { length: val.length, score: finalScore, chain: val.chain };
      }
    }
    if (bestOverall.chain.length >= 2) {
      starts = bestOverall.chain.map((i) => candidates[i]);
    } else if (numberedStarts.length === 1) {
      const c = candidates[numberedStarts[0]];
      if (hasQuestionStructure(text.slice((c.index ?? 0) + c[0].length))) {
        starts = [c];
      }
    }
  }

  const blocks: ExtractedExamBlock[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const number = Number(start[1] || start[2]);
    const begin = (start.index ?? 0) + start[0].length;
    const end = i + 1 < starts.length ? (starts[i + 1].index ?? text.length) : text.length;
    let block = text.slice(begin, end).trim();
    if (!block) continue;
    const { statement, alternatives } = splitExamQuestion(block);
    if (alternatives.length >= 2) {
      blocks.push({
        numero: number,
        enunciado: statement,
        alternativas: alternatives,
        gabarito: '',
        comentario: '',
        tipo: 'ME',
      });
    } else {
      blocks.push({
        numero: number,
        enunciado: statement || block.replace(/\s+/g, ' ').trim(),
        alternativas: [],
        gabarito: '',
        comentario: '',
        tipo: 'CE',
      });
    }
  }
  void subject;
  return blocks;
}

export function buildStructuredExamTxt(
  filename: string,
  blocks: ExtractedExamBlock[],
  answerMap: Record<number, string>,
  positional: boolean,
): string {
  const questionNumbers = blocks.map((b) => b.numero);
  const repeated = [...new Set(questionNumbers.filter((n) => questionNumbers.filter((x) => x === n).length > 1))].sort((a, b) => a - b);
  const orderedAnswers = Object.keys(answerMap)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => answerMap[k]);

  const out: string[] = [`PROVA: ${filename}`, ''];
  if (repeated.length) {
    out.push(
      `AVISO: foram encontradas numerações repetidas (${repeated.join(', ')}). As questões foram reindexadas pela ordem de extração; o gabarito explícito mantém os números originais e pode exigir revisão.`,
      '',
    );
  }
  out.push('QUESTÕES', '');
  blocks.forEach((q, idx) => {
    const displayNum = repeated.length ? idx + 1 : q.numero;
    const label = repeated.length ? `Questão ${displayNum} (número extraído: ${q.numero})` : `Questão ${displayNum}`;
    out.push(label, `Enunciado: ${q.enunciado}`);
    if (q.alternativas.length) {
      out.push('Alternativas:');
      q.alternativas.forEach((opt) => out.push(`[${opt.letra}] ${opt.texto}`));
    } else {
      out.push('Tipo: Certo/Errado');
    }
    out.push('');
  });
  out.push('GABARITO OFICIAL');
  if (Object.keys(answerMap).length) {
    if (positional) {
      blocks.forEach((q, idx) => {
        const number = repeated.length ? idx + 1 : q.numero;
        out.push(`${number}-${orderedAnswers[idx] || ''}`);
      });
    } else {
      Object.keys(answerMap)
        .map(Number)
        .sort((a, b) => a - b)
        .forEach((num) => out.push(`${num}-${answerMap[num]}`));
    }
  } else {
    out.push('Não informado.');
  }
  return out.join('\n') + '\n';
}

function normalizedWeekday(raw: string): WeekdayName | '' {
  const clean = normalizeSearch(raw);
  return WEEKDAYS.find((day) => normalizeSearch(day) === clean) || '';
}

export function parseScheduleText(text: string): Array<{ day: WeekdayName; topic: ScheduleTopic }> {
  const topics: Array<{ day: WeekdayName; topic: ScheduleTopic }> = [];
  const today = localDateBrazilian();
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, idx) => {
    const lineNumber = idx + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const fields = line.split('|').map((p) => p.trim());
    if (fields.length && ['dia', 'dia da semana'].includes(fields[0].toLowerCase())) return;
    if (![3, 4, 5, 6, 7, 8, 9].includes(fields.length)) {
      throw new Error(`Linha ${lineNumber}: use Dia | Matéria | Tempo [| Observações] ou Dia | Data | Matéria | Tempo | Observações.`);
    }
    const day = normalizedWeekday(fields[0]);
    if (!day) {
      throw new Error(`Linha ${lineNumber}: dia da semana inválido.`);
    }
    let date = today;
    let subject = '';
    let duration = '';
    let notes = '';
    let studiedSeconds = 0;
    let customDate = false;
    let disciplinaFixa = '';
    let concursoAlvo = '';
    if (fields.length >= 5) {
      date = fields[1] || today;
      subject = fields[2] || '';
      duration = fields[3] || '';
      notes = fields[4] || '';
      if (fields[5]) {
        const secNum = Number(fields[5]);
        if (Number.isFinite(secNum) && secNum > 0) studiedSeconds = Math.round(secNum);
      }
      if (fields[6]) {
        customDate = fields[6] === '1' || fields[6].toLowerCase() === 'sim' || fields[6].toLowerCase() === 'true';
      }
      if (fields[7]) {
        disciplinaFixa = fields[7];
      }
      if (fields[8]) {
        concursoAlvo = fields[8];
      }
    } else {
      subject = fields[1];
      duration = fields[2];
      notes = fields[3] || '';
    }
    if (!subject && !disciplinaFixa) {
      throw new Error(`Linha ${lineNumber}: informe a matéria ou assunto.`);
    }
    topics.push({
      day,
      topic: {
        id: uid(8),
        data: date || today,
        data_personalizada: customDate,
        ...(disciplinaFixa ? { disciplina_fixa: disciplinaFixa } : {}),
        ...(concursoAlvo ? { concurso_alvo: concursoAlvo } : {}),
        materia: subject || disciplinaFixa,
        tempo: duration,
        observacoes: notes,
        estudado_segundos: studiedSeconds > 0 ? studiedSeconds : undefined,
      },
    });
  });

  if (!topics.length) {
    throw new Error('O arquivo não contém linhas de cronograma válidas.');
  }
  return topics;
}

const LEGAL_PREPOSITION_OR_REF_RE =
  /^(?:art|arts|artigo|artigos|do|da|de|dos|das|no|na|nos|nas|ao|à|aos|às|pelo|pela|pelos|pelas|pro|pra|com|em|por|para|entre|sobre|sob|ante|até|apos|após|contra|desde|perante|conforme|segundo|mediante|salvo|exceto|ou|e|o|a|os|as|seu|sua|seus|suas|este|esta|estes|estas|esse|essa|esses|essas|aquele|aquela|aqueles|aquelas|vide|cf|cfr|cit|cujo|cuja|cujos|cujas|que|como|quanto|disposto|previsto|previstos|prevista|previstas|referido|referidos|referida|referidas|mencionado|mencionados|observado|observados|ressalvado|ressalvados|indicado|indicados|descrito|descritos|estabelecido|estabelecidos|caput|inciso|incisos|alínea|alinea|parágrafo|paragrafo|termos|forma)$/i;

export function cleanAndStructureLawText(rawText: string): string {
  if (!rawText) return '';

  let text = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/[\u00a0\u2007\u202f]/g, ' ');

  // Normalize stray spaces/dots between article/paragraph number and ordinal symbol (e.g. "Art. 1.º", "Art. 2 º", "§ 1.º")
  text = text
    .replace(/\b(Art|ART)\.?\s*(\d{1,4})\.\s*([º°ª])(?=\s|$|[-–—.,;:a-zA-Z])/g, '$1. $2$3')
    .replace(/\b(Art|ART)\.?\s*(\d{1,4})\s+([º°ª])(?=\s|$|[-–—.,;:a-zA-Z])/g, '$1. $2$3')
    .replace(/(§)\s*(\d{1,4})\.\s*([º°ª])/g, '$1 $2$3')
    .replace(/(§)\s*(\d{1,4})\s+([º°ª])/g, '$1 $2$3');

  // Split mid-line when a genuine device header follows sentence-ending punctuation, closing quotes/brackets, tabs, pipes, or an incidence grade
  const afterBoundary = '(?<=[.;:)!?>”"»\\]\\t|]|MUITO\\s+ALT[AO]|\\bALT[AO]|\\bM[ÉE]DI[AO]|\\bBAIX[AO])';
  const gluedArticlePattern = new RegExp(
    `${afterBoundary}[ \\t]*(?=(?:Art(?:igo)?|ART(?:IGO)?)\\.?\\s*\\d{1,4}(?:[º°ªo])?(?:-[A-Za-z0-9]+)*(?:\\s|[.:\\-–—]|$))`,
    'g',
  );
  const gluedParagraphPattern = new RegExp(
    `${afterBoundary}[ \\t]*(?=(?:§\\s*(?:\\d{1,4}(?:[º°ªo])?(?:-[A-Za-z0-9]+)*|[úu]nico)|Par[áa]grafo\\s+(?:\\d{1,4}|[úu]nico))\\b)`,
    'gi',
  );
  const gluedIncisoPattern = new RegExp(
    `(?<=[.;:)>”"»\\]]|MUITO\\s+ALT[AO]|\\bALT[AO]|\\bM[ÉE]DI[AO]|\\bBAIX[AO])[ \\t]+(?=[IVXLCDM]{1,8}[ \\t]*[-–—.)][ \\t]+)`,
    'g',
  );
  const afterGradeBoundary = '(?<=MUITO\\s+ALT[AO]|\\bALT[AO]|\\bM[ÉE]DI[AO]|\\bBAIX[AO])';
  const gluedAlineaPattern = new RegExp(
    `${afterGradeBoundary}[ \\t]+(?=(?:Al[íi]nea\\s+[a-z]\\b|[a-z]\\)[ \\t]+))`,
    'g',
  );
  const gluedPenaPattern = new RegExp(
    `${afterGradeBoundary}[ \\t]+(?=Pena[ \\t]*[:\\-–—][ \\t]+)`,
    'gi',
  );
  const gluedRubricaAfterGradePattern = new RegExp(
    `${afterGradeBoundary}[ \\t]+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])`,
    'g',
  );
  const gluedStandaloneRubricaPattern = new RegExp(
    `(?<=[.;:)]|${afterGradeBoundary})[ \\t]+(?=Pena\\s+(?:cumprida\\s+no\\s+estrangeiro|de\\s+tentativa|de\\s+multa)\\b)`,
    'g',
  );

  text = text
    .replace(gluedArticlePattern, '\n')
    .replace(gluedParagraphPattern, '\n')
    .replace(gluedIncisoPattern, '\n')
    .replace(gluedAlineaPattern, '\n')
    .replace(gluedPenaPattern, '\n')
    .replace(gluedStandaloneRubricaPattern, '\n')
    .replace(gluedRubricaAfterGradePattern, '\n');

  // Split unpunctuated mid-line glued articles (e.g. from PDF page/table merges lacking period) when clearly NOT a cross-reference
  text = text.replace(
    /([^\s\n]+)[ \t]+((?:Art|ART)\.?\s*\d{1,4}(?:[º°ªo])?(?:-[A-Za-z0-9]+)*)(?=[ \t]*[:.\-–—]?[ \t]*(?:[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ(“"§]|$))/g,
    (full, prevWord: string, artHeader: string, offset: number, src: string) => {
      const cleanedPrev = prevWord.replace(/^["“(]+|[.,;:)"”']+$/g, '');
      if (!cleanedPrev || LEGAL_PREPOSITION_OR_REF_RE.test(cleanedPrev)) {
        return full;
      }
      const afterSlice = src.slice(offset + full.length, offset + full.length + 32).trimStart();
      if (/^(?:da|do|de|dos|das|no|na|nos|nas|desta|deste|dessa|desse|e|ou|a|o)\b/i.test(afterSlice)) {
        return full;
      }
      if (/^(?:CAP[ÍI]TULO|T[ÍI]TULO|SE[ÇC][ÃA]O|LIVRO|PARTE)$/i.test(cleanedPrev)) {
        return `${prevWord}\n${artHeader}`;
      }
      if (/^[a-záàâãéêíóôõúç0-9)\]]+$/.test(prevWord)) {
        return `${prevWord}\n${artHeader}`;
      }
      return full;
    },
  );

  const lines = text
    .split('\n')
    .map((l) => l.trim().replace(/^[•▪▫►◦]+\s*(?=(?:Art|ART|§|Par[áa]grafo|Inciso|Al[íi]nea|[IVXLCDM]{1,8}\s*[-–—.)]|[a-z]\)))/i, ''))
    .filter((l) => Boolean(l) && !l.startsWith('#'))
    .map((line) =>
      line
        .replace(/^(?:Artigo|ARTIGO)\s+(\d+(?:[º°ªo])?(?:-[A-Za-z0-9]+)*)/, 'Art. $1')
        .replace(/^ART\.\s*(\d+(?:[º°ªo])?(?:-[A-Za-z0-9]+)*)/, 'Art. $1')
        .replace(/^Art\s+(\d+(?:[º°ªo])?(?:-[A-Za-z0-9]+)*)/i, 'Art. $1')
        .replace(/^Art\.\s*([1-9])(?![º°ªo0-9-])/, 'Art. $1º')
        .replace(/^Par[áa]grafo\s+[úu]nico\b/i, 'Parágrafo único')
        .replace(/^Par[áa]grafo\s+(\d+)(?:[º°ªo])?/i, '§ $1º')
        .replace(/^§\s*([1-9])(?![º°ªo0-9-])/, '§ $1º')
        // Distinguish "§ 1º-A superveniência..." / "§ 3º-O erro..." (where - is separator and A/O is the Portuguese article)
        // from genuine lettered paragraphs like "§ 3º-A. No crime..." or "§ 4º-A A pena..."
        .replace(/^(§\s*\d{1,4}(?:[º°ªo])?)-([AO])\s+([a-záàâãéêíóôõúç])/, '$1 - $2 $3'),
    );

  return lines.join('\n');
}

function mapGradeKeyword(token: string): IncidenceGrade {
  const norm = token.trim().toUpperCase().replace(/\s+/g, ' ');
  if (/^MUITO\s+ALT[AO]$/.test(norm)) return 'Muito Alto';
  if (/^ALT[AO]$/.test(norm)) return 'Alto';
  if (/^M[ÉE]DI[AO](?:\/BAIX[AO])?$/.test(norm)) return 'Médio';
  if (/^BAIX[AO](?:\/NULA)?$/.test(norm)) return 'Baixo';
  return 'Não Classificado';
}

export function detectAndCleanIncidenceGrade(rawContent: string): { grade: IncidenceGrade; cleanText: string } {
  if (!rawContent) return { grade: 'Não Classificado', cleanText: '' };
  let text = rawContent;
  let grade: IncidenceGrade = 'Não Classificado';

  const gradeGroup =
    '(MUITO\\s+ALT[AO]|ALT[AO]|M[ÉE]DI[AO](?:\\/BAIX[AO])?|BAIX[AO](?:\\/NULA)?|NULA|SEM\\s+INCID[ÊE]NCIA)';

  const explicitLabelRegex = new RegExp(
    `(?:^|[\\s|;,(>])Grau\\s*de\\s*Incid[êe]ncia\\s*[:=-]?\\s*${gradeGroup}(?=$|[\\s|;,)])`,
    'i',
  );
  const trailingGradeRegex = new RegExp(`(?:^|[\\s|;,(>])${gradeGroup}\\s*$`, 'i');
  const uppercaseTokenRegex = new RegExp(`(?:^|[\\s|;,(>])${gradeGroup}(?=$|[\\s|;,)])`);

  const explicitMatch = text.match(explicitLabelRegex);
  if (explicitMatch) {
    grade = mapGradeKeyword(explicitMatch[1]);
    text = text.replace(explicitLabelRegex, ' ');
  } else {
    const trailingMatch = text.match(trailingGradeRegex);
    if (trailingMatch) {
      grade = mapGradeKeyword(trailingMatch[1]);
      text = text.replace(trailingGradeRegex, ' ');
    } else {
      const upperMatch = text.match(uppercaseTokenRegex);
      if (upperMatch) {
        grade = mapGradeKeyword(uppercaseTokenRegex.exec(text)?.[1] || upperMatch[1]);
        text = text.replace(uppercaseTokenRegex, ' ');
      }
    }
  }

  const cleanText = text
    .replace(/Grau\s*de\s*Incid[êe]ncia\s*[:=-]?/gi, '')
    .replace(/\bOBSERVA[ÇC][ÕO]ES\b/gi, '')
    .replace(/\|+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[ \t\r\n:;.\-–—|]+|[ \t\r\n|>]+$/g, '')
    .trim();

  return { grade, cleanText };
}

export function formatSequentialDeviceLabel(dispositivo: string, artigoBase?: string): string {
  if (!dispositivo) return '';
  const label = dispositivo.trim();

  const repetitionRegex =
    /^Art(?:igo)?\.?\s*\d+(?:[º°ªo])?(?:-[A-Za-z0-9]+)*[\s,:\-–—]+(?:,\s*)?((?:§|Par[áa]grafo|Inciso|Al[íi]nea|Pena\b|Rubrica\b|[IVXLCDM]{1,8}\b|[a-z]\)).*)$/i;
  const match = label.match(repetitionRegex);
  if (match && match[1]) {
    let sub = match[1].trim();
    if (/^[IVXLCDM]{1,8}$/i.test(sub)) {
      sub = `Inciso ${sub.toUpperCase()}`;
    } else if (/^[a-z]\)$/i.test(sub)) {
      sub = `Alínea ${sub.toLowerCase()}`;
    }
    return sub;
  }

  if (artigoBase && label.toLowerCase().startsWith(artigoBase.toLowerCase())) {
    const remainder = label.slice(artigoBase.length).replace(/^[\s,:\-–—]+/, '').trim();
    if (
      remainder &&
      /^(?:§|Par[áa]grafo|Inciso|Al[íi]nea|Pena\b|Rubrica\b|[IVXLCDM]{1,8}\b|[a-z]\))/i.test(remainder)
    ) {
      if (/^[IVXLCDM]{1,8}$/i.test(remainder)) {
        return `Inciso ${remainder.toUpperCase()}`;
      }
      if (/^[a-z]\)$/i.test(remainder)) {
        return `Alínea ${remainder.toLowerCase()}`;
      }
      return remainder;
    }
  }

  return label;
}

interface ParsedArticleSortKey {
  sectionGroup: 0 | 1 | 2; // 0 = Preâmbulo, 1 = Art. N, 2 = unnumbered fallback
  num: number;
  suffixTokens: Array<{ isNum: boolean; num: number; str: string }>;
  subKind: 0 | 1 | 2; // 0 = Rubrica, 1 = Caput, 2 = Child (§ / Inciso / Alínea / Pena / Dispositivo)
}

function parseArticleSortKey(item: {
  dispositivo?: string;
  artigo_base?: string;
  tipo_dispositivo?: string;
}): ParsedArticleSortKey {
  const disp = String(item.dispositivo || '').trim();
  const tipo = String(item.tipo_dispositivo || '').trim();
  if (tipo === 'Preâmbulo' || /^pre[âa]mbulo$/i.test(disp)) {
    return { sectionGroup: 0, num: -1, suffixTokens: [], subKind: 1 };
  }

  const artSource = String(item.artigo_base || disp || '').trim();
  const m = artSource.match(/^Art(?:igo)?\.?\s*(\d{1,5})(?:\.\s*[º°ª]|[º°ªo])?((?:-[A-Za-z0-9]+)*)/i);
  if (!m) {
    return { sectionGroup: 2, num: Number.MAX_SAFE_INTEGER, suffixTokens: [], subKind: 2 };
  }

  const num = parseInt(m[1], 10);
  const rawSuffix = (m[2] || '').trim();
  const suffixTokens = rawSuffix
    .split('-')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      if (/^\d+$/.test(p)) {
        return { isNum: true, num: parseInt(p, 10), str: '' };
      }
      return { isNum: false, num: 0, str: p.toUpperCase() };
    });

  let subKind: 0 | 1 | 2 = 2;
  if (tipo === 'Rubrica' || /^rubrica$/i.test(disp)) {
    subKind = 0;
  } else if (
    tipo === 'Artigo (caput)' ||
    /^Art(?:igo)?\.?\s*\d{1,5}(?:\.\s*[º°ª]|[º°ªo])?(?:-[A-Za-z0-9]+)*\.?$/i.test(disp)
  ) {
    subKind = 1;
  }

  return { sectionGroup: 1, num, suffixTokens, subKind };
}

export function compareLawItemsCanonicalOrder(
  a: { dispositivo?: string; artigo_base?: string; tipo_dispositivo?: string },
  b: { dispositivo?: string; artigo_base?: string; tipo_dispositivo?: string },
  idxA = 0,
  idxB = 0,
): number {
  const ka = parseArticleSortKey(a);
  const kb = parseArticleSortKey(b);

  if (ka.sectionGroup !== kb.sectionGroup) {
    return ka.sectionGroup - kb.sectionGroup;
  }

  if (ka.sectionGroup === 1) {
    if (ka.num !== kb.num) {
      return ka.num - kb.num;
    }

    const minLen = Math.min(ka.suffixTokens.length, kb.suffixTokens.length);
    for (let i = 0; i < minLen; i++) {
      const ta = ka.suffixTokens[i];
      const tb = kb.suffixTokens[i];
      if (ta.isNum !== tb.isNum) {
        return ta.isNum ? -1 : 1;
      }
      if (ta.isNum) {
        if (ta.num !== tb.num) return ta.num - tb.num;
      } else {
        if (ta.str.length !== tb.str.length) return ta.str.length - tb.str.length;
        if (ta.str !== tb.str) return ta.str < tb.str ? -1 : 1;
      }
    }
    if (ka.suffixTokens.length !== kb.suffixTokens.length) {
      return ka.suffixTokens.length - kb.suffixTokens.length;
    }

    if (ka.subKind !== kb.subKind) {
      return ka.subKind - kb.subKind;
    }
  }

  return idxA - idxB;
}

export function sortLawItemsInOrder<T extends { dispositivo?: string; artigo_base?: string; tipo_dispositivo?: string }>(
  items: T[],
): T[] {
  if (!Array.isArray(items) || items.length <= 1) return Array.isArray(items) ? [...items] : [];
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => compareLawItemsCanonicalOrder(a.item, b.item, a.idx, b.idx))
    .map((entry) => entry.item);
}

export function formatCanonicalArticleLabel(
  num: number,
  suffixTokens: Array<{ isNum: boolean; num: number; str: string }> = [],
): string {
  const base = num >= 1 && num <= 9 ? `Art. ${num}º` : `Art. ${num}`;
  if (!suffixTokens.length) return base;
  const suffix = suffixTokens
    .map((t) => (t.isNum ? String(t.num) : t.str))
    .join('-');
  return `${base}-${suffix}`;
}

export function resolveCanonicalArticleIdentity(input: {
  dispositivo?: string;
  artigo_base?: string;
  tipo_dispositivo?: string;
}): {
  canonicalKey: string;
  canonicalLabel: string;
  articleNumber: number | null;
  sectionGroup: 0 | 1 | 2;
} {
  const disp = String(input.dispositivo || '').trim();
  const base = String(input.artigo_base || '').trim();
  const keyInfo = parseArticleSortKey(input);

  if (keyInfo.sectionGroup === 0) {
    return {
      canonicalKey: 'preambulo',
      canonicalLabel: 'Preâmbulo',
      articleNumber: null,
      sectionGroup: 0,
    };
  }

  if (keyInfo.sectionGroup === 1) {
    const suffixKey = keyInfo.suffixTokens
      .map((t) => (t.isNum ? String(t.num) : t.str.toLowerCase()))
      .join('-');
    return {
      canonicalKey: suffixKey ? `art-${keyInfo.num}-${suffixKey}` : `art-${keyInfo.num}`,
      canonicalLabel: formatCanonicalArticleLabel(keyInfo.num, keyInfo.suffixTokens),
      articleNumber: keyInfo.num,
      sectionGroup: 1,
    };
  }

  const fallbackLabel = (base || disp || 'Outros').trim();
  const fallbackSlug = fallbackLabel
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return {
    canonicalKey: `other-${fallbackSlug || 'item'}`,
    canonicalLabel: fallbackLabel,
    articleNumber: null,
    sectionGroup: 2,
  };
}

export function resolveCanonicalArticleKeyFromQuery(rawQuery: string): string {
  const trimmed = String(rawQuery || '').trim();
  if (!trimmed) return '';
  if (/^pre[âa]mbulo$/i.test(trimmed)) return 'preambulo';
  const cleaned = trimmed
    .replace(/^law-(?:cont|dev)-art-/i, '')
    .replace(/^art-/i, 'Art. ');
  const m = cleaned.match(/^(?:art(?:igo)?\.?\s*)?(\d{1,5})(?:\.\s*[º°ª]|[º°ªo])?((?:-[a-z0-9]+)*)/i);
  if (m) {
    const num = parseInt(m[1], 10);
    const suffix = (m[2] || '').toLowerCase();
    return `art-${num}${suffix}`;
  }
  return resolveCanonicalArticleIdentity({ dispositivo: trimmed }).canonicalKey;
}

export interface IndexedLawItemMeta {
  docSeqIndex: number;
  articleSeqIndex: number;
  canonicalKey: string;
  canonicalLabel: string;
  articleNumber: number | null;
}

export interface IndexedLawArticleGroup<T> {
  canonicalKey: string;
  canonicalLabel: string;
  articleSeqIndex: number;
  articleNumber: number | null;
  items: T[];
}

export interface SequentialLawIndex<T> {
  orderedItems: T[];
  articleGroups: IndexedLawArticleGroup<T>[];
  itemMetaById: Map<string, IndexedLawItemMeta>;
  groupByCanonicalKey: Map<string, IndexedLawArticleGroup<T>>;
  missingArticleNumbers: number[];
  minArticleNumber: number | null;
  maxArticleNumber: number | null;
  totalArticles: number;
  hadOutOfOrderInput: boolean;
}

export function buildSequentialLawIndex<
  T extends { id?: string; dispositivo?: string; artigo_base?: string; tipo_dispositivo?: string },
>(items: T[]): SequentialLawIndex<T> {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      orderedItems: [],
      articleGroups: [],
      itemMetaById: new Map(),
      groupByCanonicalKey: new Map(),
      missingArticleNumbers: [],
      minArticleNumber: null,
      maxArticleNumber: null,
      totalArticles: 0,
      hadOutOfOrderInput: false,
    };
  }

  const orderedItems = sortLawItemsInOrder(items);
  let hadOutOfOrderInput = false;
  for (let i = 0; i < items.length; i++) {
    if (orderedItems[i] !== items[i]) {
      hadOutOfOrderInput = true;
      break;
    }
  }

  const articleGroups: IndexedLawArticleGroup<T>[] = [];
  const groupByCanonicalKey = new Map<string, IndexedLawArticleGroup<T>>();
  const itemMetaById = new Map<string, IndexedLawItemMeta>();
  const presentIntegerNumbers = new Set<number>();
  let minArticleNumber: number | null = null;
  let maxArticleNumber: number | null = null;
  let articleCounter = 0;

  orderedItems.forEach((item, idx) => {
    const identity = resolveCanonicalArticleIdentity(item);
    let group = groupByCanonicalKey.get(identity.canonicalKey);
    if (!group) {
      if (identity.sectionGroup === 1) {
        articleCounter += 1;
      }
      group = {
        canonicalKey: identity.canonicalKey,
        canonicalLabel: identity.canonicalLabel,
        articleSeqIndex: identity.sectionGroup === 0 ? 0 : articleCounter || articleGroups.length + 1,
        articleNumber: identity.articleNumber,
        items: [],
      };
      groupByCanonicalKey.set(identity.canonicalKey, group);
      articleGroups.push(group);
    }

    group.items.push(item);

    if (identity.articleNumber !== null && Number.isFinite(identity.articleNumber)) {
      presentIntegerNumbers.add(identity.articleNumber);
      minArticleNumber =
        minArticleNumber === null
          ? identity.articleNumber
          : Math.min(minArticleNumber, identity.articleNumber);
      maxArticleNumber =
        maxArticleNumber === null
          ? identity.articleNumber
          : Math.max(maxArticleNumber, identity.articleNumber);
    }

    const meta: IndexedLawItemMeta = {
      docSeqIndex: idx + 1,
      articleSeqIndex: group.articleSeqIndex,
      canonicalKey: group.canonicalKey,
      canonicalLabel: group.canonicalLabel,
      articleNumber: group.articleNumber,
    };

    if (item.id) {
      itemMetaById.set(item.id, meta);
    }
  });

  const missingArticleNumbers: number[] = [];
  if (
    minArticleNumber !== null &&
    maxArticleNumber !== null &&
    maxArticleNumber > minArticleNumber &&
    maxArticleNumber - minArticleNumber <= 2500
  ) {
    for (let n = minArticleNumber; n <= maxArticleNumber; n++) {
      if (!presentIntegerNumbers.has(n)) {
        missingArticleNumbers.push(n);
      }
    }
  }

  return {
    orderedItems,
    articleGroups,
    itemMetaById,
    groupByCanonicalKey,
    missingArticleNumbers,
    minArticleNumber,
    maxArticleNumber,
    totalArticles: articleGroups.filter((g) => g.articleNumber !== null).length,
    hadOutOfOrderInput,
  };
}

function normalizeArticleHeaderLabel(rawHeader: string): string {
  return rawHeader
    .replace(/\s+/g, ' ')
    .replace(/^ART\.?\s*/i, (m) => (m === m.toUpperCase() || m.startsWith('A') ? 'Art. ' : m))
    .replace(/^Art\.?\s*(\d{1,4})\.\s*([º°ª])/i, 'Art. $1$2')
    .replace(/^Art\.?\s*(\d{1,4})\s+([º°ª])/i, 'Art. $1$2')
    .replace(/^Art\s+(\d)/i, 'Art. $1')
    .replace(/^Art\.\s*([1-9])(?![º°ªo0-9-])/, 'Art. $1º')
    .replace(/\.$/, '')
    .trim();
}

function isLikelyCrossReferenceArticleLine(
  artHeader: string,
  artBody: string,
  currentBodyLines: string[],
  hasArticle: boolean,
  lastArticleNum: number | null,
): boolean {
  if (!hasArticle) return false;
  const trimmedBody = artBody.trim();
  const numMatch = artHeader.match(/(\d{1,5})/);
  const candNum = numMatch ? parseInt(numMatch[1], 10) : null;

  const nonEmptyBody = currentBodyLines.map((l) => l.trim()).filter(Boolean);
  const lastBodyLine = nonEmptyBody[nonEmptyBody.length - 1] || '';
  const prevLastWord = lastBodyLine.split(/\s+/).pop() || '';
  const prevLastWordClean = prevLastWord.replace(/^["“(]+|[.,;:)"”']+$/g, '');

  const prevEndsWithPrepositionOrConnector =
    Boolean(lastBodyLine) &&
    (/[,\-–—(]$/.test(lastBodyLine) || LEGAL_PREPOSITION_OR_REF_RE.test(prevLastWordClean));

  const bodyStartsWithCitationPhrase =
    /^(?:da|do|de|dos|das|no|na|nos|nas|ao|à|aos|às|desta|deste|dessa|desse|daquela|daquele|e|ou|a|o|em|com|por|para|caput|inciso|incisos|al[íi]nea|§)\b/i.test(
      trimmedBody,
    ) || /^,\s*(?:caput|inciso|incisos|al[íi]nea|§|do|da|de|desta|deste)\b/i.test(trimmedBody);

  // If the previous line explicitly ended with an unclosed preposition ("nos termos do\nArt. 37 da CF")
  // or the body after Art. N immediately reads like a citation ("Art. 5º da Constituição", "Art. 10 desta Lei")
  // while the previous sentence didn't end cleanly or the article number jumps backwards/out-of-sequence:
  if (prevEndsWithPrepositionOrConnector && (bodyStartsWithCitationPhrase || candNum !== (lastArticleNum ?? 0) + 1)) {
    return true;
  }

  if (bodyStartsWithCitationPhrase && candNum !== null && lastArticleNum !== null && candNum !== lastArticleNum + 1) {
    return true;
  }

  return false;
}

export function splitLawDevices(rawText: string): Array<{
  dispositivo: string;
  artigo_base: string;
  tipo_dispositivo: string;
  texto: string;
  grau: IncidenceGrade;
  dica?: string;
}> {
  const structuredText = cleanAndStructureLawText(rawText);
  if (!structuredText) return [];

  const lines = structuredText.split('\n');
  const articleStartRe = /^((?:Art|ART)\.?\s*\d{1,4}(?:\.\s*[º°ª]|[º°ªo])?(?:-[A-Za-z0-9]+)*)(?:\s*[:.\-–—]\s*|\s+|$)(.*)$/;
  const paragraphStartRe =
    /^(§\s*(?:\d{1,4}(?:\.\s*[º°ª]|[º°ªo])?(?:-[A-Za-z0-9]+)*|[úu]nico)|Par[áa]grafo\s+(?:\d{1,4}(?:[º°ªo])?(?:-[A-Za-z0-9]+)*|[úu]nico))(?:\s*[:.\-–—]\s*|\s+|$)(.*)$/i;
  const incisoStartRe =
    /^(?:Inciso\s+([IVXLCDM]{1,8})|([IVXLCDM]{1,8})(?=\s*[-–—.)]\s*|\s*$))(?:\s*[:.\-–—.)]\s*|\s+|$)(.*)$/;
  const alineaStartRe =
    /^(?:Al[íi]nea\s+([a-zA-Z])\b[):.\-–—]?|([a-z])\))(?:\s*[:.\-–—]\s*|\s+|$)(.*)$/;
  const penaStartRe = /^(Pena)\s*[:\-–—]\s*(.+)$/i;
  const trailingGradeCheckRe =
    /(?:^|[\s|;,(>])(MUITO\s+ALT[AO]|ALT[AO]|M[ÉE]DI[AO](?:\/BAIX[AO])?|BAIX[AO](?:\/NULA)?|NULA|SEM\s+INCID[ÊE]NCIA)\s*$/i;

  const segments: Array<{
    dispositivo: string;
    artigo_base: string;
    tipo_dispositivo: string;
    texto: string;
    grau: IncidenceGrade;
    dica?: string;
  }> = [];

  const preambleLines: string[] = [];
  let currentArticle = '';
  let currentDevice = '';
  let currentType = '';
  let currentBodyLines: string[] = [];
  let hasArticle = false;
  let lastArticleNum: number | null = null;

  const flushCurrent = (fallbackIfEmptyCaput = false) => {
    if (!currentDevice) return;
    const rawBody = currentBodyLines.join(' ').trim();
    if (!rawBody) {
      if (fallbackIfEmptyCaput && currentType === 'Artigo (caput)') {
        segments.push({
          dispositivo: currentDevice,
          artigo_base: currentArticle,
          tipo_dispositivo: currentType,
          texto: '(Caput sem texto próprio)',
          grau: 'Não Classificado',
          dica: '',
        });
      }
      return;
    }

    if (rawBody.includes('|||')) {
      const pipeSegments = rawBody
        .split('|||')
        .map((s) => s.trim())
        .filter((s, idx) => idx > 0 || Boolean(s));
      let grade: IncidenceGrade = 'Não Classificado';
      let content = '';
      let tip = '';

      if (pipeSegments.length >= 2) {
        const firstDetected = detectAndCleanIncidenceGrade(pipeSegments[0]);
        if (firstDetected.grade !== 'Não Classificado' && !firstDetected.cleanText) {
          grade = firstDetected.grade;
          const secondDetected = detectAndCleanIncidenceGrade(pipeSegments[1]);
          content = secondDetected.cleanText || pipeSegments[1];
          tip = pipeSegments.slice(2).join(' | ');
        } else {
          const secondDetected = detectAndCleanIncidenceGrade(pipeSegments[1]);
          grade = secondDetected.grade !== 'Não Classificado' ? secondDetected.grade : firstDetected.grade;
          content = firstDetected.cleanText || pipeSegments[0];
          tip = pipeSegments.slice(2).join(' | ');
        }
      } else if (pipeSegments.length === 1) {
        const singleDetected = detectAndCleanIncidenceGrade(pipeSegments[0]);
        grade = singleDetected.grade;
        content = singleDetected.cleanText;
      }

      if (content) {
        segments.push({
          dispositivo: currentDevice,
          artigo_base: currentArticle,
          tipo_dispositivo: currentType,
          texto: content,
          grau: grade,
          dica: tip,
        });
      }
      return;
    }

    const { grade, cleanText } = detectAndCleanIncidenceGrade(rawBody);
    if (cleanText && !/^[§º°ª.:;,\-–—\s]*$/.test(cleanText)) {
      segments.push({
        dispositivo: currentDevice,
        artigo_base: currentArticle,
        tipo_dispositivo: currentType,
        texto: cleanText,
        grau: grade,
        dica: '',
      });
    }
  };

  const standaloneRubricaRe =
    /^Pena\s+(?:cumprida\s+no\s+estrangeiro|de\s+tentativa|de\s+multa)\b/i;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const artMatch = line.match(articleStartRe);
    if (
      artMatch &&
      !isLikelyCrossReferenceArticleLine(
        artMatch[1],
        artMatch[2],
        currentBodyLines,
        hasArticle,
        lastArticleNum,
      )
    ) {
      flushCurrent(false);
      hasArticle = true;
      currentArticle = normalizeArticleHeaderLabel(artMatch[1]);
      const artNumMatch = currentArticle.match(/(\d{1,5})/);
      if (artNumMatch) {
        lastArticleNum = parseInt(artNumMatch[1], 10);
      }
      currentDevice = currentArticle;
      currentType = 'Artigo (caput)';
      currentBodyLines = [artMatch[2].trim()];
      continue;
    }

    if (hasArticle) {
      const paraMatch = line.match(paragraphStartRe);
      if (paraMatch) {
        flushCurrent(true);
        currentDevice = paraMatch[1]
          .replace(/\s+/g, ' ')
          .replace(/(§\s*\d{1,4})\.\s*([º°ª])/, '$1$2')
          .replace(/\.$/, '')
          .trim();
        currentType = 'Parágrafo';
        currentBodyLines = [paraMatch[2].trim()];
        continue;
      }

      const incMatch = line.match(incisoStartRe);
      if (incMatch) {
        const roman = (incMatch[1] || incMatch[2] || '').toUpperCase();
        if (roman) {
          flushCurrent(true);
          currentDevice = `Inciso ${roman}`;
          currentType = 'Inciso';
          currentBodyLines = [incMatch[3].trim()];
          continue;
        }
      }

      const aliMatch = line.match(alineaStartRe);
      if (aliMatch) {
        const letter = (aliMatch[1] || aliMatch[2] || '').toLowerCase();
        if (letter) {
          flushCurrent(true);
          currentDevice = `Alínea ${letter})`;
          currentType = 'Alínea';
          currentBodyLines = [aliMatch[3].trim()];
          continue;
        }
      }

      const penaMatch = line.match(penaStartRe);
      if (penaMatch) {
        flushCurrent(true);
        currentDevice = 'Pena';
        currentType = 'Pena';
        currentBodyLines = [penaMatch[2].trim()];
        continue;
      }

      // If previous body line already ended with an explicit grade token or this is a known standalone rubrica, start a Rubrica device
      const lastBodyLine = currentBodyLines[currentBodyLines.length - 1] || '';
      if (
        (lastBodyLine && trailingGradeCheckRe.test(lastBodyLine)) ||
        standaloneRubricaRe.test(line)
      ) {
        flushCurrent(false);
        currentDevice = 'Rubrica';
        currentType = 'Rubrica';
        currentBodyLines = [line];
        continue;
      }
    }

    if (currentDevice) {
      currentBodyLines.push(line);
    } else {
      preambleLines.push(line);
    }
  }

  flushCurrent(false);

  if (!hasArticle) return [];

  // Associate any Rubrica that immediately precedes a new Artigo (caput) with that next article
  for (let i = 0; i < segments.length - 1; i++) {
    if (
      segments[i].tipo_dispositivo === 'Rubrica' &&
      segments[i + 1].tipo_dispositivo === 'Artigo (caput)' &&
      segments[i + 1].artigo_base
    ) {
      segments[i].artigo_base = segments[i + 1].artigo_base;
    }
  }

  if (preambleLines.length > 0) {
    const preambleDetected = detectAndCleanIncidenceGrade(preambleLines.join(' '));
    if (preambleDetected.cleanText && !/^[§º°ª.:;,\-–—\s]*$/.test(preambleDetected.cleanText)) {
      segments.unshift({
        dispositivo: 'Preâmbulo',
        artigo_base: '',
        tipo_dispositivo: 'Preâmbulo',
        texto: preambleDetected.cleanText,
        grau: preambleDetected.grade,
        dica: '',
      });
    }
  }

  return sortLawItemsInOrder(segments);
}

export function parseLawTextToItems(fileName: string, rawText: string): LawItem[] {
  if (
    isScheduleTxtDescriptor(fileName, undefined, rawText) ||
    isContestOrEditalTxtDescriptor(fileName, undefined, rawText)
  ) {
    return [];
  }
  const devices = splitLawDevices(rawText);
  if (devices.length) {
    return sortLawItemsInOrder(
      devices.map((d, index) => {
        const artBaseMatch = d.dispositivo.match(/^(Art(?:igo)?\.?\s*\d+(?:[º°ªo])?(?:-[A-Za-z0-9]+)*)/i);
        return {
          id: `${fileName}::${index}::${uid(6)}`,
          arquivo: fileName,
          dispositivo: d.dispositivo,
          grau: d.grau || 'Não Classificado',
          texto: d.texto,
          dica: d.dica || '',
          observacao: '',
          artigo_base: artBaseMatch ? artBaseMatch[1] : d.artigo_base || '',
          tipo_dispositivo: d.tipo_dispositivo || 'Dispositivo',
        };
      }),
    );
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return sortLawItemsInOrder(
    lines.map((line, index) => {
      const parts = parsePipeLine(line, 3);
      let device = '';
      let grade: IncidenceGrade = 'Não Classificado';
      let content = '';
      let tip = '';

      if (parts) {
        device = parts[0];
        const maybeGrade = parts[1] as IncidenceGrade;
        const detectedInPart1 = detectAndCleanIncidenceGrade(parts[1]);
        grade = INCIDENCE_GRADES.includes(maybeGrade)
          ? maybeGrade
          : detectedInPart1.grade;

        const contentCleaned = detectAndCleanIncidenceGrade(parts[2]);
        if (grade === 'Não Classificado' && contentCleaned.grade !== 'Não Classificado') {
          grade = contentCleaned.grade;
        }
        content = contentCleaned.cleanText || parts[2];
        tip = parts.slice(3).join(' | ');
      } else {
        const artMatch = line.match(/^(Art(?:igo)?\.?\s*\d+(?:[º°ªo])?(?:-[A-Za-z0-9]+)*)\s*[:.\-–—]?\s*(.*)$/i);
        device = artMatch ? artMatch[1].trim() : lines.length === 1 ? displayBaseName(fileName) : `Dispositivo ${index + 1}`;
        const rawBody = artMatch && artMatch[2].trim() ? artMatch[2].trim() : line;
        const detected = detectAndCleanIncidenceGrade(rawBody);
        grade = detected.grade;
        content = detected.cleanText || rawBody;
      }

      const artBaseMatch = device.match(/^(Art(?:igo)?\.?\s*\d+(?:[º°ªo])?(?:-[A-Za-z0-9]+)*)/i);
      const tipo =
        device.toLowerCase() === 'preâmbulo'
          ? 'Preâmbulo'
          : /§|Parágrafo/i.test(device)
            ? 'Parágrafo'
            : /\binciso\b/i.test(device)
              ? 'Inciso'
              : /\bal[íi]nea\b|^[a-z]\)$/i.test(device)
                ? 'Alínea'
                : /^pena$/i.test(device)
                  ? 'Pena'
                  : /^Art(?:igo)?\.?\s*\d+/i.test(device)
                    ? 'Artigo (caput)'
                    : 'Dispositivo';

      return {
        id: `${fileName}::${index}::${uid(6)}`,
        arquivo: fileName,
        dispositivo: device,
        grau: grade,
        texto: content,
        dica: tip,
        observacao: '',
        artigo_base: artBaseMatch ? artBaseMatch[1] : '',
        tipo_dispositivo: tipo,
      };
    }),
  );
}

function gradeToKeyword(grade?: IncidenceGrade): string {
  switch (grade) {
    case 'Muito Alto':
      return 'MUITO ALTA';
    case 'Alto':
      return 'ALTA';
    case 'Médio':
      return 'MÉDIA';
    case 'Baixo':
      return 'BAIXA';
    default:
      return '';
  }
}

function inferDeviceTypeFromLabel(dispositivo: string, fallback?: string): string {
  const d = String(dispositivo || '').trim();
  if (!d) return fallback || 'Dispositivo';
  if (/^pre[âa]mbulo$/i.test(d)) return 'Preâmbulo';
  if (/^rubrica$/i.test(d)) return 'Rubrica';
  if (/^pena\b/i.test(d)) return 'Pena';
  if (/^(?:al[íi]nea\b|[a-z]\))/i.test(d)) return 'Alínea';
  if (/^(?:inciso\b|[IVXLCDM]{1,8}\b)/i.test(d)) return 'Inciso';
  if (/§|par[áa]grafo/i.test(d)) return 'Parágrafo';
  if (/^art(?:igo)?\.?\s*\d+/i.test(d)) return 'Artigo (caput)';
  return fallback || 'Dispositivo';
}

/**
 * Non-destructively heals and normalizes existing LawItem[] already saved in the user's database
 * so legacy-parsed laws (e.g. with glued "Pena - ...", glued "a) ...", embedded grade tokens,
 * or "§ 1º-A <lowercase>" where "A"/"O" was stripped from the sentence start) are automatically
 * repaired while preserving id, observacao, dica, and leituras.
 */
export function healAndNormalizeLawItems(items: LawItem[]): LawItem[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const embeddedGradeOrSubDeviceRe =
    /(?:^|[\s|;,(>])(MUITO\s+ALT[AO]|ALT[AO]|M[ÉE]DI[AO](?:\/BAIX[AO])?|BAIX[AO](?:\/NULA)?)(?=$|[\s|;,)])|\bPena\s*[:\-–—]\s+|\bPena\s+(?:cumprida\s+no\s+estrangeiro|de\s+tentativa|de\s+multa)\b|(?:^|\s)[a-z]\)\s+[a-záàâãéêíóôõúçA-Z]/;

  const healed: LawItem[] = [];
  let runningArticleBase = '';

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'object') continue;

    let dispositivo = String(rawItem.dispositivo || '').trim();
    let texto = String(rawItem.texto || '').trim();
    if (!texto || /^[§º°ª.:;,\-–—\s]*$/.test(texto)) continue;

    let grau: IncidenceGrade = INCIDENCE_GRADES.includes(rawItem.grau)
      ? rawItem.grau
      : 'Não Classificado';

    // 1. Heal "§ Xº-A <lowercase>" / "§ Xº-O <lowercase>" where "-A" or "-O" was a separator + Portuguese article
    const paraSwallowedMatch = dispositivo.match(/^(.*§\s*\d{1,4}(?:[º°ªo])?)-([AO])$/i);
    if (paraSwallowedMatch && /^[a-záàâãéêíóôõúç]/.test(texto)) {
      dispositivo = paraSwallowedMatch[1].trim();
      texto = `${paraSwallowedMatch[2].toUpperCase()} ${texto}`;
    }

    // 1b. Heal multi-hyphen devices (e.g. "Art. 359-M" + texto "A. Quando os delitos..." -> "Art. 359-M-A")
    if (/^(?:Art(?:igo)?\.?\s*\d{1,4}(?:[º°ªo])?(?:-[A-Za-z0-9]+)+|§\s*\d{1,4}(?:[º°ªo])?(?:-[A-Za-z0-9]+)+)$/i.test(dispositivo)) {
      const multiSuffixMatch = texto.match(/^-?([A-Z])\s*[.:–—-]\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ(].*)$/);
      if (multiSuffixMatch) {
        dispositivo = `${dispositivo}-${multiSuffixMatch[1].toUpperCase()}`;
        texto = multiSuffixMatch[2].trim();
      }
    }

    const explicitArtMatch = dispositivo.match(/^(Art(?:igo)?\.?\s*\d{1,4}(?:[º°ªo])?(?:-[A-Za-z0-9]+)*)/i);
    if (explicitArtMatch) {
      runningArticleBase = explicitArtMatch[1].replace(/\s+/g, ' ').replace(/\.$/, '').trim();
    } else if (rawItem.artigo_base) {
      const baseMatch = String(rawItem.artigo_base).match(
        /^(Art(?:igo)?\.?\s*\d{1,4}(?:[º°ªo])?(?:-[A-Za-z0-9]+)*)/i,
      );
      if (baseMatch) {
        runningArticleBase = baseMatch[1].replace(/\s+/g, ' ').replace(/\.$/, '').trim();
      }
    }

    const effectiveArtBase =
      dispositivo.toLowerCase() === 'preâmbulo'
        ? ''
        : explicitArtMatch
          ? runningArticleBase
          : rawItem.artigo_base || runningArticleBase;

    // 2. Check if this legacy item has glued sub-devices (Pena - ..., a) ..., rubrics, or embedded grade tokens)
    if (embeddedGradeOrSubDeviceRe.test(texto) && effectiveArtBase) {
      const isArtHeader = /^Art(?:igo)?\.?\s*\d+/i.test(dispositivo);
      const trailingKw = gradeToKeyword(grau);
      const syntheticBlock = isArtHeader
        ? `${dispositivo} ${texto}${trailingKw ? ` ${trailingKw}` : ''}`
        : `${effectiveArtBase} __ANCHOR_CAPUT__\n${dispositivo} ${texto}${trailingKw ? ` ${trailingKw}` : ''}`;

      const splitResult = splitLawDevices(syntheticBlock).filter(
        (seg) => seg.texto !== '__ANCHOR_CAPUT__' && !/^[§º°ª.:;,\-–—\s]*$/.test(seg.texto),
      );

      if (splitResult.length >= 2) {
        splitResult.forEach((seg, idx) => {
          const segArtBase = seg.artigo_base || effectiveArtBase;
          if (idx === 0) {
            healed.push({
              ...rawItem,
              dispositivo: seg.dispositivo || dispositivo,
              artigo_base: segArtBase,
              tipo_dispositivo: inferDeviceTypeFromLabel(
                seg.dispositivo || dispositivo,
                seg.tipo_dispositivo || rawItem.tipo_dispositivo,
              ),
              texto: seg.texto,
              grau: seg.grau !== 'Não Classificado' ? seg.grau : grau,
              dica: rawItem.dica || seg.dica || '',
              observacao: rawItem.observacao || '',
            });
          } else {
            healed.push({
              id: `${rawItem.id}::sub-${idx}`,
              arquivo: rawItem.arquivo,
              dispositivo: seg.dispositivo,
              artigo_base: segArtBase,
              tipo_dispositivo: inferDeviceTypeFromLabel(seg.dispositivo, seg.tipo_dispositivo),
              texto: seg.texto,
              grau: seg.grau !== 'Não Classificado' ? seg.grau : grau,
              dica: seg.dica || '',
              observacao: '',
              ...(rawItem.leituras?.length ? { leituras: rawItem.leituras } : {}),
            });
          }
        });
        continue;
      }
    }

    // 3. Clean any stray embedded grade token in single item
    const cleanedSingle = detectAndCleanIncidenceGrade(texto);
    if (cleanedSingle.grade !== 'Não Classificado' && cleanedSingle.cleanText) {
      texto = cleanedSingle.cleanText;
      if (grau === 'Não Classificado') {
        grau = cleanedSingle.grade;
      }
    }
    if (!texto || /^[§º°ª.:;,\-–—\s]*$/.test(texto)) continue;

    healed.push({
      ...rawItem,
      dispositivo,
      texto,
      grau,
      artigo_base: effectiveArtBase,
      tipo_dispositivo: inferDeviceTypeFromLabel(dispositivo, rawItem.tipo_dispositivo),
      dica: rawItem.dica || '',
      observacao: rawItem.observacao || '',
    });
  }

  for (let i = 0; i < healed.length - 1; i++) {
    if (
      healed[i].tipo_dispositivo === 'Rubrica' &&
      healed[i + 1].tipo_dispositivo === 'Artigo (caput)' &&
      healed[i + 1].artigo_base
    ) {
      healed[i].artigo_base = healed[i + 1].artigo_base;
    }
  }

  return sortLawItemsInOrder(healed);
}

export interface ParsedEditalTopic {
  materia: string;
  titulo: string;
}

export function parseEditalTopicsText(
  rawText: string,
  defaultSubject = 'Geral',
): ParsedEditalTopic[] {
  const normalizedRaw = String(rawText || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\f/g, '\n')
    .trim();
  if (!normalizedRaw) return [];

  let rawLines = normalizedRaw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // If the user pasted a single semicolon-separated list (without pipes or newlines), split it cleanly
  if (rawLines.length === 1 && !rawLines[0].includes('|') && rawLines[0].includes(';')) {
    const semiParts = rawLines[0]
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    if (semiParts.length > 1) {
      rawLines = semiParts;
    }
  }

  let currentSubject = defaultSubject.trim() || 'Geral';
  const results: ParsedEditalTopic[] = [];
  const seen = new Set<string>();

  const pushTopic = (materiaRaw: string, tituloRaw: string) => {
    const materia = materiaRaw.trim() || defaultSubject.trim() || 'Geral';
    const titulo = tituloRaw
      .replace(/^[-•*▪▫►–—]+\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!titulo) return;
    const key = `${normalizeSearch(materia)}::${normalizeSearch(titulo)}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ materia, titulo });
  };

  for (const line of rawLines) {
    if (/^#\s*(?:modelo|formato|exemplo|como usar)/i.test(line)) continue;

    // 1. Markdown heading or bracketed/decorated header: # Direito Penal | [Direito Penal] | === Direito Penal ===
    const mdHeading = line.match(/^#{1,4}\s+(.+)$/);
    if (mdHeading) {
      const candidate = mdHeading[1].replace(/[:\-–—\s]+$/, '').trim();
      if (candidate) currentSubject = candidate;
      continue;
    }

    const bracketHeading = line.match(/^\[([^\]]{2,80})\]$/);
    if (bracketHeading) {
      const candidate = bracketHeading[1].trim();
      if (candidate) currentSubject = candidate;
      continue;
    }

    const eqHeading = line.match(/^={2,}\s*(.+?)\s*={2,}$/);
    if (eqHeading) {
      const candidate = eqHeading[1].trim();
      if (candidate) currentSubject = candidate;
      continue;
    }

    // 2. Explicit subject label: "Matéria: Direito Constitucional" or "Disciplina: Português"
    const explicitSubject = line.match(/^(?:Mat[eé]ria|Disciplina)\s*:\s*(.+)$/i);
    if (explicitSubject) {
      const candidate = explicitSubject[1].replace(/[:\s]+$/, '').trim();
      if (candidate) currentSubject = candidate;
      continue;
    }

    // 3. Pipe syntax: "Matéria | Ponto do edital"
    if (line.includes('|')) {
      const pipeParts = line
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean);
      if (pipeParts.length >= 2) {
        const subjectPart = pipeParts[0].replace(/^[-•*▪▫►]+\s+/, '').trim();
        const topicPart = pipeParts.slice(1).join(' | ').trim();
        if (subjectPart && topicPart) {
          currentSubject = subjectPart;
          pushTopic(subjectPart, topicPart);
          continue;
        }
      }
    }

    // 4. Standalone section header ending with ":" (e.g. "DIREITO CONSTITUCIONAL:" or "Língua Portuguesa:")
    if (
      line.endsWith(':') &&
      line.length <= 80 &&
      !/^[-•*▪▫►]/.test(line) &&
      !/^\d+(?:\.\d+)+\s+/.test(line) &&
      !/[.;!?]/.test(line.slice(0, -1))
    ) {
      const candidate = line
        .slice(0, -1)
        .replace(/^\d+[.)\-–—]\s*/, '')
        .trim();
      if (candidate) {
        currentSubject = candidate;
        continue;
      }
    }

    // 5. Regular topic line
    pushTopic(currentSubject, line);
  }

  return results;
}

function normalizeArticleIdentifier(raw: string): string {
  const cleaned = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:artigo|art)\.?\s*/gi, '')
    .replace(/[º°ª]/g, '')
    .replace(/(\d)o(?=$|-|\s)/gi, '$1')
    .replace(/\s+/g, '')
    .trim();
  const numLetterMatch = cleaned.match(/^(\d+(?:-[a-z0-9]+)*)/i);
  if (numLetterMatch) return numLetterMatch[1].toLowerCase();
  return cleaned;
}

export interface MultiArticleSpec {
  exactKeys: Set<string>;
  textTokens: string[];
  numericRanges?: Array<[number, number]>;
}

export function parseMultiArticleSpec(rawQuery: string): MultiArticleSpec {
  const exactKeys = new Set<string>();
  const textTokens: string[] = [];
  const numericRanges: Array<[number, number]> = [];

  const trimmed = String(rawQuery || '').trim();
  if (!trimmed) return { exactKeys, textTokens, numericRanges };

  // Split by comma, semicolon, or whitespace between standalone numbers/ranges
  const rawChunks = trimmed
    .split(/[,;\n]+/)
    .flatMap((chunk) => {
      const c = chunk.trim();
      if (!c) return [];
      // If user typed space-separated numbers/ranges like "5 14 37-40", split by spaces too
      if (
        /^(?:\d+[º°ªo]?(?:-[a-zA-Z0-9]+)*(?:\s*(?:-|a)\s*\d+[º°ªo]?)?\s+)+\d+[º°ªo]?(?:-[a-zA-Z0-9]+)*(?:\s*(?:-|a)\s*\d+[º°ªo]?)?$/i.test(
          c,
        )
      ) {
        return c.split(/\s+/);
      }
      return [c];
    })
    .map((s) => s.trim())
    .filter(Boolean);

  for (const rawChunk of rawChunks) {
    const chunk = rawChunk.replace(/[º°ª]/g, '').replace(/(\d)o(?=$|-|\s)/gi, '$1');

    // Check numeric range: e.g. "1-5", "Art. 1º - Art. 5º", "10 a 15", "121 a 129"
    const rangeMatch = chunk.match(
      /^(?:art(?:igo)?\.?\s*)?(\d+)\s*(?:-|–|—|\ba\b|\bat[eé]\b)\s*(?:art(?:igo)?\.?\s*)?(\d+)$/i,
    );
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        const lo = Math.min(start, end);
        const hi = Math.min(Math.max(start, end), lo + 250);
        numericRanges.push([lo, hi]);
        for (let n = lo; n <= hi; n++) {
          exactKeys.add(String(n));
        }
        continue;
      }
    }

    // Check lettered range within same article number: e.g. "359-A a 359-U" or "Art. 359-A - Art. 359-U"
    const letterRangeMatch = chunk.match(
      /^(?:art(?:igo)?\.?\s*)?(\d+)-([a-z])\s*(?:-|–|—|\ba\b|\bat[eé]\b)\s*(?:art(?:igo)?\.?\s*)?(?:(\d+)-)?([a-z])$/i,
    );
    if (letterRangeMatch) {
      const baseNum = letterRangeMatch[1];
      const endNum = letterRangeMatch[3] || baseNum;
      if (baseNum === endNum) {
        const c1 = letterRangeMatch[2].toLowerCase().charCodeAt(0);
        const c2 = letterRangeMatch[4].toLowerCase().charCodeAt(0);
        const loC = Math.min(c1, c2);
        const hiC = Math.max(c1, c2);
        for (let code = loC; code <= hiC; code++) {
          exactKeys.add(`${baseNum}-${String.fromCharCode(code)}`);
        }
        continue;
      }
    }

    const numericOrBaseMatch = chunk.match(
      /^(?:art(?:igo)?\.?\s*)?(\d+(?:-[a-zA-Z0-9]+)*)$/i,
    );
    if (numericOrBaseMatch) {
      exactKeys.add(numericOrBaseMatch[1].toLowerCase());
      continue;
    }

    const normText = normalizeSearch(rawChunk);
    if (normText) {
      textTokens.push(normText);
    }
  }

  return { exactKeys, textTokens, numericRanges };
}

export function itemMatchesMultiArticleSpec(
  item: { artigo_base?: string; dispositivo: string },
  spec: MultiArticleSpec,
): boolean {
  if (!spec.exactKeys.size && !spec.textTokens.length && !(spec.numericRanges?.length)) {
    return true;
  }

  const baseNorm = normalizeArticleIdentifier(item.artigo_base || '');
  const deviceNorm = normalizeArticleIdentifier(item.dispositivo || '');

  if (baseNorm && spec.exactKeys.has(baseNorm)) return true;
  if (deviceNorm && spec.exactKeys.has(deviceNorm)) return true;

  // Support multi-hyphen children when parent lettered key is in exactKeys (e.g., "359-m" in range "359-A a 359-U" matches "359-m-a")
  for (const norm of [baseNorm, deviceNorm]) {
    if (!norm) continue;
    const parentLetterMatch = norm.match(/^(\d+-[a-z])-[a-z0-9]+$/i);
    if (parentLetterMatch && spec.exactKeys.has(parentLetterMatch[1].toLowerCase())) {
      return true;
    }
  }

  // If the spec includes numeric ranges (e.g., "121 a 129"), include lettered articles in that range (e.g., "Art. 121-A")
  if (spec.numericRanges && spec.numericRanges.length > 0) {
    for (const norm of [baseNorm, deviceNorm]) {
      const leadNumMatch = norm.match(/^(\d+)(?:-[a-z0-9]+)*$/i);
      if (leadNumMatch) {
        const num = Number(leadNumMatch[1]);
        if (
          Number.isFinite(num) &&
          spec.numericRanges.some(([lo, hi]) => num >= lo && num <= hi)
        ) {
          return true;
        }
      }
    }
  }

  if (spec.textTokens.length) {
    const fullLabel = normalizeSearch(`${item.artigo_base || ''} ${item.dispositivo || ''}`);
    if (spec.textTokens.some((tok) => fullLabel.includes(tok))) return true;
  }

  return false;
}

export function formatIsoDateBr(iso: string): string {
  const m = String(iso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function sanitizeStudyFileSegment(raw: string): string {
  return String(raw || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

export function resolveActiveScheduleWeekKey(
  scheduleDayDates?: Partial<Record<WeekdayName, string>>,
  schedule?: ScheduleMap,
): string {
  const candidateDateBr =
    scheduleDayDates?.['Segunda-feira'] ||
    WEEKDAYS.map((d) => scheduleDayDates?.[d]).find(Boolean) ||
    WEEKDAYS.flatMap((d) => (schedule?.[d] || []).map((t) => t.data)).find(Boolean) ||
    '';
  const iso = candidateDateBr ? goalDateIso(candidateDateBr) : '';
  const weekVal = iso ? isoWeekInputValue(iso) : '';
  return weekVal || isoWeekInputValue(localDateIso());
}

export function buildScheduleWeekMetadata(
  weekKeyInput?: string,
  scheduleDayDates?: Partial<Record<WeekdayName, string>>,
): {
  weekKey: string;
  label: string;
  fileName: string;
  dayDates: Record<WeekdayName, string>;
} {
  const fallbackKey = isoWeekInputValue(localDateIso());
  const cleanKey =
    weekKeyInput && /^\d{4}-W\d{2}$/i.test(weekKeyInput.trim())
      ? weekKeyInput.trim().toUpperCase()
      : resolveActiveScheduleWeekKey(scheduleDayDates) || fallbackKey;

  const computedDates = getWeekDatesForIsoWeek(cleanKey) || getCurrentWeekDates();
  const dayDates: Record<WeekdayName, string> = { ...computedDates };
  WEEKDAYS.forEach((d) => {
    if (scheduleDayDates?.[d]?.trim()) {
      dayDates[d] = scheduleDayDates[d]!.trim();
    }
  });

  const m = cleanKey.match(/^(\d{4})-W(\d{2})$/);
  const startSafe = (dayDates['Segunda-feira'] || '').replace(/\//g, '-');
  const endSafe = (dayDates['Domingo'] || '').replace(/\//g, '-');
  const label = m
    ? `Semana ${m[2]}/${m[1]} (${dayDates['Segunda-feira']} a ${dayDates['Domingo']})`
    : `${dayDates['Segunda-feira']} a ${dayDates['Domingo']}`;
  const fileName = m
    ? `CRONOGRAMA - Semana ${m[2]}-${m[1]} (${startSafe} a ${endSafe}).txt`
    : `CRONOGRAMA - ${ cleanKey } (${startSafe} a ${endSafe}).txt`;

  return {
    weekKey: cleanKey,
    label,
    fileName,
    dayDates,
  };
}

export function serializeScheduleWeekToText(
  weekKeyInput: string,
  schedule: ScheduleMap,
  scheduleDayDates?: Partial<Record<WeekdayName, string>>,
): string {
  const meta = buildScheduleWeekMetadata(weekKeyInput, scheduleDayDates);
  const dayDatesHeader = WEEKDAYS.map((d) => `${d}=${meta.dayDates[d] || ''}`).join(' | ');
  const lines: string[] = [
    '# ==============================================================================',
    '# CRONOGRAMA SEMANAL - CENTRAL DE ESTUDOS',
    `# SEMANA: ${meta.weekKey}`,
    `# PERIODO: ${meta.label}`,
    `# ATUALIZADO_EM: ${localDateTimeBrazilian()}`,
    `# DATAS_DIAS: ${dayDatesHeader}`,
    '# Formato: Dia | Data | Assunto | Tempo | Observações | SegundosEstudados | DataPersonalizada | MatériaFixa | ConcursoAlvo',
    '# ==============================================================================',
    '',
  ];

  WEEKDAYS.forEach((day) => {
    const dayDate = meta.dayDates[day] || localDateBrazilian();
    const list = schedule?.[day] || [];
    lines.push(`# --- ${day} (${dayDate}) ---`);
    if (list.length === 0) {
      lines.push(`# (Sem tópicos planejados para ${day})`);
    } else {
      list.forEach((t) => {
        const cleanSubject = String(t.materia || '').replace(/\|/g, '/').trim() || '(Tópico sem título)';
        const cleanTime = String(t.tempo || '1h').replace(/\|/g, '/').trim();
        const cleanNotes = String(t.observacoes || '').replace(/\r?\n/g, ' ').replace(/\|/g, '/').trim();
        const sec = Math.max(0, Math.round(Number(t.estudado_segundos || 0)));
        const customFlag = t.data_personalizada ? '1' : '0';
        const cleanFixed = String(t.disciplina_fixa || '').replace(/\|/g, '/').trim();
        const cleanContest = String(t.concurso_alvo || '').replace(/\|/g, '/').trim();
        lines.push(
          `${day} | ${t.data || dayDate} | ${cleanSubject} | ${cleanTime} | ${cleanNotes} | ${sec} | ${customFlag} | ${cleanFixed} | ${cleanContest}`,
        );
      });
    }
    lines.push('');
  });

  return lines.join('\n');
}

export function parseScheduleWeekText(
  text: string,
  fallbackFileName?: string,
): WeeklyScheduleFileRecord {
  const lines = String(text || '').split(/\r?\n/);
  let headerWeekKey = '';
  let headerUpdatedAt = '';
  const parsedDayDates: Partial<Record<WeekdayName, string>> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('#')) continue;
    const weekMatch = line.match(/^#\s*SEMANA:\s*(\d{4}-W\d{2})/i);
    if (weekMatch) {
      headerWeekKey = weekMatch[1].toUpperCase();
      continue;
    }
    const updMatch = line.match(/^#\s*ATUALIZADO_EM:\s*(.+)$/i);
    if (updMatch) {
      headerUpdatedAt = updMatch[1].trim();
      continue;
    }
    const datesMatch = line.match(/^#\s*DATAS_DIAS:\s*(.+)$/i);
    if (datesMatch) {
      datesMatch[1].split('|').forEach((pair) => {
        const [rawDay, rawDate] = pair.split('=').map((s) => s?.trim() || '');
        const day = normalizedWeekday(rawDay);
        if (day && rawDate) {
          parsedDayDates[day] = rawDate;
        }
      });
    }
  }

  if (!headerWeekKey && fallbackFileName) {
    const fileWeekMatch = fallbackFileName.match(/Semana[\s_-]*(\d{2})[\s_-]*(\d{4})/i);
    if (fileWeekMatch) {
      headerWeekKey = `${fileWeekMatch[2]}-W${fileWeekMatch[1]}`;
    } else {
      const isoWeekMatch = fallbackFileName.match(/(\d{4}-W\d{2})/i);
      if (isoWeekMatch) headerWeekKey = isoWeekMatch[1].toUpperCase();
    }
  }

  const emptySchedule = WEEKDAYS.reduce<ScheduleMap>(
    (acc, d) => ({ ...acc, [d]: [] }),
    {} as ScheduleMap,
  );

  let parsedTopics: Array<{ day: WeekdayName; topic: ScheduleTopic }> = [];
  try {
    parsedTopics = parseScheduleText(text);
  } catch (err) {
    if (!headerWeekKey && Object.keys(parsedDayDates).length === 0) {
      throw err;
    }
  }

  parsedTopics.forEach(({ day, topic }) => {
    const cleanedMateria = topic.materia === '(Tópico sem título)' ? '' : topic.materia;
    emptySchedule[day].push({
      ...topic,
      materia: cleanedMateria,
    });
  });

  const resolvedWeekKey =
    headerWeekKey || resolveActiveScheduleWeekKey(parsedDayDates, emptySchedule);
  const meta = buildScheduleWeekMetadata(resolvedWeekKey, parsedDayDates);

  return {
    weekKey: meta.weekKey,
    label: meta.label,
    fileName: meta.fileName,
    updatedAt: headerUpdatedAt || localDateTimeBrazilian(),
    schedule: emptySchedule,
    scheduleDayDates: meta.dayDates,
  };
}

export function buildContestTxtFileName(contest: Pick<ContestItem, 'concurso' | 'id'>): string {
  const safe = sanitizeStudyFileSegment(contest.concurso || contest.id || 'Concurso');
  return `DATAS E LOCAIS - ${safe}.txt`;
}

export function buildEditalTxtFileName(contest: Pick<ContestItem, 'concurso' | 'id'>): string {
  const safe = sanitizeStudyFileSegment(contest.concurso || contest.id || 'Concurso');
  return `EDITAL - ${safe}.txt`;
}

function serializeEditalLawLinks(links?: EditalLawLink[]): string {
  if (!links || !links.length) return '';
  return links
    .map((l) => {
      const law = String(l.pastaLei || '').replace(/[|;=>\r\n]/g, ' ').trim();
      const spec = String(l.filtroArtigos || '').replace(/[|;=>\r\n]/g, ' ').trim();
      const lbl = l.label ? String(l.label).replace(/[|;=>\r\n[\]]/g, ' ').trim() : '';
      if (!law || !spec) return '';
      return lbl && lbl !== spec ? `${law} => ${spec} [${lbl}]` : `${law} => ${spec}`;
    })
    .filter(Boolean)
    .join(' ;; ');
}

function parseEditalLawLinks(raw?: string): EditalLawLink[] | undefined {
  const txt = String(raw || '').trim();
  if (!txt) return undefined;
  const parsed: EditalLawLink[] = [];
  for (const chunk of txt.split(';;')) {
    const clean = chunk.trim();
    if (!clean) continue;
    const arrowIdx = clean.indexOf('=>');
    if (arrowIdx === -1) continue;
    const pastaLei = clean.slice(0, arrowIdx).trim();
    let rest = clean.slice(arrowIdx + 2).trim();
    let label: string | undefined;
    const lblMatch = rest.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
    if (lblMatch) {
      rest = lblMatch[1].trim();
      label = lblMatch[2].trim() || undefined;
    }
    if (pastaLei && rest) {
      parsed.push({
        id: uid(10),
        pastaLei,
        filtroArtigos: rest,
        ...(label ? { label } : {}),
      });
    }
  }
  return parsed.length ? parsed : undefined;
}

function formatContestEditalPointPipeLine(pt: ContestEditalPoint, fallbackMateria?: string): string {
  const statusFlag = pt.estudado ? '[X]' : '[ ]';
  const mat = String(pt.materia || fallbackMateria || 'Geral').replace(/\|/g, '/').trim();
  const tit = String(pt.titulo || '').replace(/\|/g, '/').trim();
  const estEm = String(pt.estudado_em || '').replace(/\|/g, '/').trim();
  const obs = String(pt.observacao || '').replace(/\r?\n/g, ' ').replace(/\|/g, '/').trim();
  const linksStr = serializeEditalLawLinks(pt.artigos_vinculados);
  return linksStr
    ? `${statusFlag} | ${mat} | ${tit} | ${estEm} | ${obs} | ${linksStr}`
    : `${statusFlag} | ${mat} | ${tit} | ${estEm} | ${obs}`;
}

export function serializeContestRegistrationTxt(contest: ContestItem): string {
  const lines: string[] = [
    '# ==============================================================================',
    '# CONTROLE DE INSCRICOES, BOLETOS E LOCAIS DE PROVA - CENTRAL DE ESTUDOS',
    '# ==============================================================================',
    `ID: ${contest.id}`,
    `CONCURSO: ${contest.concurso || ''}`,
    `DATA_INSCRICAO_PROVA: ${contest.data_abertura || ''}`,
    `VENCIMENTO_BOLETO: ${contest.data_pagamento || ''}`,
    `STATUS_PAGAMENTO: ${contest.status_pagamento || 'Não Pago'}`,
    `LOCAL_PROVA: ${contest.local_prova || ''}`,
    `OBSERVACOES: ${(contest.observacoes || '').replace(/\r?\n/g, ' ')}`,
    `EDITAL_ARQUIVO: ${contest.edital_arquivo || buildEditalTxtFileName(contest)}`,
    '',
    '# PONTOS DO EDITAL VINCULADOS (Status | Matéria | Tópico | DataEstudo | Observação | VínculosLei)',
  ];

  const points = contest.edital_pontos || [];
  if (points.length === 0) {
    lines.push('# (Nenhum ponto de edital cadastrado para este concurso)');
  } else {
    points.forEach((pt) => {
      lines.push(formatContestEditalPointPipeLine(pt));
    });
  }

  return lines.join('\n') + '\n';
}

export function serializeAllContestsMasterTxt(contests: ContestItem[]): string {
  const lines: string[] = [
    '# ==============================================================================',
    '# PASTA DATAS & LOCAIS - CONTROLE GERAL DE INSCRICOES, BOLETOS E LOCAIS DE PROVA',
    `# ATUALIZADO_EM: ${localDateTimeBrazilian()}`,
    `# TOTAL_CONCURSOS: ${contests.length}`,
    '# ==============================================================================',
    '',
  ];

  contests.forEach((c, idx) => {
    lines.push(`# === CONCURSO ${idx + 1} ===`);
    lines.push(`ID: ${c.id}`);
    lines.push(`CONCURSO: ${c.concurso || ''}`);
    lines.push(`DATA_INSCRICAO_PROVA: ${c.data_abertura || ''}`);
    lines.push(`VENCIMENTO_BOLETO: ${c.data_pagamento || ''}`);
    lines.push(`STATUS_PAGAMENTO: ${c.status_pagamento || 'Não Pago'}`);
    lines.push(`LOCAL_PROVA: ${c.local_prova || ''}`);
    lines.push(`OBSERVACOES: ${(c.observacoes || '').replace(/\r?\n/g, ' ')}`);
    lines.push(`EDITAL_ARQUIVO: ${c.edital_arquivo || buildEditalTxtFileName(c)}`);
    (c.edital_pontos || []).forEach((pt) => {
      lines.push(formatContestEditalPointPipeLine(pt));
    });
    lines.push('---');
    lines.push('');
  });

  return lines.join('\n');
}

export function serializeContestEditalTxt(contest: ContestItem): string {
  const points = contest.edital_pontos || [];
  const studiedCount = points.filter((p) => p.estudado).length;
  const lines: string[] = [
    '# ==============================================================================',
    '# EDITAL VERTICALIZADO E CONTROLE DE PROVA - CENTRAL DE ESTUDOS',
    `# ID_CONCURSO: ${contest.id}`,
    `# CONCURSO: ${contest.concurso || ''}`,
    `# DATA_INSCRICAO_PROVA: ${contest.data_abertura || ''}`,
    `# VENCIMENTO_BOLETO: ${contest.data_pagamento || ''}`,
    `# STATUS_PAGAMENTO: ${contest.status_pagamento || 'Não Pago'}`,
    `# LOCAL_PROVA: ${contest.local_prova || ''}`,
    `# OBSERVACOES: ${(contest.observacoes || '').replace(/\r?\n/g, ' ')}`,
    `# PROGRESSO: ${studiedCount}/${points.length} pontos estudados`,
    `# ATUALIZADO_EM: ${localDateTimeBrazilian()}`,
    '# Formato: [X]/[ ] | Matéria | Tópico do Edital | DataEstudo | Observação | VínculosLei',
    '# ==============================================================================',
    '',
  ];

  const bySubject = new Map<string, ContestEditalPoint[]>();
  points.forEach((pt) => {
    const mat = pt.materia?.trim() || 'Geral';
    const list = bySubject.get(mat) || [];
    list.push(pt);
    bySubject.set(mat, list);
  });

  for (const [subject, list] of bySubject.entries()) {
    lines.push(`# Matéria: ${subject}`);
    list.forEach((pt) => {
      lines.push(formatContestEditalPointPipeLine(pt, subject));
    });
    lines.push('');
  }

  return lines.join('\n');
}

export function parseContestOrEditalTxt(
  rawText: string,
  fallbackFileName?: string,
): ContestItem[] {
  const text = String(rawText || '').trim();
  if (!text) return [];

  // Check if it contains multiple contests separated by '---' or '# === CONCURSO'
  const blocks = text.includes('\n---\n')
    ? text.split(/\n---\n+/).map((b) => b.trim()).filter(Boolean)
    : [text];

  const results: ContestItem[] = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    let id = '';
    let concurso = '';
    let data_abertura = '';
    let data_pagamento = '';
    let status_pagamento: 'Pago' | 'Não Pago' = 'Não Pago';
    let local_prova = '';
    let observacoes = '';
    let edital_arquivo = '';
    const edital_pontos: ContestEditalPoint[] = [];
    const plainLines: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const metaLine = line.replace(/^#\s*/, '');
      const kvMatch = metaLine.match(
        /^(ID|ID_CONCURSO|CONCURSO|DATA_INSCRICAO_PROVA|VENCIMENTO_BOLETO|STATUS_PAGAMENTO|LOCAL_PROVA|OBSERVACOES|EDITAL_ARQUIVO):\s*(.*)$/i,
      );
      if (kvMatch) {
        const key = kvMatch[1].toUpperCase();
        const val = kvMatch[2].trim();
        if (key === 'ID' || key === 'ID_CONCURSO') id = val;
        else if (key === 'CONCURSO') concurso = val;
        else if (key === 'DATA_INSCRICAO_PROVA') data_abertura = val;
        else if (key === 'VENCIMENTO_BOLETO') data_pagamento = val;
        else if (key === 'STATUS_PAGAMENTO') {
          status_pagamento = val.toLowerCase() === 'pago' ? 'Pago' : 'Não Pago';
        } else if (key === 'LOCAL_PROVA') local_prova = val;
        else if (key === 'OBSERVACOES') observacoes = val;
        else if (key === 'EDITAL_ARQUIVO') edital_arquivo = val;
        continue;
      }

      if (line.startsWith('#')) {
        const subjComment = line.match(/^#\s*Mat[eé]ria:\s*(.+)$/i);
        if (subjComment) {
          plainLines.push(`Matéria: ${subjComment[1].trim()}`);
        }
        continue;
      }

      const checkPipeMatch = line.match(/^\[([xX\s])\]\s*\|\s*(.+)$/);
      if (checkPipeMatch) {
        const studied = checkPipeMatch[1].toLowerCase() === 'x';
        const parts = checkPipeMatch[2].split('|').map((s) => s.trim());
        const materia = parts[0] || 'Geral';
        const titulo = parts[1] || parts[0] || '';
        const estudado_em = parts[2] || (studied ? localDateBrazilian() : undefined);
        const observacao = parts[3] || undefined;
        const artigos_vinculados = parseEditalLawLinks(parts[4]);
        if (titulo) {
          edital_pontos.push({
            id: uid(10),
            materia,
            titulo,
            estudado: studied,
            estudado_em: studied ? estudado_em : undefined,
            observacao,
            ...(artigos_vinculados ? { artigos_vinculados } : {}),
          });
        }
        continue;
      }

      plainLines.push(line);
    }

    if (!edital_pontos.length && plainLines.length > 0) {
      const parsedPlain = parseEditalTopicsText(plainLines.join('\n'), 'Geral');
      parsedPlain.forEach((pt) => {
        edital_pontos.push({
          id: uid(10),
          materia: pt.materia,
          titulo: pt.titulo,
          estudado: false,
        });
      });
    }

    if (!concurso && fallbackFileName) {
      concurso = fallbackFileName
        .replace(/^(?:EDITAL|DATAS\s*E\s*LOCAIS|CONCURSO)\s*-\s*/i, '')
        .replace(/\.txt$/i, '')
        .trim();
    }

    if (concurso || edital_pontos.length > 0) {
      results.push({
        id: id || uid(8),
        concurso: concurso || 'Concurso Importado',
        data_abertura,
        data_pagamento,
        status_pagamento,
        local_prova,
        observacoes,
        edital_arquivo: edital_arquivo || fallbackFileName || undefined,
        edital_pontos,
      });
    }
  }

  return results;
}



