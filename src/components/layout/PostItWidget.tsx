import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Cloud,
  CloudOff,
  Maximize2,
  Minimize2,
  RefreshCw,
  Save,
  StickyNote,
  X,
} from 'lucide-react';
import { useStudy, getUserScopeKey } from '../../context/StudyContext';
import { getFileBlob, saveFileBlob } from '../../lib/fileStorage';
import {
  POST_IT_FILENAME,
  getAccessToken,
  readPostItFileFromDrive,
  savePostItFileToDrive,
} from '../../lib/googleDrive';

interface PostItLocalState {
  content: string;
  updatedAtMs: number;
  dirty: boolean;
  driveFileId: string | null;
  lastDriveModifiedTime: string | null;
  lastSyncedContent: string;
}

const POST_IT_STORAGE_PREFIX = 'central_estudos_postit_v1_';
const POST_IT_FALLBACK_KEY = 'central_estudos_postit_v1_global';
const POST_IT_BLOB_KEY = 'postit_txt_standalone_v1';

function getPostItStorageKey(scope: string): string {
  return `${POST_IT_STORAGE_PREFIX}${scope || 'offline_guest'}`;
}

function readLocalPostItState(scope: string): PostItLocalState {
  const empty: PostItLocalState = {
    content: '',
    updatedAtMs: 0,
    dirty: false,
    driveFileId: null,
    lastDriveModifiedTime: null,
    lastSyncedContent: '',
  };
  if (typeof window === 'undefined' || !window.localStorage) return empty;
  const keysToTry = [getPostItStorageKey(scope), POST_IT_FALLBACK_KEY];
  for (const key of keysToTry) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<PostItLocalState>;
      if (typeof parsed.content === 'string') {
        return {
          content: parsed.content,
          updatedAtMs: typeof parsed.updatedAtMs === 'number' ? parsed.updatedAtMs : 0,
          dirty: Boolean(parsed.dirty),
          driveFileId: typeof parsed.driveFileId === 'string' ? parsed.driveFileId : null,
          lastDriveModifiedTime:
            typeof parsed.lastDriveModifiedTime === 'string' ? parsed.lastDriveModifiedTime : null,
          lastSyncedContent:
            typeof parsed.lastSyncedContent === 'string' ? parsed.lastSyncedContent : '',
        };
      }
    } catch {
      // ignore corrupted entry and try next
    }
  }
  return empty;
}

function writeLocalPostItState(scope: string, state: PostItLocalState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const serialized = JSON.stringify(state);
  try {
    window.localStorage.setItem(getPostItStorageKey(scope), serialized);
  } catch {
    // ignore quota error
  }
  try {
    window.localStorage.setItem(POST_IT_FALLBACK_KEY, serialized);
  } catch {
    // ignore quota error
  }
}

function formatShortTime(ms: number): string {
  if (!ms) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return '';
  }
}

export const PostItWidget: React.FC = () => {
  const { googleUser, driveConnected, driveTokenReady, connectGoogleDrive, toast } = useStudy();
  const scope = getUserScopeKey(googleUser);

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localState, setLocalState] = useState<PostItLocalState>(() => readLocalPostItState(scope));
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [conflictRemote, setConflictRemote] = useState<{
    content: string;
    fileId: string;
    modifiedTime: string | null;
  } | null>(null);
  const [confirmClearDrive, setConfirmClearDrive] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stateRef = useRef<PostItLocalState>(localState);
  stateRef.current = localState;
  const scopeRef = useRef<string>(scope);
  scopeRef.current = scope;
  const saveTimerRef = useRef<number | null>(null);
  const inFlightSaveRef = useRef<boolean>(false);
  const syncedOnMountScopeRef = useRef<string | null>(null);

  // Hydrate from localStorage + IndexedDB whenever user scope changes
  useEffect(() => {
    const lsState = readLocalPostItState(scope);
    stateRef.current = lsState;
    setLocalState(lsState);
    setConflictRemote(null);
    setConfirmClearDrive(false);

    let cancelled = false;
    void (async () => {
      try {
        const blob = await getFileBlob(POST_IT_BLOB_KEY, scope);
        if (!blob || cancelled) return;
        const idbText = await blob.text();
        if (cancelled) return;
        if (idbText && !stateRef.current.content && !stateRef.current.dirty) {
          const recovered: PostItLocalState = {
            ...stateRef.current,
            content: idbText,
            updatedAtMs: Date.now(),
          };
          stateRef.current = recovered;
          writeLocalPostItState(scope, recovered);
          setLocalState(recovered);
        }
      } catch {
        // ignore IDB read errors
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scope]);

  const persistToBrowser = useCallback((next: PostItLocalState, targetScope: string) => {
    stateRef.current = next;
    writeLocalPostItState(targetScope, next);
    setLocalState(next);
    try {
      const blob = new Blob([next.content], { type: 'text/plain;charset=utf-8' });
      void saveFileBlob(POST_IT_BLOB_KEY, blob, targetScope);
    } catch {
      // ignore IDB write errors
    }
  }, []);

  const pushToDrive = useCallback(
    async (options?: { manual?: boolean; allowEmptyOverwrite?: boolean }): Promise<boolean> => {
      if (inFlightSaveRef.current) return false;
      const curScope = scopeRef.current;
      const cur = stateRef.current;

      // Guard against accidental wipe of a non-empty Post-it.txt on Drive
      if (
        !options?.allowEmptyOverwrite &&
        cur.content.trim() === '' &&
        cur.lastSyncedContent.trim() !== ''
      ) {
        setConfirmClearDrive(true);
        return false;
      }

      if (!driveConnected || !driveTokenReady) {
        if (options?.manual) {
          toast('Anotações salvas no navegador. Conecte o Google Drive para gravar em Post-it.txt.', true);
        }
        return false;
      }

      const token = await getAccessToken();
      if (!token) {
        if (options?.manual) {
          toast('Sessão do Google Drive expirada. Reconecte para salvar em Post-it.txt.', true);
        }
        return false;
      }

      inFlightSaveRef.current = true;
      setSyncStatus('saving');
      setSyncMessage('Salvando em Post-it.txt…');
      setConfirmClearDrive(false);

      const contentBeingSaved = cur.content;
      try {
        const savedFile = await savePostItFileToDrive(contentBeingSaved, token, cur.driveFileId);
        const nowMs = Date.now();
        const editedWhileSaving = stateRef.current.content !== contentBeingSaved;
        const updated: PostItLocalState = {
          ...stateRef.current,
          dirty: editedWhileSaving,
          driveFileId: savedFile.id,
          lastDriveModifiedTime: savedFile.modifiedTime || new Date(nowMs).toISOString(),
          lastSyncedContent: contentBeingSaved,
        };
        persistToBrowser(updated, curScope);
        setConflictRemote(null);
        setSyncStatus('saved');
        setSyncMessage(`Salvo em ${POST_IT_FILENAME} · ${formatShortTime(nowMs)}`);

        if (options?.manual) {
          toast('Post-it salvo diretamente em Post-it.txt no Google Drive!');
        }

        if (editedWhileSaving) {
          if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = null;
            void pushToDrive();
          }, 900);
        }
        return true;
      } catch (err: any) {
        const msg = err?.message || 'Erro ao salvar Post-it.txt no Drive';
        setSyncStatus('error');
        setSyncMessage(msg);
        if (options?.manual) {
          toast(`Salvo localmente; falha ao atualizar Post-it.txt no Drive: ${msg}`, true);
        }
        return false;
      } finally {
        inFlightSaveRef.current = false;
      }
    },
    [driveConnected, driveTokenReady, persistToBrowser, toast],
  );

  const pullFromDrive = useCallback(
    async (options?: { manual?: boolean; forceReplace?: boolean }): Promise<void> => {
      if (!driveConnected || !driveTokenReady) return;
      const token = await getAccessToken();
      if (!token) return;

      const curScope = scopeRef.current;
      setSyncStatus('loading');
      setSyncMessage('Verificando Post-it.txt no Drive…');

      try {
        const remote = await readPostItFileFromDrive(token, stateRef.current.driveFileId);
        const cur = stateRef.current;

        if (!remote) {
          // File doesn't exist yet on Drive: create Post-it.txt directly in the user's selected folder
          setSyncStatus('idle');
          await pushToDrive({ manual: options?.manual, allowEmptyOverwrite: true });
          return;
        }

        const remoteContent = remote.content ?? '';
        const remoteModTime = remote.file.modifiedTime || null;

        if (remoteContent === cur.content) {
          const synced: PostItLocalState = {
            ...cur,
            dirty: false,
            driveFileId: remote.file.id,
            lastDriveModifiedTime: remoteModTime,
            lastSyncedContent: remoteContent,
          };
          persistToBrowser(synced, curScope);
          setConflictRemote(null);
          setSyncStatus('saved');
          setSyncMessage(
            `Sincronizado com ${POST_IT_FILENAME}${remoteModTime ? ` · ${formatShortTime(Date.parse(remoteModTime) || Date.now())}` : ''}`,
          );
          if (options?.manual) toast('Post-it.txt já está atualizado.');
          return;
        }

        const canSafelyAdoptRemote =
          options?.forceReplace ||
          (!cur.dirty && (cur.content === '' || cur.content === cur.lastSyncedContent)) ||
          (!cur.dirty &&
            remoteModTime !== null &&
            (Date.parse(remoteModTime) || 0) >= cur.updatedAtMs);

        if (canSafelyAdoptRemote) {
          const adopted: PostItLocalState = {
            content: remoteContent,
            updatedAtMs: Date.parse(remoteModTime || '') || Date.now(),
            dirty: false,
            driveFileId: remote.file.id,
            lastDriveModifiedTime: remoteModTime,
            lastSyncedContent: remoteContent,
          };
          persistToBrowser(adopted, curScope);
          setConflictRemote(null);
          setSyncStatus('saved');
          setSyncMessage(`Carregado de ${POST_IT_FILENAME}`);
          if (options?.manual) toast('Anotações carregadas de Post-it.txt no Google Drive.');
          return;
        }

        // Local has unsaved edits AND Drive has different content:
        // If Drive hasn't changed since our last sync, push local edits cleanly;
        // otherwise surface non-destructive conflict choices so nothing is ever overwritten!
        if (remoteContent === cur.lastSyncedContent || (!cur.lastSyncedContent && !remoteContent)) {
          const updatedMeta: PostItLocalState = {
            ...cur,
            driveFileId: remote.file.id,
            lastDriveModifiedTime: remoteModTime,
          };
          persistToBrowser(updatedMeta, curScope);
          await pushToDrive({ manual: options?.manual });
          return;
        }

        setConflictRemote({
          content: remoteContent,
          fileId: remote.file.id,
          modifiedTime: remoteModTime,
        });
        setSyncStatus('idle');
        setSyncMessage('Há uma versão diferente em Post-it.txt no Drive');
      } catch (err: any) {
        setSyncStatus('error');
        setSyncMessage(err?.message || 'Não foi possível ler Post-it.txt');
        if (options?.manual) {
          toast(`Erro ao ler Post-it.txt: ${err?.message || 'Falha'}`, true);
        }
      }
    },
    [driveConnected, driveTokenReady, persistToBrowser, pushToDrive, toast],
  );

  // Automatically sync with Post-it.txt on login / token readiness (and after reconnect)
  useEffect(() => {
    if (!driveConnected || !driveTokenReady) {
      syncedOnMountScopeRef.current = null;
      return;
    }
    if (syncedOnMountScopeRef.current === scope) return;
    syncedOnMountScopeRef.current = scope;
    void pullFromDrive({ manual: false });
  }, [driveConnected, driveTokenReady, scope, pullFromDrive]);

  // Flush pending Post-it save on tab hide / reload / unmount
  useEffect(() => {
    const flushNow = () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (stateRef.current.dirty) {
        writeLocalPostItState(scopeRef.current, stateRef.current);
        void pushToDrive({ manual: false });
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('beforeunload', flushNow);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', flushNow);
      window.removeEventListener('beforeunload', flushNow);
      document.removeEventListener('visibilitychange', handleVisibility);
      flushNow();
    };
  }, [pushToDrive]);

  // Close on outside click or Escape (flushing any pending write first)
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (stateRef.current.dirty) {
          if (saveTimerRef.current) {
            window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
          }
          void pushToDrive({ manual: false });
        }
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (stateRef.current.dirty) {
          if (saveTimerRef.current) {
            window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
          }
          void pushToDrive({ manual: false });
        }
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleOutside);
      window.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open, pushToDrive]);

  const handleToggleOpen = () => {
    setOpen((prev) => {
      const nextOpen = !prev;
      if (nextOpen) {
        window.setTimeout(() => textareaRef.current?.focus(), 40);
        if (driveConnected && driveTokenReady && !stateRef.current.dirty) {
          void pullFromDrive({ manual: false });
        }
      } else if (stateRef.current.dirty) {
        if (saveTimerRef.current) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        void pushToDrive({ manual: false });
      }
      return nextOpen;
    });
  };

  const handleTextChange = (nextText: string) => {
    setConfirmClearDrive(false);
    const nextState: PostItLocalState = {
      ...stateRef.current,
      content: nextText,
      updatedAtMs: Date.now(),
      dirty: true,
    };
    persistToBrowser(nextState, scopeRef.current);

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    if (driveConnected && driveTokenReady) {
      setSyncStatus('idle');
      setSyncMessage('Salvando em breve em Post-it.txt…');
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void pushToDrive({ manual: false });
      }, 1200);
    } else {
      setSyncMessage('Salvo no navegador (aguardando Drive)');
    }
  };

  const lineCount = localState.content ? localState.content.split('\n').length : 0;
  const charCount = localState.content.length;
  const hasNotes = localState.content.trim().length > 0;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={handleToggleOpen}
        aria-expanded={open}
        aria-label="Abrir Post-it de anotações permanentes"
        title={
          hasNotes
            ? `Post-it (${POST_IT_FILENAME}) — Clique para expandir e editar`
            : `Post-it (${POST_IT_FILENAME}) — Clique para fazer anotações permanentes`
        }
        className={`inline-flex items-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3 rounded-lg border text-[12px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          open
            ? 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-300'
            : hasNotes
              ? 'border-amber-500/50 bg-amber-500/10 text-[var(--text)] hover:border-amber-500'
              : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--text)] hover:border-amber-500/70'
        }`}
      >
        <StickyNote className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span>Post-it</span>
        {localState.dirty && (
          <span className="text-[10px] font-semibold text-amber-500 leading-none" title="Aguardando gravação em Post-it.txt">
            *
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute right-0 md:right-auto md:left-0 top-[calc(100%+8px)] z-50 rounded-2xl border border-amber-500/45 bg-[var(--panel)] shadow-2xl overflow-hidden flex flex-col transition-all ${
            expanded ? 'w-[540px] max-w-[94vw]' : 'w-[360px] sm:w-[410px] max-w-[94vw]'
          }`}
        >
          {/* Header do Post-it */}
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-amber-500/12 border-b border-amber-500/25">
            <div className="min-w-0 flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 leading-none">
                  <strong className="text-[13px] font-extrabold text-[var(--text)]">Post-it</strong>
                  <span className="text-[11px] text-[var(--subtle)]" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-[11px] font-mono-num text-[var(--muted)] truncate">
                    {POST_IT_FILENAME}
                  </span>
                </div>
                <div className="text-[10.5px] text-[var(--muted)] truncate mt-0.5">
                  {syncStatus === 'saving' || syncStatus === 'loading'
                    ? syncMessage
                    : syncStatus === 'error'
                      ? `Aviso: ${syncMessage}`
                      : syncMessage ||
                        (driveConnected && driveTokenReady
                          ? 'Salvo automaticamente em Post-it.txt no Google Drive'
                          : 'Salvo localmente no navegador')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? 'Reduzir tamanho do Post-it' : 'Expandir tamanho do Post-it'}
                title={expanded ? 'Reduzir tamanho' : 'Ampliar área de escrita'}
                className="grid place-items-center w-7 h-7 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)] transition-colors cursor-pointer"
              >
                {expanded ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={handleToggleOpen}
                aria-label="Fechar Post-it"
                title="Fechar Post-it"
                className="grid place-items-center w-7 h-7 rounded-lg text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Alerta não destrutivo caso haja versão diferente em Post-it.txt no Drive */}
          {conflictRemote && (
            <div className="px-3.5 py-2.5 bg-[var(--warning)]/12 border-b border-[var(--warning)]/35 text-[11.5px] flex flex-col gap-2">
              <div className="flex items-start gap-2 text-[var(--text)]">
                <AlertTriangle className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" />
                <span>
                  Existe uma versão diferente em <strong>{POST_IT_FILENAME}</strong> no Google Drive.
                  Escolha como deseja resolver sem perder nada:
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const merged = [
                      localState.content.trim(),
                      '--- Versão do Google Drive ---',
                      conflictRemote.content.trim(),
                    ]
                      .filter(Boolean)
                      .join('\n\n');
                    const next: PostItLocalState = {
                      ...stateRef.current,
                      content: merged,
                      updatedAtMs: Date.now(),
                      dirty: true,
                      driveFileId: conflictRemote.fileId,
                    };
                    persistToBrowser(next, scopeRef.current);
                    setConflictRemote(null);
                    void pushToDrive({ manual: true, allowEmptyOverwrite: true });
                  }}
                  className="px-2.5 py-1 rounded-md border border-[var(--accent)] bg-[var(--accent)] text-white text-[11px] font-bold cursor-pointer"
                >
                  Unir as duas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next: PostItLocalState = {
                      ...stateRef.current,
                      driveFileId: conflictRemote.fileId,
                      dirty: true,
                    };
                    persistToBrowser(next, scopeRef.current);
                    setConflictRemote(null);
                    void pushToDrive({ manual: true, allowEmptyOverwrite: true });
                  }}
                  className="px-2.5 py-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] text-[11px] font-bold hover:border-[var(--accent)] cursor-pointer"
                >
                  Manter minha versão
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const adopted: PostItLocalState = {
                      content: conflictRemote.content,
                      updatedAtMs: Date.parse(conflictRemote.modifiedTime || '') || Date.now(),
                      dirty: false,
                      driveFileId: conflictRemote.fileId,
                      lastDriveModifiedTime: conflictRemote.modifiedTime,
                      lastSyncedContent: conflictRemote.content,
                    };
                    persistToBrowser(adopted, scopeRef.current);
                    setConflictRemote(null);
                    toast('Versão de Post-it.txt do Drive carregada.');
                  }}
                  className="px-2.5 py-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] text-[11px] font-bold hover:border-[var(--accent)] cursor-pointer"
                >
                  Usar versão do Drive
                </button>
              </div>
            </div>
          )}

          {/* Confirmação explícita antes de apagar todo o conteúdo salvo em Post-it.txt no Drive */}
          {confirmClearDrive && (
            <div className="px-3.5 py-2.5 bg-[var(--bad)]/10 border-b border-[var(--bad)]/30 text-[11.5px] flex flex-wrap items-center justify-between gap-2">
              <span className="text-[var(--text)]">
                Deseja realmente limpar todo o conteúdo de <strong>{POST_IT_FILENAME}</strong> no Drive?
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const restored: PostItLocalState = {
                      ...stateRef.current,
                      content: stateRef.current.lastSyncedContent,
                      updatedAtMs: Date.now(),
                      dirty: false,
                    };
                    persistToBrowser(restored, scopeRef.current);
                    setConfirmClearDrive(false);
                  }}
                  className="px-2.5 py-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] text-[11px] font-bold cursor-pointer"
                >
                  Restaurar texto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmClearDrive(false);
                    void pushToDrive({ manual: true, allowEmptyOverwrite: true });
                  }}
                  className="px-2.5 py-1 rounded-md border border-[var(--bad)] bg-[var(--bad)] text-white text-[11px] font-bold cursor-pointer"
                >
                  Confirmar limpeza
                </button>
              </div>
            </div>
          )}

          {/* Área de texto principal */}
          <div className="p-3 bg-[var(--panel)]">
            <textarea
              ref={textareaRef}
              value={localState.content}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="Escreva suas anotações permanentes aqui… Tudo é salvo automaticamente no navegador e gravado diretamente no arquivo Post-it.txt do seu Google Drive."
              className={`w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 text-[13px] leading-relaxed text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-amber-500/70 transition-colors ${
                expanded ? 'h-[420px]' : 'h-[240px]'
              }`}
            />
          </div>

          {/* Rodapé com ações diretas no Post-it.txt */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-t border-[var(--line)] bg-[var(--panel-soft)] text-[11px]">
            <div className="flex items-center gap-2 text-[var(--muted)] font-mono-num tabular-nums">
              <span>{lineCount} linha(s)</span>
              <span aria-hidden="true">·</span>
              <span>{charCount} carac.</span>
            </div>

            <div className="flex items-center gap-1.5">
              {driveConnected && driveTokenReady ? (
                <>
                  <button
                    type="button"
                    onClick={() => void pullFromDrive({ manual: true })}
                    disabled={syncStatus === 'loading' || syncStatus === 'saving'}
                    title="Recarregar anotações diretamente de Post-it.txt no Google Drive"
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] font-semibold hover:border-[var(--accent)] disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${syncStatus === 'loading' ? 'animate-spin' : ''}`}
                    />
                    Ler Drive
                  </button>
                  <button
                    type="button"
                    onClick={() => void pushToDrive({ manual: true })}
                    disabled={syncStatus === 'saving'}
                    title="Gravar imediatamente em Post-it.txt no Google Drive"
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-amber-500 bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {syncStatus === 'saving' ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3" />
                    )}
                    Salvar .txt
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void connectGoogleDrive()}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-[var(--warning)]/60 bg-[var(--warning)]/12 text-[var(--warning)] font-bold hover:bg-[var(--warning)]/20 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {driveConnected ? <CloudOff className="w-3 h-3" /> : <Cloud className="w-3 h-3" />}
                  {driveConnected ? 'Reconectar Drive' : 'Conectar Drive'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
