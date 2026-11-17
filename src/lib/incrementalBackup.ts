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
  StudyDatabase,
  StudyTimeRecord,
  SubmittedSimulation,
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
  pdfFolders?: RecordDelta<PersonalPdfFile[]>;
  summaryFolders?: RecordDelta<SummaryFile[]>;
  proofBanks?: string[];
  fixedSubjects?: string[];
  phrases?: string[];
  preferences?: AppPreferences;
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
 * Deterministic fast hash of StudyDatabase content (used to avoid redundant Drive writes).
 */
export function computeDatabaseContentHash(db: StudyDatabase): string {
  const str = JSON.stringify(db);
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
  trackRecord('pdfFolders', baseDb?.pdfFolders, currentDb.pdfFolders);
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
  if (!baseDb || stableJson(baseDb.preferences) !== stableJson(currentDb.preferences)) {
    delta.preferences = currentDb.preferences;
    changedSections.push('preferences');
    addedOrUpdated += 1;
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
  additiveMerge = false,
): ScheduleTopic[] {
  const prev = baseTopics || [];
  const prevHasCustom = prev.some((t) => !isSeedScheduleTopic(t));
  const deltaOnlySeed = deltaTopics.length > 0 && deltaTopics.every((t) => isSeedScheduleTopic(t));
  // Never overwrite custom user schedule topics with default seed topics (sch-1..sch-8)
  if (prevHasCustom && deltaOnlySeed) {
    return prev;
  }
  if (additiveMerge && prevHasCustom) {
    const customDelta = deltaTopics.filter((t) => !isSeedScheduleTopic(t));
    if (customDelta.length === 0) {
      return prev;
    }
    const deltaById = new Map<string, ScheduleTopic>();
    for (const t of customDelta) {
      if (t?.id) deltaById.set(t.id, t);
    }
    const seen = new Set<string>();
    const merged: ScheduleTopic[] = [];
    for (const t of prev) {
      if (t?.id) seen.add(t.id);
      merged.push(t?.id && deltaById.has(t.id) ? deltaById.get(t.id)! : t);
    }
    for (const t of customDelta) {
      if (!t?.id || !seen.has(t.id)) {
        if (t?.id) seen.add(t.id);
        merged.push(t);
      }
    }
    return merged;
  }
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
    pdfFolders: mergeRecordDelta(
      baseDb.pdfFolders,
      d.pdfFolders,
      additive ? mergePersonalPdfArrays : undefined,
    ),
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
    preferences: d.preferences
      ? {
          ...baseDb.preferences,
          ...d.preferences,
          modules: {
            ...(baseDb.preferences?.modules || {}),
            ...(d.preferences.modules || {}),
          },
        }
      : baseDb.preferences,
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
 * Prevents additive merges (offline_guest -> account, offline -> Firestore/Drive, Drive TXT -> DB)
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
    if (!olderBaseDb || !olderCompletedIds.has(g.id)) {
      newNoDateDoneOrArchivedKeys.add(keys.noDateKey);
    }
  }

  for (const inc of authIncomplete) {
    if (!olderBaseDb || !olderIncompleteIds.has(inc.id)) {
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
  ): { nextTopics: ScheduleTopic[]; changed: boolean } => {
    if (!topics.length) return { nextTopics: topics, changed: false };

    const authDayTopics = authoritativeDb.schedule?.[day] || [];
    const authTopicIds = new Set(authDayTopics.map((t) => t.id));
    const authBaseCounts = authScheduleBaseCountsByDay.get(day) || new Map<string, number>();
    const authNoDateCounts = authScheduleNoDateCountsByDay.get(day) || new Map<string, number>();
    const fallbackDate = dayDates?.[day] || '';

    const usedExact = new Map<string, number>();
    const usedNoDate = new Map<string, number>();
    const orderedTopics = [
      ...topics.filter((t) => authTopicIds.has(t.id)),
      ...topics.filter((t) => !authTopicIds.has(t.id)),
    ];
    const keptTopicIds = new Set<string>();

    for (const topic of orderedTopics) {
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
    let recChanged = false;
    const updatedRecSchedule: ScheduleMap = { ...rec.schedule };
    for (const day of WEEKDAYS) {
      const res = filterDayScheduleTopics(
        day,
        updatedRecSchedule[day] || [],
        rec.scheduleDayDates || mergedDb.scheduleDayDates,
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

export interface TombstoneEntry {
  section: string;
  key: string;
  deletedAt: number;
}

const TOMBSTONE_ARRAY_SECTIONS: Array<{
  section: keyof StudyDatabase;
  getKey: (item: any) => string;
}> = [
  { section: 'questions', getKey: (x) => x?.id || '' },
  { section: 'submittedSimulations', getKey: (x) => x?.id || '' },
  { section: 'completedSimulations', getKey: (x) => x?.id || '' },
  { section: 'history', getKey: (x) => x?.id || '' },
  { section: 'studyTimeRecords', getKey: (x) => x?.quizId || '' },
  { section: 'annotations', getKey: (x) => x?.id || '' },
  { section: 'caseLaw', getKey: (x) => x?.id || '' },
  { section: 'contests', getKey: (x) => x?.id || '' },
  { section: 'completedGoals', getKey: (x) => x?.id || '' },
  { section: 'incompleteGoals', getKey: (x) => x?.id || '' },
  { section: 'proofFiles', getKey: (x) => x?.id || '' },
  { section: 'essays', getKey: (x) => x?.id || '' },
  { section: 'criticalPoints', getKey: (x) => x?.id || '' },
  { section: 'savedIncidenceFilters', getKey: (x) => x?.id || '' },
];

const TOMBSTONE_RECORD_SECTIONS: Array<keyof StudyDatabase> = [
  'laws',
  'weeklySchedules',
  'pdfFolders',
  'summaryFolders',
];

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
): void {
  if (!entries.length) return;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const now = Date.now();
    const existing = loadDeletedTombstones(scope);
    const map = new Map<string, TombstoneEntry>();
    for (const item of existing) {
      map.set(`${item.section}::${item.key}`, item);
    }
    for (const e of entries) {
      if (!e.section || !e.key) continue;
      map.set(`${e.section}::${e.key}`, {
        section: e.section,
        key: e.key,
        deletedAt: now,
      });
    }
    window.localStorage.setItem(
      getTombstoneStorageKey(scope),
      JSON.stringify(Array.from(map.values()).slice(-1000)),
    );
  } catch {
    // ignore storage errors
  }
}

export function clearDeletedTombstones(scope: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(getTombstoneStorageKey(scope));
  } catch {
    // ignore
  }
}

export function detectDeletedEntitiesBetweenDatabases(
  prevDb: StudyDatabase,
  nextDb: StudyDatabase,
): Array<{ section: string; key: string }> {
  const deleted: Array<{ section: string; key: string }> = [];
  for (const cfg of TOMBSTONE_ARRAY_SECTIONS) {
    const prevArr = (prevDb[cfg.section] as unknown as any[]) || [];
    const nextArr = (nextDb[cfg.section] as unknown as any[]) || [];
    if (prevArr.length <= nextArr.length && nextArr.length > 0) {
      const nextKeys = new Set(nextArr.map((item) => cfg.getKey(item)).filter(Boolean));
      for (const item of prevArr) {
        const k = cfg.getKey(item);
        if (k && !nextKeys.has(k)) {
          deleted.push({ section: String(cfg.section), key: k });
        }
      }
    } else if (prevArr.length > nextArr.length) {
      const nextKeys = new Set(nextArr.map((item) => cfg.getKey(item)).filter(Boolean));
      for (const item of prevArr) {
        const k = cfg.getKey(item);
        if (k && !nextKeys.has(k)) {
          deleted.push({ section: String(cfg.section), key: k });
        }
      }
    }
  }

  for (const sec of TOMBSTONE_RECORD_SECTIONS) {
    const prevRec = (prevDb[sec] as Record<string, unknown> | undefined) || {};
    const nextRec = (nextDb[sec] as Record<string, unknown> | undefined) || {};
    for (const k of Object.keys(prevRec)) {
      if (!(k in nextRec)) {
        deleted.push({ section: String(sec), key: k });
      }
    }
  }
  return deleted;
}

export function applyTombstonesToMergedDatabase(
  mergedDb: StudyDatabase,
  scope: string,
): StudyDatabase {
  const tombstones = loadDeletedTombstones(scope);
  if (tombstones.length === 0) return mergedDb;

  const deletedBySection = new Map<string, Set<string>>();
  for (const t of tombstones) {
    let set = deletedBySection.get(t.section);
    if (!set) {
      set = new Set<string>();
      deletedBySection.set(t.section, set);
    }
    set.add(t.key);
  }

  let changed = false;
  const nextDb: StudyDatabase = { ...mergedDb };

  for (const cfg of TOMBSTONE_ARRAY_SECTIONS) {
    const secName = String(cfg.section);
    const delSet = deletedBySection.get(secName);
    if (!delSet || delSet.size === 0) continue;
    const arr = (nextDb[cfg.section] as unknown as any[]) || [];
    const filtered = arr.filter((item) => {
      const k = cfg.getKey(item);
      return !k || !delSet.has(k);
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
    for (const k of delSet) {
      if (k in rec) {
        delete rec[k];
        recChanged = true;
      }
    }
    if (recChanged) {
      (nextDb as any)[sec] = rec;
      changed = true;
    }
  }

  return changed ? nextDb : mergedDb;
}
