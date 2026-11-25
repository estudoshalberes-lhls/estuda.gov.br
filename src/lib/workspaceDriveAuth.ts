import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User as FirebaseUser,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const WORKSPACE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
] as const;

export const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
export const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
export const GOOGLE_SLIDE_MIME = 'application/vnd.google-apps.presentation';
export const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';
export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface WorkspaceAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface WorkspaceDriveItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  parents?: string[];
  starred?: boolean;
  trashed?: boolean;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  owners?: Array<{ displayName?: string; emailAddress?: string }>;
}

export interface WorkspaceAuthSnapshot {
  user: WorkspaceAuthUser | null;
  hasToken: boolean;
  ready: boolean;
}

export type DriveSpecialView = 'my-drive' | 'recent' | 'starred' | 'shared' | 'trash';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
WORKSPACE_DRIVE_SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({ prompt: 'select_account' });

// Strictly in-memory OAuth access token cache (never written to localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let currentAuthUser: WorkspaceAuthUser | null = null;
let isSigningIn = false;
let authReady = false;

type AuthListener = (snapshot: WorkspaceAuthSnapshot) => void;
const authListeners = new Set<AuthListener>();

function toWorkspaceUser(user: FirebaseUser | null): WorkspaceAuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

function notifyAuthListeners(): void {
  const snapshot: WorkspaceAuthSnapshot = {
    user: currentAuthUser,
    hasToken: Boolean(cachedAccessToken),
    ready: authReady,
  };
  authListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // ignore subscriber errors
    }
  });
}

let initializedListener = false;
function ensureAuthListener(): void {
  if (initializedListener) return;
  initializedListener = true;
  onAuthStateChanged(auth, (fbUser) => {
    authReady = true;
    if (fbUser) {
      currentAuthUser = toWorkspaceUser(fbUser);
      if (!cachedAccessToken && !isSigningIn) {
        cachedAccessToken = null;
      }
    } else {
      currentAuthUser = null;
      cachedAccessToken = null;
    }
    notifyAuthListeners();
  });
}

export function getWorkspaceAuthSnapshot(): WorkspaceAuthSnapshot {
  ensureAuthListener();
  return {
    user: currentAuthUser,
    hasToken: Boolean(cachedAccessToken),
    ready: authReady,
  };
}

export function subscribeWorkspaceAuth(listener: AuthListener): () => void {
  ensureAuthListener();
  authListeners.add(listener);
  listener(getWorkspaceAuthSnapshot());
  return () => {
    authListeners.delete(listener);
  };
}

export async function signInWorkspaceGoogle(): Promise<{
  user: WorkspaceAuthUser;
  accessToken: string;
}> {
  ensureAuthListener();
  isSigningIn = true;
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'Não foi possível obter a autorização do Google Drive. Tente entrar novamente.',
      );
    }
    cachedAccessToken = credential.accessToken;
    currentAuthUser = toWorkspaceUser(result.user);
    authReady = true;
    notifyAuthListeners();
    return {
      user: currentAuthUser!,
      accessToken: cachedAccessToken,
    };
  } finally {
    isSigningIn = false;
  }
}

export async function signOutWorkspaceGoogle(): Promise<void> {
  ensureAuthListener();
  await auth.signOut();
  cachedAccessToken = null;
  currentAuthUser = null;
  notifyAuthListeners();
}

export function getWorkspaceAccessToken(): string | null {
  return cachedAccessToken;
}

export function clearWorkspaceAccessToken(): void {
  cachedAccessToken = null;
  notifyAuthListeners();
}

async function requireAccessToken(): Promise<string> {
  if (!cachedAccessToken) {
    throw new Error('AUTH_REQUIRED');
  }
  return cachedAccessToken;
}

async function driveFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await requireAccessToken();
  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    clearWorkspaceAccessToken();
    throw new Error('AUTH_EXPIRED');
  }
  if (!res.ok) {
    let message = `Erro do Google Drive (${res.status})`;
    try {
      const payload = await res.json();
      if (payload?.error?.message) {
        message = payload.error.message;
      }
    } catch {
      // ignore non-json error body
    }
    throw new Error(message);
  }
  return res;
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const DEFAULT_DRIVE_FIELDS =
  'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,parents,starred,trashed,webViewLink,iconLink,thumbnailLink,owners(displayName,emailAddress))';

export async function listDriveDirectory(options: {
  view: DriveSpecialView;
  folderId?: string;
  searchQuery?: string;
  mimeFilter?: 'all' | 'folders' | 'pdf' | 'docs' | 'images';
  sortBy?: 'modified' | 'name' | 'size';
  pageToken?: string;
  pageSize?: number;
}): Promise<{ files: WorkspaceDriveItem[]; nextPageToken?: string }> {
  const clauses: string[] = [];
  const qText = (options.searchQuery || '').trim();

  if (options.view === 'trash') {
    clauses.push('trashed = true');
  } else {
    clauses.push('trashed = false');
    if (qText) {
      clauses.push(`name contains '${escapeDriveQueryValue(qText)}'`);
    } else if (options.view === 'my-drive') {
      const parentId = options.folderId || 'root';
      clauses.push(`'${escapeDriveQueryValue(parentId)}' in parents`);
    } else if (options.view === 'starred') {
      clauses.push('starred = true');
    } else if (options.view === 'shared') {
      clauses.push('sharedWithMe = true');
    } else if (options.view === 'recent') {
      clauses.push(`mimeType != '${GOOGLE_FOLDER_MIME}'`);
    }
  }

  if (options.mimeFilter === 'folders') {
    clauses.push(`mimeType = '${GOOGLE_FOLDER_MIME}'`);
  } else if (options.mimeFilter === 'pdf') {
    clauses.push(`mimeType = 'application/pdf'`);
  } else if (options.mimeFilter === 'docs') {
    clauses.push(
      `(mimeType = '${GOOGLE_DOC_MIME}' or mimeType = '${DOCX_MIME}' or mimeType = '${GOOGLE_SHEET_MIME}' or mimeType = '${GOOGLE_SLIDE_MIME}')`,
    );
  } else if (options.mimeFilter === 'images') {
    clauses.push(`mimeType contains 'image/'`);
  }

  let orderBy = 'folder,modifiedTime desc';
  if (options.sortBy === 'name') {
    orderBy = 'folder,name_natural';
  } else if (options.sortBy === 'size') {
    orderBy = 'folder,quotaBytesUsed desc';
  } else if (options.view === 'recent') {
    orderBy = 'viewedByMeTime desc,modifiedTime desc';
  }

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    fields: DEFAULT_DRIVE_FIELDS,
    pageSize: String(options.pageSize || 80),
    orderBy,
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  if (options.pageToken) {
    params.set('pageToken', options.pageToken);
  }

  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
  );
  const data = (await res.json()) as {
    files?: WorkspaceDriveItem[];
    nextPageToken?: string;
  };
  return {
    files: data.files || [],
    nextPageToken: data.nextPageToken,
  };
}

export async function listRecentGoogleDocs(limit = 25): Promise<WorkspaceDriveItem[]> {
  const params = new URLSearchParams({
    q: `mimeType = '${GOOGLE_DOC_MIME}' and trashed = false`,
    fields: DEFAULT_DRIVE_FIELDS,
    pageSize: String(limit),
    orderBy: 'modifiedTime desc',
  });
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
  );
  const data = (await res.json()) as { files?: WorkspaceDriveItem[] };
  return data.files || [];
}

export async function getDriveItemMeta(fileId: string): Promise<WorkspaceDriveItem> {
  const params = new URLSearchParams({
    fields:
      'id,name,mimeType,size,modifiedTime,createdTime,parents,starred,trashed,webViewLink,iconLink,owners(displayName,emailAddress)',
    supportsAllDrives: 'true',
  });
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`,
  );
  return (await res.json()) as WorkspaceDriveItem;
}

export async function createDriveFolder(
  name: string,
  parentId = 'root',
): Promise<WorkspaceDriveItem> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Informe um nome para a pasta.');
  const res = await driveFetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,modifiedTime,parents,webViewLink',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cleanName,
        mimeType: GOOGLE_FOLDER_MIME,
        parents: [parentId || 'root'],
      }),
    },
  );
  return (await res.json()) as WorkspaceDriveItem;
}

async function findOrCreateSubfolder(
  name: string,
  parentId = 'root',
): Promise<WorkspaceDriveItem> {
  const cleanName = name.trim();
  const q = `mimeType = '${GOOGLE_FOLDER_MIME}' and name = '${escapeDriveQueryValue(cleanName)}' and '${escapeDriveQueryValue(parentId)}' in parents and trashed = false`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType,parents,webViewLink)',
    pageSize: '1',
  });
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
  );
  const data = (await res.json()) as { files?: WorkspaceDriveItem[] };
  if (data.files && data.files.length > 0) {
    return data.files[0];
  }
  return createDriveFolder(cleanName, parentId);
}

export async function ensureSummaryDocsFolder(subjectName?: string): Promise<string> {
  const rootFolder = await findOrCreateSubfolder('Central de Estudos - Resumos', 'root');
  if (subjectName && subjectName.trim()) {
    const sub = await findOrCreateSubfolder(subjectName.trim(), rootFolder.id);
    return sub.id;
  }
  return rootFolder.id;
}

export async function createGoogleDocInDrive(options: {
  title: string;
  parentId?: string;
  initialHtml?: string;
}): Promise<WorkspaceDriveItem> {
  const cleanTitle = options.title.trim() || 'Resumo sem título';
  const parentId = options.parentId || 'root';
  const htmlBody = (options.initialHtml || '').trim();

  if (htmlBody) {
    const boundary = `ce_gdoc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const metadata = {
      name: cleanTitle,
      mimeType: GOOGLE_DOC_MIME,
      parents: [parentId],
    };
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>${htmlBody}</body></html>`;
    const multipartBody = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      fullHtml,
      `--${boundary}--`,
    ].join('\r\n');

    const res = await driveFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,parents,webViewLink',
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      },
    );
    return (await res.json()) as WorkspaceDriveItem;
  }

  const res = await driveFetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,modifiedTime,parents,webViewLink',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cleanTitle,
        mimeType: GOOGLE_DOC_MIME,
        parents: [parentId],
      }),
    },
  );
  return (await res.json()) as WorkspaceDriveItem;
}

export async function uploadFileToWorkspaceDrive(
  file: File,
  parentId = 'root',
): Promise<WorkspaceDriveItem> {
  const metadata = {
    name: file.name,
    parents: [parentId || 'root'],
  };
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
  );
  form.append('file', file);

  const res = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,parents,webViewLink',
    {
      method: 'POST',
      body: form,
    },
  );
  return (await res.json()) as WorkspaceDriveItem;
}

export async function renameDriveItem(
  fileId: string,
  newName: string,
): Promise<WorkspaceDriveItem> {
  const cleanName = newName.trim();
  if (!cleanName) throw new Error('Informe o novo nome.');
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,parents,webViewLink&supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName }),
    },
  );
  return (await res.json()) as WorkspaceDriveItem;
}

export async function moveDriveItem(
  fileId: string,
  targetFolderId: string,
  currentParents?: string[],
): Promise<WorkspaceDriveItem> {
  const params = new URLSearchParams({
    addParents: targetFolderId,
    fields: 'id,name,mimeType,modifiedTime,parents,webViewLink',
    supportsAllDrives: 'true',
  });
  if (currentParents && currentParents.length > 0) {
    params.set('removeParents', currentParents.join(','));
  }
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
  return (await res.json()) as WorkspaceDriveItem;
}

export async function toggleDriveStarred(
  fileId: string,
  starred: boolean,
): Promise<WorkspaceDriveItem> {
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,starred&supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred }),
    },
  );
  return (await res.json()) as WorkspaceDriveItem;
}

export async function trashDriveItem(fileId: string): Promise<void> {
  await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    },
  );
}

export async function restoreDriveItem(fileId: string): Promise<void> {
  await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: false }),
    },
  );
}

export async function deleteDriveItemPermanently(fileId: string): Promise<void> {
  await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    {
      method: 'DELETE',
    },
  );
}

export async function downloadWorkspaceDriveBlob(
  fileId: string,
  mimeType: string,
): Promise<{ blob: Blob; suggestedExtension?: string }> {
  if (mimeType === GOOGLE_DOC_MIME) {
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(DOCX_MIME)}`,
    );
    return { blob: await res.blob(), suggestedExtension: '.docx' };
  }
  if (mimeType === GOOGLE_SHEET_MIME) {
    const xlsxMime =
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(xlsxMime)}`,
    );
    return { blob: await res.blob(), suggestedExtension: '.xlsx' };
  }
  if (mimeType === GOOGLE_SLIDE_MIME) {
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`,
    );
    return { blob: await res.blob(), suggestedExtension: '.pdf' };
  }
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
  );
  return { blob: await res.blob() };
}

export async function exportGoogleDocHtml(fileId: string): Promise<string> {
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent('text/html')}`,
  );
  const rawHtml = await res.text();
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    return doc.body?.innerHTML || rawHtml;
  } catch {
    return rawHtml;
  }
}

export interface GoogleDocStructuredSnapshot {
  documentId: string;
  title: string;
  revisionId?: string;
  plainText: string;
}

/**
 * Reads a Google Doc directly via Google Docs API v1 (docs.googleapis.com/v1/documents).
 */
export async function getGoogleDocDocument(
  documentId: string,
): Promise<GoogleDocStructuredSnapshot> {
  const res = await driveFetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
  );
  const data = (await res.json()) as {
    documentId?: string;
    title?: string;
    revisionId?: string;
    body?: {
      content?: Array<{
        paragraph?: {
          elements?: Array<{ textRun?: { content?: string } }>;
        };
      }>;
    };
  };

  const chunks: string[] = [];
  for (const el of data.body?.content || []) {
    for (const part of el.paragraph?.elements || []) {
      if (part.textRun?.content) {
        chunks.push(part.textRun.content);
      }
    }
  }

  return {
    documentId: data.documentId || documentId,
    title: data.title || 'Documento sem título',
    revisionId: data.revisionId,
    plainText: chunks.join('').trim(),
  };
}

/**
 * Appends text to the end of a Google Doc via Google Docs API v1 batchUpdate.
 */
export async function appendTextToGoogleDoc(
  documentId: string,
  textToAppend: string,
): Promise<void> {
  const clean = textToAppend.trim();
  if (!clean) return;
  await driveFetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              endOfSegmentLocation: {},
              text: `\n${clean}\n`,
            },
          },
        ],
      }),
    },
  );
}

export async function listDriveSubfolders(
  parentId = 'root',
): Promise<WorkspaceDriveItem[]> {
  const params = new URLSearchParams({
    q: `mimeType = '${GOOGLE_FOLDER_MIME}' and '${escapeDriveQueryValue(parentId)}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,parents)',
    orderBy: 'name_natural',
    pageSize: '100',
  });
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
  );
  const data = (await res.json()) as { files?: WorkspaceDriveItem[] };
  return data.files || [];
}

export function getEmbeddedGoogleUrl(
  fileId: string,
  mimeType: string,
  compactToolbar = false,
): string {
  const encodedId = encodeURIComponent(fileId);
  if (mimeType === GOOGLE_DOC_MIME) {
    return compactToolbar
      ? `https://docs.google.com/document/d/${encodedId}/edit?rm=minimal`
      : `https://docs.google.com/document/d/${encodedId}/edit`;
  }
  if (mimeType === GOOGLE_SHEET_MIME) {
    return compactToolbar
      ? `https://docs.google.com/spreadsheets/d/${encodedId}/edit?rm=minimal`
      : `https://docs.google.com/spreadsheets/d/${encodedId}/edit`;
  }
  if (mimeType === GOOGLE_SLIDE_MIME) {
    return compactToolbar
      ? `https://docs.google.com/presentation/d/${encodedId}/edit?rm=minimal`
      : `https://docs.google.com/presentation/d/${encodedId}/edit`;
  }
  return `https://drive.google.com/file/d/${encodedId}/preview`;
}

export function getExternalGoogleUrl(
  fileId: string,
  mimeType: string,
  webViewLink?: string,
): string {
  if (webViewLink) return webViewLink;
  const encodedId = encodeURIComponent(fileId);
  if (mimeType === GOOGLE_DOC_MIME) {
    return `https://docs.google.com/document/d/${encodedId}/edit`;
  }
  if (mimeType === GOOGLE_SHEET_MIME) {
    return `https://docs.google.com/spreadsheets/d/${encodedId}/edit`;
  }
  if (mimeType === GOOGLE_SLIDE_MIME) {
    return `https://docs.google.com/presentation/d/${encodedId}/edit`;
  }
  return `https://drive.google.com/file/d/${encodedId}/view`;
}
