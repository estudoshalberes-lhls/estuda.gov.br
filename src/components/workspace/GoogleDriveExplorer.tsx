import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  File as FileIcon,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FileUp,
  Folder,
  FolderInput,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Presentation,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { saveFileBlob, triggerBlobDownload } from '../../lib/fileStorage';
import { formatUploadSize } from '../../lib/parsers';
import {
  createDriveFolder,
  createGoogleDocInDrive,
  deleteDriveItemPermanently,
  downloadWorkspaceDriveBlob,
  DriveSpecialView,
  getExternalGoogleUrl,
  getWorkspaceAuthSnapshot,
  GOOGLE_DOC_MIME,
  GOOGLE_FOLDER_MIME,
  GOOGLE_SHEET_MIME,
  GOOGLE_SLIDE_MIME,
  listDriveDirectory,
  listDriveSubfolders,
  moveDriveItem,
  renameDriveItem,
  restoreDriveItem,
  signInWorkspaceGoogle,
  signOutWorkspaceGoogle,
  subscribeWorkspaceAuth,
  toggleDriveStarred,
  trashDriveItem,
  uploadFileToWorkspaceDrive,
  WorkspaceAuthSnapshot,
  WorkspaceDriveItem,
} from '../../lib/workspaceDriveAuth';
import { PersonalPdfFile } from '../../types/study';
import { PdfAnnotatorViewer } from '../ui/PdfAnnotatorViewer';
import { EmbeddedGoogleDocFrame } from './EmbeddedGoogleDocFrame';
import { GoogleWorkspaceSignInButton } from './GoogleWorkspaceSignInButton';

interface BreadcrumbNode {
  id: string;
  name: string;
}

type MimeFilter = 'all' | 'folders' | 'pdf' | 'docs' | 'images';
type SortMode = 'modified' | 'name' | 'size';

function formatDriveDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function getFileTypeMeta(mimeType: string): {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
} {
  if (mimeType === GOOGLE_FOLDER_MIME) {
    return { label: 'Pasta', Icon: Folder, colorClass: 'text-[var(--accent)]' };
  }
  if (mimeType === 'application/pdf') {
    return { label: 'PDF', Icon: FileText, colorClass: 'text-rose-600 dark:text-rose-400' };
  }
  if (mimeType === GOOGLE_DOC_MIME) {
    return { label: 'Google Docs', Icon: FileText, colorClass: 'text-blue-600 dark:text-blue-400' };
  }
  if (mimeType === GOOGLE_SHEET_MIME) {
    return {
      label: 'Planilha',
      Icon: FileSpreadsheet,
      colorClass: 'text-emerald-600 dark:text-emerald-400',
    };
  }
  if (mimeType === GOOGLE_SLIDE_MIME) {
    return {
      label: 'Apresentação',
      Icon: Presentation,
      colorClass: 'text-amber-600 dark:text-amber-400',
    };
  }
  if (mimeType.startsWith('image/')) {
    return { label: 'Imagem', Icon: ImageIcon, colorClass: 'text-violet-600 dark:text-violet-400' };
  }
  return { label: 'Arquivo', Icon: FileIcon, colorClass: 'text-[var(--muted)]' };
}

export const GoogleDriveExplorer: React.FC = () => {
  const { requestConfirm, toast } = useStudy();

  const [authState, setAuthState] = useState<WorkspaceAuthSnapshot>(() =>
    getWorkspaceAuthSnapshot(),
  );
  const [signingIn, setSigningIn] = useState(false);

  // Navigation & listing state
  const [activeView, setActiveView] = useState<DriveSpecialView>('my-drive');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbNode[]>([
    { id: 'root', name: 'Meu Drive' },
  ]);
  const [items, setItems] = useState<WorkspaceDriveItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search, filter & layout controls
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mimeFilter, setMimeFilter] = useState<MimeFilter>('all');
  const [sortBy, setSortBy] = useState<SortMode>('modified');
  const [layoutMode, setLayoutMode] = useState<'list' | 'grid'>('list');

  // "+ Novo" menu & uploads
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const fileUploadRef = useRef<HTMLInputElement | null>(null);
  const newMenuRef = useRef<HTMLDivElement | null>(null);

  // Modals (Create folder, Create Google Doc, Rename, Move)
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [createDocOpen, setCreateDocOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [creatingDoc, setCreatingDoc] = useState(false);

  const [renameTarget, setRenameTarget] = useState<WorkspaceDriveItem | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);

  const [moveTarget, setMoveTarget] = useState<WorkspaceDriveItem | null>(null);
  const [movePath, setMovePath] = useState<BreadcrumbNode[]>([{ id: 'root', name: 'Meu Drive' }]);
  const [moveFolders, setMoveFolders] = useState<WorkspaceDriveItem[]>([]);
  const [loadingMoveFolders, setLoadingMoveFolders] = useState(false);
  const [movingItem, setMovingItem] = useState(false);

  // Active open preview (Embedded Google Docs/Drive OR PdfAnnotatorViewer)
  const [embeddedItem, setEmbeddedItem] = useState<WorkspaceDriveItem | null>(null);
  const [openingPdfId, setOpeningPdfId] = useState<string | null>(null);
  const [activePdfPreview, setActivePdfPreview] = useState<{
    folderLabel: string;
    file: PersonalPdfFile;
    driveItem: WorkspaceDriveItem;
  } | null>(null);

  const currentFolder = breadcrumbs[breadcrumbs.length - 1] || { id: 'root', name: 'Meu Drive' };

  useEffect(() => subscribeWorkspaceAuth(setAuthState), []);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 280);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!newMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [newMenuOpen]);

  const loadDirectory = useCallback(
    async (append = false, pageToken?: string) => {
      if (!authState.hasToken) return;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setErrorMsg(null);
      }
      try {
        const res = await listDriveDirectory({
          view: activeView,
          folderId: activeView === 'my-drive' ? currentFolder.id : undefined,
          searchQuery: debouncedSearch || undefined,
          mimeFilter,
          sortBy,
          pageToken,
        });
        setItems((prev) => (append ? [...prev, ...res.files] : res.files));
        setNextPageToken(res.nextPageToken);
      } catch (err) {
        const msg = (err as Error).message || 'Não foi possível carregar o Google Drive.';
        if (msg === 'AUTH_REQUIRED' || msg === 'AUTH_EXPIRED') {
          setErrorMsg('Sua sessão do Google expirou. Entre novamente para acessar o Google Drive.');
        } else {
          setErrorMsg(msg);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeView, authState.hasToken, currentFolder.id, debouncedSearch, mimeFilter, sortBy],
  );

  useEffect(() => {
    if (authState.hasToken) {
      void loadDirectory(false);
    } else {
      setItems([]);
      setNextPageToken(undefined);
    }
  }, [authState.hasToken, loadDirectory]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setErrorMsg(null);
    try {
      await signInWorkspaceGoogle();
      toast('Conectado ao Google Drive com sucesso.');
    } catch (err) {
      const msg = (err as Error).message || 'Não foi possível conectar com o Google.';
      if (!msg.includes('popup-closed-by-user')) {
        toast(msg, true);
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOutWorkspaceGoogle();
    setEmbeddedItem(null);
    setActivePdfPreview(null);
    setItems([]);
    toast('Conta Google desconectada desta visualização.');
  };

  const handleSwitchView = (view: DriveSpecialView) => {
    setActiveView(view);
    setSearchInput('');
    setDebouncedSearch('');
    setMimeFilter('all');
    if (view === 'my-drive') {
      setBreadcrumbs([{ id: 'root', name: 'Meu Drive' }]);
    }
  };

  const handleEnterFolder = (folder: WorkspaceDriveItem) => {
    setActiveView('my-drive');
    setSearchInput('');
    setDebouncedSearch('');
    setBreadcrumbs((prev) => {
      const existingIndex = prev.findIndex((b) => b.id === folder.id);
      if (existingIndex >= 0) return prev.slice(0, existingIndex + 1);
      return [...prev, { id: folder.id, name: folder.name }];
    });
  };

  const handleBreadcrumbClick = (index: number) => {
    setActiveView('my-drive');
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  const handleUploadFiles = async (files: File[]) => {
    if (!files.length) return;
    const targetParent = activeView === 'my-drive' ? currentFolder.id : 'root';
    setUploadingCount(files.length);
    let uploaded = 0;
    try {
      for (const file of files) {
        await uploadFileToWorkspaceDrive(file, targetParent);
        uploaded += 1;
      }
      toast(
        `${uploaded} arquivo(s) enviado(s) direto para "${
          activeView === 'my-drive' ? currentFolder.name : 'Meu Drive'
        }".`,
      );
      await loadDirectory(false);
    } catch (err) {
      toast((err as Error).message || 'Erro ao enviar arquivos para o Google Drive.', true);
    } finally {
      setUploadingCount(0);
    }
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const targetParent = activeView === 'my-drive' ? currentFolder.id : 'root';
      const created = await createDriveFolder(newFolderName.trim(), targetParent);
      setCreateFolderOpen(false);
      setNewFolderName('');
      toast(`Pasta "${created.name}" criada no Google Drive.`);
      await loadDirectory(false);
    } catch (err) {
      toast((err as Error).message || 'Não foi possível criar a pasta.', true);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleCreateDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newDocTitle.trim() || 'Novo documento de estudo';
    setCreatingDoc(true);
    try {
      const targetParent = activeView === 'my-drive' ? currentFolder.id : 'root';
      const created = await createGoogleDocInDrive({ title, parentId: targetParent });
      setCreateDocOpen(false);
      setNewDocTitle('');
      setActivePdfPreview(null);
      setEmbeddedItem(created);
      toast(`Google Docs "${created.name}" criado e aberto.`);
      await loadDirectory(false);
    } catch (err) {
      toast((err as Error).message || 'Não foi possível criar o Google Docs.', true);
    } finally {
      setCreatingDoc(false);
    }
  };

  const handleOpenItem = async (item: WorkspaceDriveItem) => {
    if (item.mimeType === GOOGLE_FOLDER_MIME) {
      if (item.trashed) {
        toast('Restaure a pasta da lixeira antes de abri-la.', true);
        return;
      }
      handleEnterFolder(item);
      return;
    }

    if (item.mimeType === 'application/pdf') {
      setOpeningPdfId(item.id);
      try {
        const { blob } = await downloadWorkspaceDriveBlob(item.id, item.mimeType);
        const blobKey = `gdrive-pdf-${item.id}`;
        await saveFileBlob(blobKey, blob);
        const virtualPdf: PersonalPdfFile = {
          id: `gdrive-${item.id}`,
          name: item.name,
          size: Number(item.size) || blob.size,
          blobKey,
          createdAt: item.createdTime || new Date().toISOString(),
          updatedAt: item.modifiedTime || new Date().toISOString(),
        };
        setEmbeddedItem(null);
        setActivePdfPreview({
          folderLabel: currentFolder.name,
          file: virtualPdf,
          driveItem: item,
        });
      } catch (err) {
        // Graceful fallback to embedded Drive preview if direct download fails
        toast(
          `Abrindo "${item.name}" no visualizador do Google Drive (${(err as Error).message}).`,
        );
        setActivePdfPreview(null);
        setEmbeddedItem(item);
      } finally {
        setOpeningPdfId(null);
      }
      return;
    }

    setActivePdfPreview(null);
    setEmbeddedItem(item);
  };

  const handleDownloadItem = async (item: WorkspaceDriveItem) => {
    try {
      const { blob, suggestedExtension } = await downloadWorkspaceDriveBlob(
        item.id,
        item.mimeType,
      );
      const fileName =
        suggestedExtension && !item.name.toLowerCase().endsWith(suggestedExtension)
          ? `${item.name}${suggestedExtension}`
          : item.name;
      triggerBlobDownload(blob, fileName);
      toast(`Download de "${fileName}" iniciado.`);
    } catch (err) {
      toast((err as Error).message || 'Erro ao baixar arquivo do Google Drive.', true);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameDraft.trim()) return;
    setRenaming(true);
    try {
      const updated = await renameDriveItem(renameTarget.id, renameDraft.trim());
      setItems((prev) =>
        prev.map((it) => (it.id === updated.id ? { ...it, name: updated.name } : it)),
      );
      if (embeddedItem?.id === updated.id) {
        setEmbeddedItem((prev) => (prev ? { ...prev, name: updated.name } : prev));
      }
      toast(`Item renomeado para "${updated.name}" no Google Drive.`);
      setRenameTarget(null);
    } catch (err) {
      toast((err as Error).message || 'Não foi possível renomear o item.', true);
    } finally {
      setRenaming(false);
    }
  };

  const openMoveModal = async (item: WorkspaceDriveItem) => {
    setMoveTarget(item);
    setMovePath([{ id: 'root', name: 'Meu Drive' }]);
    setLoadingMoveFolders(true);
    try {
      const folders = await listDriveSubfolders('root');
      setMoveFolders(folders.filter((f) => f.id !== item.id));
    } catch (err) {
      toast((err as Error).message || 'Erro ao listar pastas de destino.', true);
      setMoveFolders([]);
    } finally {
      setLoadingMoveFolders(false);
    }
  };

  const navigateMoveModal = async (target: BreadcrumbNode, sliceToIndex?: number) => {
    setLoadingMoveFolders(true);
    if (sliceToIndex !== undefined) {
      setMovePath((prev) => prev.slice(0, sliceToIndex + 1));
    } else {
      setMovePath((prev) => [...prev, target]);
    }
    try {
      const folders = await listDriveSubfolders(target.id);
      setMoveFolders(folders.filter((f) => f.id !== moveTarget?.id));
    } catch {
      setMoveFolders([]);
    } finally {
      setLoadingMoveFolders(false);
    }
  };

  const handleConfirmMove = async () => {
    if (!moveTarget) return;
    const dest = movePath[movePath.length - 1];
    if (!dest) return;
    setMovingItem(true);
    try {
      await moveDriveItem(moveTarget.id, dest.id, moveTarget.parents);
      toast(`"${moveTarget.name}" movido para "${dest.name}".`);
      setMoveTarget(null);
      await loadDirectory(false);
    } catch (err) {
      toast((err as Error).message || 'Erro ao mover item.', true);
    } finally {
      setMovingItem(false);
    }
  };

  const handleToggleStar = async (item: WorkspaceDriveItem) => {
    const nextStarred = !item.starred;
    const ok = await requestConfirm({
      title: nextStarred ? 'Adicionar aos favoritos do Drive' : 'Remover dos favoritos do Drive',
      description: nextStarred
        ? `Deseja marcar "${item.name}" com estrela no seu Google Drive?`
        : `Deseja remover a estrela de "${item.name}" no seu Google Drive?`,
      confirmLabel: nextStarred ? 'Marcar com estrela' : 'Remover estrela',
    });
    if (!ok) return;
    try {
      await toggleDriveStarred(item.id, nextStarred);
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, starred: nextStarred } : it)),
      );
      toast(nextStarred ? `"${item.name}" marcado com estrela.` : `Estrela removida de "${item.name}".`);
    } catch (err) {
      toast((err as Error).message || 'Erro ao atualizar favorito.', true);
    }
  };

  const handleTrashItem = async (item: WorkspaceDriveItem) => {
    const ok = await requestConfirm({
      title: 'Mover para a lixeira do Google Drive',
      description: `Deseja mover "${item.name}" para a lixeira do seu Google Drive? Você poderá restaurá-lo depois pela aba Lixeira.`,
      confirmLabel: 'Mover para lixeira',
      danger: true,
    });
    if (!ok) return;
    try {
      await trashDriveItem(item.id);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      if (embeddedItem?.id === item.id) setEmbeddedItem(null);
      if (activePdfPreview?.driveItem.id === item.id) setActivePdfPreview(null);
      toast(`"${item.name}" movido para a lixeira do Google Drive.`);
    } catch (err) {
      toast((err as Error).message || 'Erro ao mover para a lixeira.', true);
    }
  };

  const handleRestoreItem = async (item: WorkspaceDriveItem) => {
    const ok = await requestConfirm({
      title: 'Restaurar arquivo do Google Drive',
      description: `Deseja restaurar "${item.name}" da lixeira do Google Drive?`,
      confirmLabel: 'Restaurar',
    });
    if (!ok) return;
    try {
      await restoreDriveItem(item.id);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      toast(`"${item.name}" restaurado no Google Drive.`);
    } catch (err) {
      toast((err as Error).message || 'Erro ao restaurar item.', true);
    }
  };

  const handleDeletePermanently = async (item: WorkspaceDriveItem) => {
    const ok = await requestConfirm({
      title: 'Excluir permanentemente do Google Drive',
      description: `Atenção: "${item.name}" será excluído permanentemente da sua conta Google Drive e não poderá ser recuperado.`,
      confirmLabel: 'Excluir definitivamente',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteDriveItemPermanently(item.id);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      toast(`"${item.name}" excluído permanentemente do Google Drive.`);
    } catch (err) {
      toast((err as Error).message || 'Erro ao excluir permanentemente.', true);
    }
  };

  const folderItems = useMemo(
    () => items.filter((i) => i.mimeType === GOOGLE_FOLDER_MIME),
    [items],
  );
  const fileItems = useMemo(
    () => items.filter((i) => i.mimeType !== GOOGLE_FOLDER_MIME),
    [items],
  );

  // Unauthenticated view
  if (!authState.hasToken) {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-8 sm:p-10 flex flex-col items-center text-center max-w-2xl mx-auto my-4">
        <div className="w-12 h-12 rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] flex items-center justify-center mb-4">
          <HardDrive className="w-6 h-6 text-[var(--accent)]" />
        </div>
        <h2 className="text-[19px] font-bold text-[var(--text)] tracking-tight mb-2">
          Conectar seu Google Drive ao Acervo
        </h2>
        <p className="text-[13.5px] text-[var(--muted)] max-w-lg leading-relaxed mb-6">
          Navegue pelas suas pastas reais do Google Drive em uma interface dedicada, envie apostilas
          por arrastar e soltar, abra PDFs no leitor com marca-texto e edite seus Google Docs
          diretamente dentro desta tela.
        </p>
        <GoogleWorkspaceSignInButton
          onClick={() => void handleSignIn()}
          loading={signingIn}
          label="Entrar com o Google"
        />
        <p className="mt-4 text-[11.5px] text-[var(--muted)]">
          {authState.user?.email
            ? `Conta detectada: ${authState.user.email} · Clique acima para renovar o acesso nesta sessão.`
            : 'O acesso fica ativo apenas durante a sua sessão no navegador.'}
        </p>
      </div>
    );
  }

  const navItems: Array<{
    id: DriveSpecialView;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'my-drive', label: 'Meu Drive', Icon: HardDrive },
    { id: 'recent', label: 'Recentes', Icon: Clock },
    { id: 'starred', label: 'Com estrela', Icon: Star },
    { id: 'shared', label: 'Compartilhados', Icon: Users },
    { id: 'trash', label: 'Lixeira', Icon: Trash2 },
  ];

  const activeViewLabel =
    activeView === 'my-drive'
      ? currentFolder.name
      : navItems.find((n) => n.id === activeView)?.label || 'Google Drive';

  return (
    <div className="flex flex-col gap-4">
      {/* Hidden multi-file upload input */}
      <input
        ref={fileUploadRef}
        type="file"
        multiple
        onChange={(e) => {
          const selected = Array.from(e.target.files || []);
          e.target.value = '';
          void handleUploadFiles(selected);
        }}
        className="hidden"
      />

      {/* Active Embedded Google Docs / Drive Frame */}
      {embeddedItem && (
        <EmbeddedGoogleDocFrame
          fileId={embeddedItem.id}
          title={embeddedItem.name}
          mimeType={embeddedItem.mimeType}
          webViewLink={embeddedItem.webViewLink}
          subtitle={`Pasta: ${activeViewLabel} · Modificado ${formatDriveDate(embeddedItem.modifiedTime)}`}
          onClose={() => setEmbeddedItem(null)}
        />
      )}

      {/* Active PDF Annotator Viewer loaded from Google Drive */}
      {activePdfPreview && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[12px]">
            <span className="text-[var(--muted)]">
              Lendo PDF do Google Drive:{' '}
              <strong className="text-[var(--text)]">{activePdfPreview.driveItem.name}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const item = activePdfPreview.driveItem;
                  setActivePdfPreview(null);
                  setEmbeddedItem(item);
                }}
                className="text-[11.5px] font-semibold text-[var(--accent)] hover:underline cursor-pointer"
              >
                Abrir no visualizador Google
              </button>
              <a
                href={getExternalGoogleUrl(
                  activePdfPreview.driveItem.id,
                  activePdfPreview.driveItem.mimeType,
                  activePdfPreview.driveItem.webViewLink,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
              >
                Drive <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <PdfAnnotatorViewer
            folder={activePdfPreview.folderLabel}
            file={activePdfPreview.file}
            onClose={() => setActivePdfPreview(null)}
          />
        </div>
      )}

      {/* Main Google Drive-Style Shell */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer.types.includes('Files')) {
            setIsDraggingFiles(true);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setIsDraggingFiles(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingFiles(false);
          const dropped = Array.from(e.dataTransfer.files || []);
          if (dropped.length > 0) {
            void handleUploadFiles(dropped);
          }
        }}
        className={`relative rounded-xl border bg-[var(--panel)] overflow-hidden transition-colors ${
          isDraggingFiles ? 'border-[var(--accent)]' : 'border-[var(--line)]'
        }`}
      >
        {/* Drag-and-drop overlay */}
        {isDraggingFiles && (
          <div className="absolute inset-0 z-30 bg-[var(--accent-soft)]/90 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 pointer-events-none">
            <FileUp className="w-9 h-9 text-[var(--accent)]" />
            <div className="text-[15px] font-bold text-[var(--text)]">
              Solte aqui para enviar ao Google Drive
            </div>
            <div className="text-[12.5px] text-[var(--muted)]">
              Destino: {activeView === 'my-drive' ? currentFolder.name : 'Meu Drive'}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[224px_minmax(0,1fr)] min-h-[540px]">
          {/* Left Google Drive Sidebar */}
          <aside className="border-b lg:border-b-0 lg:border-r border-[var(--line)] bg-[var(--panel-soft)] p-3 flex flex-col justify-between gap-4">
            <div className="flex flex-col gap-3">
              {/* "+ Novo" Primary Action Button */}
              <div className="relative" ref={newMenuRef}>
                <button
                  type="button"
                  onClick={() => setNewMenuOpen((v) => !v)}
                  disabled={uploadingCount > 0}
                  className="inline-flex items-center justify-center gap-2 w-full h-[42px] px-4 rounded-xl border border-[var(--accent)] bg-[var(--accent)] text-white text-[13px] font-bold hover:bg-[var(--accent-hover)] shadow-xs transition-colors whitespace-nowrap cursor-pointer"
                >
                  {uploadingCount > 0 ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enviando ({uploadingCount})…
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Novo
                    </>
                  )}
                </button>

                {newMenuOpen && (
                  <div className="absolute left-0 right-0 mt-1.5 z-20 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-lg py-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        setCreateFolderOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-left text-[12.5px] font-medium text-[var(--text)] hover:bg-[var(--panel-soft)] flex items-center gap-2.5 cursor-pointer"
                    >
                      <FolderPlus className="w-4 h-4 text-[var(--accent)] shrink-0" />
                      Nova pasta
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        fileUploadRef.current?.click();
                      }}
                      className="w-full px-3.5 py-2 text-left text-[12.5px] font-medium text-[var(--text)] hover:bg-[var(--panel-soft)] flex items-center gap-2.5 cursor-pointer"
                    >
                      <FileUp className="w-4 h-4 text-[var(--text)] shrink-0" />
                      Upload de arquivo
                    </button>
                    <div className="my-1 border-t border-[var(--line)]" />
                    <button
                      type="button"
                      onClick={() => {
                        setNewMenuOpen(false);
                        setCreateDocOpen(true);
                      }}
                      className="w-full px-3.5 py-2 text-left text-[12.5px] font-medium text-[var(--text)] hover:bg-[var(--panel-soft)] flex items-center gap-2.5 cursor-pointer"
                    >
                      <FilePlus2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      Documentos Google
                    </button>
                  </div>
                )}
              </div>

              {/* Navigation Sections */}
              <nav
                aria-label="Navegação do Google Drive"
                className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0"
              >
                {navItems.map(({ id, label, Icon }) => {
                  const active = activeView === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSwitchView(id)}
                      className={`inline-flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                          : 'text-[var(--text)] hover:bg-[var(--panel-raised)]'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Account footer */}
            <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-[var(--text)] truncate">
                  {authState.user?.displayName || 'Conta Google'}
                </div>
                <div className="text-[11px] text-[var(--muted)] truncate">
                  {authState.user?.email || 'Google Drive conectado'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                title="Desconectar conta Google"
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)] transition-colors shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </aside>

          {/* Right Explorer Content */}
          <div className="flex flex-col min-w-0">
            {/* Search + Breadcrumbs + Controls Bar */}
            <div className="p-3.5 border-b border-[var(--line)] flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* Breadcrumb trail */}
                <div className="flex items-center flex-wrap gap-1 min-w-0">
                  {activeView === 'my-drive' ? (
                    breadcrumbs.map((crumb, idx) => {
                      const isLast = idx === breadcrumbs.length - 1;
                      return (
                        <React.Fragment key={crumb.id}>
                          {idx > 0 && (
                            <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                          )}
                          <button
                            type="button"
                            onClick={() => handleBreadcrumbClick(idx)}
                            className={`px-1.5 py-0.5 rounded text-[13.5px] truncate max-w-[200px] transition-colors cursor-pointer ${
                              isLast
                                ? 'font-bold text-[var(--text)]'
                                : 'font-medium text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)]'
                            }`}
                          >
                            {crumb.name}
                          </button>
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <span className="text-[14px] font-bold text-[var(--text)] px-1">
                      {activeViewLabel}
                    </span>
                  )}
                </div>

                {/* Search + View Toggle + Refresh */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Pesquisar no Drive…"
                      className="ce-input pl-8 pr-7 h-[34px] w-[200px] sm:w-[240px] text-[12.5px]"
                    />
                    {searchInput && (
                      <button
                        type="button"
                        onClick={() => setSearchInput('')}
                        aria-label="Limpar pesquisa"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
                    <button
                      type="button"
                      onClick={() => setLayoutMode('list')}
                      title="Visualização em lista"
                      className={`inline-flex items-center justify-center w-[30px] h-[28px] rounded-md transition-colors cursor-pointer ${
                        layoutMode === 'list'
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLayoutMode('grid')}
                      title="Visualização em grade"
                      className={`inline-flex items-center justify-center w-[30px] h-[28px] rounded-md transition-colors cursor-pointer ${
                        layoutMode === 'grid'
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => void loadDirectory(false)}
                    disabled={loading}
                    title="Atualizar pasta"
                    className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Filter & Sort Row */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex flex-wrap items-center gap-1 p-0.5 rounded-lg bg-[var(--panel-soft)] border border-[var(--line)]">
                  {(
                    [
                      ['all', 'Todos'],
                      ['folders', 'Pastas'],
                      ['pdf', 'PDFs'],
                      ['docs', 'Docs'],
                      ['images', 'Imagens'],
                    ] as Array<[MimeFilter, string]>
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMimeFilter(key)}
                      className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                        mimeFilter === key
                          ? 'bg-[var(--panel)] text-[var(--text)] shadow-xs'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
                  <span className="tabular-nums hidden sm:inline">
                    {items.length} {items.length === 1 ? 'item' : 'itens'}
                  </span>
                  <select
                    aria-label="Ordenar arquivos do Drive"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortMode)}
                    className="ce-select h-[30px] w-auto text-[11.5px]"
                  >
                    <option value="modified">Modificado recentemente</option>
                    <option value="name">Nome (A–Z)</option>
                    <option value="size">Maior tamanho</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Body: Error / Loading / Empty / Files */}
            <div className="p-3.5 flex-1">
              {errorMsg && (
                <div className="mb-3 rounded-lg border border-[var(--bad)]/40 bg-[var(--panel-soft)] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[var(--text)]">
                  <span>{errorMsg}</span>
                  <button
                    type="button"
                    onClick={() => void handleSignIn()}
                    className="text-[12px] font-bold text-[var(--accent)] hover:underline cursor-pointer"
                  >
                    Reconectar Google
                  </button>
                </div>
              )}

              {loading ? (
                <div className="flex flex-col divide-y divide-[var(--line)]">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-[44px] flex items-center justify-between gap-4 px-2 animate-pulse"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-4 h-4 rounded bg-[var(--panel-raised)]" />
                        <div className="h-3.5 w-48 rounded bg-[var(--panel-raised)]" />
                      </div>
                      <div className="h-3 w-20 rounded bg-[var(--panel-raised)]" />
                      <div className="h-3 w-14 rounded bg-[var(--panel-raised)]" />
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="py-14 px-4 flex flex-col items-center text-center">
                  <Folder className="w-10 h-10 text-[var(--muted)]/60 mb-3" />
                  <h3 className="text-[14.5px] font-bold text-[var(--text)] mb-1">
                    {debouncedSearch
                      ? `Nenhum arquivo encontrado para "${debouncedSearch}"`
                      : activeView === 'trash'
                        ? 'A lixeira está vazia'
                        : 'Esta pasta está vazia'}
                  </h3>
                  <p className="text-[12.5px] text-[var(--muted)] max-w-md mb-4">
                    {activeView === 'trash'
                      ? 'Itens movidos para a lixeira aparecerão aqui.'
                      : 'Arraste PDFs ou apostilas para esta área, crie uma subpasta ou inicie um Google Docs direto no seu Drive.'}
                  </p>
                  {activeView !== 'trash' && (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileUploadRef.current?.click()}
                        className="inline-flex items-center gap-1.5 h-[36px] px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] cursor-pointer"
                      >
                        <FileUp className="w-3.5 h-3.5" />
                        Enviar arquivo
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreateDocOpen(true)}
                        className="inline-flex items-center gap-1.5 h-[36px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
                      >
                        <FilePlus2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        Novo Google Docs
                      </button>
                    </div>
                  )}
                </div>
              ) : layoutMode === 'list' ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[var(--line)] text-[11.5px] font-semibold text-[var(--muted)]">
                        <th className="py-2 pl-2 pr-3">Nome</th>
                        <th className="py-2 px-3 hidden md:table-cell whitespace-nowrap">Tipo</th>
                        <th className="py-2 px-3 hidden sm:table-cell whitespace-nowrap">
                          Modificado
                        </th>
                        <th className="py-2 px-3 hidden lg:table-cell text-right whitespace-nowrap">
                          Tamanho
                        </th>
                        <th className="py-2 pl-3 pr-2 text-right whitespace-nowrap">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)] text-[13px]">
                      {items.map((item) => {
                        const { label, Icon, colorClass } = getFileTypeMeta(item.mimeType);
                        const isFolder = item.mimeType === GOOGLE_FOLDER_MIME;
                        const isOpeningThisPdf = openingPdfId === item.id;
                        return (
                          <tr
                            key={item.id}
                            className="group hover:bg-[var(--panel-soft)] transition-colors"
                          >
                            <td className="py-2.5 pl-2 pr-3 max-w-[360px]">
                              <button
                                type="button"
                                onClick={() => void handleOpenItem(item)}
                                className="flex items-center gap-2.5 min-w-0 w-full text-left cursor-pointer"
                              >
                                {isOpeningThisPdf ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)] shrink-0" />
                                ) : (
                                  <Icon className={`w-4 h-4 shrink-0 ${colorClass}`} />
                                )}
                                <span className="font-medium text-[var(--text)] group-hover:text-[var(--accent)] truncate">
                                  {item.name}
                                </span>
                                {item.starred && (
                                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                                )}
                              </button>
                            </td>
                            <td className="py-2.5 px-3 hidden md:table-cell text-[12px] text-[var(--muted)] whitespace-nowrap">
                              {label}
                            </td>
                            <td className="py-2.5 px-3 hidden sm:table-cell text-[12px] text-[var(--muted)] tabular-nums whitespace-nowrap">
                              {formatDriveDate(item.modifiedTime)}
                            </td>
                            <td className="py-2.5 px-3 hidden lg:table-cell text-right text-[12px] text-[var(--muted)] tabular-nums whitespace-nowrap">
                              {item.size ? formatUploadSize(Number(item.size)) : '—'}
                            </td>
                            <td className="py-2.5 pl-3 pr-2 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-1">
                                {activeView === 'trash' ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => void handleRestoreItem(item)}
                                      title="Restaurar da lixeira"
                                      className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--good)] hover:bg-[var(--panel-raised)] cursor-pointer"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleDeletePermanently(item)}
                                      title="Excluir permanentemente"
                                      className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--bad)] hover:bg-[var(--panel-raised)] cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => void handleToggleStar(item)}
                                      title={item.starred ? 'Remover estrela' : 'Marcar com estrela'}
                                      className={`p-1.5 rounded-md hover:bg-[var(--panel-raised)] cursor-pointer ${
                                        item.starred
                                          ? 'text-amber-500'
                                          : 'text-[var(--muted)] hover:text-amber-500'
                                      }`}
                                    >
                                      <Star
                                        className={`w-3.5 h-3.5 ${item.starred ? 'fill-amber-500' : ''}`}
                                      />
                                    </button>
                                    {!isFolder && (
                                      <button
                                        type="button"
                                        onClick={() => void handleDownloadItem(item)}
                                        title="Baixar arquivo"
                                        className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--panel-raised)] cursor-pointer"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRenameTarget(item);
                                        setRenameDraft(item.name);
                                      }}
                                      title="Renomear"
                                      className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--panel-raised)] cursor-pointer"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void openMoveModal(item)}
                                      title="Mover para pasta"
                                      className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--panel-raised)] cursor-pointer"
                                    >
                                      <FolderInput className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleTrashItem(item)}
                                      title="Mover para lixeira"
                                      className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--bad)] hover:bg-[var(--panel-raised)] cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {folderItems.length > 0 && (
                    <div>
                      <div className="text-[11.5px] font-semibold text-[var(--muted)] mb-2">
                        Pastas ({folderItems.length})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                        {folderItems.map((folder) => (
                          <div
                            key={folder.id}
                            className="group rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] hover:border-[var(--accent)] p-3 flex items-center justify-between gap-2 transition-colors"
                          >
                            <button
                              type="button"
                              onClick={() => void handleOpenItem(folder)}
                              className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                            >
                              <Folder className="w-4 h-4 text-[var(--accent)] shrink-0" />
                              <span className="text-[13px] font-semibold text-[var(--text)] truncate">
                                {folder.name}
                              </span>
                            </button>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setRenameTarget(folder);
                                  setRenameDraft(folder.name);
                                }}
                                title="Renomear pasta"
                                className="p-1 rounded text-[var(--muted)] hover:text-[var(--accent)] cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleTrashItem(folder)}
                                title="Mover pasta para lixeira"
                                className="p-1 rounded text-[var(--muted)] hover:text-[var(--bad)] cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {fileItems.length > 0 && (
                    <div>
                      <div className="text-[11.5px] font-semibold text-[var(--muted)] mb-2">
                        Arquivos ({fileItems.length})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {fileItems.map((file) => {
                          const { label, Icon, colorClass } = getFileTypeMeta(file.mimeType);
                          const isOpeningThisPdf = openingPdfId === file.id;
                          return (
                            <div
                              key={file.id}
                              className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] hover:border-[var(--accent)] p-3.5 flex flex-col justify-between gap-3 transition-colors"
                            >
                              <button
                                type="button"
                                onClick={() => void handleOpenItem(file)}
                                className="text-left flex flex-col gap-2 cursor-pointer"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  {isOpeningThisPdf ? (
                                    <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
                                  ) : (
                                    <Icon className={`w-5 h-5 ${colorClass}`} />
                                  )}
                                  {file.starred && (
                                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                  )}
                                </div>
                                <div className="text-[13px] font-semibold text-[var(--text)] line-clamp-2 leading-snug">
                                  {file.name}
                                </div>
                                <div className="text-[11.5px] text-[var(--muted)] tabular-nums">
                                  {label}
                                  {file.size ? ` · ${formatUploadSize(Number(file.size))}` : ''} ·{' '}
                                  {formatDriveDate(file.modifiedTime)}
                                </div>
                              </button>

                              <div className="pt-2 border-t border-[var(--line)] flex items-center justify-between gap-1">
                                <button
                                  type="button"
                                  onClick={() => void handleOpenItem(file)}
                                  className="text-[11.5px] font-bold text-[var(--accent)] hover:underline cursor-pointer"
                                >
                                  Abrir
                                </button>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => void handleDownloadItem(file)}
                                    title="Baixar"
                                    className="p-1 rounded text-[var(--muted)] hover:text-[var(--accent)] cursor-pointer"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRenameTarget(file);
                                      setRenameDraft(file.name);
                                    }}
                                    title="Renomear"
                                    className="p-1 rounded text-[var(--muted)] hover:text-[var(--accent)] cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void openMoveModal(file)}
                                    title="Mover"
                                    className="p-1 rounded text-[var(--muted)] hover:text-[var(--accent)] cursor-pointer"
                                  >
                                    <FolderInput className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleTrashItem(file)}
                                    title="Mover para lixeira"
                                    className="p-1 rounded text-[var(--muted)] hover:text-[var(--bad)] cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {nextPageToken && !loading && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => void loadDirectory(true, nextPageToken)}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 h-[36px] px-4 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-semibold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-60 cursor-pointer"
                  >
                    {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Carregar mais arquivos
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: New Folder */}
      {createFolderOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateFolderSubmit}
            className="w-full max-w-md rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-5 shadow-xl flex flex-col gap-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-bold text-[var(--text)]">Nova pasta no Google Drive</h3>
              <button
                type="button"
                onClick={() => setCreateFolderOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                Nome da pasta (em {activeView === 'my-drive' ? currentFolder.name : 'Meu Drive'})
              </label>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Ex.: Direito Administrativo"
                className="ce-input w-full"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateFolderOpen(false)}
                className="h-[36px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-semibold text-[var(--text)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingFolder || !newFolderName.trim()}
                className="h-[36px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 cursor-pointer"
              >
                {creatingFolder ? 'Criando…' : 'Criar pasta'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: New Google Doc */}
      {createDocOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateDocSubmit}
            className="w-full max-w-md rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-5 shadow-xl flex flex-col gap-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-bold text-[var(--text)]">Novo Documento Google</h3>
              <button
                type="button"
                onClick={() => setCreateDocOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[var(--muted)] mb-1.5">
                Título do documento (salvo em {activeView === 'my-drive' ? currentFolder.name : 'Meu Drive'})
              </label>
              <input
                type="text"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                placeholder="Ex.: Resumo — Controle de Constitucionalidade"
                className="ce-input w-full"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateDocOpen(false)}
                className="h-[36px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-semibold text-[var(--text)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingDoc}
                className="h-[36px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 cursor-pointer"
              >
                {creatingDoc ? 'Criando…' : 'Criar e abrir Docs'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Rename (Explicit Confirmation) */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleRenameSubmit}
            className="w-full max-w-md rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-5 shadow-xl flex flex-col gap-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-bold text-[var(--text)]">Renomear no Google Drive</h3>
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[12.5px] text-[var(--muted)]">
              Isso alterará o nome de <strong className="text-[var(--text)]">{renameTarget.name}</strong>{' '}
              diretamente na sua conta Google Drive.
            </p>
            <input
              type="text"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className="ce-input w-full"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="h-[36px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-semibold text-[var(--text)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={renaming || !renameDraft.trim()}
                className="h-[36px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 cursor-pointer"
              >
                {renaming ? 'Renomeando…' : 'Confirmar renomeação'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Move to Folder (Explicit Confirmation) */}
      {moveTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-bold text-[var(--text)]">Mover no Google Drive</h3>
              <button
                type="button"
                onClick={() => setMoveTarget(null)}
                className="text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[12.5px] text-[var(--muted)]">
              Escolha a pasta de destino para <strong className="text-[var(--text)]">{moveTarget.name}</strong>:
            </p>

            {/* Move modal breadcrumbs */}
            <div className="flex items-center flex-wrap gap-1 text-[12px] border-b border-[var(--line)] pb-2">
              {movePath.map((node, idx) => (
                <React.Fragment key={node.id}>
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-[var(--muted)]" />}
                  <button
                    type="button"
                    onClick={() => void navigateMoveModal(node, idx)}
                    className={`hover:underline cursor-pointer ${
                      idx === movePath.length - 1
                        ? 'font-bold text-[var(--text)]'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    {node.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            <div className="max-h-[220px] overflow-y-auto divide-y divide-[var(--line)] border border-[var(--line)] rounded-lg">
              {loadingMoveFolders ? (
                <div className="p-4 flex items-center justify-center text-[12px] text-[var(--muted)] gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando pastas…
                </div>
              ) : moveFolders.length === 0 ? (
                <div className="p-4 text-center text-[12px] text-[var(--muted)]">
                  Nenhuma subpasta aqui.
                </div>
              ) : (
                moveFolders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => void navigateMoveModal({ id: folder.id, name: folder.name })}
                    className="w-full px-3 py-2 text-left text-[12.5px] text-[var(--text)] hover:bg-[var(--panel-soft)] flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Folder className="w-4 h-4 text-[var(--accent)] shrink-0" />
                      <span className="truncate">{folder.name}</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                  </button>
                ))
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setMoveTarget(null)}
                className="h-[36px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-semibold text-[var(--text)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmMove()}
                disabled={movingItem}
                className="h-[36px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 cursor-pointer"
              >
                {movingItem
                  ? 'Movendo…'
                  : `Mover para "${movePath[movePath.length - 1]?.name || 'Meu Drive'}"`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
