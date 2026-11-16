import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Cloud,
  CloudDownload,
  CloudUpload,
  Database,
  Download,
  FileJson,
  Folder,
  FolderOpen,
  FolderSearch,
  FolderSync,
  HardDrive,
  RefreshCcw,
  Share2,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { CLOUD_SYNC_FILENAME, DriveFileInfo, DriveFolderSummary } from '../lib/googleDrive';
import {
  CANONICAL_LOCAL_SUBFOLDERS,
  getLocalCategoryList,
  LocalBackupFileInfo,
} from '../lib/localFolderSync';
import { formatUploadSize } from '../lib/parsers';
import { PageHeader, Panel } from '../components/ui/PageHeader';

export const BackupPage: React.FC = () => {
  const {
    db,
    requestConfirm,
    exportBackupJson,
    importBackupJson,
    resetDemoData,
    testLocalIntegrity,
    toast,
    googleUser,
    driveConnected,
    driveTokenReady,
    driveFolderUrl,
    activeDriveFolderName,
    lastCloudSyncAt,
    lastCacheVerifiedAt,
    isSyncingDrive,
    hasPendingCloudChanges,
    drivePermissionNeedsPicker,
    restoreProgress,
    connectGoogleDrive,
    disconnectGoogleDrive,
    clearDriveBrowserCache,
    selectDriveStudyFolder,
    authorizeDriveFolderViaPicker,
    restoreAllFromGoogleDrive,
    syncAllLocalFilesToDrive,
    pickDriveFolderOrFiles,
    inspectDriveFolders,
    saveCloudBackup,
    listCloudBackups,
    restoreCloudBackup,
    deleteCloudBackup,
    pruneOldCloudBackups,
    localFolderConnected,
    localFolderWritable,
    localFolderName,
    localFolderSummary,
    savedLocalFolderMeta,
    hasSavedLocalFolderHandle,
    lastLocalFolderSyncAt,
    lastLocalIncrementalBackupAt,
    isSyncingLocalFolder,
    connectLocalStudyFolder,
    reconnectLocalStudyFolder,
    importLocalStudyFolderFromFiles,
    syncNowWithLocalStudyFolder,
    disconnectLocalStudyFolder,
    saveLocalIncrementalBackupNow,
    listLocalBackups,
    restoreLocalBackup,
    deleteLocalBackup,
  } = useStudy();

  const fileRef = useRef<HTMLInputElement | null>(null);
  const localFolderInputRef = useRef<HTMLInputElement | null>(null);
  const mobileQuickFilesInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [sharingMobileBackup, setSharingMobileBackup] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<DriveFileInfo[]>([]);
  const [localBackups, setLocalBackups] = useState<LocalBackupFileInfo[]>([]);
  const [loadingLocalBackups, setLoadingLocalBackups] = useState(false);
  const [restoringLocalId, setRestoringLocalId] = useState<string | null>(null);
  const [driveFolders, setDriveFolders] = useState<DriveFolderSummary[]>([]);
  const [loadingCloudList, setLoadingCloudList] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [selectedRestoreFolderId, setSelectedRestoreFolderId] = useState<string>('all');
  const [folderImportTarget, setFolderImportTarget] = useState<'auto' | 'pdfs' | 'laws' | 'proofs' | 'summaries'>('auto');
  const [showFolderLinkInput, setShowFolderLinkInput] = useState(false);
  const [customFolderInput, setCustomFolderInput] = useState('');
  const [savingCustomFolder, setSavingCustomFolder] = useState(false);
  const [needsPickerFileConfirmationFolderId, setNeedsPickerFileConfirmationFolderId] = useState<string | null>(null);
  const [integrityReport, setIntegrityReport] = useState<{
    status: string;
    totalRecords: number;
  } | null>(null);

  const refreshLocalList = useCallback(async () => {
    if (!localFolderConnected) {
      setLocalBackups([]);
      return;
    }
    setLoadingLocalBackups(true);
    try {
      const items = await listLocalBackups();
      setLocalBackups(items);
    } finally {
      setLoadingLocalBackups(false);
    }
  }, [listLocalBackups, localFolderConnected]);

  useEffect(() => {
    void refreshLocalList();
  }, [refreshLocalList, lastLocalIncrementalBackupAt, lastLocalFolderSyncAt]);

  const refreshCloudList = useCallback(async () => {
    if (!driveConnected || !driveTokenReady) {
      setCloudBackups([]);
      setDriveFolders([]);
      return;
    }
    setLoadingCloudList(true);
    try {
      const [backupsRes, foldersRes] = await Promise.allSettled([
        listCloudBackups(),
        inspectDriveFolders(),
      ]);
      setCloudBackups(backupsRes.status === 'fulfilled' ? backupsRes.value : []);
      setDriveFolders(foldersRes.status === 'fulfilled' ? foldersRes.value : []);
    } finally {
      setLoadingCloudList(false);
    }
  }, [driveConnected, driveTokenReady, inspectDriveFolders, listCloudBackups]);

  useEffect(() => {
    void refreshCloudList();
  }, [refreshCloudList]);

  const selectedFolderObj = driveFolders.find((f) => f.id === selectedRestoreFolderId);

  const handleRestoreLatestFromDrive = async () => {
    // Acquire OAuth token synchronously inside the user gesture before opening the confirm modal (prevents mobile popup blocker)
    if (!driveConnected || !driveTokenReady) {
      const connected = await connectGoogleDrive();
      if (!connected) return;
    }
    const isAll = !selectedRestoreFolderId || selectedRestoreFolderId === 'all';
    const folderLabel = selectedFolderObj?.fullPath || 'pasta selecionada';
    const ok = await requestConfirm({
      title: isAll ? 'Restaurar dados do Google Drive' : `Restaurar da pasta "${folderLabel}"`,
      description: isAll
        ? 'Esta ação buscará o banco de dados sincronizado mais recente e os arquivos PDFs salvos no Google Drive desta conta, restaurando tudo para este dispositivo. Continuar?'
        : `Esta ação restaurará backups e arquivos compatíveis encontrados dentro da pasta "${folderLabel}" (incluindo subpastas) para este dispositivo. Continuar?`,
      confirmLabel: isAll ? 'Restaurar do Google Drive' : 'Restaurar da pasta selecionada',
    });
    if (!ok) return;
    setNeedsPickerFileConfirmationFolderId(null);
    const res = await restoreAllFromGoogleDrive({
      folderId: selectedRestoreFolderId,
      forceModule: folderImportTarget,
    });
    if ((res.permissionBlockedCount || 0) > 0) {
      setNeedsPickerFileConfirmationFolderId(selectedRestoreFolderId);
    }
    await refreshCloudList();
  };

  const handleCreateFreshWritableFolder = async () => {
    if (!driveConnected || !driveTokenReady) {
      const connected = await connectGoogleDrive();
      if (!connected) return;
    }
    setSavingCustomFolder(true);
    try {
      const ok = await selectDriveStudyFolder({ name: 'Central de Estudos - Materiais' });
      if (ok) {
        await saveCloudBackup();
        await refreshCloudList();
      }
    } finally {
      setSavingCustomFolder(false);
    }
  };

  const handleShareBackupOnMobile = async () => {
    setSharingMobileBackup(true);
    try {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
      const filename = `backup_central_estudos_${dateStr}_${timeStr}.json`;
      const payload = {
        version: 2,
        app: 'Central de Estudos',
        exportedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        userEmail: googleUser?.email || undefined,
        data: db,
      };
      const jsonString = JSON.stringify(payload, null, 2);
      const file = new File([jsonString], filename, { type: 'application/json' });
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };
      if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({
          title: 'Backup Central de Estudos (estuda.gov.br)',
          text: `Backup completo gerado em ${now.toLocaleString('pt-BR')}`,
          files: [file],
        });
        toast('Backup enviado! Escolha "Salvar no Drive", "Arquivos" ou "WhatsApp" no menu do celular.');
        return;
      }
      exportBackupJson();
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      exportBackupJson();
    } finally {
      setSharingMobileBackup(false);
    }
  };

  const handleMobileQuickFilesImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImporting(true);
    try {
      const fileArray = Array.from(files) as File[];
      const jsonFiles = fileArray.filter((f) => f.name.toLowerCase().endsWith('.json'));
      const otherFiles = fileArray.filter((f) => !f.name.toLowerCase().endsWith('.json'));

      for (const jf of jsonFiles) {
        await importBackupJson(jf);
      }
      if (otherFiles.length > 0) {
        await importLocalStudyFolderFromFiles(files);
      }
    } catch (err) {
      toast((err as Error).message || 'Falha ao importar arquivos selecionados.', true);
    } finally {
      setImporting(false);
      if (mobileQuickFilesInputRef.current) {
        mobileQuickFilesInputRef.current.value = '';
      }
    }
  };

  const handleOpenGooglePicker = async (
    mode: 'folders-and-files' | 'files-only' | 'folders-only' = 'folders-and-files',
    parentFolderId?: string,
    autoRestore = true,
  ) => {
    setNeedsPickerFileConfirmationFolderId(null);
    const res = await pickDriveFolderOrFiles({
      mode,
      parentFolderId,
      targetModule: folderImportTarget,
      autoRestore,
    });
    if (res?.folder?.id) {
      setSelectedRestoreFolderId(res.folder.id);
    }
    if ((res?.permissionBlockedCount || 0) > 0 && res?.folder?.id) {
      setNeedsPickerFileConfirmationFolderId(res.folder.id);
    }
    await refreshCloudList();
  };

  const handleApplyCustomFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = customFolderInput.trim();
    if (!val) {
      toast('Informe o nome da pasta ou cole o link/ID da pasta do Google Drive.', true);
      return;
    }
    setSavingCustomFolder(true);
    try {
      const ok = await selectDriveStudyFolder({ name: val });
      if (ok) {
        setShowFolderLinkInput(false);
        setCustomFolderInput('');
        await refreshCloudList();
      }
    } finally {
      setSavingCustomFolder(false);
    }
  };

  const handleSaveCloudNow = async () => {
    const ok = await saveCloudBackup();
    if (ok) await refreshCloudList();
  };

  const handleRestoreSpecificCloud = async (file: DriveFileInfo) => {
    if (!driveConnected || !driveTokenReady) {
      const connected = await connectGoogleDrive();
      if (!connected) return;
    }
    const isIncremental = file.name.startsWith('backup_incremental_central_estudos_');
    const ok = await requestConfirm({
      title: isIncremental ? 'Aplicar backup incremental da nuvem' : 'Restaurar backup da nuvem',
      description: isIncremental
        ? `O arquivo "${file.name}" é incremental e irá atualizar/mesclar apenas os itens alterados sem apagar os demais dados atuais, além de baixar eventuais arquivos faltantes. Continuar?`
        : `Substituir os dados atuais pelo backup "${file.name}" do Google Drive e baixar arquivos faltantes?`,
      confirmLabel: isIncremental ? 'Aplicar alterações incrementais' : 'Restaurar este backup',
      danger: !isIncremental,
    });
    if (!ok) return;
    setRestoringId(file.id);
    try {
      await restoreCloudBackup(file.id);
    } finally {
      setRestoringId(null);
    }
  };

  const handleDeleteSpecificCloud = async (file: DriveFileInfo) => {
    if (!driveConnected || !driveTokenReady) {
      const connected = await connectGoogleDrive();
      if (!connected) return;
    }
    const ok = await requestConfirm({
      title: 'Excluir backup do Google Drive',
      description: `Excluir permanentemente "${file.name}" da sua pasta do Google Drive?`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const removed = await deleteCloudBackup(file.id);
    if (removed) await refreshCloudList();
  };

  const handleRestoreJson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast('Selecione um arquivo de backup .json.', true);
      return;
    }
    const ok = await requestConfirm({
      title: 'Restaurar backup JSON',
      description:
        'A restauração substituirá suas questões, histórico, anotações e leis pelos dados do arquivo selecionado. Continuar?',
      confirmLabel: 'Restaurar backup',
      danger: true,
    });
    if (!ok) return;

    setImporting(true);
    try {
      await importBackupJson(selectedFile);
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="GUARDA PERMANENTE · BACKUP"
        title="Sincronização em nuvem e cópias de segurança"
        description="Restaure todo o seu dossiê diretamente da sua conta Google Drive ou pasta local e emita snapshots de segurança em JSON."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Questões</div>
          <div className="font-mono-num text-[24px] font-extrabold text-[var(--text)] mt-1">
            {db.questions.length}
          </div>
        </article>
        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Simulados realizados</div>
          <div className="font-mono-num text-[24px] font-extrabold text-[var(--text)] mt-1">
            {db.completedSimulations.length}
          </div>
        </article>
        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Anotações de erros</div>
          <div className="font-mono-num text-[24px] font-extrabold text-[var(--text)] mt-1">
            {db.annotations.length}
          </div>
        </article>
        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Pastas de Lei Seca</div>
          <div className="font-mono-num text-[24px] font-extrabold text-[var(--text)] mt-1">
            {Object.keys(db.laws).length}
          </div>
        </article>
      </div>

      <input
        ref={localFolderInputRef}
        type="file"
        multiple
        onChange={async (e) => {
          const files = e.target.files;
          if (!files || files.length === 0) return;
          await importLocalStudyFolderFromFiles(files);
          if (localFolderInputRef.current) {
            localFolderInputRef.current.value = '';
          }
        }}
        className="hidden"
        {...({ webkitdirectory: '', directory: '' } as any)}
      />

      <input
        ref={mobileQuickFilesInputRef}
        type="file"
        multiple
        accept=".json,.pdf,.txt,.md,.doc,.docx,application/json,application/pdf,text/plain"
        onChange={(e) => void handleMobileQuickFilesImport(e)}
        className="hidden"
      />

      <Panel
        title="Modo Smartphone & Compartilhamento Rápido (App Google Drive / WhatsApp / Arquivos)"
        subtitle="Alternativa direta para celulares Android e iPhone: envie ou importe backups e PDFs usando o aplicativo nativo do Google Drive ou Arquivos do seu aparelho, sem depender de janelas pop-up do navegador."
        className="mb-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--accent)]/35 bg-[var(--accent-soft)]/45">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <span className="grid place-items-center w-10 h-10 rounded-xl border border-[var(--accent)]/40 bg-[var(--panel)] text-[var(--accent)] shrink-0">
              <Smartphone className="w-5 h-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <strong className="block text-[13px] font-bold text-[var(--text)]">
                Sincronização Direta com o Aplicativo do Celular
              </strong>
              <span className="block text-[11.5px] text-[var(--muted)] leading-relaxed mt-0.5">
                No smartphone, você pode compartilhar o arquivo de backup direto para o app <strong>Google Drive</strong>, <strong>WhatsApp</strong> ou <strong>Arquivos</strong>, ou importar arquivos salvos no celular com um toque.
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleShareBackupOnMobile()}
              disabled={sharingMobileBackup}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap shadow-xs cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 shrink-0" />
              <span>{sharingMobileBackup ? 'Preparando arquivo…' : 'Enviar p/ App do Drive ou WhatsApp'}</span>
            </button>

            <button
              type="button"
              onClick={() => mobileQuickFilesInputRef.current?.click()}
              disabled={importing || isSyncingLocalFolder}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap shadow-xs cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>{importing ? 'Importando…' : 'Importar Backup (.json) ou PDFs do Celular'}</span>
            </button>
          </div>
        </div>
      </Panel>

      <Panel
        title="Pasta Local do Computador (Leitura e Salvamento 100% Local)"
        subtitle="Vincule uma pasta do seu computador para identificar automaticamente todas as pastas e arquivos usados pelo site e gravar todas as alterações localmente sem depender de login externo."
        className="mb-4"
      >
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)]">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <span className="grid place-items-center w-10 h-10 rounded-xl border border-[var(--accent)]/40 bg-[var(--panel-raised)] text-[var(--accent)] shrink-0">
                <HardDrive className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <strong className="block text-[13px] font-bold text-[var(--text)] break-words sm:truncate">
                  {localFolderConnected
                    ? `Pasta local ativa: ${localFolderName}`
                    : savedLocalFolderMeta
                    ? `Última pasta local lida: ${savedLocalFolderMeta.rootFolderName}`
                    : 'Nenhuma pasta local selecionada'}
                </strong>
                <span className="block text-[11.5px] text-[var(--muted)] leading-relaxed">
                  {localFolderConnected
                    ? localFolderWritable
                      ? lastLocalIncrementalBackupAt
                        ? `Backup incremental automático a cada 10 min ativo · Último incremental: ${new Date(lastLocalIncrementalBackupAt).toLocaleString('pt-BR')}${lastLocalFolderSyncAt ? ` · Último salvamento: ${new Date(lastLocalFolderSyncAt).toLocaleString('pt-BR')}` : ''}`
                        : lastLocalFolderSyncAt
                        ? `Leitura e escrita direta no disco ativas · Backup incremental a cada 10 min · Último salvamento: ${new Date(lastLocalFolderSyncAt).toLocaleString('pt-BR')}`
                        : 'Leitura e escrita direta no disco ativas · Backup incremental automático a cada 10 min'
                      : 'Arquivos importados da pasta local · Alterações salvas automaticamente no banco local do navegador'
                    : 'Selecione sua pasta de estudos no computador para identificar, editar e gerar backups incrementais a cada 10 min localmente'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
              {!localFolderConnected && (hasSavedLocalFolderHandle || savedLocalFolderMeta) && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await reconnectLocalStudyFolder();
                    if (!ok) {
                      const pickRes = await connectLocalStudyFolder();
                      if (pickRes.needsInputFallback) {
                        localFolderInputRef.current?.click();
                      }
                    }
                  }}
                  disabled={isSyncingLocalFolder}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap shadow-xs"
                >
                  <FolderSync className={`w-3.5 h-3.5 shrink-0 ${isSyncingLocalFolder ? 'animate-spin' : ''}`} />
                  <span>Reconectar &ldquo;{savedLocalFolderMeta?.rootFolderName || 'Pasta Local'}&rdquo;</span>
                </button>
              )}

              <button
                type="button"
                onClick={async () => {
                  const res = await connectLocalStudyFolder();
                  if (res.needsInputFallback) {
                    localFolderInputRef.current?.click();
                  }
                }}
                disabled={isSyncingLocalFolder}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap shadow-xs"
              >
                <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                <span>{localFolderConnected ? 'Trocar Pasta Local' : 'Selecionar Pasta Local'}</span>
              </button>

              <button
                type="button"
                onClick={() => localFolderInputRef.current?.click()}
                disabled={isSyncingLocalFolder}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>Importar pasta (seletor do navegador)</span>
              </button>

              {localFolderConnected && (
                <>
                  {localFolderWritable && (
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await saveLocalIncrementalBackupNow();
                        if (ok) await refreshLocalList();
                      }}
                      disabled={isSyncingLocalFolder}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[12px] font-bold hover:opacity-90 disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap shadow-xs"
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>Salvar backup incremental local agora</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void syncNowWithLocalStudyFolder()}
                    disabled={isSyncingLocalFolder}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap shadow-xs"
                  >
                    <FolderSync className={`w-3.5 h-3.5 text-[var(--accent)] shrink-0 ${isSyncingLocalFolder ? 'animate-spin' : ''}`} />
                    <span>{isSyncingLocalFolder ? 'Sincronizando pasta…' : 'Reler e salvar tudo na Pasta Local'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void disconnectLocalStudyFolder()}
                    disabled={isSyncingLocalFolder}
                    className="w-full sm:w-auto px-3 py-2 rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/40 transition-colors text-center whitespace-normal sm:whitespace-nowrap"
                  >
                    Desvincular pasta
                  </button>
                </>
              )}
            </div>
          </div>

          {(localFolderSummary || savedLocalFolderMeta) ? (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <strong className="text-[12.5px] font-bold text-[var(--text)] break-words">
                    Inventário de pastas e arquivos identificados pelo site em &ldquo;{(localFolderSummary || savedLocalFolderMeta)?.rootFolderName}&rdquo;
                  </strong>
                  <span className="block text-[11px] text-[var(--muted)]">
                    Total reconhecido: {(localFolderSummary || savedLocalFolderMeta)?.totalFiles || 0} arquivo(s) e {(localFolderSummary || savedLocalFolderMeta)?.totalFolders || 0} subpasta(s)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {getLocalCategoryList(localFolderSummary || savedLocalFolderMeta)
                  .filter((cat) => cat.key !== 'others' || cat.fileCount > 0)
                  .map((cat) => (
                    <div
                      key={cat.key}
                      className="rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] p-2.5 flex flex-col justify-between gap-1 min-w-0"
                    >
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <span className="text-[11.5px] font-bold text-[var(--text)] truncate">
                          {cat.label}
                        </span>
                        <span className="font-mono-num text-[12px] font-extrabold text-[var(--accent)] shrink-0">
                          {cat.fileCount}
                        </span>
                      </div>
                      <div className="text-[10.5px] text-[var(--muted)] truncate">
                        {cat.fileCount > 0
                          ? `${cat.fileCount} arquivo(s) identificado(s)`
                          : 'Pasta pronta para uso'}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 text-[11.5px] text-[var(--muted)]">
              <strong className="text-[var(--text)]">Estrutura de pastas reconhecida e criada automaticamente na pasta local:</strong>{' '}
              {CANONICAL_LOCAL_SUBFOLDERS.join(' · ')}.
            </div>
          )}

          {localFolderConnected && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <strong className="text-[12px] font-bold text-[var(--text)]">
                    Backups disponíveis na Pasta Local ({localBackups.length})
                  </strong>
                  <span className="block text-[11px] text-[var(--muted)]">
                    Pasta: {localFolderName} / Backups · A cada 10 minutos, apenas as alterações são gravadas em um novo arquivo incremental (cópias antigas nunca são sobrescritas)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshLocalList()}
                  disabled={loadingLocalBackups}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCcw className={`w-3 h-3 ${loadingLocalBackups ? 'animate-spin' : ''}`} />
                  Atualizar lista local
                </button>
              </div>

              {loadingLocalBackups ? (
                <p className="m-0 text-[12px] text-[var(--muted)] py-2">
                  Carregando backups da pasta local…
                </p>
              ) : localBackups.length === 0 ? (
                <p className="m-0 text-[12px] text-[var(--muted)] py-2">
                  Nenhum arquivo JSON listado ainda em {localFolderName}/Backups.{' '}
                  {localFolderWritable
                    ? 'Clique em "Salvar backup incremental local agora" ou aguarde o ciclo automático de 10 minutos.'
                    : 'Use "Selecionar Pasta Local" para permitir leitura e gravação incremental direta em disco.'}
                </p>
              ) : (
                <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto">
                  {localBackups.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] px-3 py-2 min-w-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-[12.5px] font-bold text-[var(--text)] break-all sm:truncate">
                            {item.isCanonicalSync ? 'Espelho Local Automático (Mais recente)' : item.name}
                          </strong>
                          {item.isCanonicalSync ? (
                            <span className="px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-extrabold uppercase">
                              Principal
                            </span>
                          ) : item.isIncremental ? (
                            <span className="px-1.5 py-0.5 rounded bg-[var(--good)]/15 text-[var(--good)] text-[10px] font-extrabold uppercase">
                              Incremental
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-[var(--panel-soft)] border border-[var(--line)] text-[var(--muted)] text-[10px] font-extrabold uppercase">
                              Base
                            </span>
                          )}
                        </div>
                        <span className="block text-[11px] text-[var(--muted)] break-words">
                          {item.subfolder ? `${item.subfolder} · ` : 'Raiz · '}
                          Modificado em {new Date(item.modifiedTime).toLocaleString('pt-BR')} ·{' '}
                          {formatUploadSize(item.size)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await requestConfirm({
                              title: item.isIncremental
                                ? 'Aplicar backup incremental local'
                                : 'Restaurar backup local',
                              description: item.isIncremental
                                ? `O arquivo "${item.name}" é incremental e irá atualizar/mesclar apenas os itens alterados sem apagar os demais dados atuais. Continuar?`
                                : `Substituir os dados atuais pelo backup "${item.name}" salvo na pasta local?`,
                              confirmLabel: item.isIncremental
                                ? 'Aplicar alterações incrementais'
                                : 'Restaurar este backup',
                              danger: !item.isIncremental,
                            });
                            if (!ok) return;
                            setRestoringLocalId(item.id);
                            try {
                              await restoreLocalBackup(item);
                            } finally {
                              setRestoringLocalId(null);
                            }
                          }}
                          disabled={isSyncingLocalFolder || restoringLocalId === item.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)] text-[11.5px] font-bold hover:bg-[var(--accent)] hover:text-white disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {restoringLocalId === item.id ? 'Restaurando…' : 'Restaurar'}
                        </button>
                        {localFolderWritable && (
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await requestConfirm({
                                title: 'Excluir backup da pasta local',
                                description: `Excluir permanentemente "${item.name}" da sua pasta local do computador?`,
                                confirmLabel: 'Excluir',
                                danger: true,
                              });
                              if (!ok) return;
                              const removed = await deleteLocalBackup(item);
                              if (removed) await refreshLocalList();
                            }}
                            disabled={isSyncingLocalFolder}
                            aria-label={`Excluir ${item.name}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/40 text-[11.5px] font-bold transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="Integração com Google Drive e Sincronização em Nuvem"
        subtitle="Vincule sua conta e pasta no Google Drive para sincronizar automaticamente seus dados de estudo, backups periódicos e arquivos PDF entre computadores e celulares."
        className="mb-4"
      >
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)]">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <span className="grid place-items-center w-10 h-10 rounded-xl border border-[var(--line)] bg-[var(--panel-raised)] shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <strong className="block text-[13px] font-bold text-[var(--text)] break-words sm:truncate">
                  {driveConnected
                    ? `Conta vinculada: ${googleUser?.email || googleUser?.displayName || 'Google Drive'}`
                    : 'Conta Google Drive desconectada'}
                </strong>
                <span className="block text-[11.5px] text-[var(--muted)] leading-relaxed">
                  {driveConnected
                    ? driveTokenReady
                      ? lastCloudSyncAt
                        ? `Pasta ativa: "${activeDriveFolderName}" · Última sincronização: ${new Date(lastCloudSyncAt).toLocaleString('pt-BR')}`
                        : `Pasta ativa: "${activeDriveFolderName}" · Sincronização automática ativa`
                      : `Conta vinculada (${googleUser?.email || 'Google'}), mas a permissão do Drive expirou — toque em Reconectar Drive`
                    : 'Nenhuma conta Google vinculada no momento. Conecte para ativar backups automáticos na nuvem'}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
              {(!driveConnected || !driveTokenReady) && (
                <button
                  type="button"
                  onClick={() => void connectGoogleDrive()}
                  disabled={isSyncingDrive}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap shadow-xs"
                >
                  <Cloud className="w-3.5 h-3.5 shrink-0" />
                  <span>{driveConnected ? 'Reconectar Drive' : 'Conectar Google Drive'}</span>
                </button>
              )}
              {driveConnected && driveTokenReady && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleCreateFreshWritableFolder()}
                    disabled={isSyncingDrive || savingCustomFolder}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--good)] bg-[var(--good)]/12 text-[12px] font-bold text-[var(--good)] hover:bg-[var(--good)] hover:text-white disabled:opacity-60 transition-colors text-center whitespace-normal sm:whitespace-nowrap"
                  >
                    <FolderSync className="w-3.5 h-3.5 shrink-0" />
                    <span>{savingCustomFolder ? 'Ativando pasta…' : 'Ativar Pasta Automática (Celular/Direto)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleOpenGooglePicker('folders-only', undefined, false)}
                    disabled={isSyncingDrive}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--accent)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:bg-[var(--accent-soft)] disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap"
                  >
                    <FolderSearch className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span>Escolher pasta no Drive</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFolderLinkInput((v) => !v)}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] text-center whitespace-normal sm:whitespace-nowrap"
                  >
                    <Folder className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span>Nome / Link da pasta</span>
                  </button>
                </>
              )}
              {driveFolderUrl && (
                <a
                  href={driveFolderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] text-center whitespace-normal sm:whitespace-nowrap"
                >
                  Abrir pasta no Drive ↗
                </a>
              )}
              {driveConnected && (
                <button
                  type="button"
                  onClick={() => disconnectGoogleDrive()}
                  className="w-full sm:w-auto px-3 py-2 rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/40 transition-colors text-center whitespace-normal sm:whitespace-nowrap"
                >
                  Desconectar
                </button>
              )}
            </div>
          </div>

          {driveConnected && driveTokenReady && drivePermissionNeedsPicker && (
            <div className="rounded-xl border border-[var(--warning)]/60 bg-[var(--warning)]/10 p-3.5 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <strong className="block text-[12.5px] font-bold text-[var(--text)]">
                  Autorização necessária para acessar a pasta &ldquo;{drivePermissionNeedsPicker.folderName}&rdquo;
                </strong>
                <span className="block text-[11.5px] text-[var(--muted)] mt-0.5 leading-relaxed">
                  No celular, toque em <strong>Ativar Pasta Sincronizada Automática</strong> para criar/vincular imediatamente uma pasta 100% liberada no seu Google Drive sem precisar do seletor em janela.
                </span>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreateFreshWritableFolder()}
                  disabled={isSyncingDrive || savingCustomFolder}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[12px] font-bold hover:opacity-95 disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap shadow-xs"
                >
                  <FolderSync className="w-3.5 h-3.5 shrink-0" />
                  <span>Ativar Pasta Sincronizada Automática</span>
                </button>
                <button
                  type="button"
                  onClick={() => void authorizeDriveFolderViaPicker()}
                  disabled={isSyncingDrive}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap shadow-xs"
                >
                  <FolderSearch className="w-3.5 h-3.5 shrink-0" />
                  <span>Autorizar via Seletor do Drive</span>
                </button>
              </div>
            </div>
          )}

          {showFolderLinkInput && driveConnected && driveTokenReady && (
            <form
              onSubmit={handleApplyCustomFolder}
              className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 p-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--panel-soft)]"
            >
              <input
                type="text"
                value={customFolderInput}
                onChange={(e) => setCustomFolderInput(e.target.value)}
                placeholder="Nome da pasta no Drive (ex.: Meus Estudos) ou cole o link/ID da pasta..."
                className="ce-input flex-1 min-w-0 w-full sm:w-auto sm:min-w-[240px]"
              />
              <button
                type="submit"
                disabled={savingCustomFolder}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 h-[38px] px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap"
              >
                {savingCustomFolder ? 'Aplicando…' : 'Associar pasta'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFolderLinkInput(false);
                  setCustomFolderInput('');
                }}
                className="w-full sm:w-auto h-[38px] px-3 rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
              >
                Cancelar
              </button>
            </form>
          )}

          {driveConnected && driveTokenReady && (
            <div className="flex flex-col gap-2.5 p-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] min-w-0">
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] gap-2.5 min-w-0">
                <div className="flex flex-col gap-1 min-w-0">
                  <label
                    htmlFor="restore-folder-select"
                    className="text-[11.5px] font-bold text-[var(--text)] flex items-center gap-1.5"
                  >
                    <FolderSearch className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    <span>Pasta de origem para restaurar dados e arquivos:</span>
                  </label>
                  <select
                    id="restore-folder-select"
                    value={selectedRestoreFolderId}
                    onChange={(e) => {
                      setSelectedRestoreFolderId(e.target.value);
                      setNeedsPickerFileConfirmationFolderId(null);
                    }}
                    className="ce-input w-full max-w-full min-w-0 h-[36px] py-0 px-2.5 text-[12px] font-semibold truncate"
                  >
                    <option value="all">
                      Todas as pastas associadas da conta (Restauração completa)
                    </option>
                    {driveFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.fullPath} ({folder.studyFileCount} compatível / {folder.fileCount} arquivo(s))
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1 min-w-0">
                  <label
                    htmlFor="restore-module-select"
                    className="text-[11.5px] font-bold text-[var(--text)]"
                  >
                    Módulo de destino dos arquivos:
                  </label>
                  <select
                    id="restore-module-select"
                    value={folderImportTarget}
                    onChange={(e) => setFolderImportTarget(e.target.value as any)}
                    className="ce-input w-full max-w-full min-w-0 h-[36px] py-0 px-2.5 text-[12px] font-semibold"
                  >
                    <option value="auto">Detectar automaticamente</option>
                    <option value="pdfs">PDFs Pessoais</option>
                    <option value="laws">Lei Seca</option>
                    <option value="proofs">Provas</option>
                    <option value="summaries">Resumos & Mapas</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-[var(--line)]/60">
                <span className="text-[11px] text-[var(--muted)]">
                  Navegue pelas suas pastas e arquivos do Meu Drive pelo seletor oficial ou use a lista de pastas acima no celular:
                </span>
                <button
                  type="button"
                  onClick={() => void handleOpenGooglePicker('folders-and-files')}
                  disabled={isSyncingDrive}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:bg-[var(--accent-soft)] disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap"
                >
                  <FolderSearch className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>Escolher pasta ou arquivos no Google Drive</span>
                </button>
              </div>

              {needsPickerFileConfirmationFolderId && (
                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2 p-2.5 rounded-lg border border-[var(--warning)]/50 bg-[var(--warning)]/10">
                  <span className="text-[11.5px] text-[var(--text)]">
                    Alguns arquivos dessa pasta foram enviados fora do aplicativo. Selecione-os no Google Drive ou importe-os diretamente do celular:
                  </span>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void handleOpenGooglePicker('files-only', needsPickerFileConfirmationFolderId)
                      }
                      disabled={isSyncingDrive}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] text-center whitespace-normal sm:whitespace-nowrap"
                    >
                      <CloudDownload className="w-3.5 h-3.5 shrink-0" />
                      <span>Selecionar arquivos no Drive</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => mobileQuickFilesInputRef.current?.click()}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] text-[11.5px] font-bold hover:border-[var(--accent)] text-center whitespace-normal sm:whitespace-nowrap"
                    >
                      <Upload className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <span>Importar do aparelho</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleRestoreLatestFromDrive()}
              disabled={isSyncingDrive}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap shadow-xs"
            >
              <CloudDownload className="w-4 h-4 shrink-0" />
              <span>
                {isSyncingDrive
                  ? 'Sincronizando com o Drive…'
                  : selectedRestoreFolderId !== 'all' && selectedFolderObj
                  ? `Restaurar da pasta "${selectedFolderObj.name}"`
                  : 'Restaurar dados e arquivos do Google Drive'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleSaveCloudNow()}
              disabled={isSyncingDrive}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[12.5px] font-bold hover:opacity-90 disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap shadow-xs"
            >
              <CloudUpload className="w-4 h-4 shrink-0" />
              <span>Salvar backup incremental na nuvem agora</span>
            </button>

            <button
              type="button"
              onClick={() => void syncAllLocalFilesToDrive()}
              disabled={isSyncingDrive}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap shadow-xs"
            >
              <FolderSync className="w-3.5 h-3.5 text-[var(--good)] shrink-0" />
              <span>{isSyncingDrive ? 'Sincronizando acervo…' : 'Sincronizar acervo local agora'}</span>
            </button>

            <button
              type="button"
              onClick={() => void refreshCloudList()}
              disabled={loadingCloudList || !driveConnected || !driveTokenReady}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50 text-center whitespace-normal sm:whitespace-nowrap"
            >
              <RefreshCcw className={`w-3.5 h-3.5 shrink-0 ${loadingCloudList ? 'animate-spin' : ''}`} />
              <span>Verificar pastas e backups do Drive</span>
            </button>
          </div>

          <div className="ce-notice ce-notice-accent text-[11.5px] leading-relaxed flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <strong className="text-[var(--text)]">Cache local do navegador e restauração inteligente:</strong>{' '}
              Ao fazer login com sua conta Google ({googleUser?.email || 'ambiente offline/local'}), o sistema compara as assinaturas da pasta ativa (&ldquo;{activeDriveFolderName}&rdquo;) com o cache do navegador. Quando não há alterações no Drive, a restauração completa é dispensada automaticamente.{' '}
              <span className="font-semibold text-[var(--text)]">
                {lastCacheVerifiedAt
                  ? `Cache verificado em ${new Date(lastCacheVerifiedAt).toLocaleString('pt-BR')}.`
                  : 'Sem verificação em cache ainda.'}
              </span>
            </div>
            {driveConnected && (
              <button
                type="button"
                onClick={() => void clearDriveBrowserCache()}
                disabled={isSyncingDrive}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCcw className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>Limpar cache local</span>
              </button>
            )}
          </div>

          {hasPendingCloudChanges && (!driveConnected || !driveTokenReady || drivePermissionNeedsPicker) && (
            <div className="ce-notice ce-notice-warning text-[11.5px] leading-relaxed flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2">
              <span className="min-w-0 flex-1">
                <strong className="text-[var(--text)]">Alterações locais aguardando envio para a nuvem:</strong>{' '}
                {drivePermissionNeedsPicker
                  ? 'seus dados já estão salvos neste navegador. Ative a pasta sincronizada do Google Drive para enviar suas alterações.'
                  : driveConnected && !driveTokenReady
                  ? 'seus dados já estão seguros no navegador, mas a permissão temporária do Drive expirou. Reconecte para enviar à nuvem.'
                  : 'suas edições estão salvas localmente neste navegador e serão enviadas automaticamente assim que você conectar sua conta Google.'}
              </span>
              {drivePermissionNeedsPicker ? (
                <button
                  type="button"
                  onClick={() => void handleCreateFreshWritableFolder()}
                  disabled={isSyncingDrive || savingCustomFolder}
                  className="w-full sm:w-auto px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap"
                >
                  Ativar pasta no Drive
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void connectGoogleDrive()}
                  disabled={isSyncingDrive}
                  className="w-full sm:w-auto px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 text-center whitespace-normal sm:whitespace-nowrap"
                >
                  {driveConnected ? 'Reconectar agora' : 'Conectar Google Drive'}
                </button>
              )}
            </div>
          )}

          {restoreProgress && (
            <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3">
              <div className="flex items-center justify-between gap-2 text-[11.5px] font-bold text-[var(--text)] mb-1.5">
                <span className="truncate">{restoreProgress.label}</span>
                <span className="font-mono-num text-[var(--accent)] shrink-0">
                  {restoreProgress.current} de {restoreProgress.total} arquivos
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--panel)] border border-[var(--line)] overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] transition-all duration-200"
                  style={{ width: `${Math.round((restoreProgress.current / Math.max(1, restoreProgress.total)) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {driveConnected && driveTokenReady && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <strong className="text-[12px] font-bold text-[var(--text)]">
                    Backups disponíveis no Google Drive ({cloudBackups.length})
                  </strong>
                  <span className="block text-[11px] text-[var(--muted)]">
                    Pasta: {activeDriveFolderName} / Backups · Apenas alterações geram novos backups incrementais (cópias existentes nunca são substituídas ou removidas automaticamente)
                  </span>
                </div>
                {cloudBackups.filter((b) => b.name !== CLOUD_SYNC_FILENAME).length > 20 && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await requestConfirm({
                        title: 'Remover backups antigos manualmente',
                        description:
                          'Deseja excluir os backups datados excedentes do Google Drive mantendo apenas os 20 mais recentes? Esta ação é manual e irreversível.',
                        confirmLabel: 'Limpar excedentes (manter 20)',
                        danger: true,
                      });
                      if (!ok) return;
                      await pruneOldCloudBackups(20);
                      await refreshCloudList();
                    }}
                    disabled={isSyncingDrive}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50 whitespace-nowrap"
                  >
                    <Trash2 className="w-3 h-3" />
                    Limpar antigos (manter 20)
                  </button>
                )}
              </div>

              {loadingCloudList ? (
                <p className="m-0 text-[12px] text-[var(--muted)] py-2">
                  Carregando backups do Google Drive…
                </p>
              ) : cloudBackups.length === 0 ? (
                <p className="m-0 text-[12px] text-[var(--muted)] py-2">
                  Nenhum arquivo de backup JSON encontrado ainda no Drive. Toque em &ldquo;Salvar backup incremental na nuvem agora&rdquo; para criar seu primeiro snapshot.
                </p>
              ) : (
                <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto">
                  {cloudBackups.map((item) => {
                    const isCanonical = item.name === CLOUD_SYNC_FILENAME;
                    const isIncremental = item.name.startsWith('backup_incremental_central_estudos_');
                    const isInActive = item.isInActiveFolder !== false;
                    const dateStr = item.modifiedTime || item.createdTime;
                    const formattedDate = dateStr
                      ? new Date(dateStr).toLocaleString('pt-BR')
                      : 'Data indisponível';
                    return (
                      <div
                        key={item.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] px-3 py-2 min-w-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <strong className="text-[12.5px] font-bold text-[var(--text)] break-all sm:truncate">
                              {isCanonical ? 'Sincronização Automática (Mais recente)' : item.name}
                            </strong>
                            {isCanonical ? (
                              <span className="px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-extrabold uppercase">
                                Principal
                              </span>
                            ) : isIncremental ? (
                              <span className="px-1.5 py-0.5 rounded bg-[var(--good)]/15 text-[var(--good)] text-[10px] font-extrabold uppercase">
                                Incremental
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-[var(--panel-soft)] border border-[var(--line)] text-[var(--muted)] text-[10px] font-extrabold uppercase">
                                Base
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                isInActive
                                  ? 'bg-[var(--good)]/15 text-[var(--good)]'
                                  : 'bg-[var(--warning)]/15 text-[var(--warning)]'
                              }`}
                            >
                              {isInActive ? 'Pasta ativa' : 'Outra pasta'}
                            </span>
                          </div>
                          <span className="block text-[11px] text-[var(--muted)] break-words">
                            {item.folderPath ? `${item.folderPath} · ` : ''}Atualizado em {formattedDate}
                            {item.size ? ` · ${formatUploadSize(Number(item.size))}` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleRestoreSpecificCloud(item)}
                            disabled={isSyncingDrive || restoringId === item.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)] text-[11.5px] font-bold hover:bg-[var(--accent)] hover:text-white disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            <CloudDownload className="w-3.5 h-3.5" />
                            {restoringId === item.id ? 'Restaurando…' : 'Restaurar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSpecificCloud(item)}
                            disabled={isSyncingDrive}
                            aria-label={`Excluir ${item.name}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/40 text-[11.5px] font-bold transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="O que é feito em cada tipo de backup"
        subtitle="Entenda exatamente quais dados e arquivos são salvos ou restaurados em cada rotina automática e manual."
        className="mb-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <article className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--text)]">
              <RefreshCcw className="w-4 h-4 text-[var(--accent)] shrink-0" />
              Sincronização contínua (incremental)
            </div>
            <p className="m-0 text-[11.5px] text-[var(--muted)] leading-relaxed">
              Quando há alteração real nos dados (validada por hash de conteúdo), aplica apenas as mudanças sobre o espelho{' '}
              <strong className="text-[var(--text)] break-all">central_estudos_sync_latest.json</strong> na pasta{' '}
              <strong className="text-[var(--text)]">Backups</strong>. Sem alterações, nada é reenviado.
            </p>
          </article>

          <article className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--text)]">
              <Clock className="w-4 h-4 text-[var(--good)] shrink-0" />
              Backup incremental local automático (10 min)
            </div>
            <p className="m-0 text-[11.5px] text-[var(--muted)] leading-relaxed">
              A cada <strong className="text-[var(--text)]">10 minutos</strong>, com a Pasta Local vinculada, verifica mudanças desde o último backup local. Se houver alterações, grava{' '}
              <strong className="text-[var(--text)] break-all">Backups/backup_incremental_central_estudos_…json</strong> e atualiza o espelho{' '}
              <strong className="text-[var(--text)] break-all">central_estudos_sync_latest.json</strong> diretamente no disco, preservando cópias anteriores.
            </p>
          </article>

          <article className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--text)]">
              <Clock className="w-4 h-4 text-[var(--accent)] shrink-0" />
              Backup incremental automático no Drive (30 min)
            </div>
            <p className="m-0 text-[11.5px] text-[var(--muted)] leading-relaxed">
              Quando conectado ao Google Drive, a cada 30 minutos verifica mudanças desde a última cópia na nuvem e cria um novo arquivo datado (
              <strong className="text-[var(--text)] break-all">backup_incremental_central_estudos_…json</strong>) contendo{' '}
              <strong className="text-[var(--text)]">apenas os itens alterados ou novos</strong>, sem substituir nem apagar backups existentes.
            </p>
          </article>

          <article className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--text)]">
              <CloudUpload className="w-4 h-4 text-[var(--good)] shrink-0" />
              Salvar backup incremental na nuvem agora
            </div>
            <p className="m-0 text-[11.5px] text-[var(--muted)] leading-relaxed">
              Calcula imediatamente o delta dos itens modificados desde a última cópia e grava um novo snapshot incremental no Drive. Se nada mudou, preserva os arquivos existentes sem duplicação.
            </p>
          </article>

          <article className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--text)]">
              <FolderSync className="w-4 h-4 text-[var(--good)] shrink-0" />
              Sincronizar acervo local agora (PDFs)
            </div>
            <p className="m-0 text-[11.5px] text-[var(--muted)] leading-relaxed">
              Os arquivos PDF/binários não ficam dentro do JSON. Este botão verifica PDFs Pessoais, Lei Seca, Provas, Resumos e Discursivas salvos localmente e envia apenas os faltantes, sem substituir os já existentes.
            </p>
          </article>

          <article className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--text)]">
              <CloudDownload className="w-4 h-4 text-[var(--accent)] shrink-0" />
              Restaurar dados e arquivos do Drive
            </div>
            <p className="m-0 text-[11.5px] text-[var(--muted)] leading-relaxed">
              Baixa o backup base mais recente e aplica em ordem cronológica todos os backups incrementais posteriores, recuperando também os PDFs e materiais compatíveis do Google Drive.
            </p>
          </article>

          <article className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--text)]">
              <FileJson className="w-4 h-4 text-[var(--accent)] shrink-0" />
              Exportar / Restaurar JSON local
            </div>
            <p className="m-0 text-[11.5px] text-[var(--muted)] leading-relaxed">
              Gera uma cópia offline em <strong className="text-[var(--text)]">.json</strong> ou importa tanto snapshots completos quanto arquivos incrementais baixados da Pasta Local ou do Drive (mesclando apenas o que foi alterado).
            </p>
          </article>
        </div>

        <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 text-[11.5px] text-[var(--muted)] leading-relaxed flex items-start gap-2.5">
          <Database className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <strong className="text-[var(--text)]">Escopo coberto pelo diff incremental (10 min Local / 30 min Nuvem):</strong>{' '}
            questões, simulados enviados e realizados, histórico de acertos/erros, tempo de estudo, Caderno de Erros (com revisões), Súmulas e Jurisprudência, Pontos Críticos, Concursos (Datas &amp; Locais),{' '}
            <strong className="text-[var(--text)]">Editais e pontos marcados</strong>, Cronograma semanal, Metas concluídas e não concluídas, pastas de Lei Seca e Matriz de Incidência (dispositivos, graus, dicas, grifos e{' '}
            <strong className="text-[var(--text)]">datas de leitura por lei e por artigo</strong>), metadados/correções de documentos (PDFs, Resumos, Provas, Discursivas), frases motivacionais e preferências. Apenas seções e itens efetivamente alterados são gravados em cada backup incremental.
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Panel
          title="Exportar cópia de segurança (.json)"
          subtitle="Baixa para este dispositivo um arquivo JSON com todas as questões, histórico, leis, datas de leitura, editais, metas, súmulas e preferências."
        >
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
            <button
              type="button"
              onClick={() => exportBackupJson()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap shadow-xs"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Exportar backup JSON</span>
            </button>
            <button
              type="button"
              onClick={() => void handleShareBackupOnMobile()}
              disabled={sharingMobileBackup}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap"
            >
              <Share2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>Compartilhar no Celular</span>
            </button>
          </div>
        </Panel>

        <Panel
          title="Restaurar a partir de JSON local"
          subtitle="Carrega um snapshot .json exportado anteriormente do computador ou celular para restaurar todos os registros de estudo."
        >
          <form onSubmit={handleRestoreJson} className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center">
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="ce-input flex-1 min-w-0 w-full sm:w-auto sm:min-w-[180px]"
            />
            <button
              type="submit"
              disabled={importing}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 h-[38px] px-4 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap shadow-xs"
            >
              <Upload className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
              <span>{importing ? 'Restaurando…' : 'Restaurar arquivo'}</span>
            </button>
          </form>
        </Panel>

        <Panel
          title="Verificar integridade local"
          subtitle="Checa consistência estrutural dos registros armazenados no navegador."
        >
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIntegrityReport(testLocalIntegrity())}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap shadow-xs"
            >
              <ShieldCheck className="w-4 h-4 text-[var(--good)] shrink-0" />
              <span>Executar verificação</span>
            </button>
            {integrityReport && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--good)] font-mono-num">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {integrityReport.status} · {integrityReport.totalRecords} registros
              </span>
            )}
          </div>
        </Panel>

        <Panel
          title="Restaurar dados iniciais de demonstração"
          subtitle="Reinicia a base com o conjunto padrão de exemplo e recria os PDFs demonstrativos."
        >
          <button
            type="button"
            onClick={() => void resetDemoData()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--bad)]/60 bg-[var(--bad)]/15 text-[12.5px] font-bold text-[var(--bad)] hover:bg-[var(--bad)] hover:text-white transition-colors whitespace-nowrap shadow-xs"
          >
            <RefreshCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Restaurar dados de demonstração</span>
          </button>
        </Panel>
      </div>
    </div>
  );
};
