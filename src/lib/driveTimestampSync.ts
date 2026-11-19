import { StudyDatabase } from '../types/study';
import {
  classifyDriveFileSyncOrigin,
  CLOUD_SYNC_FILENAME,
  DriveDeleteTarget,
  DriveFileInfo,
  DriveFileSyncOrigin,
  getKnownStudyDriveFolderNames,
  getPendingDriveDeletes,
  getPreferredStudyFolder,
} from './googleDrive';
import {
  findMatchingDriveFileTombstones,
  normalizeTombstoneName,
} from './incrementalBackup';
import {
  isContestOrEditalTxtDescriptor,
  isReservedBackupFolderName,
  isScheduleTxtDescriptor,
  normalizeSearch,
  visibleName,
} from './parsers';

export type TimestampComparisonStatus =
  | 'local-newer'
  | 'drive-newer'
  | 'in-sync'
  | 'local-only'
  | 'deleted-conflict';

export interface LocalFileDescriptor {
  blobKey: string;
  name: string;
  altNames?: string[];
  subfolder?: string | string[];
  moduleLabel: string;
  folderName?: string;
  localIso?: string;
  localTimestampMs: number;
  hasDateTimePrecision: boolean;
}

export interface FileTimestampComparison {
  blobKey: string;
  name: string;
  altNames?: string[];
  subfolder?: string | string[];
  moduleLabel: string;
  folderName?: string;
  localTimestampMs: number;
  localIso?: string;
  driveTimestampMs: number;
  driveIso?: string;
  status: Exclude<TimestampComparisonStatus, 'deleted-conflict'>;
  driveFile?: DriveFileInfo;
  syncOrigin?: DriveFileSyncOrigin;
  syncTagPresent?: boolean;
  syncTagSyncedAtMs?: number;
}

export interface DeletedDriveConflict {
  id: string;
  driveFile: DriveFileInfo;
  displayName: string;
  moduleLabel: string;
  folderName?: string;
  deletedAtMs: number;
  driveModifiedMs: number;
  newerSide: 'drive' | 'local-delete' | 'unknown';
  tombstoneCompositeKeys: string[];
  fromPendingQueue: boolean;
  syncOrigin: DriveFileSyncOrigin;
  syncTagPresent: boolean;
  syncTagSyncedAtMs: number;
  syncOriginReason: string;
}

export interface TimestampSyncComparisonReport {
  comparedAt: string;
  totalActiveLocalFiles: number;
  totalDriveFiles: number;
  localNewer: FileTimestampComparison[];
  driveNewer: FileTimestampComparison[];
  localOnly: FileTimestampComparison[];
  inSync: FileTimestampComparison[];
  deletedConflicts: DeletedDriveConflict[];
  internalTaggedCount: number;
  externalFilesCount: number;
  externalModifiedCount: number;
}

const TIMESTAMP_TOLERANCE_MS = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const IGNORED_DRIVE_CONFLICTS_PREFIX = 'ce_ignored_drive_conflicts_v1_';

function getIgnoredDriveConflictsKey(scope: string): string {
  return `${IGNORED_DRIVE_CONFLICTS_PREFIX}${scope || 'offline_guest'}`;
}

export function getIgnoredDriveConflictFileIds(scope: string): Set<string> {
  const result = new Set<string>();
  const scopesToRead = scope && scope !== 'offline_guest' ? [scope, 'offline_guest'] : [scope || 'offline_guest'];
  try {
    if (typeof window === 'undefined' || !window.localStorage) return result;
    for (const s of scopesToRead) {
      const raw = window.localStorage.getItem(getIgnoredDriveConflictsKey(s));
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          if (typeof id === 'string' && id.trim()) result.add(id.trim());
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return result;
}

export function addIgnoredDriveConflictFileId(scope: string, fileId: string): void {
  const cleanId = String(fileId || '').replace(/^drive_/, '').trim();
  if (!cleanId) return;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const key = getIgnoredDriveConflictsKey(scope);
    const raw = window.localStorage.getItem(key);
    const existing: string[] = raw ? JSON.parse(raw) : [];
    const next = Array.from(new Set([...(Array.isArray(existing) ? existing : []), cleanId])).slice(-300);
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export function removeIgnoredDriveConflictFileId(scope: string, fileId: string): void {
  const cleanId = String(fileId || '').replace(/^drive_/, '').trim();
  if (!cleanId) return;
  const scopesToClean = scope && scope !== 'offline_guest' ? [scope, 'offline_guest'] : [scope || 'offline_guest'];
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    for (const s of scopesToClean) {
      const key = getIgnoredDriveConflictsKey(s);
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const existing: string[] = JSON.parse(raw);
      if (!Array.isArray(existing)) continue;
      const next = existing.filter((id) => id !== cleanId);
      if (next.length > 0) {
        window.localStorage.setItem(key, JSON.stringify(next));
      } else {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore storage errors
  }
}

function stripDrivePrefix(name: string): string {
  return String(name || '')
    .replace(
      /^(LEI|PROVA|GABARITO|RESUMO|DISCURSIVA|CORRECAO|CRONOGRAMA|DATAS\s*E\s*LOCAIS|EDITAL)\s*-\s*/i,
      '',
    )
    .trim();
}

function normalizeLookup(val?: string): string {
  return normalizeSearch(visibleName(val || '')).replace(/\s+/g, ' ').trim();
}

function isDateOnlyString(raw?: string): boolean {
  return Boolean(raw && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()));
}

export function parseTimestampMs(raw?: string): { ms: number; hasDateTimePrecision: boolean } {
  if (!raw || typeof raw !== 'string') return { ms: 0, hasDateTimePrecision: false };
  const trimmed = raw.trim();
  if (!trimmed) return { ms: 0, hasDateTimePrecision: false };
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms) || ms <= 0) return { ms: 0, hasDateTimePrecision: false };
  return {
    ms,
    hasDateTimePrecision: !isDateOnlyString(trimmed),
  };
}

export function isDriveTimestampNewerThanLocal(
  localIso?: string,
  driveIso?: string,
): boolean {
  const local = parseTimestampMs(localIso);
  const drive = parseTimestampMs(driveIso);
  if (!drive.ms) return false;
  if (!local.ms) return false;
  if (!local.hasDateTimePrecision) {
    // Local record only stores YYYY-MM-DD (no time-of-day); require >24h margin to avoid false same-day downloads
    return drive.ms - local.ms > DAY_MS;
  }
  return drive.ms - local.ms > TIMESTAMP_TOLERANCE_MS;
}

export function compareFileTimestampPair(
  localIso: string | undefined,
  driveIso: string | undefined,
): 'local-newer' | 'drive-newer' | 'in-sync' {
  const local = parseTimestampMs(localIso);
  const drive = parseTimestampMs(driveIso);
  if (!local.ms || !drive.ms) return 'in-sync';
  if (!local.hasDateTimePrecision) {
    if (local.ms - drive.ms > DAY_MS) return 'local-newer';
    if (drive.ms - local.ms > DAY_MS) return 'drive-newer';
    return 'in-sync';
  }
  if (local.ms - drive.ms > TIMESTAMP_TOLERANCE_MS) return 'local-newer';
  if (drive.ms - local.ms > TIMESTAMP_TOLERANCE_MS) return 'drive-newer';
  return 'in-sync';
}

function isDriveBackupOrSystemFile(df: DriveFileInfo): boolean {
  const lowerName = (df.name || '').toLowerCase();
  const pathSegments = (df.folderPath || '')
    .split('/')
    .map((s) => normalizeSearch(visibleName(s)));
  return (
    df.subfolderName === 'Backups' ||
    pathSegments.includes('backups') ||
    pathSegments.includes('backup geral') ||
    lowerName === CLOUD_SYNC_FILENAME ||
    lowerName === 'post-it.txt' ||
    lowerName.startsWith('backup_central_estudos') ||
    lowerName.startsWith('backup_incremental_central_estudos') ||
    lowerName.includes('central_estudos_sync') ||
    lowerName.startsWith('.central_estudos_') ||
    lowerName.endsWith('.json')
  );
}

function inferModuleFromDriveFile(df: DriveFileInfo): { moduleLabel: string; folderName?: string } {
  const name = df.name || '';
  const sub = df.subfolderName || '';
  const parts = String(df.folderPath || '')
    .split('/')
    .map((s) => visibleName(s.trim()))
    .filter(Boolean);
  const folderName = parts.length > 1 ? parts[parts.length - 1] : undefined;

  if (sub === 'Lei Seca' || /^LEI\s*-\s*/i.test(name)) {
    return { moduleLabel: 'Lei Seca', folderName };
  }
  if (sub === 'Provas e Gabaritos' || /^(PROVA|GABARITO)\s*-\s*/i.test(name)) {
    return { moduleLabel: 'Provas e Gabaritos', folderName };
  }
  if (sub === 'Resumos e Mapas' || /^RESUMO\s*-\s*/i.test(name)) {
    return { moduleLabel: 'Resumos e Mapas', folderName };
  }
  if (sub === 'Discursivas' || /^(DISCURSIVA|CORRECAO)\s*-\s*/i.test(name)) {
    return { moduleLabel: 'Discursivas', folderName };
  }
  if (
    sub === 'Editais' ||
    sub === 'Datas e Locais' ||
    isContestOrEditalTxtDescriptor(name, sub || df.folderPath)
  ) {
    return { moduleLabel: 'Editais e Concursos', folderName };
  }
  if (sub === 'Cronogramas' || isScheduleTxtDescriptor(name, sub || df.folderPath)) {
    return { moduleLabel: 'Cronogramas', folderName };
  }
  if (sub === 'Questões') {
    return { moduleLabel: 'Questões', folderName };
  }
  return { moduleLabel: 'PDFs Pessoais', folderName };
}

function matchesPendingDeleteTarget(
  df: DriveFileInfo,
  target: DriveDeleteTarget,
): boolean {
  const cleanDriveId = String(df.id || '').trim();
  if (
    target.fileIds?.some(
      (id) => String(id || '').replace(/^drive_/, '').trim() === cleanDriveId,
    )
  ) {
    return true;
  }

  const dfFull = normalizeTombstoneName(df.name);
  const dfStripped = normalizeTombstoneName(stripDrivePrefix(df.name || ''));
  const targetNames = (target.names || []).flatMap((n) => [
    normalizeTombstoneName(n),
    normalizeTombstoneName(stripDrivePrefix(n)),
  ]);
  if (targetNames.some((tn) => tn && (tn === dfFull || tn === dfStripped))) {
    return true;
  }

  if (target.folderNames?.length && df.isInStudyFolder !== false) {
    const segs = String(df.folderPath || '')
      .split('/')
      .map((s) => normalizeTombstoneName(s))
      .filter(Boolean);
    const fKeys = new Set(target.folderNames.map((f) => normalizeTombstoneName(f)).filter(Boolean));
    if (segs.some((s) => fKeys.has(s))) {
      return true;
    }
  }

  return false;
}

export function collectActiveLocalFileDescriptors(
  localDb: StudyDatabase,
): LocalFileDescriptor[] {
  const toDriveSeg = (raw: string) => visibleName(raw).replace(/[\\/]+/g, ' - ').trim();
  const knownBackupRoots = [
    getPreferredStudyFolder().name,
    ...getKnownStudyDriveFolderNames(),
  ];

  const descriptors: LocalFileDescriptor[] = [];

  Object.entries(localDb.pdfFolders || {}).forEach(([folderKey, list]) => {
    if (isReservedBackupFolderName(folderKey, knownBackupRoots, list)) return;
    (list || []).forEach((f) => {
      const annIso = f.blobKey ? localDb.pdfAnnotations?.[f.blobKey]?.updatedAt : undefined;
      const candidateIso =
        annIso && (!f.updatedAt || Date.parse(annIso) > Date.parse(f.updatedAt))
          ? annIso
          : f.updatedAt || f.createdAt;
      const parsed = parseTimestampMs(candidateIso);
      descriptors.push({
        blobKey: f.blobKey,
        name: f.name,
        subfolder: ['PDFs Pessoais', toDriveSeg(folderKey)].filter(Boolean),
        moduleLabel: 'PDFs Pessoais',
        folderName: visibleName(folderKey),
        localIso: candidateIso,
        localTimestampMs: parsed.ms,
        hasDateTimePrecision: parsed.hasDateTimePrecision,
      });
    });
  });

  Object.entries(localDb.summaryFolders || {}).forEach(([folderKey, list]) => {
    (list || []).forEach((s) => {
      const candidateIso = s.updatedAt || s.createdAt;
      const parsed = parseTimestampMs(candidateIso);
      descriptors.push({
        blobKey: s.blobKey,
        name: s.name,
        altNames: [`RESUMO - ${s.name}`],
        subfolder: ['Resumos e Mapas', toDriveSeg(folderKey)].filter(Boolean),
        moduleLabel: 'Resumos e Mapas',
        folderName: visibleName(folderKey),
        localIso: candidateIso,
        localTimestampMs: parsed.ms,
        hasDateTimePrecision: parsed.hasDateTimePrecision,
      });
    });
  });

  Object.entries(localDb.laws || {}).forEach(([folderKey, folderObj]) => {
    (folderObj.pdfs || []).forEach((p) => {
      const candidateIso = p.updatedAt || p.createdAt;
      const parsed = parseTimestampMs(candidateIso);
      descriptors.push({
        blobKey: p.blobKey,
        name: p.name,
        altNames: [`LEI - ${p.name}`],
        subfolder: ['Lei Seca', toDriveSeg(folderKey)].filter(Boolean),
        moduleLabel: 'Lei Seca',
        folderName: visibleName(folderKey),
        localIso: candidateIso,
        localTimestampMs: parsed.ms,
        hasDateTimePrecision: parsed.hasDateTimePrecision,
      });
    });
  });

  (localDb.proofFiles || []).forEach((pf) => {
    const candidateIso = pf.updatedAt || pf.createdAt;
    const parsed = parseTimestampMs(candidateIso);
    descriptors.push({
      blobKey: pf.blobKey,
      name: pf.name,
      altNames: [`PROVA - ${pf.name}`],
      subfolder:
        pf.bank && pf.bank !== 'Geral'
          ? ['Provas e Gabaritos', toDriveSeg(pf.bank)]
          : 'Provas e Gabaritos',
      moduleLabel: 'Provas e Gabaritos',
      folderName: visibleName(pf.bank || 'Geral'),
      localIso: candidateIso,
      localTimestampMs: parsed.ms,
      hasDateTimePrecision: parsed.hasDateTimePrecision,
    });
  });

  (localDb.essays || []).forEach((e) => {
    const candidateIso = e.updatedAt || e.created_at || e.data;
    const parsed = parseTimestampMs(candidateIso);
    descriptors.push({
      blobKey: e.original_blobKey,
      name: `DISCURSIVA - ${e.original_arquivo}`,
      altNames: [e.original_arquivo],
      subfolder: 'Discursivas',
      moduleLabel: 'Discursivas',
      localIso: candidateIso,
      localTimestampMs: parsed.ms,
      hasDateTimePrecision: parsed.hasDateTimePrecision,
    });
    if (e.corrigido_blobKey && e.corrigido_arquivo) {
      const corrIso = e.updatedAt || e.corrigida_em || e.created_at;
      const corrParsed = parseTimestampMs(corrIso);
      descriptors.push({
        blobKey: e.corrigido_blobKey,
        name: `CORRECAO - ${e.corrigido_arquivo}`,
        altNames: [e.corrigido_arquivo],
        subfolder: 'Discursivas',
        moduleLabel: 'Discursivas',
        localIso: corrIso,
        localTimestampMs: corrParsed.ms,
        hasDateTimePrecision: corrParsed.hasDateTimePrecision,
      });
    }
  });

  return descriptors;
}

/**
 * Compares local study files and local deletion records (tombstones + queued deletes)
 * against live Google Drive files by timestamp during synchronization.
 */
export function compareLocalAndDriveFileTimestamps(
  localDb: StudyDatabase,
  driveFiles: DriveFileInfo[],
  scope: string,
  options?: { onlyFolderId?: string },
): TimestampSyncComparisonReport {
  const onlyFolderId =
    options?.onlyFolderId && options.onlyFolderId !== 'all' ? options.onlyFolderId : undefined;

  const inSelectedFolder = (df: DriveFileInfo) => {
    if (!onlyFolderId) return true;
    if (onlyFolderId === 'root') {
      return !df.parents || df.parents.length === 0 || df.folderPath === 'Meu Drive (Raiz)';
    }
    return Boolean(
      df.parents?.includes(onlyFolderId) || df.ancestorFolderIds?.includes(onlyFolderId),
    );
  };

  const activeDriveFiles = driveFiles.filter(
    (df) => inSelectedFolder(df) && !isDriveBackupOrSystemFile(df),
  );

  const driveById = new Map<string, DriveFileInfo>();
  const driveByName = new Map<string, DriveFileInfo>();
  const driveByStripped = new Map<string, DriveFileInfo>();

  for (const df of activeDriveFiles) {
    driveById.set(df.id, df);
    const norm = normalizeLookup(df.name);
    if (norm && !driveByName.has(norm)) driveByName.set(norm, df);
    const stripped = normalizeLookup(stripDrivePrefix(df.name));
    if (stripped && !driveByStripped.has(stripped)) driveByStripped.set(stripped, df);
  }

  const localDescriptors = collectActiveLocalFileDescriptors(localDb);
  const matchedActiveDriveIds = new Set<string>();
  const activeNormalizedNames = new Set<string>();

  const localNewer: FileTimestampComparison[] = [];
  const driveNewer: FileTimestampComparison[] = [];
  const localOnly: FileTimestampComparison[] = [];
  const inSync: FileTimestampComparison[] = [];

  for (const desc of localDescriptors) {
    const candidates = [desc.name, ...(desc.altNames || [])];
    for (const c of candidates) {
      const n1 = normalizeLookup(c);
      const n2 = normalizeLookup(stripDrivePrefix(c));
      if (n1) activeNormalizedNames.add(n1);
      if (n2) activeNormalizedNames.add(n2);
    }

    let match: DriveFileInfo | undefined;
    if (desc.blobKey.startsWith('drive_')) {
      match = driveById.get(desc.blobKey.replace(/^drive_/, ''));
    }
    if (!match) {
      match = candidates
        .map(
          (c) =>
            driveByName.get(normalizeLookup(c)) ||
            driveByStripped.get(normalizeLookup(stripDrivePrefix(c))),
        )
        .find((item): item is DriveFileInfo => Boolean(item));
    }

    if (!match) {
      const entry: FileTimestampComparison = {
        blobKey: desc.blobKey,
        name: desc.name,
        altNames: desc.altNames,
        subfolder: desc.subfolder,
        moduleLabel: desc.moduleLabel,
        folderName: desc.folderName,
        localTimestampMs: desc.localTimestampMs,
        localIso: desc.localIso,
        driveTimestampMs: 0,
        status: 'local-only',
      };
      localOnly.push(entry);
      continue;
    }

    matchedActiveDriveIds.add(match.id);
    const driveIso = match.modifiedTime || match.createdTime;
    const driveParsed = parseTimestampMs(driveIso);
    const rel = compareFileTimestampPair(desc.localIso, driveIso);
    const tagInfo = classifyDriveFileSyncOrigin(match);

    const entry: FileTimestampComparison = {
      blobKey: desc.blobKey,
      name: desc.name,
      altNames: desc.altNames,
      subfolder: desc.subfolder,
      moduleLabel: desc.moduleLabel,
      folderName: desc.folderName,
      localTimestampMs: desc.localTimestampMs,
      localIso: desc.localIso,
      driveTimestampMs: driveParsed.ms,
      driveIso,
      status: rel,
      driveFile: match,
      syncOrigin: tagInfo.origin,
      syncTagPresent: tagInfo.tagPresent,
      syncTagSyncedAtMs: tagInfo.syncedAtMs,
    };

    if (rel === 'local-newer') localNewer.push(entry);
    else if (rel === 'drive-newer') driveNewer.push(entry);
    else inSync.push(entry);
  }

  // Detect locally-deleted files still present on Google Drive (via tombstones or pending delete queue)
  const pendingDeletes = [
    ...getPendingDriveDeletes(scope),
    ...(scope !== 'offline_guest' ? getPendingDriveDeletes('offline_guest') : []),
  ];

  const deletedConflicts: DeletedDriveConflict[] = [];
  const seenConflictDriveIds = new Set<string>();
  const ignoredConflictIds = getIgnoredDriveConflictFileIds(scope);

  for (const df of activeDriveFiles) {
    if (seenConflictDriveIds.has(df.id)) continue;
    if (ignoredConflictIds.has(df.id)) continue;
    if (matchedActiveDriveIds.has(df.id)) continue;

    // Never flag a file that is still actively present in localDb by exact/stripped name
    const dfNorm = normalizeLookup(df.name);
    const dfStripped = normalizeLookup(stripDrivePrefix(df.name));
    if (
      (dfNorm && activeNormalizedNames.has(dfNorm)) ||
      (dfStripped && activeNormalizedNames.has(dfStripped))
    ) {
      continue;
    }

    const tombstoneMatch = findMatchingDriveFileTombstones(df, localDb, scope);
    const matchedPending = pendingDeletes.filter((pd) => matchesPendingDeleteTarget(df, pd));

    if (!tombstoneMatch.isTombstoned && matchedPending.length === 0) {
      continue;
    }

    const pendingQueuedMs = matchedPending.reduce(
      (max, pd) => Math.max(max, typeof pd.queuedAt === 'number' ? pd.queuedAt : 0),
      0,
    );
    const deletedAtMs = Math.max(tombstoneMatch.latestDeletedAtMs, pendingQueuedMs);
    const driveModifiedMs = parseTimestampMs(df.modifiedTime || df.createdTime).ms;
    const tagInfo = classifyDriveFileSyncOrigin(df);

    let newerSide: DeletedDriveConflict['newerSide'] = 'unknown';
    if (tagInfo.origin === 'internal' && tagInfo.syncedAtMs > 0 && deletedAtMs > 0) {
      // File has an intact internal app sync-tag and was NOT externally modified on Drive:
      // compare against the app's own stamped sync time (ceAt) so Drive indexing/metadata drift
      // never misclassifies a stale deleted internal copy as newer than the local deletion.
      newerSide =
        tagInfo.syncedAtMs > deletedAtMs + 60_000 ? 'drive' : 'local-delete';
    } else if (driveModifiedMs > 0 && deletedAtMs > 0) {
      newerSide =
        driveModifiedMs > deletedAtMs + TIMESTAMP_TOLERANCE_MS
          ? 'drive'
          : 'local-delete';
    }

    const inferred = inferModuleFromDriveFile(df);
    seenConflictDriveIds.add(df.id);
    deletedConflicts.push({
      id: df.id,
      driveFile: df,
      displayName: stripDrivePrefix(df.name) || df.name,
      moduleLabel: inferred.moduleLabel,
      folderName: inferred.folderName,
      deletedAtMs,
      driveModifiedMs,
      newerSide,
      tombstoneCompositeKeys: tombstoneMatch.matchedKeys,
      fromPendingQueue: matchedPending.length > 0,
      syncOrigin: tagInfo.origin,
      syncTagPresent: tagInfo.tagPresent,
      syncTagSyncedAtMs: tagInfo.syncedAtMs,
      syncOriginReason: tagInfo.syncReason,
    });
  }

  let internalTaggedCount = 0;
  let externalFilesCount = 0;
  let externalModifiedCount = 0;
  for (const df of activeDriveFiles) {
    const tagInfo = classifyDriveFileSyncOrigin(df);
    if (tagInfo.origin === 'internal') internalTaggedCount += 1;
    else if (tagInfo.origin === 'external-modified') externalModifiedCount += 1;
    else externalFilesCount += 1;
  }

  return {
    comparedAt: new Date().toISOString(),
    totalActiveLocalFiles: localDescriptors.length,
    totalDriveFiles: activeDriveFiles.length,
    localNewer,
    driveNewer,
    localOnly,
    inSync,
    deletedConflicts,
    internalTaggedCount,
    externalFilesCount,
    externalModifiedCount,
  };
}
