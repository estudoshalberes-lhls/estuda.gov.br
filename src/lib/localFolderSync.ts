import { CLOUD_SYNC_FILENAME, DriveFileInfo } from './googleDrive';
import { IncrementalBackupEnvelope, isIncrementalBackupPayload } from './incrementalBackup';
import {
  clearLocalDirectoryHandle,
  loadLocalDirectoryHandle,
  saveLocalDirectoryHandle,
} from './fileStorage';
import {
  isContestOrEditalTxtDescriptor,
  isScheduleTxtDescriptor,
  normalizeSearch,
  visibleName,
} from './parsers';

export const LOCAL_FOLDER_META_KEY = 'central_estudos_local_folder_meta_v1';

export const CANONICAL_LOCAL_SUBFOLDERS = [
  'Backups',
  'PDFs Pessoais',
  'Lei Seca',
  'Provas e Gabaritos',
  'Resumos e Mapas',
  'Discursivas',
  'Cronogramas',
  'Editais',
  'Datas e Locais',
  'Questões',
] as const;

export type CanonicalLocalSubfolder = (typeof CANONICAL_LOCAL_SUBFOLDERS)[number];

export interface LocalDiskFileEntry {
  id: string;
  name: string;
  relativePath: string;
  subfolderName?: string;
  nestedFolderPath?: string;
  folderPath: string;
  mimeType: string;
  size: number;
  lastModified: number;
  modifiedTime: string;
  file: File;
}

export interface LocalFolderScanSummary {
  rootFolderName: string;
  totalFiles: number;
  totalFolders: number;
  writable: boolean;
  categories: {
    backups: number;
    pdfs: number;
    laws: number;
    proofs: number;
    summaries: number;
    essays: number;
    schedules: number;
    editais: number;
    contests: number;
    questions: number;
    others: number;
  };
  folderNames: string[];
  scannedAt: string;
}

export function loadSavedLocalFolderMeta(): LocalFolderScanSummary | null {
  try {
    const raw = localStorage.getItem(LOCAL_FOLDER_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalFolderScanSummary;
    if (parsed && typeof parsed.rootFolderName === 'string' && parsed.rootFolderName.trim()) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLocalFolderMeta(summary: LocalFolderScanSummary | null): void {
  try {
    if (!summary) {
      localStorage.removeItem(LOCAL_FOLDER_META_KEY);
    } else {
      localStorage.setItem(LOCAL_FOLDER_META_KEY, JSON.stringify(summary));
    }
  } catch {
    // ignore storage errors
  }
}

export function inferMimeTypeFromFilename(filename: string, fallback = ''): string {
  if (fallback && fallback !== 'application/octet-stream') return fallback;
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text/plain';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.doc')) return 'application/msword';
  return fallback || 'application/octet-stream';
}

export function matchCanonicalCategorySegment(rawSegment: string): CanonicalLocalSubfolder | null {
  const norm = normalizeSearch(visibleName(rawSegment || ''));
  if (!norm) return null;
  if (norm === 'backups' || norm === 'backup' || norm === 'backup geral' || norm === 'copias de seguranca') {
    return 'Backups';
  }
  if (norm === 'pdfs pessoais' || norm === 'pdf pessoais' || norm === 'pdfs' || norm === 'materiais pdf') {
    return 'PDFs Pessoais';
  }
  if (norm === 'lei seca' || norm === 'leis' || norm === 'legislacao' || norm === 'vade mecum' || norm === 'matriz de incidencia') {
    return 'Lei Seca';
  }
  if (
    norm === 'provas e gabaritos' ||
    norm === 'provas' ||
    norm === 'provas anteriores' ||
    norm === 'gabaritos'
  ) {
    return 'Provas e Gabaritos';
  }
  if (
    norm === 'resumos e mapas' ||
    norm === 'resumos & mapas' ||
    norm === 'resumos' ||
    norm === 'mapas mentais'
  ) {
    return 'Resumos e Mapas';
  }
  if (norm === 'discursivas' || norm === 'discursiva' || norm === 'redacoes' || norm === 'redacao') {
    return 'Discursivas';
  }
  if (norm === 'cronogramas' || norm === 'cronograma') {
    return 'Cronogramas';
  }
  if (norm === 'editais' || norm === 'edital') {
    return 'Editais';
  }
  if (
    norm === 'datas e locais' ||
    norm === 'datas & locais' ||
    norm === 'concursos' ||
    norm === 'inscricoes'
  ) {
    return 'Datas e Locais';
  }
  if (norm === 'questoes' || norm === 'simulados' || norm === 'banco de questoes') {
    return 'Questões';
  }
  return null;
}

export function classifyLocalFileCategory(
  name: string,
  folderSegments: string[],
): {
  canonicalCategory: CanonicalLocalSubfolder | undefined;
  nestedSubfolder: string | undefined;
} {
  // 1. Check folder segments from top-most to deepest for a canonical category match
  for (let i = 0; i < folderSegments.length; i++) {
    const matched = matchCanonicalCategorySegment(folderSegments[i]);
    if (matched) {
      const nested =
        folderSegments.length > i + 1
          ? folderSegments.slice(i + 1).join(' / ')
          : undefined;
      return { canonicalCategory: matched, nestedSubfolder: nested };
    }
  }

  // 2. Check filename prefixes & extensions
  const trimmedName = (name || '').trim();
  const lower = trimmedName.toLowerCase();

  if (
    lower === CLOUD_SYNC_FILENAME.toLowerCase() ||
    lower === 'central estudos sync latest.json' ||
    lower.startsWith('backup_central_estudos') ||
    lower.startsWith('backup central estudos') ||
    lower.startsWith('backup_incremental_central_estudos') ||
    lower.startsWith('backup incremental central estudos') ||
    lower.includes('central_estudos_sync') ||
    lower.includes('central estudos sync') ||
    lower.endsWith('.json')
  ) {
    return { canonicalCategory: 'Backups', nestedSubfolder: undefined };
  }

  if (isScheduleTxtDescriptor(trimmedName)) {
    return { canonicalCategory: 'Cronogramas', nestedSubfolder: undefined };
  }
  if (isContestOrEditalTxtDescriptor(trimmedName)) {
    const isDatasLocais =
      /^(?:DATAS\s*(?:E|&)\s*LOCAIS)\b/i.test(trimmedName) ||
      normalizeSearch(trimmedName).includes('controle geral de inscricoes') ||
      normalizeSearch(trimmedName).includes('inscricoes boletos e locais');
    return {
      canonicalCategory: isDatasLocais ? 'Datas e Locais' : 'Editais',
      nestedSubfolder: undefined,
    };
  }
  if (/^LEI\s*-\s*/i.test(trimmedName)) {
    const nested = folderSegments.length > 0 ? folderSegments[folderSegments.length - 1] : undefined;
    return { canonicalCategory: 'Lei Seca', nestedSubfolder: nested };
  }
  if (/^(?:PROVA|GABARITO)\s*-\s*/i.test(trimmedName) || lower.endsWith('.gabarito.txt')) {
    const nested = folderSegments.length > 0 ? folderSegments[folderSegments.length - 1] : undefined;
    return { canonicalCategory: 'Provas e Gabaritos', nestedSubfolder: nested };
  }
  if (/^RESUMO\s*-\s*/i.test(trimmedName)) {
    const nested = folderSegments.length > 0 ? folderSegments[folderSegments.length - 1] : undefined;
    return { canonicalCategory: 'Resumos e Mapas', nestedSubfolder: nested };
  }
  if (/^(?:DISCURSIVA|CORRECAO)\s*-\s*/i.test(trimmedName)) {
    return { canonicalCategory: 'Discursivas', nestedSubfolder: undefined };
  }

  const nested = folderSegments.length > 0 ? folderSegments.join(' / ') : undefined;
  const normalizedBase = normalizeSearch(trimmedName);

  if (
    (lower.endsWith('.txt') || lower.endsWith('.md')) &&
    !isScheduleTxtDescriptor(trimmedName) &&
    !isContestOrEditalTxtDescriptor(trimmedName) &&
    (normalizedBase.includes('_estruturada') ||
      normalizedBase.includes('estruturada.') ||
      /\b(?:prova|simulado)\b/.test(normalizedBase))
  ) {
    return { canonicalCategory: 'Provas e Gabaritos', nestedSubfolder: nested };
  }

  if ((lower.endsWith('.txt') || lower.endsWith('.md')) && /\bquestoes\b/.test(normalizedBase)) {
    return { canonicalCategory: 'Questões', nestedSubfolder: nested };
  }

  // 3. Default fallback for PDFs in custom user folders
  if (lower.endsWith('.pdf')) {
    return { canonicalCategory: 'PDFs Pessoais', nestedSubfolder: nested };
  }

  return { canonicalCategory: undefined, nestedSubfolder: nested };
}

export function buildLocalScanSummary(
  rootFolderName: string,
  entries: LocalDiskFileEntry[],
  discoveredFolders: Set<string>,
  writable: boolean,
): LocalFolderScanSummary {
  const categories = {
    backups: 0,
    pdfs: 0,
    laws: 0,
    proofs: 0,
    summaries: 0,
    essays: 0,
    schedules: 0,
    editais: 0,
    contests: 0,
    questions: 0,
    others: 0,
  };

  for (const entry of entries) {
    switch (entry.subfolderName) {
      case 'Backups':
        categories.backups += 1;
        break;
      case 'PDFs Pessoais':
        categories.pdfs += 1;
        break;
      case 'Lei Seca':
        categories.laws += 1;
        break;
      case 'Provas e Gabaritos':
        categories.proofs += 1;
        break;
      case 'Resumos e Mapas':
        categories.summaries += 1;
        break;
      case 'Discursivas':
        categories.essays += 1;
        break;
      case 'Cronogramas':
        categories.schedules += 1;
        break;
      case 'Editais':
        categories.editais += 1;
        break;
      case 'Datas e Locais':
        categories.contests += 1;
        break;
      case 'Questões':
        categories.questions += 1;
        break;
      default:
        categories.others += 1;
        break;
    }
  }

  const folderNames = Array.from(discoveredFolders).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return {
    rootFolderName,
    totalFiles: entries.length,
    totalFolders: folderNames.length,
    writable,
    categories,
    folderNames,
    scannedAt: new Date().toISOString(),
  };
}

export async function verifyDirectoryHandlePermission(
  handle: FileSystemDirectoryHandle,
  requestIfPrompt = true,
): Promise<'granted' | 'readonly' | 'denied'> {
  const anyHandle = handle as any;
  try {
    if (typeof anyHandle.queryPermission === 'function') {
      const rwPerm = await anyHandle.queryPermission({ mode: 'readwrite' });
      if (rwPerm === 'granted') return 'granted';
      if (requestIfPrompt && typeof anyHandle.requestPermission === 'function') {
        const reqRw = await anyHandle.requestPermission({ mode: 'readwrite' });
        if (reqRw === 'granted') return 'granted';
      }
      const roPerm = await anyHandle.queryPermission({ mode: 'read' });
      if (roPerm === 'granted') return 'readonly';
      if (requestIfPrompt && typeof anyHandle.requestPermission === 'function') {
        const reqRo = await anyHandle.requestPermission({ mode: 'read' });
        if (reqRo === 'granted') return 'readonly';
      }
      return 'denied';
    }
    return 'granted';
  } catch {
    return 'denied';
  }
}

export async function pickLocalStudyDirectory(): Promise<{
  handle?: FileSystemDirectoryHandle;
  writable?: boolean;
  aborted?: boolean;
  needsInputFallback?: boolean;
}> {
  const win = window as any;
  if (typeof win.showDirectoryPicker !== 'function') {
    return { needsInputFallback: true };
  }
  try {
    const handle: FileSystemDirectoryHandle = await win.showDirectoryPicker({
      id: 'central_estudos_local_dir',
      mode: 'readwrite',
    });
    const perm = await verifyDirectoryHandlePermission(handle, true);
    const writable = perm === 'granted';
    await saveLocalDirectoryHandle(handle);
    return { handle, writable };
  } catch (err: any) {
    const name = String(err?.name || '');
    const msg = String(err?.message || '');
    if (name === 'AbortError' || msg.toLowerCase().includes('aborted') || msg.toLowerCase().includes('user activation')) {
      return { aborted: true };
    }
    // SecurityError inside cross-origin iframe or unsupported browser -> use <input webkitdirectory> fallback
    return { needsInputFallback: true };
  }
}

export async function reconnectSavedLocalDirectory(
  requestIfPrompt = true,
): Promise<{
  handle: FileSystemDirectoryHandle;
  writable: boolean;
} | null> {
  const saved = await loadLocalDirectoryHandle();
  if (!saved) return null;
  const perm = await verifyDirectoryHandlePermission(saved, requestIfPrompt);
  if (perm === 'denied') return null;
  return {
    handle: saved,
    writable: perm === 'granted',
  };
}

export async function forgetSavedLocalDirectory(): Promise<void> {
  await clearLocalDirectoryHandle();
  saveLocalFolderMeta(null);
}

export interface LocalCategorySummaryItem {
  key: keyof LocalFolderScanSummary['categories'];
  label: string;
  fileCount: number;
}

export function getLocalCategoryList(
  summary: LocalFolderScanSummary | null | undefined,
): LocalCategorySummaryItem[] {
  const c = summary?.categories;
  return [
    { key: 'backups', label: 'Backups', fileCount: c?.backups || 0 },
    { key: 'pdfs', label: 'PDFs Pessoais', fileCount: c?.pdfs || 0 },
    { key: 'laws', label: 'Lei Seca', fileCount: c?.laws || 0 },
    { key: 'proofs', label: 'Provas e Gabaritos', fileCount: c?.proofs || 0 },
    { key: 'summaries', label: 'Resumos e Mapas', fileCount: c?.summaries || 0 },
    { key: 'essays', label: 'Discursivas', fileCount: c?.essays || 0 },
    { key: 'schedules', label: 'Cronogramas', fileCount: c?.schedules || 0 },
    { key: 'editais', label: 'Editais', fileCount: c?.editais || 0 },
    { key: 'contests', label: 'Datas e Locais', fileCount: c?.contests || 0 },
    { key: 'questions', label: 'Questões', fileCount: c?.questions || 0 },
    { key: 'others', label: 'Outros Arquivos', fileCount: c?.others || 0 },
  ];
}

export async function scanDirectoryHandle(
  rootHandle: FileSystemDirectoryHandle,
  writable = true,
): Promise<{
  entries: LocalDiskFileEntry[];
  summary: LocalFolderScanSummary;
}> {
  const entries: LocalDiskFileEntry[] = [];
  const discoveredFolders = new Set<string>();
  const rootName = rootHandle.name || 'Pasta Local';

  const walk = async (dirHandle: FileSystemDirectoryHandle, currentSegments: string[]) => {
    const anyDir = dirHandle as any;
    if (typeof anyDir.values !== 'function' && typeof anyDir.entries !== 'function') return;

    const iterator =
      typeof anyDir.values === 'function' ? anyDir.values() : anyDir.entries();

    for await (const rawEntry of iterator) {
      const entry: FileSystemHandle = Array.isArray(rawEntry) ? rawEntry[1] : rawEntry;
      if (!entry || !entry.name) continue;
      if (entry.name.startsWith('.DS_Store') || entry.name === 'Thumbs.db' || entry.name === 'desktop.ini') {
        continue;
      }

      if (entry.kind === 'directory') {
        const nextSegments = [...currentSegments, entry.name];
        discoveredFolders.add(nextSegments.join(' / '));
        await walk(entry as FileSystemDirectoryHandle, nextSegments);
      } else if (entry.kind === 'file') {
        try {
          const fileHandle = entry as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          const relSegments = [...currentSegments, file.name];
          const relativePath = relSegments.join('/');
          const { canonicalCategory, nestedSubfolder } = classifyLocalFileCategory(
            file.name,
            currentSegments,
          );
          const folderPathParts = [rootName, ...currentSegments];
          if (
            canonicalCategory &&
            !currentSegments.some((s: string) => matchCanonicalCategorySegment(s) === canonicalCategory)
          ) {
            folderPathParts.splice(1, 0, canonicalCategory);
          }
          const mimeType = inferMimeTypeFromFilename(file.name, file.type);
          const lastModified = file.lastModified || Date.now();
          entries.push({
            id: `local_${relativePath}`,
            name: file.name,
            relativePath,
            subfolderName: canonicalCategory || currentSegments[0],
            nestedFolderPath: nestedSubfolder,
            folderPath: folderPathParts.join(' / '),
            mimeType,
            size: file.size,
            lastModified,
            modifiedTime: new Date(lastModified).toISOString(),
            file,
          });
        } catch (readErr) {
          console.warn(`Aviso ao ler arquivo local "${entry.name}":`, readErr);
        }
      }
    }
  };

  await walk(rootHandle, []);
  const summary = buildLocalScanSummary(rootName, entries, discoveredFolders, writable);
  saveLocalFolderMeta(summary);
  return { entries, summary };
}

export function scanFileListFromInput(fileList: FileList | File[]): {
  entries: LocalDiskFileEntry[];
  summary: LocalFolderScanSummary;
} {
  const files = Array.from(fileList || []);
  const entries: LocalDiskFileEntry[] = [];
  const discoveredFolders = new Set<string>();
  let rootName = 'Pasta Local';

  for (const file of files) {
    if (!file || !file.name) continue;
    if (file.name.startsWith('.DS_Store') || file.name === 'Thumbs.db' || file.name === 'desktop.ini') {
      continue;
    }
    const rawRel = ((file as any).webkitRelativePath || file.name).replace(/\\/g, '/');
    const parts = rawRel.split('/').filter(Boolean);
    if (parts.length > 1 && rootName === 'Pasta Local') {
      rootName = parts[0];
    }
    const folderSegments = parts.length > 1 ? parts.slice(1, -1) : [];
    for (let i = 1; i <= folderSegments.length; i++) {
      discoveredFolders.add(folderSegments.slice(0, i).join(' / '));
    }

    const { canonicalCategory, nestedSubfolder } = classifyLocalFileCategory(
      file.name,
      folderSegments,
    );
    const folderPathParts = [rootName, ...folderSegments];
    if (
      canonicalCategory &&
      !folderSegments.some((s: string) => matchCanonicalCategorySegment(s) === canonicalCategory)
    ) {
      folderPathParts.splice(1, 0, canonicalCategory);
    }

    const relativePath = parts.length > 1 ? parts.slice(1).join('/') : file.name;
    const mimeType = inferMimeTypeFromFilename(file.name, file.type);
    const lastModified = file.lastModified || Date.now();

    entries.push({
      id: `local_${relativePath}`,
      name: file.name,
      relativePath,
      subfolderName: canonicalCategory || folderSegments[0],
      nestedFolderPath: nestedSubfolder,
      folderPath: folderPathParts.join(' / '),
      mimeType,
      size: file.size,
      lastModified,
      modifiedTime: new Date(lastModified).toISOString(),
      file,
    });
  }

  const summary = buildLocalScanSummary(rootName, entries, discoveredFolders, false);
  saveLocalFolderMeta(summary);
  return { entries, summary };
}

export function toDriveCompatibleEntries(entries: LocalDiskFileEntry[]): {
  driveFiles: DriveFileInfo[];
  fileById: Map<string, File>;
} {
  const fileById = new Map<string, File>();
  const driveFiles: DriveFileInfo[] = entries.map((entry) => {
    fileById.set(entry.id, entry.file);
    return {
      id: entry.id,
      name: entry.name,
      mimeType: entry.mimeType,
      size: String(entry.size),
      createdTime: entry.modifiedTime,
      modifiedTime: entry.modifiedTime,
      subfolderName: entry.subfolderName,
      folderPath: entry.folderPath,
      isInStudyFolder: true,
      isInActiveFolder: true,
    };
  });
  return { driveFiles, fileById };
}

function isLikelyStudyDatabaseJson(obj: unknown): obj is Record<string, any> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const rec = obj as Record<string, any>;
  if (rec.data && typeof rec.data === 'object' && !Array.isArray(rec.data)) {
    return isLikelyStudyDatabaseJson(rec.data);
  }
  const knownKeys = [
    'questions',
    'completedSimulations',
    'submittedSimulations',
    'laws',
    'schedule',
    'contests',
    'annotations',
    'caseLaw',
    'pdfFolders',
    'summaryFolders',
    'proofFiles',
    'fixedSubjects',
    'completedGoals',
    'incompleteGoals',
  ];
  return knownKeys.some((k) => k in rec);
}

export async function extractLatestBackupFromLocalFiles(
  entries: LocalDiskFileEntry[],
): Promise<{
  basePayload: any | null;
  baseFile: LocalDiskFileEntry | null;
  baseTimestampMs: number;
  incrementalDeltas: IncrementalBackupEnvelope[];
  allBackupEntries: LocalDiskFileEntry[];
}> {
  const jsonEntries = entries.filter(
    (e) => e.name.toLowerCase().endsWith('.json') || e.mimeType === 'application/json',
  );
  if (!jsonEntries.length) {
    return {
      basePayload: null,
      baseFile: null,
      baseTimestampMs: 0,
      incrementalDeltas: [],
      allBackupEntries: [],
    };
  }

  const fullSnapshots: Array<{
    entry: LocalDiskFileEntry;
    payload: any;
    timestampMs: number;
    isCanonicalSync: boolean;
  }> = [];

  const incrementals: Array<{
    entry: LocalDiskFileEntry;
    envelope: IncrementalBackupEnvelope;
    timestampMs: number;
  }> = [];

  const validBackupEntries: LocalDiskFileEntry[] = [];

  for (const entry of jsonEntries) {
    try {
      const rawText = await entry.file.text();
      if (!rawText.trim()) continue;
      const parsed = JSON.parse(rawText);
      if (isIncrementalBackupPayload(parsed)) {
        const ts =
          Date.parse(parsed.updatedAt || '') ||
          entry.lastModified ||
          0;
        incrementals.push({
          entry,
          envelope: parsed,
          timestampMs: ts,
        });
        validBackupEntries.push(entry);
      } else if (isLikelyStudyDatabaseJson(parsed)) {
        const ts =
          Date.parse(parsed.updatedAt || parsed.exportedAt || parsed?.data?.updatedAt || '') ||
          entry.lastModified ||
          0;
        const lowerEntryName = entry.name.toLowerCase();
        const isCanonicalSync =
          lowerEntryName === CLOUD_SYNC_FILENAME.toLowerCase() ||
          lowerEntryName === 'central estudos sync latest.json';
        fullSnapshots.push({
          entry,
          payload: parsed,
          timestampMs: ts,
          isCanonicalSync,
        });
        validBackupEntries.push(entry);
      }
    } catch {
      // Ignore unrelated or malformed JSON files
    }
  }

  // Sort full snapshots newest first (preferring newest timestamp, breaking ties by canonical sync file)
  fullSnapshots.sort((a, b) => {
    if (Math.abs(b.timestampMs - a.timestampMs) > 1000) {
      return b.timestampMs - a.timestampMs;
    }
    if (a.isCanonicalSync !== b.isCanonicalSync) {
      return a.isCanonicalSync ? -1 : 1;
    }
    return b.timestampMs - a.timestampMs;
  });

  const bestBase = fullSnapshots[0] || null;
  const baseTimestampMs = bestBase ? bestBase.timestampMs : 0;

  // Sort incrementals oldest-to-newest and keep those newer than base snapshot
  incrementals.sort((a, b) => a.timestampMs - b.timestampMs);
  const applicableIncrementals = bestBase
    ? incrementals.filter((inc) => inc.timestampMs > baseTimestampMs + 500).map((inc) => inc.envelope)
    : incrementals.map((inc) => inc.envelope);

  return {
    basePayload: bestBase ? bestBase.payload : null,
    baseFile: bestBase ? bestBase.entry : null,
    baseTimestampMs,
    incrementalDeltas: applicableIncrementals,
    allBackupEntries: validBackupEntries,
  };
}

function sanitizeLocalPathSegment(raw: string, fallback = 'Geral'): string {
  const cleaned = visibleName(raw || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '');
  return cleaned || fallback;
}

function sanitizeLocalFilename(raw: string, fallback = 'arquivo.dat'): string {
  const cleaned = (raw || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '');
  return cleaned || fallback;
}

export async function ensureLocalStudySubfolders(
  rootHandle: FileSystemDirectoryHandle,
): Promise<void> {
  for (const folderName of CANONICAL_LOCAL_SUBFOLDERS) {
    try {
      await rootHandle.getDirectoryHandle(folderName, { create: true });
    } catch {
      // Ignore if read-only
    }
  }
}

export async function getOrCreateNestedLocalDirectory(
  rootHandle: FileSystemDirectoryHandle,
  subfolder?: string | string[],
): Promise<FileSystemDirectoryHandle> {
  if (!subfolder) return rootHandle;
  const segments = (Array.isArray(subfolder) ? subfolder : [subfolder])
    .map((s) => sanitizeLocalPathSegment(s, ''))
    .filter(Boolean);
  let current = rootHandle;
  for (const seg of segments) {
    current = await current.getDirectoryHandle(seg, { create: true });
  }
  return current;
}

export async function writeFileToLocalDirectory(
  rootHandle: FileSystemDirectoryHandle,
  subfolder: string | string[] | undefined,
  filename: string,
  content: Blob | string,
): Promise<boolean> {
  try {
    const dir = await getOrCreateNestedLocalDirectory(rootHandle, subfolder);
    const safeFilename = sanitizeLocalFilename(filename, 'arquivo.dat');
    const fileHandle = await dir.getFileHandle(safeFilename, { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (err) {
    console.warn(`[Pasta Local] Não foi possível gravar "${filename}":`, err);
    return false;
  }
}

export async function deleteFileFromLocalDirectory(
  rootHandle: FileSystemDirectoryHandle,
  subfolder: string | string[] | undefined,
  filename: string,
): Promise<boolean> {
  try {
    const segments = subfolder
      ? (Array.isArray(subfolder) ? subfolder : [subfolder])
          .map((s) => sanitizeLocalPathSegment(s, ''))
          .filter(Boolean)
      : [];
    let current = rootHandle;
    for (const seg of segments) {
      current = await current.getDirectoryHandle(seg, { create: false });
    }
    const candidates = Array.from(
      new Set([
        sanitizeLocalFilename(filename, ''),
        sanitizeLocalPathSegment(filename, ''),
      ].filter(Boolean)),
    );
    let removedAny = false;
    for (const candidate of candidates) {
      try {
        await current.removeEntry(candidate);
        removedAny = true;
      } catch {
        // Ignore missing candidate
      }
    }
    return removedAny;
  } catch {
    return false;
  }
}

export async function deleteDirectoryFromLocalDirectory(
  rootHandle: FileSystemDirectoryHandle,
  subfolderPath: string[],
): Promise<boolean> {
  if (!subfolderPath.length) return false;
  try {
    const segments = subfolderPath
      .map((s) => sanitizeLocalPathSegment(s, ''))
      .filter(Boolean);
    if (!segments.length) return false;
    let parent = rootHandle;
    for (let i = 0; i < segments.length - 1; i++) {
      parent = await parent.getDirectoryHandle(segments[i], { create: false });
    }
    await parent.removeEntry(segments[segments.length - 1], { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export async function saveLocalFolderSyncSnapshot(
  rootHandle: FileSystemDirectoryHandle,
  payload: unknown,
): Promise<boolean> {
  const json = JSON.stringify(payload, null, 2);
  return writeFileToLocalDirectory(rootHandle, 'Backups', CLOUD_SYNC_FILENAME, json);
}

export async function saveLocalFolderBackupFile(
  rootHandle: FileSystemDirectoryHandle,
  payload: unknown,
  customFilename?: string,
): Promise<string | null> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const isInc = isIncrementalBackupPayload(payload);
  const filename =
    customFilename ||
    (isInc
      ? `backup_incremental_central_estudos_${stamp}.json`
      : `backup_central_estudos_${stamp}.json`);
  const json = JSON.stringify(payload, null, 2);
  const ok = await writeFileToLocalDirectory(rootHandle, 'Backups', filename, json);
  return ok ? filename : null;
}

export interface LocalBackupFileInfo {
  id: string;
  name: string;
  subfolder?: string;
  size: number;
  modifiedMs: number;
  modifiedTime: string;
  isCanonicalSync: boolean;
  isIncremental: boolean;
}

export async function listLocalFolderBackups(
  rootHandle: FileSystemDirectoryHandle,
): Promise<LocalBackupFileInfo[]> {
  const results: LocalBackupFileInfo[] = [];

  const readJsonFilesFromDir = async (
    dirHandle: FileSystemDirectoryHandle,
    subfolderName?: string,
  ) => {
    const anyDir = dirHandle as any;
    if (typeof anyDir.values !== 'function' && typeof anyDir.entries !== 'function') return;
    const iterator =
      typeof anyDir.values === 'function' ? anyDir.values() : anyDir.entries();

    for await (const rawEntry of iterator) {
      const entry: FileSystemHandle = Array.isArray(rawEntry) ? rawEntry[1] : rawEntry;
      if (!entry || entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.json')) continue;
      try {
        const file = await (entry as FileSystemFileHandle).getFile();
        const lower = file.name.toLowerCase();
        const isCanonicalSync =
          lower === CLOUD_SYNC_FILENAME.toLowerCase() ||
          lower === 'central estudos sync latest.json';
        const isIncremental =
          lower.startsWith('backup_incremental_central_estudos') ||
          lower.startsWith('backup incremental central estudos');
        const modifiedMs = file.lastModified || Date.now();
        results.push({
          id: subfolderName ? `${subfolderName}/${file.name}` : file.name,
          name: file.name,
          subfolder: subfolderName,
          size: file.size,
          modifiedMs,
          modifiedTime: new Date(modifiedMs).toISOString(),
          isCanonicalSync,
          isIncremental,
        });
      } catch {
        // ignore unreadable entry
      }
    }
  };

  try {
    const backupsDir = await rootHandle.getDirectoryHandle('Backups', { create: false });
    await readJsonFilesFromDir(backupsDir, 'Backups');
  } catch {
    // Backups folder does not exist yet
  }

  // Also include study backup JSONs at root if the user placed them there manually
  try {
    await readJsonFilesFromDir(rootHandle, undefined);
  } catch {
    // ignore
  }

  // Deduplicate keeping canonical sync at top, then newest first
  const dedup = new Map<string, LocalBackupFileInfo>();
  for (const item of results) {
    if (!dedup.has(item.id)) dedup.set(item.id, item);
  }
  return Array.from(dedup.values()).sort((a, b) => {
    if (a.isCanonicalSync !== b.isCanonicalSync) return a.isCanonicalSync ? -1 : 1;
    return b.modifiedMs - a.modifiedMs;
  });
}

export async function readLocalBackupFile(
  rootHandle: FileSystemDirectoryHandle,
  filename: string,
  subfolder?: string,
): Promise<any> {
  const dir = subfolder
    ? await rootHandle.getDirectoryHandle(subfolder, { create: false })
    : rootHandle;
  const fileHandle = await dir.getFileHandle(filename, { create: false });
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text);
}

export async function deleteLocalBackupFile(
  rootHandle: FileSystemDirectoryHandle,
  filename: string,
  subfolder?: string,
): Promise<boolean> {
  return deleteFileFromLocalDirectory(rootHandle, subfolder, filename);
}

