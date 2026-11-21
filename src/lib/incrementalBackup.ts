import { WEEKDAYS, healAndNormalizeLawItems } from './parsers';
import {
  AppPreferences,
  CaseLawItem,
  CompletedGoal,
  CompletedSimulation,
  ContestEditalPoint,
  ContestItem,
  CriticalPoint,
  ErrorNotebookEntry,
  EssayRecord,
  HistoryRecord,
  HighlightColorKey,
  IncompleteGoal,
  LawFolderData,
  LawHighlight,
  LawReadingEntry,
  ProofFileRecord,
  Question,
  SavedIncidenceFilter,
  ScheduleMap,
  ScheduleTopic,
  StudyCycleConfig,
  StudyDatabase,
  StudyTimeRecord,
  SubmittedSimulation,
  PdfFileAnnotations,
  PersonalPdfFile,
  SummaryFile,
  WeekdayName,
  WeeklyScheduleFileRecord,
} from '../types/study';

export interface ArrayDelta<T> {
  upsert?: T[];
  deletedIds?: string[];
}

export interface RecordDelta<T> {
  upsert?: Record<string, T>;
  deletedKeys?: string[];
}

export interface IncrementalChangesSummary {
  addedOrUpdated: number;
  removed: number;
  sections: number;
}

export interface IncrementalDatabaseDelta {
  questions?: ArrayDelta<Question>;
  submittedSimulations?: ArrayDelta<SubmittedSimulation>;
  completedSimulations?: ArrayDelta<CompletedSimulation>;
  history?: ArrayDelta<HistoryRecord>;
  studyTimeRecords?: ArrayDelta<StudyTimeRecord>;
  annotations?: ArrayDelta<ErrorNotebookEntry>;
  caseLaw?: ArrayDelta<CaseLawItem>;
  contests?: ArrayDelta<ContestItem>;
  completedGoals?: ArrayDelta<CompletedGoal>;
  incompleteGoals?: ArrayDelta<IncompleteGoal>;
  proofFiles?: ArrayDelta<ProofFileRecord>;
  essays?: ArrayDelta<EssayRecord>;
  criticalPoints?: ArrayDelta<CriticalPoint>;
  schedule?: Partial<ScheduleMap>;
  scheduleDayDates?: Partial<Record<WeekdayName, string>>;
  weeklySchedules?: RecordDelta<WeeklyScheduleFileRecord>;
  weeklyGoalNotes?: RecordDelta<string>;
  laws?: RecordDelta<LawFolderData>;
  lawHighlights?: RecordDelta<Array<{ text: string; color: HighlightColorKey } | LawHighlight>>;
  readLawItems?: RecordDelta<string[]>;
  lawReadDates?: RecordDelta<LawReadingEntry[]>;
  savedIncidenceFilters?: ArrayDelta<SavedIncidenceFilter>;
  lawLastReadPosition?: RecordDelta<string>;
  lawNotes?: RecordDelta<string>;
  pdfFolders?: RecordDelta<PersonalPdfFile[]>;
  pdfAnnotations?: RecordDelta<PdfFileAnnotations>;
  summaryFolders?: RecordDelta<SummaryFile[]>;
  proofBanks?: string[];
  fixedSubjects?: string[];
  phrases?: string[];
  studyCycle?: StudyCycleConfig;
  preferences?: AppPreferences;
  deletedTombstones?: Record<string, number>;
}

export interface IncrementalBackupEnvelope {
  version: 3;
  backupType: 'incremental';
  app: string;
  updatedAt: string;
  baseUpdatedAt?: string;
  contentHash: string;
  userEmail?: string;
  changedSections: string[];
  changesSummary: IncrementalChangesSummary;
  delta: IncrementalDatabaseDelta;
}

/**
 * Deterministic fast hash of an already-serialized JSON string (avoids double JSON.stringify).
 */
export function computeSerializedContentHash(str: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Deterministic fast hash of StudyDatabase content (used to avoid redundant Drive writes).
 */
export function computeDatabaseContentHash(db: StudyDatabase): string {
  return computeSerializedContentHash(JSON.stringify(db));
}

function stableJson(val: unknown): string {
  return JSON.stringify(val);
}

function diffArrayByKey<T>(
  baseArr: T[] | undefined,
  curArr: T[] | undefined,
  getKey: (item: T) => string,
): ArrayDelta<T> | undefined {
  const baseList = baseArr || [];
  const curList = curArr || [];
  const baseMap = new Map<string, string>();
  baseList.forEach((item) => {
    const k = getKey(item);
    if (k) baseMap.set(k, stableJson(item));
  });

  const curKeys = new Set<string>();
  const upsert: T[] = [];
  for (const item of curList) {
    const k = getKey(item);
    if (!k) continue;
    curKeys.add(k);
    const prevJson = baseMap.get(k);
    if (prevJson === undefined || prevJson !== stableJson(item)) {
      upsert.push(item);
    }
  }

  const deletedIds: string[] = [];
  for (const k of baseMap.keys()) {
    if (!curKeys.has(k)) {
      deletedIds.push(k);
    }
  }

  if (upsert.length === 0 && deletedIds.length === 0) return undefined;
  const result: ArrayDelta<T> = {};
  if (upsert.length > 0) result.upsert = upsert;
  if (deletedIds.length > 0) result.deletedIds = deletedIds;
  return result;
}

function diffRecord<T>(
  baseRec: Record<string, T> | undefined,
  curRec: Record<string, T> | undefined,
): RecordDelta<T> | undefined {
  const baseObj = baseRec || {};
  const curObj = curRec || {};
  const upsert: Record<string, T> = {};
  const deletedKeys: string[] = [];

  for (const [k, v] of Object.entries(curObj)) {
    if (!(k in baseObj) || stableJson(baseObj[k]) !== stableJson(v)) {
      upsert[k] = v;
    }
  }

  for (const k of Object.keys(baseObj)) {
    if (!(k in curObj)) {
      deletedKeys.push(k);
    }
  }

  const upsertCount = Object.keys(upsert).length;
  if (upsertCount === 0 && deletedKeys.length === 0) return undefined;
  const result: RecordDelta<T> = {};
  if (upsertCount > 0) result.upsert = upsert;
  if (deletedKeys.length > 0) result.deletedKeys = deletedKeys;
  return result;
}

export function buildIncrementalDatabaseBackup(
  baseDb: StudyDatabase | null,
  currentDb: StudyDatabase,
  meta: { updatedAt: string; baseUpdatedAt?: string; userEmail?: string },
): {
  hasChanges: boolean;
  envelope: IncrementalBackupEnvelope;
} {
  const delta: IncrementalDatabaseDelta = {};
  const changedSections: string[] = [];
  let addedOrUpdated = 0;
  let removed = 0;

  const trackArray = <K extends keyof IncrementalDatabaseDelta, T>(
    section: K,
    baseArr: T[] | undefined,
    curArr: T[] | undefined,
    getKey: (item: T) => string,
  ) => {
    const d = diffArrayByKey(baseArr, curArr, getKey);
    if (d) {
      (delta as any)[section] = d;
      changedSections.push(String(section));
      addedOrUpdated += d.upsert?.length || 0;
      removed += d.deletedIds?.length || 0;
    }
  };

  const trackRecord = <K extends keyof IncrementalDatabaseDelta, T>(
    section: K,
    baseRec: Record<string, T> | undefined,
    curRec: Record<string, T> | undefined,
  ) => {
    const d = diffRecord(baseRec, curRec);
    if (d) {
      (delta as any)[section] = d;
      changedSections.push(String(section));
      addedOrUpdated += Object.keys(d.upsert || {}).length;
      removed += d.deletedKeys?.length || 0;
    }
  };

  trackArray('questions', baseDb?.questions, currentDb.questions, (q) => q.id);
  trackArray('submittedSimulations', baseDb?.submittedSimulations, currentDb.submittedSimulations, (s) => s.id);
  trackArray('completedSimulations', baseDb?.completedSimulations, currentDb.completedSimulations, (s) => s.id);
  trackArray('history', baseDb?.history, currentDb.history, (h) => h.id);
  trackArray('studyTimeRecords', baseDb?.studyTimeRecords, currentDb.studyTimeRecords, (r) => r.quizId);
  trackArray('annotations', baseDb?.annotations, currentDb.annotations, (a) => a.id);
  trackArray('caseLaw', baseDb?.caseLaw, currentDb.caseLaw, (c) => c.id);
  trackArray('contests', baseDb?.contests, currentDb.contests, (c) => c.id);
  trackArray('completedGoals', baseDb?.completedGoals, currentDb.completedGoals, (g) => g.id);
  trackArray('incompleteGoals', baseDb?.incompleteGoals, currentDb.incompleteGoals, (g) => g.id);
  trackArray('proofFiles', baseDb?.proofFiles, currentDb.proofFiles, (p) => p.id);
  trackArray('essays', baseDb?.essays, currentDb.essays, (e) => e.id);
  trackArray('criticalPoints', baseDb?.criticalPoints, currentDb.criticalPoints, (p) => p.id);

  // Schedule per weekday
  const scheduleDelta: Partial<ScheduleMap> = {};
  let scheduleChanged = false;
  for (const day of WEEKDAYS) {
    const prevDay = baseDb?.schedule?.[day] || [];
    const curDay = currentDb.schedule?.[day] || [];
    if (!baseDb || stableJson(prevDay) !== stableJson(curDay)) {
      scheduleDelta[day] = curDay;
      scheduleChanged = true;
      addedOrUpdated += curDay.length || 1;
    }
  }
  if (scheduleChanged) {
    delta.schedule = scheduleDelta;
    changedSections.push('schedule');
  }

  // General date per weekday
  const scheduleDayDatesDelta: Partial<Record<WeekdayName, string>> = {};
  let dayDatesChanged = false;
  for (const day of WEEKDAYS) {
    const prevDate = baseDb?.scheduleDayDates?.[day] || '';
    const curDate = currentDb.scheduleDayDates?.[day] || '';
    if ((!baseDb && curDate) || prevDate !== curDate) {
      scheduleDayDatesDelta[day] = curDate;
      dayDatesChanged = true;
      addedOrUpdated += 1;
    }
  }
  if (dayDatesChanged) {
    delta.scheduleDayDates = scheduleDayDatesDelta;
    changedSections.push('scheduleDayDates');
  }

  trackRecord('weeklySchedules', baseDb?.weeklySchedules, currentDb.weeklySchedules);
  trackRecord('weeklyGoalNotes', baseDb?.weeklyGoalNotes, currentDb.weeklyGoalNotes);
  trackRecord('laws', baseDb?.laws, currentDb.laws);
  trackRecord('lawHighlights', baseDb?.lawHighlights, currentDb.lawHighlights);
  trackRecord('readLawItems', baseDb?.readLawItems, currentDb.readLawItems);
  trackRecord('lawReadDates', baseDb?.lawReadDates, currentDb.lawReadDates);
  trackArray('savedIncidenceFilters', baseDb?.savedIncidenceFilters, currentDb.savedIncidenceFilters, (f) => f.id);
  trackRecord('lawLastReadPosition', baseDb?.lawLastReadPosition, currentDb.lawLastReadPosition);
  trackRecord('lawNotes', baseDb?.lawNotes, currentDb.lawNotes);
  trackRecord('pdfFolders', baseDb?.pdfFolders, currentDb.pdfFolders);
  trackRecord('pdfAnnotations', baseDb?.pdfAnnotations, currentDb.pdfAnnotations);
  trackRecord('summaryFolders', baseDb?.summaryFolders, currentDb.summaryFolders);

  if (!baseDb || stableJson(baseDb.proofBanks) !== stableJson(currentDb.proofBanks)) {
    delta.proofBanks = currentDb.proofBanks;
    changedSections.push('proofBanks');
    addedOrUpdated += 1;
  }
  if (!baseDb || stableJson(baseDb.fixedSubjects) !== stableJson(currentDb.fixedSubjects)) {
    delta.fixedSubjects = currentDb.fixedSubjects;
    changedSections.push('fixedSubjects');
    addedOrUpdated += 1;
  }
  if (!baseDb || stableJson(baseDb.phrases) !== stableJson(currentDb.phrases)) {
    delta.phrases = currentDb.phrases;
    changedSections.push('phrases');
    addedOrUpdated += 1;
  }
  if (!baseDb || stableJson(baseDb.studyCycle) !== stableJson(currentDb.studyCycle)) {
    if (currentDb.studyCycle) {
      delta.studyCycle = currentDb.studyCycle;
      changedSections.push('studyCycle');
      addedOrUpdated += 1;
    }
  }
  if (!baseDb || stableJson(baseDb.preferences) !== stableJson(currentDb.preferences)) {
    delta.preferences = currentDb.preferences;
    changedSections.push('preferences');
    addedOrUpdated += 1;
  }
  if (
    currentDb.deletedTombstones &&
    Object.keys(currentDb.deletedTombstones).length > 0 &&
    (!baseDb || stableJson(baseDb.deletedTombstones || {}) !== stableJson(currentDb.deletedTombstones))
  ) {
    delta.deletedTombstones = currentDb.deletedTombstones;
    changedSections.push('deletedTombstones');
    addedOrUpdated += Object.keys(currentDb.deletedTombstones).length;
  }

  const envelope: IncrementalBackupEnvelope = {
    version: 3,
    backupType: 'incremental',
    app: 'Central de Estudos',
    updatedAt: meta.updatedAt,
    baseUpdatedAt: meta.baseUpdatedAt,
    contentHash: computeDatabaseContentHash(currentDb),
    userEmail: meta.userEmail,
    changedSections,
    changesSummary: {
      addedOrUpdated,
      removed,
      sections: changedSections.length,
    },
    delta,
  };

  return {
    hasChanges: changedSections.length > 0,
    envelope,
  };
}

function mergeArrayByKey<T>(
  existing: T[] | undefined,
  delta: ArrayDelta<T> | undefined,
  getKey: (item: T) => string,
  mergeItem?: (prev: T, next: T) => T,
): T[] {
  const baseList = existing || [];
  if (!delta) return baseList;

  const deletedSet = new Set(delta.deletedIds || []);
  const upsertMap = new Map<string, T>();
  (delta.upsert || []).forEach((item) => {
    const k = getKey(item);
    if (k) upsertMap.set(k, item);
  });

  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of baseList) {
    const k = getKey(item);
    if (!k) continue;
    if (deletedSet.has(k)) continue;
    seen.add(k);
    const updated = upsertMap.get(k);
    if (updated) {
      result.push(mergeItem ? mergeItem(item, updated) : updated);
    } else {
      result.push(item);
    }
  }

  for (const item of delta.upsert || []) {
    const k = getKey(item);
    if (k && !seen.has(k) && !deletedSet.has(k)) {
      seen.add(k);
      result.push(item);
    }
  }

  return result;
}

function mergeContestIncrementally(prev: ContestItem, next: ContestItem): ContestItem {
  const prevPts = prev.edital_pontos || [];
  const nextPts = next.edital_pontos || [];
  if (prevPts.length === 0) return next;
  if (nextPts.length === 0) return { ...next, edital_pontos: prevPts };

  const prevById = new Map<string, ContestEditalPoint>();
  const prevByTitleKey = new Map<string, ContestEditalPoint>();
  prevPts.forEach((p) => {
    if (p.id) prevById.set(p.id, p);
    prevByTitleKey.set(`${p.materia.trim().toLowerCase()}::${p.titulo.trim().toLowerCase()}`, p);
  });

  const byId = new Map<string, ContestEditalPoint>();
  const byTitleKey = new Map<string, ContestEditalPoint>();
  const mergedPts: ContestEditalPoint[] = nextPts.map((p) => {
    const tKey = `${p.materia.trim().toLowerCase()}::${p.titulo.trim().toLowerCase()}`;
    const prevMatch = (p.id ? prevById.get(p.id) : undefined) || prevByTitleKey.get(tKey);
    const enriched: ContestEditalPoint =
      p.artigos_vinculados === undefined && prevMatch?.artigos_vinculados?.length
        ? { ...p, artigos_vinculados: prevMatch.artigos_vinculados }
        : p;
    if (enriched.id) byId.set(enriched.id, enriched);
    byTitleKey.set(tKey, enriched);
    return enriched;
  });

  const seenIds = new Set(mergedPts.map((p) => p.id));
  const seenKeys = new Set(
    mergedPts.map((p) => `${p.materia.trim().toLowerCase()}::${p.titulo.trim().toLowerCase()}`),
  );

  for (const p of prevPts) {
    const tKey = `${p.materia.trim().toLowerCase()}::${p.titulo.trim().toLowerCase()}`;
    if (!byId.has(p.id) && !byTitleKey.has(tKey) && !seenIds.has(p.id) && !seenKeys.has(tKey)) {
      mergedPts.push(p);
    }
  }

  return {
    ...prev,
    ...next,
    edital_pontos: mergedPts,
  };
}

function mergeLawFolderIncrementally(prev: LawFolderData, next: LawFolderData): LawFolderData {
  const prevItems = healAndNormalizeLawItems(Array.isArray(prev?.items) ? prev.items : []);
  const nextItems = healAndNormalizeLawItems(Array.isArray(next?.items) ? next.items : []);
  const prevPdfs = Array.isArray(prev?.pdfs) ? prev.pdfs : [];
  const nextPdfs = Array.isArray(next?.pdfs) ? next.pdfs : [];

  // Never let an empty (0) folder snapshot overwrite populated law items
  let mergedItems = nextItems.length === 0 && prevItems.length > 0 ? prevItems : nextItems;

  if (prevItems.length > 0 && nextItems.length > 0) {
    const prevById = new Map(prevItems.map((it) => [it.id, it]));
    const prevByDevKey = new Map(
      prevItems.map((it) => [
        `${(it.artigo_base || '').trim().toLowerCase()}::${(it.dispositivo || '').trim().toLowerCase()}::${(it.texto || '').slice(0, 32).trim().toLowerCase()}`,
        it,
      ]),
    );
    mergedItems = nextItems.map((it) => {
      const devKey = `${(it.artigo_base || '').trim().toLowerCase()}::${(it.dispositivo || '').trim().toLowerCase()}::${(it.texto || '').slice(0, 32).trim().toLowerCase()}`;
      const match = prevById.get(it.id) || prevByDevKey.get(devKey);
      if (!match) return it;
      const mergedLeituras =
        it.leituras?.length || match.leituras?.length
          ? Array.from(
              new Map(
                [...(match.leituras || []), ...(it.leituras || [])].map((r) => [r.data, r]),
              ).values(),
            ).sort((a, b) => b.data.localeCompare(a.data))
          : undefined;
      return {
        ...it,
        observacao: it.observacao || match.observacao || '',
        dica: it.dica || match.dica || '',
        grau:
          it.grau && it.grau !== 'Não Classificado'
            ? it.grau
            : match.grau || 'Não Classificado',
        ...(mergedLeituras?.length ? { leituras: mergedLeituras } : {}),
      };
    });
  }

  const pdfMap = new Map<string, (typeof prevPdfs)[number]>();
  for (const p of prevPdfs) {
    const key = p.blobKey || p.name || p.id;
    if (key) pdfMap.set(key, p);
  }
  for (const p of nextPdfs) {
    const key = p.blobKey || p.name || p.id;
    if (key) pdfMap.set(key, p);
  }

  return {
    name: next?.name || prev?.name,
    items: mergedItems,
    pdfs: Array.from(pdfMap.values()),
  };
}

function mergeUniqueStrings(prev: string[] | undefined, next: string[] | undefined): string[] {
  return Array.from(new Set([...(prev || []), ...(next || [])].filter(Boolean)));
}

function mergeLawReadDatesArrays(
  prev: LawReadingEntry[] | undefined,
  next: LawReadingEntry[] | undefined,
): LawReadingEntry[] {
  const byKey = new Map<string, LawReadingEntry>();
  for (const item of prev || []) {
    if (!item) continue;
    const k = item.id || `${item.data || ''}::${item.observacao || ''}`;
    if (k) byKey.set(k, item);
  }
  for (const item of next || []) {
    if (!item) continue;
    const k = item.id || `${item.data || ''}::${item.observacao || ''}`;
    if (k) byKey.set(k, item);
  }
  return Array.from(byKey.values());
}

function mergeLawHighlightsArrays(
  prev: LawHighlight[] | undefined,
  next: LawHighlight[] | undefined,
): LawHighlight[] {
  const byText = new Map<string, LawHighlight>();
  for (const h of prev || []) {
    const t = typeof h === 'string' ? h : h?.text;
    if (!t) continue;
    byText.set(t, typeof h === 'string' ? { text: t, color: 'yellow' } : h);
  }
  for (const h of next || []) {
    const t = typeof h === 'string' ? h : h?.text;
    if (!t) continue;
    byText.set(t, typeof h === 'string' ? { text: t, color: 'yellow' } : h);
  }
  return Array.from(byText.values());
}

function mergePersonalPdfArrays(
  prev: PersonalPdfFile[] | undefined,
  next: PersonalPdfFile[] | undefined,
): PersonalPdfFile[] {
  const byKey = new Map<string, PersonalPdfFile>();
  for (const f of prev || []) {
    if (!f) continue;
    const k = f.id || f.blobKey || f.name;
    if (k) byKey.set(k, f);
  }
  for (const f of next || []) {
    if (!f) continue;
    const k = f.id || f.blobKey || f.name;
    if (k) byKey.set(k, f);
  }
  return Array.from(byKey.values());
}

function mergeSummaryFileArrays(
  prev: SummaryFile[] | undefined,
  next: SummaryFile[] | undefined,
): SummaryFile[] {
  const byKey = new Map<string, SummaryFile>();
  for (const f of prev || []) {
    if (!f) continue;
    const k = f.id || f.blobKey || f.name;
    if (k) byKey.set(k, f);
  }
  for (const f of next || []) {
    if (!f) continue;
    const k = f.id || f.blobKey || f.name;
    if (k) byKey.set(k, f);
  }
  return Array.from(byKey.values());
}

function mergeRecordDelta<T>(
  existing: Record<string, T> | undefined,
  delta: RecordDelta<T> | undefined,
  mergeValue?: (prev: T, next: T) => T,
): Record<string, T> {
  const baseObj = { ...(existing || {}) };
  if (!delta) return baseObj;

  for (const key of delta.deletedKeys || []) {
    delete baseObj[key];
  }
  if (delta.upsert) {
    for (const [key, value] of Object.entries(delta.upsert)) {
      if (mergeValue && key in baseObj && baseObj[key] !== undefined) {
        baseObj[key] = mergeValue(baseObj[key], value);
      } else {
        baseObj[key] = value;
      }
    }
  }
  return baseObj;
}

export function isIncrementalBackupPayload(raw: unknown): raw is IncrementalBackupEnvelope {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, any>;
  return obj.backupType === 'incremental' && obj.delta && typeof obj.delta === 'object';
}

function isSeedScheduleTopic(topic: ScheduleTopic): boolean {
  return /^sch-[1-8]$/.test(topic.id || '');
}

function mergeScheduleDayIncrementally(
  baseTopics: ScheduleTopic[] | undefined,
  deltaTopics: ScheduleTopic[],
  _additiveMerge = false,
): ScheduleTopic[] {
  const prev = baseTopics || [];
  const prevHasCustom = prev.some((t) => !isSeedScheduleTopic(t));
  const deltaOnlySeed = deltaTopics.length > 0 && deltaTopics.every((t) => isSeedScheduleTopic(t));
  // Never overwrite custom user schedule topics with default seed topics (sch-1..sch-8)
  if (prevHasCustom && deltaOnlySeed) {
    return prev;
  }
  // deltaTopics is the authoritative updated topic list for this day (including topic deletions)
  return deltaTopics;
}

/**
 * Applies an incremental backup envelope onto an existing StudyDatabase without replacing
 * unmodified sections or existing items.
 */
export function applyIncrementalDeltaToDatabase(
  baseDb: StudyDatabase,
  envelope: IncrementalBackupEnvelope,
  options?: { additiveMerge?: boolean },
): StudyDatabase {
  const additive = Boolean(options?.additiveMerge);
  const d = envelope.delta || {};
  const nextSchedule: ScheduleMap = { ...baseDb.schedule };
  if (d.schedule) {
    (Object.keys(d.schedule) as WeekdayName[]).forEach((day) => {
      if (Array.isArray(d.schedule?.[day])) {
        nextSchedule[day] = mergeScheduleDayIncrementally(
          baseDb.schedule?.[day],
          d.schedule[day]!,
          additive,
        );
      }
    });
  }

  const nextScheduleDayDates: Partial<Record<WeekdayName, string>> = {
    ...(baseDb.scheduleDayDates || {}),
  };
  if (d.scheduleDayDates) {
    (Object.keys(d.scheduleDayDates) as WeekdayName[]).forEach((day) => {
      const val = d.scheduleDayDates?.[day];
      if (val) nextScheduleDayDates[day] = val;
      else if (!additive) delete nextScheduleDayDates[day];
    });
  }

  return {
    ...baseDb,
    questions: mergeArrayByKey(baseDb.questions, d.questions, (x) => x.id),
    submittedSimulations: mergeArrayByKey(baseDb.submittedSimulations, d.submittedSimulations, (x) => x.id),
    completedSimulations: mergeArrayByKey(baseDb.completedSimulations, d.completedSimulations, (x) => x.id),
    history: mergeArrayByKey(baseDb.history, d.history, (x) => x.id),
    studyTimeRecords: mergeArrayByKey(baseDb.studyTimeRecords, d.studyTimeRecords, (x) => x.quizId),
    annotations: mergeArrayByKey(baseDb.annotations, d.annotations, (x) => x.id),
    caseLaw: mergeArrayByKey(baseDb.caseLaw, d.caseLaw, (x) => x.id),
    contests: mergeArrayByKey(baseDb.contests, d.contests, (x) => x.id, mergeContestIncrementally),
    completedGoals: mergeArrayByKey(baseDb.completedGoals, d.completedGoals, (x) => x.id),
    incompleteGoals: mergeArrayByKey(baseDb.incompleteGoals, d.incompleteGoals, (x) => x.id),
    proofFiles: mergeArrayByKey(baseDb.proofFiles, d.proofFiles, (x) => x.id),
    essays: mergeArrayByKey(baseDb.essays, d.essays, (x) => x.id),
    criticalPoints: mergeArrayByKey(baseDb.criticalPoints, d.criticalPoints, (x) => x.id),
    schedule: nextSchedule,
    scheduleDayDates: nextScheduleDayDates,
    weeklySchedules: mergeRecordDelta(baseDb.weeklySchedules, d.weeklySchedules),
    weeklyGoalNotes: mergeRecordDelta(baseDb.weeklyGoalNotes, d.weeklyGoalNotes),
    laws: mergeRecordDelta(baseDb.laws, d.laws, mergeLawFolderIncrementally),
    lawHighlights: mergeRecordDelta(
      baseDb.lawHighlights as Record<string, LawHighlight[]> | undefined,
      d.lawHighlights as RecordDelta<LawHighlight[]>,
      additive ? mergeLawHighlightsArrays : undefined,
    ),
    readLawItems: mergeRecordDelta(
      baseDb.readLawItems,
      d.readLawItems,
      additive ? mergeUniqueStrings : undefined,
    ),
    lawReadDates: mergeRecordDelta(
      baseDb.lawReadDates,
      d.lawReadDates,
      additive ? mergeLawReadDatesArrays : undefined,
    ),
    savedIncidenceFilters: mergeArrayByKey(
      baseDb.savedIncidenceFilters,
      d.savedIncidenceFilters,
      (x) => x.id,
    ),
    lawLastReadPosition: mergeRecordDelta(baseDb.lawLastReadPosition, d.lawLastReadPosition),
    lawNotes: mergeRecordDelta(baseDb.lawNotes, d.lawNotes),
    pdfFolders: mergeRecordDelta(
      baseDb.pdfFolders,
      d.pdfFolders,
      additive ? mergePersonalPdfArrays : undefined,
    ),
    pdfAnnotations: mergeRecordDelta(baseDb.pdfAnnotations, d.pdfAnnotations),
    summaryFolders: mergeRecordDelta(
      baseDb.summaryFolders,
      d.summaryFolders,
      additive ? mergeSummaryFileArrays : undefined,
    ),
    proofBanks:
      d.proofBanks !== undefined
        ? additive
          ? mergeUniqueStrings(baseDb.proofBanks, d.proofBanks)
          : d.proofBanks
        : baseDb.proofBanks,
    fixedSubjects:
      d.fixedSubjects !== undefined
        ? additive
          ? mergeUniqueStrings(baseDb.fixedSubjects, d.fixedSubjects)
          : d.fixedSubjects
        : baseDb.fixedSubjects,
    phrases:
      d.phrases !== undefined
        ? additive
          ? mergeUniqueStrings(baseDb.phrases, d.phrases)
          : d.phrases
        : baseDb.phrases,
    studyCycle: d.studyCycle !== undefined ? d.studyCycle : baseDb.studyCycle,
    preferences: d.preferences
      ? (() => {
          const baseFolder = baseDb.preferences?.default_drive_folder;
          const deltaFolder = d.preferences.default_drive_folder;
          let resolvedFolder = deltaFolder ?? baseFolder;
          if (baseFolder && deltaFolder) {
            const baseMs = Date.parse(baseFolder.updatedAt || '') || 0;
            const deltaMs = Date.parse(deltaFolder.updatedAt || '') || 0;
            if (baseFolder.id && !deltaFolder.id) {
              resolvedFolder = baseFolder;
            } else if (!baseFolder.id && deltaFolder.id) {
              resolvedFolder = deltaFolder;
            } else if (baseMs > deltaMs) {
              resolvedFolder = baseFolder;
            } else {
              resolvedFolder = deltaFolder;
            }
          }
          const baseCareer = baseDb.preferences?.career_meta;
          const deltaCareer = d.preferences.career_meta;
          let resolvedCareer = deltaCareer ?? baseCareer;
          if (baseCareer && deltaCareer) {
            const mergedUnlockedAt: Record<string, string> = {
              ...(baseCareer.unlocked_at || {}),
            };
            Object.entries(deltaCareer.unlocked_at || {}).forEach(([k, v]) => {
              if (!v) return;
              if (!mergedUnlockedAt[k] || v < mergedUnlockedAt[k]) {
                mergedUnlockedAt[k] = v;
              }
            });
            const mergedWeekly: Record<string, string> = {
              ...(baseCareer.completed_weekly_missions || {}),
              ...(deltaCareer.completed_weekly_missions || {}),
            };
            const mergedNotifiedMedals = Array.from(
              new Set([
                ...(baseCareer.last_notified_medals || []),
                ...(deltaCareer.last_notified_medals || []),
              ]),
            );
            resolvedCareer = {
              ...baseCareer,
              ...deltaCareer,
              pinned_medals:
                deltaCareer.pinned_medals !== undefined
                  ? deltaCareer.pinned_medals
                  : baseCareer.pinned_medals,
              unlocked_at: mergedUnlockedAt,
              completed_weekly_missions: mergedWeekly,
              last_notified_level: Math.max(
                baseCareer.last_notified_level || 0,
                deltaCareer.last_notified_level || 0,
              ),
              last_notified_medals: mergedNotifiedMedals,
            };
          }
          return {
            ...baseDb.preferences,
            ...d.preferences,
            modules: {
              ...(baseDb.preferences?.modules || {}),
              ...(d.preferences.modules || {}),
            },
            ...(resolvedFolder ? { default_drive_folder: resolvedFolder } : {}),
            ...(resolvedCareer ? { career_meta: resolvedCareer } : {}),
          };
        })()
      : baseDb.preferences,
    deletedTombstones: mergeTombstoneMaps(baseDb.deletedTombstones, d.deletedTombstones),
  };
}

function normalizeGoalMatchPart(val?: string): string {
  return String(val || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function getPendingMatchKeys(
  item: {
    data?: string;
    dia_semana?: string;
    materia?: string;
    tempo?: string;
    observacoes?: string;
  },
  fallbackDay?: string,
  fallbackDate?: string,
) {
  const day = normalizeGoalMatchPart(item.dia_semana || fallbackDay);
  const date = normalizeGoalMatchPart(item.data || fallbackDate);
  const materia = normalizeGoalMatchPart(item.materia);
  const tempo = normalizeGoalMatchPart(item.tempo);
  const obs = normalizeGoalMatchPart(item.observacoes);
  return {
    day,
    date,
    materia,
    strictKey: `${day}::${date}::${materia}::${tempo}::${obs}`,
    baseKey: `${day}::${date}::${materia}::${obs}`,
    dateMateriaKey: `${day}::${date}::${materia}`,
    noDateKey: `${day}::${materia}::${obs}`,
    noDateMateriaKey: `${day}::${materia}`,
  };
}

function countByKey<T>(
  items: T[],
  keyFn: (item: T) => string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = keyFn(item);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

/**
 * Prevents additive merges (offline_guest -> account, offline -> Drive/Apps Script, Drive TXT -> DB)
 * from resurrecting items in `incompleteGoals`, `schedule`, or `weeklySchedules` that were already
 * finalized into `completedGoals` or archived from `schedule` into `incompleteGoals`.
 */
export function reconcileCompletedAndArchivedItems(
  mergedDb: StudyDatabase,
  authoritativeDb: StudyDatabase,
  olderBaseDb?: StudyDatabase | null,
): StudyDatabase {
  const olderCompletedIds = new Set((olderBaseDb?.completedGoals || []).map((g) => g.id));
  const olderIncompleteIds = new Set((olderBaseDb?.incompleteGoals || []).map((g) => g.id));

  const authCompleted = authoritativeDb.completedGoals || [];
  const authIncomplete = authoritativeDb.incompleteGoals || [];
  const authIncompleteIds = new Set(authIncomplete.map((g) => g.id));

  // Pre-count how many copies of each signature remain intentionally pending in authoritativeDb
  const authIncBaseCounts = countByKey(
    authIncomplete,
    (g) => getPendingMatchKeys(g).baseKey,
  );
  const authIncNoDateCounts = countByKey(
    authIncomplete,
    (g) => getPendingMatchKeys(g).noDateKey,
  );

  const authScheduleBaseCountsByDay = new Map<WeekdayName, Map<string, number>>();
  const authScheduleNoDateCountsByDay = new Map<WeekdayName, Map<string, number>>();
  for (const day of WEEKDAYS) {
    const list = authoritativeDb.schedule?.[day] || [];
    const fallbackDate = authoritativeDb.scheduleDayDates?.[day] || '';
    authScheduleBaseCountsByDay.set(
      day,
      countByKey(list, (t) => getPendingMatchKeys(t, day, fallbackDate).baseKey),
    );
    authScheduleNoDateCountsByDay.set(
      day,
      countByKey(list, (t) => getPendingMatchKeys(t, day, fallbackDate).noDateKey),
    );
  }

  // 1. Reconcile incompleteGoals against finalized completedGoals
  let nextIncompleteGoals = [...(mergedDb.incompleteGoals || [])];
  if (authCompleted.length > 0 && nextIncompleteGoals.length > 0) {
    // Track how many times each signature is finalized in authoritativeDb
    const finalizedExactCounts = new Map<string, number>();
    const finalizedNewNoDateCounts = new Map<string, number>();
    for (const g of authCompleted) {
      const keys = getPendingMatchKeys(g);
      if (!keys.materia) continue;
      if (keys.date) {
        finalizedExactCounts.set(keys.baseKey, (finalizedExactCounts.get(keys.baseKey) || 0) + 1);
      }
      if (!olderBaseDb || !olderCompletedIds.has(g.id)) {
        finalizedNewNoDateCounts.set(
          keys.noDateKey,
          (finalizedNewNoDateCounts.get(keys.noDateKey) || 0) + 1,
        );
      }
    }

    const seenExactInc = new Map<string, number>();
    const seenNoDateInc = new Map<string, number>();
    // Keep authoritativeDb's own incompleteGoals first, so older duplicates from olderBaseDb are trimmed
    const orderedForKeepCheck = [
      ...nextIncompleteGoals.filter((g) => authIncompleteIds.has(g.id)),
      ...nextIncompleteGoals.filter((g) => !authIncompleteIds.has(g.id)),
    ];
    const keptIncIds = new Set<string>();

    for (const inc of orderedForKeepCheck) {
      const keys = getPendingMatchKeys(inc);
      const isFinalizedExact = keys.date && finalizedExactCounts.has(keys.baseKey);
      const isFinalizedNewNoDate = finalizedNewNoDateCounts.has(keys.noDateKey);

      if (isFinalizedExact) {
        const allowed = authIncBaseCounts.get(keys.baseKey) || 0;
        const used = seenExactInc.get(keys.baseKey) || 0;
        if (used >= allowed) {
          continue;
        }
        seenExactInc.set(keys.baseKey, used + 1);
      } else if (isFinalizedNewNoDate && !authIncompleteIds.has(inc.id)) {
        const allowed = authIncNoDateCounts.get(keys.noDateKey) || 0;
        const used = seenNoDateInc.get(keys.noDateKey) || 0;
        if (used >= allowed) {
          continue;
        }
        seenNoDateInc.set(keys.noDateKey, used + 1);
      }
      keptIncIds.add(inc.id);
    }

    nextIncompleteGoals = nextIncompleteGoals.filter((g) => keptIncIds.has(g.id));
  }

  // 2. Collect rules for removing finalized/archived topics from schedule[day] and weeklySchedules
  const exactDoneOrArchivedKeys = new Set<string>();
  const newNoDateDoneOrArchivedKeys = new Set<string>();
  const exactDoneDatesByNoDateKey = new Map<string, Set<string>>();

  for (const g of authCompleted) {
    const keys = getPendingMatchKeys(g);
    if (!keys.materia) continue;
    if (keys.date) {
      exactDoneOrArchivedKeys.add(keys.baseKey);
      exactDoneOrArchivedKeys.add(keys.dateMateriaKey);
      if (!exactDoneDatesByNoDateKey.has(keys.noDateKey)) {
        exactDoneDatesByNoDateKey.set(keys.noDateKey, new Set());
      }
      exactDoneDatesByNoDateKey.get(keys.noDateKey)!.add(keys.date);
    }
    if (olderBaseDb && !olderCompletedIds.has(g.id)) {
      newNoDateDoneOrArchivedKeys.add(keys.noDateKey);
    }
  }

  for (const inc of authIncomplete) {
    if (olderBaseDb && !olderIncompleteIds.has(inc.id)) {
      const keys = getPendingMatchKeys(inc);
      if (!keys.materia) continue;
      if (keys.date) {
        exactDoneOrArchivedKeys.add(keys.baseKey);
        exactDoneOrArchivedKeys.add(keys.dateMateriaKey);
      }
      newNoDateDoneOrArchivedKeys.add(keys.noDateKey);
    }
  }

  const filterDayScheduleTopics = (
    day: WeekdayName,
    topics: ScheduleTopic[],
    dayDates?: Partial<Record<WeekdayName, string>>,
    authoritativeDayTopicsOverride?: ScheduleTopic[],
  ): { nextTopics: ScheduleTopic[]; changed: boolean } => {
    if (!topics.length) return { nextTopics: topics, changed: false };

    const authDayTopics = authoritativeDayTopicsOverride ?? (authoritativeDb.schedule?.[day] || []);
    const authTopicIds = new Set(authDayTopics.map((t) => t.id));
    const fallbackDate = dayDates?.[day] || '';
    const authBaseCounts = authoritativeDayTopicsOverride
      ? countByKey(authDayTopics, (t) => getPendingMatchKeys(t, day, fallbackDate).baseKey)
      : authScheduleBaseCountsByDay.get(day) || new Map<string, number>();
    const authNoDateCounts = authoritativeDayTopicsOverride
      ? countByKey(authDayTopics, (t) => getPendingMatchKeys(t, day, fallbackDate).noDateKey)
      : authScheduleNoDateCountsByDay.get(day) || new Map<string, number>();

    const usedExact = new Map<string, number>();
    const usedNoDate = new Map<string, number>();
    const orderedTopics = [
      ...topics.filter((t) => authTopicIds.has(t.id)),
      ...topics.filter((t) => !authTopicIds.has(t.id)),
    ];
    const keptTopicIds = new Set<string>();

    for (const topic of orderedTopics) {
      // Never strip a topic that is explicitly present by ID in the authoritative schedule/week
      if (topic.id && authTopicIds.has(topic.id)) {
        keptTopicIds.add(topic.id);
        continue;
      }

      const keys = getPendingMatchKeys(topic, day, fallbackDate);
      const hasExplicitTopicDate = Boolean(normalizeGoalMatchPart(topic.data));
      const matchedExact =
        keys.date &&
        (exactDoneOrArchivedKeys.has(keys.baseKey) ||
          exactDoneOrArchivedKeys.has(keys.dateMateriaKey));

      const doneDatesForNoDate = exactDoneDatesByNoDateKey.get(keys.noDateKey);
      const dateIncompatible =
        hasExplicitTopicDate &&
        Boolean(doneDatesForNoDate && doneDatesForNoDate.size > 0 && !doneDatesForNoDate.has(keys.date));

      const matchedNewNoDate =
        !dateIncompatible &&
        newNoDateDoneOrArchivedKeys.has(keys.noDateKey) &&
        !authTopicIds.has(topic.id);

      if (matchedExact) {
        const allowed = authBaseCounts.get(keys.baseKey) || 0;
        const used = usedExact.get(keys.baseKey) || 0;
        if (used >= allowed) {
          continue;
        }
        usedExact.set(keys.baseKey, used + 1);
      } else if (matchedNewNoDate) {
        const allowed = authNoDateCounts.get(keys.noDateKey) || 0;
        const used = usedNoDate.get(keys.noDateKey) || 0;
        if (used >= allowed) {
          continue;
        }
        usedNoDate.set(keys.noDateKey, used + 1);
      }

      keptTopicIds.add(topic.id);
    }

    if (keptTopicIds.size === topics.length) {
      return { nextTopics: topics, changed: false };
    }
    return {
      nextTopics: topics.filter((t) => keptTopicIds.has(t.id)),
      changed: true,
    };
  };

  let scheduleChanged = false;
  const nextSchedule: ScheduleMap = { ...(mergedDb.schedule || {}) } as ScheduleMap;
  for (const day of WEEKDAYS) {
    const res = filterDayScheduleTopics(day, nextSchedule[day] || [], mergedDb.scheduleDayDates);
    if (res.changed) {
      nextSchedule[day] = res.nextTopics;
      scheduleChanged = true;
    }
  }

  let weeklyChanged = false;
  const nextWeeklySchedules: Record<string, WeeklyScheduleFileRecord> = {
    ...(mergedDb.weeklySchedules || {}),
  };
  for (const [wk, rec] of Object.entries(nextWeeklySchedules)) {
    if (!rec || !rec.schedule) continue;
    const authWeekRec = authoritativeDb.weeklySchedules?.[wk];
    let recChanged = false;
    const updatedRecSchedule: ScheduleMap = { ...rec.schedule };
    for (const day of WEEKDAYS) {
      const res = filterDayScheduleTopics(
        day,
        updatedRecSchedule[day] || [],
        rec.scheduleDayDates || mergedDb.scheduleDayDates,
        authWeekRec?.schedule?.[day],
      );
      if (res.changed) {
        updatedRecSchedule[day] = res.nextTopics;
        recChanged = true;
      }
    }
    if (recChanged) {
      nextWeeklySchedules[wk] = {
        ...rec,
        schedule: updatedRecSchedule,
      };
      weeklyChanged = true;
    }
  }

  const incompleteChanged = nextIncompleteGoals.length !== (mergedDb.incompleteGoals || []).length;
  if (!incompleteChanged && !scheduleChanged && !weeklyChanged) {
    return mergedDb;
  }

  return {
    ...mergedDb,
    ...(incompleteChanged ? { incompleteGoals: nextIncompleteGoals } : {}),
    ...(scheduleChanged ? { schedule: nextSchedule } : {}),
    ...(weeklyChanged ? { weeklySchedules: nextWeeklySchedules } : {}),
  };
}

const TOMBSTONE_STORAGE_PREFIX = 'ce_deleted_tombstones_v1_';
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TOMBSTONES = 1200;

export interface TombstoneEntry {
  section: string;
  key: string;
  deletedAt: number;
}

export function normalizeTombstoneName(val?: string): string {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function stripDrivePrefixForTombstone(val?: string): string {
  return String(val || '')
    .replace(/^(LEI|PROVA|GABARITO|RESUMO|DISCURSIVA|CORRECAO|CRONOGRAMA|DATAS\s*E\s*LOCAIS|EDITAL)\s*-\s*/i, '')
    .trim();
}

export function mergeTombstoneMaps(
  ...maps: Array<Record<string, number> | undefined | null>
): Record<string, number> {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const merged = new Map<string, number>();
  for (const mapObj of maps) {
    if (!mapObj || typeof mapObj !== 'object' || Array.isArray(mapObj)) continue;
    for (const [k, rawTs] of Object.entries(mapObj)) {
      if (!k || typeof rawTs !== 'number' || !Number.isFinite(rawTs) || rawTs < cutoff) continue;
      const prevTs = merged.get(k) || 0;
      if (rawTs > prevTs) merged.set(k, rawTs);
    }
  }
  const entries = Array.from(merged.entries()).sort((a, b) => a[1] - b[1]);
  const capped = entries.length > MAX_TOMBSTONES ? entries.slice(-MAX_TOMBSTONES) : entries;
  return Object.fromEntries(capped);
}

function entriesToTombstoneMap(entries: TombstoneEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  for (const e of entries) {
    if (!e?.section || !e?.key || typeof e.deletedAt !== 'number' || e.deletedAt < cutoff) continue;
    const composite = `${e.section}::${e.key}`;
    if (!out[composite] || e.deletedAt > out[composite]) {
      out[composite] = e.deletedAt;
    }
  }
  return out;
}

function tombstoneMapToEntries(map: Record<string, number>): TombstoneEntry[] {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const entries: TombstoneEntry[] = [];
  for (const [composite, deletedAt] of Object.entries(map)) {
    if (typeof deletedAt !== 'number' || deletedAt < cutoff) continue;
    const sepIdx = composite.indexOf('::');
    if (sepIdx <= 0) continue;
    const section = composite.slice(0, sepIdx);
    const key = composite.slice(sepIdx + 2);
    if (section && key) {
      entries.push({ section, key, deletedAt });
    }
  }
  return entries.sort((a, b) => a.deletedAt - b.deletedAt).slice(-MAX_TOMBSTONES);
}

const TOMBSTONE_ARRAY_SECTIONS: Array<{
  section: keyof StudyDatabase;
  getKey: (item: any) => string;
  getSecondaryKeys?: (item: any) => string[];
}> = [
  { section: 'questions', getKey: (x) => x?.id || '' },
  {
    section: 'submittedSimulations',
    getKey: (x) => x?.id || '',
    getSecondaryKeys: (x) => {
      const keys: string[] = [];
      const f1 = normalizeTombstoneName(x?.arquivo);
      const f2 = normalizeTombstoneName(stripDrivePrefixForTombstone(x?.arquivo));
      if (f1) keys.push(`file:${f1}`);
      if (f2 && f2 !== f1) keys.push(`file:${f2}`);
      return keys;
    },
  },
  { section: 'completedSimulations', getKey: (x) => x?.id || '' },
  { section: 'history', getKey: (x) => x?.id || '' },
  { section: 'studyTimeRecords', getKey: (x) => x?.quizId || '' },
  { section: 'annotations', getKey: (x) => x?.id || '' },
  { section: 'caseLaw', getKey: (x) => x?.id || '' },
  {
    section: 'contests',
    getKey: (x) => x?.id || '',
    getSecondaryKeys: (x) => {
      const keys: string[] = [];
      const nameNorm = normalizeTombstoneName(x?.concurso);
      const editalNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(x?.edital_arquivo));
      if (nameNorm) keys.push(`name:${nameNorm}`);
      if (editalNorm) keys.push(`edital:${editalNorm}`);
      return keys;
    },
  },
  { section: 'completedGoals', getKey: (x) => x?.id || '' },
  { section: 'incompleteGoals', getKey: (x) => x?.id || '' },
  {
    section: 'proofFiles',
    getKey: (x) => x?.id || '',
    getSecondaryKeys: (x) => {
      const keys: string[] = [];
      if (x?.blobKey) keys.push(`blob:${x.blobKey}`);
      const bankNorm = normalizeTombstoneName(x?.bank);
      const nameNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(x?.name));
      if (bankNorm && nameNorm) keys.push(`path:${bankNorm}::${nameNorm}`);
      if (nameNorm) keys.push(`file:${nameNorm}`);
      const gabNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(x?.gabarito_arquivo));
      if (gabNorm) keys.push(`gab:${gabNorm}`);
      return keys;
    },
  },
  {
    section: 'essays',
    getKey: (x) => x?.id || '',
    getSecondaryKeys: (x) => {
      const keys: string[] = [];
      if (x?.original_blobKey) keys.push(`blob:${x.original_blobKey}`);
      const origNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(x?.original_arquivo));
      if (origNorm) keys.push(`file:${origNorm}`);
      if (x?.corrigido_blobKey) keys.push(`blob:${x.corrigido_blobKey}`);
      const corrNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(x?.corrigido_arquivo));
      if (corrNorm) keys.push(`file:${corrNorm}`);
      return keys;
    },
  },
  { section: 'criticalPoints', getKey: (x) => x?.id || '' },
  { section: 'savedIncidenceFilters', getKey: (x) => x?.id || '' },
];

const TOMBSTONE_RECORD_SECTIONS: Array<keyof StudyDatabase> = [
  'laws',
  'weeklySchedules',
  'pdfFolders',
  'summaryFolders',
];

function getRecordFolderTombstoneKeys(sec: keyof StudyDatabase, key: string, value: any): string[] {
  const keys: string[] = [key];
  const norm = normalizeTombstoneName(key);
  if (norm) keys.push(`name:${norm}`);
  if (sec === 'weeklySchedules' && value?.fileName) {
    const fNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(value.fileName));
    if (fNorm) keys.push(`file:${fNorm}`);
  }
  return keys;
}

function getNestedPdfTombstoneKeys(folder: string, file: PersonalPdfFile): string[] {
  const keys: string[] = [];
  if (file?.id) keys.push(`id:${folder}::${file.id}`);
  if (file?.blobKey) keys.push(`blob:${file.blobKey}`);
  const fNorm = normalizeTombstoneName(folder);
  const nNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(file?.name));
  if (fNorm && nNorm) keys.push(`path:${fNorm}::${nNorm}`);
  return keys;
}

function getNestedSummaryTombstoneKeys(folder: string, file: SummaryFile): string[] {
  const keys: string[] = [];
  if (file?.id) keys.push(`id:${folder}::${file.id}`);
  if (file?.blobKey) keys.push(`blob:${file.blobKey}`);
  const fNorm = normalizeTombstoneName(folder);
  const nNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(file?.name));
  if (fNorm && nNorm) keys.push(`path:${fNorm}::${nNorm}`);
  return keys;
}

function getNestedLawPdfTombstoneKeys(
  folder: string,
  pdf: { id?: string; name?: string; blobKey?: string },
): string[] {
  const keys: string[] = [];
  if (pdf?.id) keys.push(`id:${folder}::${pdf.id}`);
  if (pdf?.blobKey) keys.push(`blob:${pdf.blobKey}`);
  const fNorm = normalizeTombstoneName(folder);
  const nNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(pdf?.name));
  if (fNorm && nNorm) keys.push(`path:${fNorm}::${nNorm}`);
  return keys;
}

function getNestedLawItemTombstoneKeys(folder: string, item: { id?: string }): string[] {
  return item?.id ? [`id:${folder}::${item.id}`] : [];
}

function getContestEditalPointTombstoneKeys(
  contest: ContestItem,
  pt: ContestEditalPoint,
): string[] {
  const keys: string[] = [];
  if (contest?.id && pt?.id) keys.push(`id:${contest.id}::${pt.id}`);
  const cNorm = normalizeTombstoneName(contest?.concurso);
  const mNorm = normalizeTombstoneName(pt?.materia);
  const tNorm = normalizeTombstoneName(pt?.titulo);
  if (cNorm && (mNorm || tNorm)) keys.push(`sig:${cNorm}::${mNorm}::${tNorm}`);
  return keys;
}

function getTombstoneStorageKey(scope: string): string {
  return `${TOMBSTONE_STORAGE_PREFIX}${scope || 'offline_guest'}`;
}

export function loadDeletedTombstones(scope: string): TombstoneEntry[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(getTombstoneStorageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - TOMBSTONE_TTL_MS;
    return parsed.filter(
      (e): e is TombstoneEntry =>
        Boolean(e) &&
        typeof e.section === 'string' &&
        typeof e.key === 'string' &&
        typeof e.deletedAt === 'number' &&
        e.deletedAt >= cutoff,
    );
  } catch {
    return [];
  }
}

export function recordDeletedTombstones(
  scope: string,
  entries: Array<{ section: string; key: string }>,
  existingDbTombstones?: Record<string, number>,
): Record<string, number> {
  const baseMap = mergeTombstoneMaps(
    entriesToTombstoneMap(loadDeletedTombstones(scope)),
    existingDbTombstones,
  );
  if (!entries.length) return baseMap;

  const now = Date.now();
  const nextMap: Record<string, number> = { ...baseMap };
  for (const e of entries) {
    if (!e.section || !e.key) continue;
    nextMap[`${e.section}::${e.key}`] = now;
  }
  const cappedMap = mergeTombstoneMaps(nextMap);

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        getTombstoneStorageKey(scope),
        JSON.stringify(tombstoneMapToEntries(cappedMap)),
      );
    }
  } catch {
    // ignore storage errors
  }

  return cappedMap;
}

export function clearDeletedTombstones(scope: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(getTombstoneStorageKey(scope));
  } catch {
    // ignore
  }
}

function getScheduleTopicTombstoneKeys(day: WeekdayName, topic: ScheduleTopic): string[] {
  if (!topic?.id) return [];
  // Only match by unique topic ID — NEVER by subject/notes text signature,
  // otherwise re-adding or importing the same subject on another week gets silently deleted!
  return [`id:${day}::${topic.id}`, `id:${topic.id}`];
}

function collectActiveTombstoneKeys(activeDb: StudyDatabase): Map<string, Set<string>> {
  const activeKeysBySection = new Map<string, Set<string>>();
  const addActive = (section: string, key: string) => {
    if (!key) return;
    let set = activeKeysBySection.get(section);
    if (!set) {
      set = new Set<string>();
      activeKeysBySection.set(section, set);
    }
    set.add(key);
  };

  for (const cfg of TOMBSTONE_ARRAY_SECTIONS) {
    const arr = (activeDb[cfg.section] as unknown as any[]) || [];
    for (const item of arr) {
      addActive(String(cfg.section), cfg.getKey(item));
      for (const secKey of cfg.getSecondaryKeys?.(item) || []) {
        addActive(String(cfg.section), secKey);
      }
    }
  }

  for (const sec of TOMBSTONE_RECORD_SECTIONS) {
    const rec = (activeDb[sec] as Record<string, unknown> | undefined) || {};
    for (const [k, v] of Object.entries(rec)) {
      for (const rk of getRecordFolderTombstoneKeys(sec, k, v)) {
        addActive(String(sec), rk);
      }
    }
  }

  for (const [folder, files] of Object.entries(activeDb.pdfFolders || {})) {
    for (const f of files || []) {
      for (const k of getNestedPdfTombstoneKeys(folder, f)) {
        addActive('pdfFiles', k);
      }
      const fNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(f?.name));
      if (fNorm) addActive('pdfDriveFiles', `file:${fNorm}`);
    }
  }

  for (const [folder, files] of Object.entries(activeDb.summaryFolders || {})) {
    for (const s of files || []) {
      for (const k of getNestedSummaryTombstoneKeys(folder, s)) {
        addActive('summaryFiles', k);
      }
      const sNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(s?.name));
      if (sNorm) addActive('summaryDriveFiles', `file:${sNorm}`);
    }
  }

  for (const [folder, data] of Object.entries(activeDb.laws || {})) {
    for (const p of data?.pdfs || []) {
      for (const k of getNestedLawPdfTombstoneKeys(folder, p)) {
        addActive('lawPdfs', k);
      }
      const pNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(p?.name));
      if (pNorm) addActive('lawDriveFiles', `file:${pNorm}`);
    }
    for (const it of data?.items || []) {
      for (const k of getNestedLawItemTombstoneKeys(folder, it)) {
        addActive('lawItems', k);
      }
    }
  }

  for (const c of activeDb.contests || []) {
    for (const pt of c?.edital_pontos || []) {
      for (const k of getContestEditalPointTombstoneKeys(c, pt)) {
        addActive('contestEditalPoints', k);
      }
    }
  }

  for (const day of WEEKDAYS) {
    for (const topic of activeDb.schedule?.[day] || []) {
      for (const k of getScheduleTopicTombstoneKeys(day, topic)) {
        addActive('scheduleTopics', k);
      }
    }
  }

  // Also preserve topics that live inside any saved week in weeklySchedules so switching weeks never tombstones them
  for (const rec of Object.values(activeDb.weeklySchedules || {})) {
    if (!rec?.schedule) continue;
    for (const day of WEEKDAYS) {
      for (const topic of rec.schedule[day] || []) {
        for (const k of getScheduleTopicTombstoneKeys(day, topic)) {
          addActive('scheduleTopics', k);
        }
      }
    }
  }

  return activeKeysBySection;
}

export function stripActiveEntityTombstones(
  tombstones: Record<string, number> | undefined,
  activeDb: StudyDatabase,
): Record<string, number> | undefined {
  if (!tombstones || Object.keys(tombstones).length === 0) return tombstones;
  const activeKeysBySection = collectActiveTombstoneKeys(activeDb);
  const next: Record<string, number> = {};
  let changed = false;
  for (const [composite, ts] of Object.entries(tombstones)) {
    const sepIdx = composite.indexOf('::');
    if (sepIdx <= 0) continue;
    const section = composite.slice(0, sepIdx);
    const key = composite.slice(sepIdx + 2);
    const activeSet = activeKeysBySection.get(section);
    if (activeSet && activeSet.has(key)) {
      changed = true;
      continue;
    }
    next[composite] = ts;
  }
  return changed ? next : tombstones;
}

export function pruneActiveTombstonesForDatabase(
  scope: string,
  activeDb: StudyDatabase,
  dbTombstones?: Record<string, number>,
): Record<string, number> | undefined {
  const merged = mergeTombstoneMaps(
    entriesToTombstoneMap(loadDeletedTombstones(scope)),
    dbTombstones ?? activeDb.deletedTombstones,
  );
  if (Object.keys(merged).length === 0) return dbTombstones;

  const activeKeysBySection = collectActiveTombstoneKeys(activeDb);
  const pruned: Record<string, number> = {};
  let changed = false;

  for (const [composite, ts] of Object.entries(merged)) {
    const sepIdx = composite.indexOf('::');
    if (sepIdx <= 0) continue;
    const section = composite.slice(0, sepIdx);
    const key = composite.slice(sepIdx + 2);
    const activeSet = activeKeysBySection.get(section);
    if (activeSet && activeSet.has(key)) {
      changed = true;
      continue;
    }
    pruned[composite] = ts;
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        getTombstoneStorageKey(scope),
        JSON.stringify(tombstoneMapToEntries(pruned)),
      );
    }
  } catch {
    // ignore storage errors
  }

  return changed || Object.keys(pruned).length > 0 ? pruned : dbTombstones;
}

export function detectDeletedEntitiesBetweenDatabases(
  prevDb: StudyDatabase,
  nextDb: StudyDatabase,
): Array<{ section: string; key: string }> {
  const deleted: Array<{ section: string; key: string }> = [];

  for (const cfg of TOMBSTONE_ARRAY_SECTIONS) {
    const prevArr = (prevDb[cfg.section] as unknown as any[]) || [];
    const nextArr = (nextDb[cfg.section] as unknown as any[]) || [];
    const nextPrimaryKeys = new Set(nextArr.map((item) => cfg.getKey(item)).filter(Boolean));
    const nextAllKeys = new Set<string>(nextPrimaryKeys);
    if (cfg.getSecondaryKeys) {
      for (const item of nextArr) {
        for (const sk of cfg.getSecondaryKeys(item)) {
          nextAllKeys.add(sk);
        }
      }
    }
    for (const item of prevArr) {
      const k = cfg.getKey(item);
      if (k && !nextPrimaryKeys.has(k)) {
        deleted.push({ section: String(cfg.section), key: k });
        for (const sk of cfg.getSecondaryKeys?.(item) || []) {
          if (!nextAllKeys.has(sk)) {
            deleted.push({ section: String(cfg.section), key: sk });
          }
        }
      }
    }
  }

  for (const sec of TOMBSTONE_RECORD_SECTIONS) {
    const prevRec = (prevDb[sec] as Record<string, unknown> | undefined) || {};
    const nextRec = (nextDb[sec] as Record<string, unknown> | undefined) || {};
    const nextNorms = new Set(Object.keys(nextRec).map((k) => normalizeTombstoneName(k)));
    for (const [k, v] of Object.entries(prevRec)) {
      if (!(k in nextRec)) {
        deleted.push({ section: String(sec), key: k });
        const n = normalizeTombstoneName(k);
        if (n && !nextNorms.has(n)) {
          deleted.push({ section: String(sec), key: `name:${n}` });
        }
        if (sec === 'weeklySchedules' && (v as any)?.fileName) {
          const fn = normalizeTombstoneName(stripDrivePrefixForTombstone((v as any).fileName));
          if (fn) deleted.push({ section: 'weeklySchedules', key: `file:${fn}` });
        }
      }
    }
  }

  // Nested Personal PDFs
  const nextPdfDriveNames = new Set<string>();
  for (const files of Object.values(nextDb.pdfFolders || {})) {
    for (const f of files || []) {
      const n = normalizeTombstoneName(stripDrivePrefixForTombstone(f?.name));
      if (n) nextPdfDriveNames.add(n);
    }
  }
  for (const [folder, prevFiles] of Object.entries(prevDb.pdfFolders || {})) {
    const folderStillExists = folder in (nextDb.pdfFolders || {});
    const nextFiles = nextDb.pdfFolders?.[folder] || [];
    const nextIds = new Set(nextFiles.map((f) => f.id).filter(Boolean));
    for (const f of prevFiles || []) {
      if (!f.id || !nextIds.has(f.id)) {
        for (const tk of getNestedPdfTombstoneKeys(folder, f)) {
          deleted.push({ section: 'pdfFiles', key: tk });
        }
        const fNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(f.name));
        if (fNorm && (!folderStillExists || !nextPdfDriveNames.has(fNorm))) {
          deleted.push({ section: 'pdfDriveFiles', key: `file:${fNorm}` });
        }
      }
    }
  }

  // Nested Summaries
  const nextSummaryDriveNames = new Set<string>();
  for (const files of Object.values(nextDb.summaryFolders || {})) {
    for (const s of files || []) {
      const n = normalizeTombstoneName(stripDrivePrefixForTombstone(s?.name));
      if (n) nextSummaryDriveNames.add(n);
    }
  }
  for (const [folder, prevFiles] of Object.entries(prevDb.summaryFolders || {})) {
    const folderStillExists = folder in (nextDb.summaryFolders || {});
    const nextFiles = nextDb.summaryFolders?.[folder] || [];
    const nextIds = new Set(nextFiles.map((s) => s.id).filter(Boolean));
    for (const s of prevFiles || []) {
      if (!s.id || !nextIds.has(s.id)) {
        for (const tk of getNestedSummaryTombstoneKeys(folder, s)) {
          deleted.push({ section: 'summaryFiles', key: tk });
        }
        const sNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(s.name));
        if (sNorm && (!folderStillExists || !nextSummaryDriveNames.has(sNorm))) {
          deleted.push({ section: 'summaryDriveFiles', key: `file:${sNorm}` });
        }
      }
    }
  }

  // Nested Law PDFs & Law Items
  const nextLawDriveNames = new Set<string>();
  for (const data of Object.values(nextDb.laws || {})) {
    for (const p of data?.pdfs || []) {
      const n = normalizeTombstoneName(stripDrivePrefixForTombstone(p?.name));
      if (n) nextLawDriveNames.add(n);
    }
  }
  for (const [folder, prevData] of Object.entries(prevDb.laws || {})) {
    const nextData = nextDb.laws?.[folder];
    const nextPdfIds = new Set((nextData?.pdfs || []).map((p) => p.id).filter(Boolean));
    for (const p of prevData?.pdfs || []) {
      if (!p.id || !nextPdfIds.has(p.id)) {
        for (const tk of getNestedLawPdfTombstoneKeys(folder, p)) {
          deleted.push({ section: 'lawPdfs', key: tk });
        }
        const pNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(p.name));
        if (pNorm && !nextLawDriveNames.has(pNorm)) {
          deleted.push({ section: 'lawDriveFiles', key: `file:${pNorm}` });
        }
      }
    }
    const nextItemIds = new Set((nextData?.items || []).map((it) => it.id).filter(Boolean));
    for (const it of prevData?.items || []) {
      if (it?.id && !nextItemIds.has(it.id)) {
        for (const tk of getNestedLawItemTombstoneKeys(folder, it)) {
          deleted.push({ section: 'lawItems', key: tk });
        }
      }
    }
  }

  // Nested Contest Edital Points (only if the point ID actually disappeared from a surviving contest)
  const nextContestsById = new Map((nextDb.contests || []).map((c) => [c.id, c]));
  for (const prevC of prevDb.contests || []) {
    const nextC = nextContestsById.get(prevC.id);
    if (!nextC) continue;
    const nextPtIds = new Set((nextC.edital_pontos || []).map((p) => p.id).filter(Boolean));
    for (const pt of prevC.edital_pontos || []) {
      if (pt?.id && !nextPtIds.has(pt.id)) {
        for (const tk of getContestEditalPointTombstoneKeys(prevC, pt)) {
          deleted.push({ section: 'contestEditalPoints', key: tk });
        }
      }
    }
  }

  // Track deleted schedule topics per day ONLY when the topic ID disappeared from BOTH
  // the active schedule AND all saved weeklySchedules (so switching weeks never tombstones saved weeks!)
  const survivingScheduleTopicIds = new Set<string>();
  for (const day of WEEKDAYS) {
    for (const t of nextDb.schedule?.[day] || []) {
      if (t?.id) survivingScheduleTopicIds.add(t.id);
    }
  }
  for (const rec of Object.values(nextDb.weeklySchedules || {})) {
    if (!rec?.schedule) continue;
    for (const day of WEEKDAYS) {
      for (const t of rec.schedule[day] || []) {
        if (t?.id) survivingScheduleTopicIds.add(t.id);
      }
    }
  }

  for (const day of WEEKDAYS) {
    const prevTopics = prevDb.schedule?.[day] || [];
    if (prevTopics.length === 0) continue;
    for (const t of prevTopics) {
      if (!t?.id || survivingScheduleTopicIds.has(t.id)) continue;
      for (const k of getScheduleTopicTombstoneKeys(day, t)) {
        deleted.push({ section: 'scheduleTopics', key: k });
      }
    }
  }

  return deleted;
}

function buildDeletedTimestampMap(
  mergedDb: StudyDatabase,
  scope: string,
): Map<string, Map<string, number>> {
  const scopeTombstones = loadDeletedTombstones(scope);
  const guestTombstones = scope !== 'offline_guest' ? loadDeletedTombstones('offline_guest') : [];
  const mergedMap = mergeTombstoneMaps(
    entriesToTombstoneMap(scopeTombstones),
    entriesToTombstoneMap(guestTombstones),
    mergedDb.deletedTombstones,
  );
  const deletedBySection = new Map<string, Map<string, number>>();
  for (const [composite, ts] of Object.entries(mergedMap)) {
    const sepIdx = composite.indexOf('::');
    if (sepIdx <= 0) continue;
    const section = composite.slice(0, sepIdx);
    const key = composite.slice(sepIdx + 2);
    let secMap = deletedBySection.get(section);
    if (!secMap) {
      secMap = new Map<string, number>();
      deletedBySection.set(section, secMap);
    }
    secMap.set(key, ts);
  }
  return deletedBySection;
}

function buildDeletedSetMap(mergedDb: StudyDatabase, scope: string): Map<string, Set<string>> {
  const tsMap = buildDeletedTimestampMap(mergedDb, scope);
  const out = new Map<string, Set<string>>();
  for (const [sec, map] of tsMap.entries()) {
    out.set(sec, new Set(map.keys()));
  }
  return out;
}

export function findMatchingDriveFileTombstones(
  df: { name?: string; id?: string; subfolderName?: string; folderPath?: string },
  db: StudyDatabase,
  scope: string,
): { isTombstoned: boolean; matchedKeys: string[]; latestDeletedAtMs: number } {
  const deletedBySection = buildDeletedTimestampMap(db, scope);
  if (deletedBySection.size === 0) {
    return { isTombstoned: false, matchedKeys: [], latestDeletedAtMs: 0 };
  }

  const matched = new Map<string, number>();
  const addIfPresent = (sec: string, secMap: Map<string, number> | undefined, key: string) => {
    if (!key || !secMap) return;
    const ts = secMap.get(key);
    if (typeof ts === 'number') {
      const composite = `${sec}::${key}`;
      matched.set(composite, Math.max(matched.get(composite) || 0, ts));
    }
  };

  const dfName = String(df.name || '');
  const normFull = normalizeTombstoneName(dfName);
  const normStripped = normalizeTombstoneName(stripDrivePrefixForTombstone(dfName));
  const driveBlobKey = df.id ? `blob:drive_${df.id}` : '';
  const pathSegments = String(df.folderPath || '')
    .split('/')
    .map((s) => normalizeTombstoneName(s))
    .filter(Boolean);

  const pdfFolderDel = deletedBySection.get('pdfFolders');
  const summaryFolderDel = deletedBySection.get('summaryFolders');
  const lawsDel = deletedBySection.get('laws');
  for (const seg of pathSegments) {
    addIfPresent('pdfFolders', pdfFolderDel, `name:${seg}`);
    addIfPresent('summaryFolders', summaryFolderDel, `name:${seg}`);
    addIfPresent('laws', lawsDel, `name:${seg}`);
  }

  const checkNames = (sec: string) => {
    const s = deletedBySection.get(sec);
    if (!s || s.size === 0) return;
    if (driveBlobKey) addIfPresent(sec, s, driveBlobKey);
    if (normFull) addIfPresent(sec, s, `file:${normFull}`);
    if (normStripped) addIfPresent(sec, s, `file:${normStripped}`);
  };

  checkNames('pdfFiles');
  checkNames('pdfDriveFiles');
  checkNames('summaryFiles');
  checkNames('summaryDriveFiles');
  checkNames('lawPdfs');
  checkNames('lawDriveFiles');
  checkNames('proofFiles');
  checkNames('essays');
  checkNames('submittedSimulations');

  const proofGab = deletedBySection.get('proofFiles');
  if (proofGab) {
    if (normFull) addIfPresent('proofFiles', proofGab, `gab:${normFull}`);
    if (normStripped) addIfPresent('proofFiles', proofGab, `gab:${normStripped}`);
  }

  const folderFileSectionNames = ['pdfFiles', 'summaryFiles', 'lawPdfs', 'proofFiles'] as const;
  for (const sec of folderFileSectionNames) {
    const s = deletedBySection.get(sec);
    if (!s) continue;
    for (const seg of pathSegments) {
      if (normFull) addIfPresent(sec, s, `path:${seg}::${normFull}`);
      if (normStripped) addIfPresent(sec, s, `path:${seg}::${normStripped}`);
    }
  }

  const contestsDel = deletedBySection.get('contests');
  if (contestsDel) {
    if (normFull) {
      addIfPresent('contests', contestsDel, `name:${normFull}`);
      addIfPresent('contests', contestsDel, `edital:${normFull}`);
    }
    if (normStripped) {
      addIfPresent('contests', contestsDel, `name:${normStripped}`);
      addIfPresent('contests', contestsDel, `edital:${normStripped}`);
    }
  }

  const weeklyDel = deletedBySection.get('weeklySchedules');
  if (weeklyDel) {
    if (normFull) addIfPresent('weeklySchedules', weeklyDel, `file:${normFull}`);
    if (normStripped) addIfPresent('weeklySchedules', weeklyDel, `file:${normStripped}`);
  }

  let latestDeletedAtMs = 0;
  for (const ts of matched.values()) {
    if (ts > latestDeletedAtMs) latestDeletedAtMs = ts;
  }

  return {
    isTombstoned: matched.size > 0,
    matchedKeys: Array.from(matched.keys()),
    latestDeletedAtMs,
  };
}

export function removeDeletedTombstoneKeys(
  scope: string,
  keysToRemove: string[],
  dbTombstones?: Record<string, number>,
): Record<string, number> {
  const removeSet = new Set(keysToRemove.filter(Boolean));
  const scopesToUpdate = scope !== 'offline_guest' ? [scope, 'offline_guest'] : [scope];

  for (const s of scopesToUpdate) {
    try {
      const existing = loadDeletedTombstones(s);
      if (existing.length > 0 && removeSet.size > 0) {
        const filtered = existing.filter((e) => !removeSet.has(`${e.section}::${e.key}`));
        if (typeof window !== 'undefined' && window.localStorage) {
          if (filtered.length > 0) {
            window.localStorage.setItem(getTombstoneStorageKey(s), JSON.stringify(filtered));
          } else {
            window.localStorage.removeItem(getTombstoneStorageKey(s));
          }
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  const nextMap: Record<string, number> = { ...(dbTombstones || {}) };
  for (const k of removeSet) {
    delete nextMap[k];
  }
  return nextMap;
}

export function isDriveFileTombstoned(
  df: { name?: string; id?: string; subfolderName?: string; folderPath?: string },
  db: StudyDatabase,
  scope: string,
): boolean {
  return findMatchingDriveFileTombstones(df, db, scope).isTombstoned;
}

export function isContestOrScheduleTombstoned(
  kind: 'contest' | 'weeklySchedule',
  identifier: { id?: string; name?: string; fileName?: string },
  db: StudyDatabase,
  scope: string,
): boolean {
  const deletedBySection = buildDeletedSetMap(db, scope);
  if (kind === 'contest') {
    const s = deletedBySection.get('contests');
    if (!s || s.size === 0) return false;
    if (identifier.id && s.has(identifier.id)) return true;
    const nNorm = normalizeTombstoneName(identifier.name);
    if (nNorm && s.has(`name:${nNorm}`)) return true;
    const fNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(identifier.fileName));
    if (fNorm && s.has(`edital:${fNorm}`)) return true;
    return false;
  }
  const s = deletedBySection.get('weeklySchedules');
  if (!s || s.size === 0) return false;
  if (identifier.id && s.has(identifier.id)) return true;
  const fNorm = normalizeTombstoneName(stripDrivePrefixForTombstone(identifier.fileName));
  if (fNorm && s.has(`file:${fNorm}`)) return true;
  return false;
}

export function applyTombstonesToMergedDatabase(
  mergedDb: StudyDatabase,
  scope: string,
): StudyDatabase {
  const unifiedTombstones = mergeTombstoneMaps(
    entriesToTombstoneMap(loadDeletedTombstones(scope)),
    scope !== 'offline_guest' ? entriesToTombstoneMap(loadDeletedTombstones('offline_guest')) : undefined,
    mergedDb.deletedTombstones,
  );
  const hasAnyTombstone = Object.keys(unifiedTombstones).length > 0;
  if (!hasAnyTombstone) return mergedDb;

  const deletedBySection = buildDeletedSetMap({ ...mergedDb, deletedTombstones: unifiedTombstones }, scope);

  let changed =
    JSON.stringify(unifiedTombstones) !== JSON.stringify(mergedDb.deletedTombstones || {});
  const nextDb: StudyDatabase = {
    ...mergedDb,
    deletedTombstones: unifiedTombstones,
  };

  for (const cfg of TOMBSTONE_ARRAY_SECTIONS) {
    const secName = String(cfg.section);
    const delSet = deletedBySection.get(secName);
    if (!delSet || delSet.size === 0) continue;
    const arr = (nextDb[cfg.section] as unknown as any[]) || [];
    const filtered = arr.filter((item) => {
      const k = cfg.getKey(item);
      if (k && delSet.has(k)) return false;
      const secKeys = cfg.getSecondaryKeys?.(item) || [];
      if (secKeys.some((sk) => delSet.has(sk))) return false;
      return true;
    });
    if (filtered.length !== arr.length) {
      (nextDb as any)[cfg.section] = filtered;
      changed = true;
    }
  }

  for (const sec of TOMBSTONE_RECORD_SECTIONS) {
    const secName = String(sec);
    const delSet = deletedBySection.get(secName);
    if (!delSet || delSet.size === 0) continue;
    const rec = { ...((nextDb[sec] as Record<string, unknown> | undefined) || {}) };
    let recChanged = false;
    for (const k of Object.keys(rec)) {
      const normK = normalizeTombstoneName(k);
      if (delSet.has(k) || (normK && delSet.has(`name:${normK}`))) {
        delete rec[k];
        recChanged = true;
      }
    }
    if (recChanged) {
      (nextDb as any)[sec] = rec;
      changed = true;
    }
  }

  // Filter nested PDFs in pdfFolders & clean orphaned pdfAnnotations
  const delPdfFiles = deletedBySection.get('pdfFiles');
  if (delPdfFiles && delPdfFiles.size > 0 && nextDb.pdfFolders) {
    const nextFolders = { ...nextDb.pdfFolders };
    let pdfFilesChanged = false;
    const nextAnnotations = { ...(nextDb.pdfAnnotations || {}) };
    let annChanged = false;
    for (const [folder, list] of Object.entries(nextFolders)) {
      const safeList = Array.isArray(list) ? list : [];
      const filtered = safeList.filter((f) => {
        const keys = getNestedPdfTombstoneKeys(folder, f);
        const drop = keys.some((k) => delPdfFiles.has(k));
        if (drop && f.blobKey && f.blobKey in nextAnnotations) {
          delete nextAnnotations[f.blobKey];
          annChanged = true;
        }
        return !drop;
      });
      if (filtered.length !== safeList.length) {
        nextFolders[folder] = filtered;
        pdfFilesChanged = true;
      }
    }
    if (pdfFilesChanged) {
      nextDb.pdfFolders = nextFolders;
      changed = true;
    }
    if (annChanged) {
      nextDb.pdfAnnotations = nextAnnotations;
      changed = true;
    }
  }

  // Filter nested summaryFiles
  const delSummaryFiles = deletedBySection.get('summaryFiles');
  if (delSummaryFiles && delSummaryFiles.size > 0 && nextDb.summaryFolders) {
    const nextSummary = { ...nextDb.summaryFolders };
    let sumChanged = false;
    for (const [folder, list] of Object.entries(nextSummary)) {
      const safeList = Array.isArray(list) ? list : [];
      const filtered = safeList.filter(
        (s) => !getNestedSummaryTombstoneKeys(folder, s).some((k) => delSummaryFiles.has(k)),
      );
      if (filtered.length !== safeList.length) {
        nextSummary[folder] = filtered;
        sumChanged = true;
      }
    }
    if (sumChanged) {
      nextDb.summaryFolders = nextSummary;
      changed = true;
    }
  }

  // Filter nested lawPdfs, lawItems, and drop orphaned metadata for deleted law folders
  const delLaws = deletedBySection.get('laws');
  const delLawPdfs = deletedBySection.get('lawPdfs');
  const delLawItems = deletedBySection.get('lawItems');
  if ((delLawPdfs?.size || 0) > 0 || (delLawItems?.size || 0) > 0) {
    const nextLaws = { ...(nextDb.laws || {}) };
    let lawsNestedChanged = false;
    for (const [folder, folderData] of Object.entries(nextLaws)) {
      const curPdfs = folderData?.pdfs || [];
      const curItems = folderData?.items || [];
      const filteredPdfs = delLawPdfs?.size
        ? curPdfs.filter((p) => !getNestedLawPdfTombstoneKeys(folder, p).some((k) => delLawPdfs.has(k)))
        : curPdfs;
      const filteredItems = delLawItems?.size
        ? curItems.filter((it) => !getNestedLawItemTombstoneKeys(folder, it).some((k) => delLawItems.has(k)))
        : curItems;
      if (filteredPdfs.length !== curPdfs.length || filteredItems.length !== curItems.length) {
        nextLaws[folder] = {
          ...folderData,
          pdfs: filteredPdfs,
          items: filteredItems,
        };
        lawsNestedChanged = true;
      }
    }
    if (lawsNestedChanged) {
      nextDb.laws = nextLaws;
      changed = true;
    }
  }
  if (delLaws && delLaws.size > 0) {
    const cleanLawMetaRecord = <T>(rec: Record<string, T> | undefined): Record<string, T> | undefined => {
      if (!rec) return rec;
      const copy = { ...rec };
      let dropped = false;
      for (const k of Object.keys(copy)) {
        const nk = normalizeTombstoneName(k);
        if ((delLaws.has(k) || (nk && delLaws.has(`name:${nk}`))) && !(k in (nextDb.laws || {}))) {
          delete copy[k];
          dropped = true;
        }
      }
      if (dropped) changed = true;
      return dropped ? copy : rec;
    };
    nextDb.lawHighlights = cleanLawMetaRecord(nextDb.lawHighlights) || {};
    nextDb.readLawItems = cleanLawMetaRecord(nextDb.readLawItems);
    nextDb.lawReadDates = cleanLawMetaRecord(nextDb.lawReadDates);
    nextDb.lawLastReadPosition = cleanLawMetaRecord(nextDb.lawLastReadPosition);
    nextDb.lawNotes = cleanLawMetaRecord(nextDb.lawNotes);
  }

  // Filter nested contestEditalPoints
  const delEditalPts = deletedBySection.get('contestEditalPoints');
  if (delEditalPts && delEditalPts.size > 0 && Array.isArray(nextDb.contests)) {
    let ptsChanged = false;
    const nextContests = nextDb.contests.map((c) => {
      const pts = c.edital_pontos || [];
      const filtered = pts.filter(
        (pt) => !getContestEditalPointTombstoneKeys(c, pt).some((k) => delEditalPts.has(k)),
      );
      if (filtered.length !== pts.length) {
        ptsChanged = true;
        return { ...c, edital_pontos: filtered };
      }
      return c;
    });
    if (ptsChanged) {
      nextDb.contests = nextContests;
      changed = true;
    }
  }

  // Filter deleted scheduleTopics from schedule and weeklySchedules
  const delScheduleSet = deletedBySection.get('scheduleTopics');
  if (delScheduleSet && delScheduleSet.size > 0) {
    const isTopicTombstoned = (day: WeekdayName, topic: ScheduleTopic): boolean => {
      const keys = getScheduleTopicTombstoneKeys(day, topic);
      return keys.some((k) => delScheduleSet.has(k));
    };

    let scheduleChanged = false;
    const nextSchedule: ScheduleMap = { ...(nextDb.schedule || {}) } as ScheduleMap;
    for (const day of WEEKDAYS) {
      const list = nextSchedule[day] || [];
      const filtered = list.filter((t) => !isTopicTombstoned(day, t));
      if (filtered.length !== list.length) {
        nextSchedule[day] = filtered;
        scheduleChanged = true;
      }
    }
    if (scheduleChanged) {
      nextDb.schedule = nextSchedule;
      changed = true;
    }

    if (nextDb.weeklySchedules && typeof nextDb.weeklySchedules === 'object') {
      let weeklyChanged = false;
      const nextWeekly: Record<string, WeeklyScheduleFileRecord> = { ...nextDb.weeklySchedules };
      for (const [wk, rec] of Object.entries(nextWeekly)) {
        if (!rec?.schedule) continue;
        let recScheduleChanged = false;
        const updatedRecSchedule: ScheduleMap = { ...rec.schedule };
        for (const day of WEEKDAYS) {
          const list = updatedRecSchedule[day] || [];
          const filtered = list.filter((t) => !isTopicTombstoned(day, t));
          if (filtered.length !== list.length) {
            updatedRecSchedule[day] = filtered;
            recScheduleChanged = true;
          }
        }
        if (recScheduleChanged) {
          nextWeekly[wk] = {
            ...rec,
            schedule: updatedRecSchedule,
          };
          weeklyChanged = true;
        }
      }
      if (weeklyChanged) {
        nextDb.weeklySchedules = nextWeekly;
        changed = true;
      }
    }
  }

  return changed ? nextDb : mergedDb;
}
