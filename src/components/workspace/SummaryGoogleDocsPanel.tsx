import React, { useCallback, useEffect, useState } from 'react';
import {
  FilePlus2,
  FileText,
  FolderOpen,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { htmlToPlainText, sanitizeDocHtml } from '../../lib/richDocUtils';
import {
  createGoogleDocInDrive,
  ensureSummaryDocsFolder,
  exportGoogleDocHtml,
  getGoogleDocDocument,
  getWorkspaceAuthSnapshot,
  GOOGLE_DOC_MIME,
  listRecentGoogleDocs,
  signInWorkspaceGoogle,
  signOutWorkspaceGoogle,
  subscribeWorkspaceAuth,
  WorkspaceAuthSnapshot,
  WorkspaceDriveItem,
} from '../../lib/workspaceDriveAuth';
import { EmbeddedGoogleDocFrame } from './EmbeddedGoogleDocFrame';
import { GoogleWorkspaceSignInButton } from './GoogleWorkspaceSignInButton';

interface SummaryGoogleDocsPanelProps {
  subjectLabel: string;
  title: string;
  onChangeTitle: (next: string) => void;
  initialLocalHtml?: string;
  activeDoc: {
    id: string;
    name: string;
    webViewLink?: string;
  } | null;
  onSelectDoc: (doc: { id: string; name: string; webViewLink?: string } | null) => void;
  onSyncDocToSummary: (payload: {
    googleDocId: string;
    googleDocUrl?: string;
    title: string;
    html: string;
    plainText: string;
  }) => Promise<void>;
}

function formatShortDate(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export const SummaryGoogleDocsPanel: React.FC<SummaryGoogleDocsPanelProps> = ({
  subjectLabel,
  title,
  onChangeTitle,
  initialLocalHtml,
  activeDoc,
  onSelectDoc,
  onSyncDocToSummary,
}) => {
  const { toast } = useStudy();
  const [authState, setAuthState] = useState<WorkspaceAuthSnapshot>(() =>
    getWorkspaceAuthSnapshot(),
  );
  const [signingIn, setSigningIn] = useState(false);
  const [creating, setCreating] = useState(false);
  const [includeLocalDraft, setIncludeLocalDraft] = useState(true);
  const [syncingBack, setSyncingBack] = useState(false);

  const [recentDocs, setRecentDocs] = useState<WorkspaceDriveItem[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [recentSearch, setRecentSearch] = useState('');

  useEffect(() => subscribeWorkspaceAuth(setAuthState), []);

  const loadRecentDocs = useCallback(async () => {
    if (!authState.hasToken) return;
    setLoadingRecent(true);
    try {
      const docs = await listRecentGoogleDocs(20);
      setRecentDocs(docs);
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg !== 'AUTH_REQUIRED' && msg !== 'AUTH_EXPIRED') {
        toast('Não foi possível listar seus Google Docs recentes.', true);
      }
    } finally {
      setLoadingRecent(false);
    }
  }, [authState.hasToken, toast]);

  useEffect(() => {
    if (authState.hasToken && !activeDoc) {
      void loadRecentDocs();
    }
  }, [activeDoc, authState.hasToken, loadRecentDocs]);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWorkspaceGoogle();
      toast('Conectado ao Google Docs e Google Drive.');
    } catch (err) {
      const msg = (err as Error).message || 'Não foi possível entrar com o Google.';
      if (!msg.includes('popup-closed-by-user')) {
        toast(msg, true);
      }
    } finally {
      setSigningIn(false);
    }
  };

  const hasLocalDraftText = Boolean(
    initialLocalHtml && htmlToPlainText(initialLocalHtml).trim().length > 0,
  );

  const handleCreateGoogleDoc = async () => {
    const cleanTitle = title.trim() || `Resumo — ${subjectLabel}`;
    setCreating(true);
    try {
      const folderId = await ensureSummaryDocsFolder(subjectLabel);
      const htmlToSend =
        includeLocalDraft && hasLocalDraftText ? initialLocalHtml : undefined;
      const created = await createGoogleDocInDrive({
        title: cleanTitle,
        parentId: folderId,
        initialHtml: htmlToSend,
      });
      onChangeTitle(created.name);
      onSelectDoc({
        id: created.id,
        name: created.name,
        webViewLink: created.webViewLink,
      });
      await onSyncDocToSummary({
        googleDocId: created.id,
        googleDocUrl:
          created.webViewLink || `https://docs.google.com/document/d/${created.id}/edit`,
        title: created.name,
        html: htmlToSend || `<p>Documento vinculado ao Google Docs (${created.name}).</p>`,
        plainText:
          (htmlToSend ? htmlToPlainText(htmlToSend).trim() : '') ||
          `Documento editado diretamente no Google Docs (${created.name}).`,
      });
      toast(`Google Docs "${created.name}" criado em "${subjectLabel}" no Drive.`);
    } catch (err) {
      toast((err as Error).message || 'Erro ao criar documento no Google Docs.', true);
    } finally {
      setCreating(false);
    }
  };

  const handleSyncActiveDoc = async () => {
    if (!activeDoc) return;
    setSyncingBack(true);
    try {
      const [docMeta, rawHtml] = await Promise.all([
        getGoogleDocDocument(activeDoc.id).catch(() => null),
        exportGoogleDocHtml(activeDoc.id),
      ]);
      const safeHtml = sanitizeDocHtml(rawHtml);
      const resolvedTitle = docMeta?.title?.trim() || title.trim() || activeDoc.name;
      const plainText =
        docMeta?.plainText?.trim() ||
        htmlToPlainText(safeHtml).trim() ||
        `Documento editado diretamente no Google Docs (${resolvedTitle}).`;

      if (docMeta?.title && docMeta.title.trim() !== activeDoc.name) {
        onChangeTitle(docMeta.title.trim());
        onSelectDoc({ ...activeDoc, name: docMeta.title.trim() });
      }

      await onSyncDocToSummary({
        googleDocId: activeDoc.id,
        googleDocUrl:
          activeDoc.webViewLink || `https://docs.google.com/document/d/${activeDoc.id}/edit`,
        title: resolvedTitle,
        html: safeHtml || `<p>${plainText}</p>`,
        plainText,
      });
      toast(`"${resolvedTitle}" sincronizado do Google Docs para o aplicativo.`);
    } catch (err) {
      toast((err as Error).message || 'Não foi possível sincronizar o texto do Google Docs.', true);
    } finally {
      setSyncingBack(false);
    }
  };

  if (!authState.hasToken) {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-7 flex flex-col items-center text-center">
        <div className="w-11 h-11 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] flex items-center justify-center mb-3.5">
          <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-[16px] font-bold text-[var(--text)] mb-1.5">
          Editar resumos direto no Google Docs embutido
        </h3>
        <p className="text-[13px] text-[var(--muted)] max-w-lg leading-relaxed mb-5">
          Crie um Google Docs diretamente na pasta{' '}
          <strong className="text-[var(--text)]">
            Central de Estudos - Resumos / {subjectLabel}
          </strong>{' '}
          do seu Google Drive e escreva dentro do próprio editor do Google Docs sem sair desta
          página.
        </p>
        <GoogleWorkspaceSignInButton
          onClick={() => void handleSignIn()}
          loading={signingIn}
          label="Entrar com o Google"
        />
      </div>
    );
  }

  if (activeDoc) {
    return (
      <div className="flex flex-col gap-2.5">
        <EmbeddedGoogleDocFrame
          fileId={activeDoc.id}
          title={title.trim() || activeDoc.name}
          mimeType={GOOGLE_DOC_MIME}
          webViewLink={activeDoc.webViewLink}
          subtitle={`Matéria: ${subjectLabel} · Salvo automaticamente no Google Drive`}
          onSyncToApp={handleSyncActiveDoc}
          isSyncingToApp={syncingBack}
          onClose={() => onSelectDoc(null)}
        />
      </div>
    );
  }

  const filteredDocs = recentDocs.filter((doc) => {
    const q = recentSearch.trim().toLowerCase();
    return !q || doc.name.toLowerCase().includes(q);
  });

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--line)]">
        <div className="text-[12.5px] text-[var(--muted)]">
          Conectado como{' '}
          <strong className="text-[var(--text)]">
            {authState.user?.email || authState.user?.displayName || 'Conta Google'}
          </strong>{' '}
          · Pasta no Drive:{' '}
          <span className="text-[var(--text)] font-medium">
            Central de Estudos - Resumos / {subjectLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void signOutWorkspaceGoogle()}
          className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--bad)] cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Trocar conta
        </button>
      </div>

      {/* Create New Embedded Google Doc */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 flex flex-col justify-between gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[14px] font-bold text-[var(--text)]">
              <FilePlus2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Criar novo Google Docs nesta matéria
            </div>
            <p className="text-[12.5px] text-[var(--muted)] leading-relaxed">
              Cria o arquivo nativo no seu Google Drive e abre o editor do Google Docs embutido
              imediatamente abaixo.
            </p>
            <div className="mt-1">
              <label className="block text-[11.5px] font-semibold text-[var(--muted)] mb-1">
                Nome do documento no Google Drive
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => onChangeTitle(e.target.value)}
                placeholder={`Ex.: Resumo — ${subjectLabel}`}
                className="ce-input w-full"
              />
            </div>

            {hasLocalDraftText && (
              <label className="mt-1 inline-flex items-center gap-2 text-[12px] text-[var(--text)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeLocalDraft}
                  onChange={(e) => setIncludeLocalDraft(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                <span>Levar o texto já digitado no editor local para este Google Docs</span>
              </label>
            )}
          </div>

          <button
            type="button"
            onClick={() => void handleCreateGoogleDoc()}
            disabled={creating}
            className="inline-flex items-center justify-center gap-2 h-[38px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 transition-colors cursor-pointer"
          >
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Criando no Google Drive…
              </>
            ) : (
              <>
                <FilePlus2 className="w-4 h-4" />
                Criar e abrir Google Docs aqui
              </>
            )}
          </button>
        </div>

        {/* Open Existing Google Doc from Drive */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[14px] font-bold text-[var(--text)]">
              <FolderOpen className="w-4 h-4 text-[var(--accent)]" />
              Abrir Google Docs existente do Drive
            </div>
            <button
              type="button"
              onClick={() => void loadRecentDocs()}
              disabled={loadingRecent}
              title="Atualizar lista de Google Docs"
              className="p-1.5 rounded-md border border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRecent ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={recentSearch}
              onChange={(e) => setRecentSearch(e.target.value)}
              placeholder="Filtrar seus Google Docs recentes…"
              className="ce-input pl-8 h-[32px] text-[12px] w-full"
            />
          </div>

          <div className="max-h-[190px] overflow-y-auto divide-y divide-[var(--line)] border border-[var(--line)] rounded-lg">
            {loadingRecent ? (
              <div className="p-4 flex items-center justify-center gap-2 text-[12px] text-[var(--muted)]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Carregando seus Google Docs…
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="p-4 text-center text-[12px] text-[var(--muted)]">
                Nenhum Google Docs encontrado.
              </div>
            ) : (
              filteredDocs.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => {
                    onChangeTitle(doc.name);
                    onSelectDoc({
                      id: doc.id,
                      name: doc.name,
                      webViewLink: doc.webViewLink,
                    });
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-[var(--panel-soft)] flex items-center justify-between gap-2 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="text-[12.5px] font-medium text-[var(--text)] truncate">
                      {doc.name}
                    </span>
                  </span>
                  <span className="text-[11px] text-[var(--muted)] tabular-nums shrink-0">
                    {formatShortDate(doc.modifiedTime)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
