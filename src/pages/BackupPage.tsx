import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Cloud,
  CloudDownload,
  CloudUpload,
  Download,
  ExternalLink,
  Folder,
  FolderSearch,
  FolderSync,
  Lock,
  RefreshCcw,
  Settings2,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { encryptBackupJson } from '../lib/cryptoBackup';
import { CLOUD_SYNC_FILENAME, DriveFileInfo, DriveFolderSummary } from '../lib/googleDrive';
import { formatUploadSize } from '../lib/parsers';
import { PageHeader, Panel } from '../components/ui/PageHeader';
import { SyncActivityLogPanel } from '../components/backup/SyncActivityLogPanel';
import { AppsScriptSetupPanel } from '../components/backup/AppsScriptSetupPanel';
import { GasConnectionMonitorPanel } from '../components/backup/GasConnectionMonitor';
import { ActiveSyncPanel } from '../components/backup/ActiveSyncPanel';
import { ConflictHistoryPanel } from '../components/backup/ConflictHistoryPanel';
import { SyncAuditPanel } from '../components/backup/SyncAuditPanel';

type DrawerKey = 'cloud' | 'audit' | 'maintenance';

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
    gasConnected,
    gasSession,
    driveConnected,
    driveTokenReady,
    isRenewingDriveToken,
    driveFolderUrl,
    activeDriveFolderId,
    activeDriveFolderName,
    lastCloudSyncAt,
    lastCacheVerifiedAt,
    isSyncingDrive,
    hasPendingCloudChanges,
    drivePermissionNeedsPicker,
    restoreProgress,
    cancelDriveRestore,
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
    driveUploadOutboxItems,
    driveUploadOutboxCount,
    flushDriveUploadOutboxNow,
    localRestorePoints,
    createManualRestorePoint,
    restoreFromLocalRestorePoint,
    deleteLocalRestorePointById,
    gasOperationQueue,
    driveSyncConflicts,
    conflictHistory,
  } = useStudy();

  const fileRef = useRef<HTMLInputElement | null>(null);
  const mobileQuickFilesInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [sharingMobileBackup, setSharingMobileBackup] = useState(false);
  const [showExportEncryption, setShowExportEncryption] = useState(false);
  const [showImportEncryption, setShowImportEncryption] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');

  const [cloudBackups, setCloudBackups] = useState<DriveFileInfo[]>([]);
  const [driveFolders, setDriveFolders] = useState<DriveFolderSummary[]>([]);
  const [loadingCloudList, setLoadingCloudList] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [selectedRestoreFolderId, setSelectedRestoreFolderId] = useState<string>(
    () => activeDriveFolderId || 'all',
  );
  const [folderImportTarget, setFolderImportTarget] = useState<
    'auto' | 'pdfs' | 'laws' | 'proofs' | 'summaries'
  >('auto');
  const [showFolderLinkInput, setShowFolderLinkInput] = useState(false);
  const [customFolderInput, setCustomFolderInput] = useState('');
  const [savingCustomFolder, setSavingCustomFolder] = useState(false);
  const [needsPickerFileConfirmationFolderId, setNeedsPickerFileConfirmationFolderId] = useState<
    string | null
  >(null);
  const [integrityReport, setIntegrityReport] = useState<{
    status: string;
    totalRecords: number;
  } | null>(null);

  const [openDrawers, setOpenDrawers] = useState<Record<DrawerKey, boolean>>({
    cloud: false,
    audit: false,
    maintenance: false,
  });

  const toggleDrawer = (key: DrawerKey) => {
    setOpenDrawers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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

  useEffect(() => {
    if (activeDriveFolderId) {
      setSelectedRestoreFolderId((prev) =>
        prev === activeDriveFolderId ? prev : activeDriveFolderId,
      );
    }
  }, [activeDriveFolderId]);

  const selectedFolderObj = driveFolders.find((f) => f.id === selectedRestoreFolderId);

  const isCloudReady = gasConnected || (driveConnected && driveTokenReady);
  const pendingAttentionCount =
    gasOperationQueue.length + driveUploadOutboxCount + driveSyncConflicts.length;

  const accountLabel =
    googleUser?.email ||
    googleUser?.displayName ||
    gasSession?.username ||
    'Conta vinculada';

  const handleRestoreLatestFromDrive = async () => {
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
      setOpenDrawers((prev) => ({ ...prev, cloud: true }));
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
    const pass = exportPassphrase.trim();
    try {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
      const filename = `backup_central_estudos_${dateStr}_${timeStr}${pass ? '_protegido' : ''}.json`;
      const payload = {
        version: 2,
        app: 'Central de Estudos',
        exportedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        userEmail: googleUser?.email || gasSession?.username || undefined,
        data: db,
      };
      const rawJson = JSON.stringify(payload, null, 2);
      const jsonString = pass
        ? JSON.stringify(await encryptBackupJson(rawJson, pass), null, 2)
        : rawJson;
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
      await exportBackupJson(pass ? { passphrase: pass } : undefined);
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      try {
        await exportBackupJson(pass ? { passphrase: pass } : undefined);
      } catch (exportErr) {
        toast((exportErr as Error).message, true);
      }
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
      if (jsonFiles.length === 0 && otherFiles.length > 0) {
        toast('Selecione um backup .json ou importe PDFs diretamente no módulo desejado.', true);
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
      const pass = importPassphrase.trim();
      await importBackupJson(selectedFile, pass ? { passphrase: pass } : undefined);
      setSelectedFile(null);
      setImportPassphrase('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setImporting(false);
    }
  };

  const handleQuickExportJson = () => {
    const pass = exportPassphrase.trim();
    void exportBackupJson(pass ? { passphrase: pass } : undefined).catch((err) =>
      toast((err as Error).message, true),
    );
  };

  const handlePruneOldCloudBackups = async () => {
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
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="GUARDA PERMANENTE · BACKUP"
        title="Backup e Sincronização"
        description="Tudo em um só lugar: nuvem, cópias locais em JSON, pontos de restauração e auditoria."
      />

      <input
        ref={mobileQuickFilesInputRef}
        type="file"
        multiple
        accept=".json,application/json"
        onChange={(e) => void handleMobileQuickFilesImport(e)}
        className="hidden"
      />

      {/* 1. PAINEL PRINCIPAL UNIFICADO: STATUS + RESUMO DA BASE + AÇÕES RÁPIDAS */}
      <section className="ce-panel overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Status da Nuvem */}
          <div className="flex items-start gap-3 min-w-0">
            <span
              className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${
                isCloudReady
                  ? 'bg-[var(--good)]'
                  : isRenewingDriveToken
                  ? 'bg-[var(--warning)]'
                  : 'bg-[var(--muted)]/50'
              }`}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <h2 className="m-0 text-[15px] font-bold text-[var(--text)]">
                  {isCloudReady
                    ? `Nuvem ativa · ${accountLabel}`
                    : isRenewingDriveToken
                    ? 'Renovando sessão na nuvem…'
                    : 'Armazenamento local ativo'}
                </h2>
                {lastCloudSyncAt && (
                  <span className="text-[11.5px] text-[var(--muted)] font-mono-num tabular-nums">
                    Última sync: {new Date(lastCloudSyncAt).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>
              <p className="m-0 mt-1 text-[12px] text-[var(--muted)] leading-relaxed">
                {isCloudReady
                  ? `Pasta ativa: "${activeDriveFolderName}"${
                      pendingAttentionCount > 0
                        ? ` · ${pendingAttentionCount} pendência(s) na auditoria`
                        : ' · Dados sincronizados'
                    }`
                  : 'Suas alterações ficam salvas automaticamente neste navegador. Conecte o Google Drive ou Apps Script abaixo para sincronizar entre dispositivos.'}
              </p>
            </div>
          </div>

          {/* Resumo numérico compacto (substitui os 4 cartões grandes) */}
          <dl className="m-0 grid grid-cols-4 divide-x divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] shrink-0">
            {[
              { label: 'Questões', value: db.questions.length },
              { label: 'Simulados', value: db.completedSimulations.length },
              { label: 'Erros', value: db.annotations.length },
              { label: 'Leis', value: Object.keys(db.laws).length },
            ].map((item) => (
              <div key={item.label} className="px-3 py-2 text-center min-w-[68px]">
                <dt className="text-[10.5px] font-semibold text-[var(--muted)] truncate">
                  {item.label}
                </dt>
                <dd className="m-0 mt-0.5 font-mono-num tabular-nums text-[16px] font-extrabold text-[var(--text)]">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Barra de ações rápidas essenciais */}
        <div className="px-4 sm:px-5 py-3 border-t border-[var(--line)] bg-[var(--panel-soft)]/60 flex flex-wrap items-center gap-2">
          {!isCloudReady && !isRenewingDriveToken ? (
            <button
              type="button"
              onClick={() => void connectGoogleDrive()}
              disabled={isSyncingDrive}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5 shrink-0" />
              <span>{driveConnected ? 'Reconectar nuvem' : 'Conectar nuvem'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSaveCloudNow()}
              disabled={isSyncingDrive}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[12px] font-bold hover:opacity-90 disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              <CloudUpload className="w-3.5 h-3.5 shrink-0" />
              <span>{isSyncingDrive ? 'Sincronizando…' : 'Salvar na nuvem'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleRestoreLatestFromDrive()}
            disabled={isSyncingDrive}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
          >
            <CloudDownload className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>Restaurar da nuvem</span>
          </button>

          <button
            type="button"
            onClick={handleQuickExportJson}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>Exportar JSON</span>
          </button>

          <button
            type="button"
            onClick={() => mobileQuickFilesInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span>{importing ? 'Importando…' : 'Importar JSON'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleShareBackupOnMobile()}
            disabled={sharingMobileBackup}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line)] bg-transparent text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--line-strong)] text-[12px] font-semibold disabled:opacity-60 whitespace-nowrap cursor-pointer sm:ml-auto"
          >
            <Share2 className="w-3.5 h-3.5 shrink-0" />
            <span>{sharingMobileBackup ? 'Preparando…' : 'Compartilhar no celular'}</span>
          </button>
        </div>

        {/* Alertas condicionais: só aparecem quando realmente há ação necessária */}
        {restoreProgress && (
          <div className="px-4 sm:px-5 py-3 border-t border-[var(--accent)]/30 bg-[var(--accent-soft)]/50">
            <div className="flex items-center justify-between gap-2 text-[12px] font-bold text-[var(--text)] mb-1.5">
              <span className="truncate">{restoreProgress.label}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono-num tabular-nums text-[var(--accent)]">
                  {restoreProgress.current}/{restoreProgress.total}
                </span>
                <button
                  type="button"
                  onClick={cancelDriveRestore}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--bad)]/40 bg-[var(--panel)] text-[11px] font-bold text-[var(--bad)] hover:border-[var(--bad)] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>Cancelar</span>
                </button>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--panel)] overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-all duration-200"
                style={{
                  width: `${Math.round((restoreProgress.current / Math.max(1, restoreProgress.total)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {driveConnected && driveTokenReady && drivePermissionNeedsPicker && (
          <div className="px-4 sm:px-5 py-3 border-t border-[var(--warning)]/40 bg-[var(--warning)]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5" />
              <div className="text-[12px] text-[var(--text)] min-w-0">
                <strong>Autorização pendente na pasta &ldquo;{drivePermissionNeedsPicker.folderName}&rdquo;.</strong>{' '}
                <span className="text-[var(--muted)]">
                  Ative a pasta automática ou autorize via seletor do Drive.
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleCreateFreshWritableFolder()}
                disabled={isSyncingDrive || savingCustomFolder}
                className="px-3 py-1.5 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[11.5px] font-bold hover:opacity-90 disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                Ativar pasta automática
              </button>
              <button
                type="button"
                onClick={() => void authorizeDriveFolderViaPicker()}
                disabled={isSyncingDrive}
                className="px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                Autorizar via Seletor
              </button>
            </div>
          </div>
        )}

        {hasPendingCloudChanges &&
          (!driveConnected ||
            (!driveTokenReady && !isRenewingDriveToken) ||
            drivePermissionNeedsPicker) && (
            <div className="px-4 sm:px-5 py-2.5 border-t border-[var(--warning)]/35 bg-[var(--warning)]/8 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[12px]">
              <span className="text-[var(--text)]">
                <strong>Alterações locais aguardando envio:</strong> salvas neste navegador até reconectar a nuvem.
              </span>
              <button
                type="button"
                onClick={() =>
                  void (drivePermissionNeedsPicker
                    ? handleCreateFreshWritableFolder()
                    : connectGoogleDrive())
                }
                disabled={isSyncingDrive || savingCustomFolder}
                className="self-start sm:self-auto px-3 py-1 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                {drivePermissionNeedsPicker
                  ? 'Ativar pasta no Drive'
                  : driveConnected
                  ? 'Reconectar agora'
                  : 'Conectar Google Drive'}
              </button>
            </div>
          )}
      </section>

      {/* 2. CÓPIAS DE SEGURANÇA: ARQUIVO JSON (EXPORTAR / RESTAURAR) */}
      <Panel
        title="Backup em arquivo (.json)"
        subtitle="Baixe uma cópia completa para o computador/celular ou restaure um arquivo existente, com opção de criptografia AES-256."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[var(--line)] -mx-4 sm:-mx-5">
          {/* Exportar */}
          <div className="px-4 sm:px-5 pb-4 lg:pb-0 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-[13px] font-bold text-[var(--text)]">
                Exportar ou enviar cópia
              </strong>
              <button
                type="button"
                onClick={() => {
                  setShowExportEncryption((v) => !v);
                  if (showExportEncryption) setExportPassphrase('');
                }}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--accent)] cursor-pointer"
              >
                <Lock className="w-3 h-3" />
                <span>{showExportEncryption ? 'Remover senha' : 'Proteger com senha'}</span>
              </button>
            </div>

            {showExportEncryption && (
              <input
                id="export-backup-pass"
                type="password"
                autoComplete="new-password"
                value={exportPassphrase}
                onChange={(e) => setExportPassphrase(e.target.value)}
                placeholder="Senha AES-256-GCM (mínimo 4 caracteres)"
                className="ce-input"
              />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleQuickExportJson}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {exportPassphrase.trim() ? 'Baixar JSON protegido' : 'Baixar backup (.json)'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleShareBackupOnMobile()}
                disabled={sharingMobileBackup}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>App do Drive / WhatsApp</span>
              </button>
            </div>
          </div>

          {/* Importar */}
          <form
            onSubmit={handleRestoreJson}
            className="px-4 sm:px-5 pt-4 lg:pt-0 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <strong className="text-[13px] font-bold text-[var(--text)]">
                Restaurar de arquivo (.json)
              </strong>
              <button
                type="button"
                onClick={() => {
                  setShowImportEncryption((v) => !v);
                  if (showImportEncryption) setImportPassphrase('');
                }}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--accent)] cursor-pointer"
              >
                <Lock className="w-3 h-3" />
                <span>{showImportEncryption ? 'Ocultar senha' : 'Arquivo com senha?'}</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="ce-input flex-1 min-w-0"
              />
              <button
                type="submit"
                disabled={importing}
                className="inline-flex items-center justify-center gap-1.5 h-[38px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span>{importing ? 'Restaurando…' : 'Restaurar'}</span>
              </button>
            </div>

            {showImportEncryption && (
              <input
                type="password"
                autoComplete="off"
                aria-label="Senha do backup criptografado"
                value={importPassphrase}
                onChange={(e) => setImportPassphrase(e.target.value)}
                placeholder="Digite a senha do arquivo criptografado"
                className="ce-input"
              />
            )}
          </form>
        </div>
      </Panel>

      {/* 3. PONTOS DE RESTAURAÇÃO (NUVEM + LOCAIS) EM UM ÚNICO PAINEL */}
      <Panel
        title="Pontos de restauração (Nuvem e Local)"
        subtitle="Reverta rapidamente para uma versão anterior salva no navegador ou no seu Google Drive."
        action={
          <div className="flex items-center gap-2">
            {driveConnected && driveTokenReady && (
              <button
                type="button"
                onClick={() => void refreshCloudList()}
                disabled={loadingCloudList}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <RefreshCcw className={`w-3.5 h-3.5 ${loadingCloudList ? 'animate-spin' : ''}`} />
                <span>Atualizar nuvem</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void createManualRestorePoint('Snapshot manual criado pelo usuário')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Criar ponto local</span>
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[var(--line)] -mx-4 sm:-mx-5">
          {/* Coluna 1: Backups no Google Drive */}
          <div className="px-4 sm:px-5 pb-4 lg:pb-0 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <strong className="text-[12.5px] font-bold text-[var(--text)]">
                Cópias no Google Drive ({cloudBackups.length})
              </strong>
              {cloudBackups.filter((b) => b.name !== CLOUD_SYNC_FILENAME).length > 20 && (
                <button
                  type="button"
                  onClick={() => void handlePruneOldCloudBackups()}
                  disabled={isSyncingDrive}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--bad)] disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Limpar antigos (manter 20)</span>
                </button>
              )}
            </div>

            {!driveConnected || !driveTokenReady ? (
              <p className="m-0 text-[12px] text-[var(--muted)] leading-relaxed">
                Conecte sua conta Google para visualizar e restaurar snapshots salvos no Drive.
              </p>
            ) : loadingCloudList ? (
              <p className="m-0 text-[12px] text-[var(--muted)]">
                Carregando backups do Google Drive…
              </p>
            ) : cloudBackups.length === 0 ? (
              <p className="m-0 text-[12px] text-[var(--muted)]">
                Nenhum backup encontrado ainda no Drive. Clique em &ldquo;Salvar na nuvem&rdquo; acima para criar o primeiro.
              </p>
            ) : (
              <div className="divide-y divide-[var(--line)] max-h-[260px] overflow-y-auto pr-1">
                {cloudBackups.map((item) => {
                  const isCanonical = item.name === CLOUD_SYNC_FILENAME;
                  const isIncremental = item.name.startsWith('backup_incremental_central_estudos_');
                  const dateStr = item.modifiedTime || item.createdTime;
                  const formattedDate = dateStr
                    ? new Date(dateStr).toLocaleString('pt-BR')
                    : 'Data indisponível';
                  const typeLabel = isCanonical
                    ? 'Principal'
                    : isIncremental
                    ? 'Incremental'
                    : 'Base';
                  const originLabel =
                    item.syncOrigin === 'external-modified'
                      ? 'Alterado fora do app'
                      : item.syncOrigin === 'internal'
                      ? 'App'
                      : 'Externo';

                  return (
                    <div
                      key={item.id}
                      className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5 min-w-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-semibold text-[var(--text)] truncate">
                          {isCanonical ? 'Sincronização Automática (Mais recente)' : item.name}
                        </div>
                        <div className="text-[11px] text-[var(--muted)] font-mono-num truncate mt-0.5">
                          <span
                            className={
                              isCanonical
                                ? 'text-[var(--accent)] font-semibold'
                                : isIncremental
                                ? 'text-[var(--good)] font-semibold'
                                : ''
                            }
                          >
                            {typeLabel}
                          </span>
                          {' · '}
                          {formattedDate}
                          {item.size ? ` · ${formatUploadSize(Number(item.size))}` : ''}
                          {' · '}
                          {originLabel}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleRestoreSpecificCloud(item)}
                          disabled={isSyncingDrive || restoringId === item.id}
                          className="px-2.5 py-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                        >
                          {restoringId === item.id ? 'Restaurando…' : 'Restaurar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteSpecificCloud(item)}
                          disabled={isSyncingDrive}
                          aria-label={`Excluir ${item.name}`}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[var(--line)] text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/50 cursor-pointer"
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

          {/* Coluna 2: Pontos Locais (IndexedDB) */}
          <div className="px-4 sm:px-5 pt-4 lg:pt-0 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <strong className="text-[12.5px] font-bold text-[var(--text)]">
                Snapshots locais no navegador ({localRestorePoints.length}/5)
              </strong>
            </div>

            {localRestorePoints.length === 0 ? (
              <p className="m-0 text-[12px] text-[var(--muted)] leading-relaxed">
                Nenhum snapshot local gravado ainda. Clique em &ldquo;Criar ponto local&rdquo; para salvar um ponto de reversão instantânea neste navegador.
              </p>
            ) : (
              <div className="divide-y divide-[var(--line)] max-h-[260px] overflow-y-auto pr-1">
                {localRestorePoints.map((pt) => (
                  <div
                    key={pt.id}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5 min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-semibold text-[var(--text)] truncate">
                        {pt.label || pt.reason}
                      </div>
                      <div className="text-[11px] text-[var(--muted)] font-mono-num truncate mt-0.5">
                        {new Date(pt.createdAt).toLocaleString('pt-BR')} ·{' '}
                        {formatUploadSize(pt.byteLength)} · {pt.stats?.questions ?? 0} q ·{' '}
                        {pt.stats?.laws ?? 0} lei(s)
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await requestConfirm({
                            title: 'Restaurar ponto de versão local',
                            description: `Deseja reverter o banco de dados para o ponto "${pt.label || pt.reason}" de ${new Date(pt.createdAt).toLocaleString('pt-BR')}? Um snapshot automático do estado atual será salvo antes da reversão.`,
                            confirmLabel: 'Reverter versão',
                          });
                          if (ok) {
                            await restoreFromLocalRestorePoint(pt.id);
                          }
                        }}
                        className="px-2.5 py-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] whitespace-nowrap cursor-pointer"
                      >
                        Reverter
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteLocalRestorePointById(pt.id)}
                        aria-label="Excluir ponto de restauração"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[var(--line)] text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Panel>

      {/* 4. CONFIGURAÇÕES AVANÇADAS, AUDITORIA E MANUTENÇÃO (RECOLHIDAS POR PADRÃO EM 1 ÚNICO BLOCO) */}
      <section className="ce-panel divide-y divide-[var(--line)] overflow-hidden">
        {/* Gaveta A: Conexão, Pasta do Drive & Google Apps Script */}
        <div>
          <button
            type="button"
            aria-expanded={openDrawers.cloud}
            onClick={() => toggleDrawer('cloud')}
            className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--panel-soft)]/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Settings2 className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <div className="min-w-0">
                <strong className="block text-[13px] font-bold text-[var(--text)]">
                  Configurar conta, pasta do Google Drive e Apps Script
                </strong>
                <span className="block text-[11.5px] text-[var(--muted)] truncate">
                  Vincular conta, escolher pasta padrão, sincronizar PDFs locais, Apps Script e cache do navegador
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span
                className={`hidden sm:inline text-[11.5px] font-semibold ${
                  isCloudReady ? 'text-[var(--good)]' : 'text-[var(--muted)]'
                }`}
              >
                {isCloudReady ? activeDriveFolderName : 'Desconectado'}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-[var(--muted)] transition-transform ${
                  openDrawers.cloud ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>

          {openDrawers.cloud && (
            <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-[var(--line)] bg-[var(--panel-soft)]/35 space-y-4">
              {/* Controles de conta e pasta do Drive */}
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block text-[13px] font-bold text-[var(--text)]">
                      {driveConnected
                        ? `Google Drive: ${googleUser?.email || googleUser?.displayName || 'Conectado'}`
                        : 'Google Drive desconectado'}
                    </strong>
                    <span className="block text-[11.5px] text-[var(--muted)] mt-0.5">
                      {driveConnected && driveTokenReady
                        ? `Pasta padrão: "${activeDriveFolderName}"${
                            lastCacheVerifiedAt
                              ? ` · Cache verificado em ${new Date(lastCacheVerifiedAt).toLocaleString('pt-BR')}`
                              : ''
                          }`
                        : 'Conecte sua conta Google ou autentique-se pelo Google Apps Script abaixo.'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {(!driveConnected || (!driveTokenReady && !isRenewingDriveToken)) && (
                      <button
                        type="button"
                        onClick={() => void connectGoogleDrive()}
                        disabled={isSyncingDrive}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                      >
                        <Cloud className="w-3.5 h-3.5" />
                        <span>{driveConnected ? 'Reconectar Google' : 'Conectar Google'}</span>
                      </button>
                    )}
                    {driveFolderUrl && (
                      <a
                        href={driveFolderUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                      >
                        <span>Abrir no Drive</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {driveConnected && (
                      <button
                        type="button"
                        onClick={() => disconnectGoogleDrive()}
                        className="px-3 py-1.5 rounded-lg border border-[var(--line)] text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/40 whitespace-nowrap cursor-pointer"
                      >
                        Desconectar
                      </button>
                    )}
                  </div>
                </div>

                {driveConnected && driveTokenReady && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-2.5 pt-3 border-t border-[var(--line)]">
                      <div className="flex flex-col gap-1 min-w-0">
                        <label
                          htmlFor="restore-folder-select"
                          className="text-[11.5px] font-semibold text-[var(--muted)]"
                        >
                          Pasta padrão de salvamento e leitura
                        </label>
                        <select
                          id="restore-folder-select"
                          value={selectedRestoreFolderId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            setSelectedRestoreFolderId(nextId);
                            setNeedsPickerFileConfirmationFolderId(null);
                            if (nextId && nextId !== 'all' && nextId !== 'root') {
                              const found = driveFolders.find((f) => f.id === nextId);
                              void selectDriveStudyFolder({
                                id: nextId,
                                name: found?.name || activeDriveFolderName,
                              }).then((ok) => {
                                if (ok) void refreshCloudList();
                              });
                            }
                          }}
                          className="ce-input w-full h-[36px] py-0 px-2.5 text-[12px] font-semibold truncate"
                        >
                          {activeDriveFolderId &&
                            !driveFolders.some((f) => f.id === activeDriveFolderId) && (
                              <option value={activeDriveFolderId}>
                                ★ {activeDriveFolderName} (Pasta padrão)
                              </option>
                            )}
                          {driveFolders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.id === activeDriveFolderId ? '★ ' : ''}
                              {folder.fullPath} ({folder.studyFileCount}/{folder.fileCount} arq.)
                            </option>
                          ))}
                          <option value="all">Todas as pastas associadas (Busca global)</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1 min-w-0">
                        <label
                          htmlFor="restore-module-select"
                          className="text-[11.5px] font-semibold text-[var(--muted)]"
                        >
                          Destino de importação
                        </label>
                        <select
                          id="restore-module-select"
                          value={folderImportTarget}
                          onChange={(e) =>
                            setFolderImportTarget(
                              e.target.value as 'auto' | 'pdfs' | 'laws' | 'proofs' | 'summaries',
                            )
                          }
                          className="ce-input w-full h-[36px] py-0 px-2.5 text-[12px] font-semibold"
                        >
                          <option value="auto">Detectar automaticamente</option>
                          <option value="pdfs">PDFs Pessoais</option>
                          <option value="laws">Lei Seca</option>
                          <option value="proofs">Provas</option>
                          <option value="summaries">Resumos &amp; Mapas</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void handleCreateFreshWritableFolder()}
                        disabled={isSyncingDrive || savingCustomFolder}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--good)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                      >
                        <FolderSync className="w-3.5 h-3.5 text-[var(--good)]" />
                        <span>{savingCustomFolder ? 'Ativando…' : 'Pasta automática'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleOpenGooglePicker('folders-and-files')}
                        disabled={isSyncingDrive}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                      >
                        <FolderSearch className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>Escolher pasta/arquivos no Drive</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFolderLinkInput((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                      >
                        <Folder className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>Nome / Link da pasta</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void syncAllLocalFilesToDrive()}
                        disabled={isSyncingDrive}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                      >
                        <CloudUpload className="w-3.5 h-3.5 text-[var(--good)]" />
                        <span>Enviar PDFs locais faltantes</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void clearDriveBrowserCache()}
                        disabled={isSyncingDrive}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line)] text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--line-strong)] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                      >
                        <RefreshCcw className="w-3.5 h-3.5" />
                        <span>Limpar cache local</span>
                      </button>
                    </div>

                    {showFolderLinkInput && (
                      <form
                        onSubmit={handleApplyCustomFolder}
                        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-[var(--line)]"
                      >
                        <input
                          type="text"
                          value={customFolderInput}
                          onChange={(e) => setCustomFolderInput(e.target.value)}
                          placeholder="Nome da pasta no Drive ou cole o link/ID da pasta…"
                          className="ce-input flex-1 min-w-0"
                        />
                        <button
                          type="submit"
                          disabled={savingCustomFolder}
                          className="h-[38px] px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                        >
                          {savingCustomFolder ? 'Aplicando…' : 'Associar pasta'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowFolderLinkInput(false);
                            setCustomFolderInput('');
                          }}
                          className="h-[38px] px-3 rounded-lg border border-[var(--line)] text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </form>
                    )}

                    {needsPickerFileConfirmationFolderId && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg border border-[var(--warning)]/50 bg-[var(--warning)]/10 text-[11.5px]">
                        <span className="text-[var(--text)]">
                          Alguns arquivos dessa pasta foram enviados fora do app. Selecione-os no Drive para liberar a leitura:
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              void handleOpenGooglePicker(
                                'files-only',
                                needsPickerFileConfirmationFolderId,
                              )
                            }
                            disabled={isSyncingDrive}
                            className="px-3 py-1 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold whitespace-nowrap cursor-pointer"
                          >
                            Selecionar no Drive
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Painéis especializados de Apps Script & Sync ativo */}
              <GasConnectionMonitorPanel />
              <ActiveSyncPanel />
              <AppsScriptSetupPanel />
            </div>
          )}
        </div>

        {/* Gaveta B: Auditoria, Conflitos e Fila de Envio */}
        <div>
          <button
            type="button"
            aria-expanded={openDrawers.audit}
            onClick={() => toggleDrawer('audit')}
            className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--panel-soft)]/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ClipboardList className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <div className="min-w-0">
                <strong className="block text-[13px] font-bold text-[var(--text)]">
                  Auditoria, conflitos e fila de envio
                </strong>
                <span className="block text-[11.5px] text-[var(--muted)] truncate">
                  Fila offline (Outbox), histórico de sincronizações, deduplicação SHA-256 e resolução de conflitos
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span
                className={`text-[11.5px] font-mono-num font-semibold ${
                  pendingAttentionCount > 0 ? 'text-[var(--warning)]' : 'text-[var(--muted)]'
                }`}
              >
                {pendingAttentionCount > 0
                  ? `${pendingAttentionCount} pendência(s)`
                  : conflictHistory.length > 0
                  ? `${conflictHistory.length} histórico`
                  : 'Em dia'}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-[var(--muted)] transition-transform ${
                  openDrawers.audit ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>

          {openDrawers.audit && (
            <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-[var(--line)] bg-[var(--panel-soft)]/35 space-y-4">
              {/* Fila Outbox + SHA-256 */}
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="block text-[13px] font-bold text-[var(--text)]">
                      Fila de uploads pendentes ({driveUploadOutboxCount}) &amp; Deduplicação SHA-256
                    </strong>
                    <span className="block text-[11.5px] text-[var(--muted)]">
                      Arquivos PDF/TXT idênticos reutilizam o mesmo hash SHA-256 evitando uploads duplicados.
                    </span>
                  </div>
                  {driveUploadOutboxCount > 0 && (
                    <button
                      type="button"
                      onClick={() => void flushDriveUploadOutboxNow()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[11.5px] font-bold hover:opacity-90 whitespace-nowrap cursor-pointer"
                    >
                      <CloudUpload className="w-3.5 h-3.5" />
                      <span>Reenviar fila ({driveUploadOutboxCount})</span>
                    </button>
                  )}
                </div>

                {driveUploadOutboxItems.length === 0 ? (
                  <p className="m-0 text-[12px] text-[var(--muted)]">
                    Fila vazia — todos os arquivos locais já foram sincronizados ou não há pendências.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--line)] max-h-[180px] overflow-y-auto">
                    {driveUploadOutboxItems.map((item) => (
                      <div
                        key={item.id}
                        className="py-2 flex items-center justify-between gap-2 text-[12px]"
                      >
                        <div className="min-w-0">
                          <strong className="block font-semibold text-[var(--text)] truncate">
                            {item.filename}
                          </strong>
                          <span className="block text-[11px] text-[var(--muted)] truncate">
                            {item.moduleTag || 'Geral'} · {item.lastError || 'Aguardando conexão'}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-[var(--warning)] shrink-0">
                          Na fila
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <SyncAuditPanel />
              <ConflictHistoryPanel />
              <SyncActivityLogPanel />
            </div>
          )}
        </div>

        {/* Gaveta C: Manutenção, Integridade & Como Funciona */}
        <div>
          <button
            type="button"
            aria-expanded={openDrawers.maintenance}
            onClick={() => toggleDrawer('maintenance')}
            className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--panel-soft)]/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Wrench className="w-4 h-4 text-[var(--muted)] shrink-0" />
              <div className="min-w-0">
                <strong className="block text-[13px] font-bold text-[var(--text)]">
                  Manutenção, integridade e detalhes do backup
                </strong>
                <span className="block text-[11.5px] text-[var(--muted)] truncate">
                  Testar integridade local, restaurar base de demonstração e consultar o que cada rotina salva
                </span>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-[var(--muted)] shrink-0 transition-transform ${
                openDrawers.maintenance ? 'rotate-180' : ''
              }`}
            />
          </button>

          {openDrawers.maintenance && (
            <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-[var(--line)] bg-[var(--panel-soft)]/35 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 flex flex-col justify-between gap-3">
                  <div>
                    <strong className="block text-[13px] font-bold text-[var(--text)]">
                      Verificar integridade local
                    </strong>
                    <span className="block text-[11.5px] text-[var(--muted)] mt-0.5">
                      Checa consistência estrutural dos registros armazenados no navegador.
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIntegrityReport(testLocalIntegrity())}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[var(--good)]" />
                      <span>Executar verificação</span>
                    </button>
                    {integrityReport && (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[var(--good)] font-mono-num">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        {integrityReport.status} · {integrityReport.totalRecords} registros
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 flex flex-col justify-between gap-3">
                  <div>
                    <strong className="block text-[13px] font-bold text-[var(--text)]">
                      Restaurar dados de demonstração
                    </strong>
                    <span className="block text-[11.5px] text-[var(--muted)] mt-0.5">
                      Reinicia a base com o conjunto padrão de exemplo e recria os PDFs demonstrativos.
                    </span>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => void resetDemoData()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--bad)]/50 bg-[var(--bad)]/10 text-[12px] font-bold text-[var(--bad)] hover:bg-[var(--bad)] hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" />
                      <span>Restaurar demonstração</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Resumo enxuto de como cada backup funciona */}
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
                <strong className="block text-[12.5px] font-bold text-[var(--text)] mb-2">
                  Como funcionam os backups
                </strong>
                <dl className="m-0 divide-y divide-[var(--line)] text-[11.5px] leading-relaxed">
                  <div className="py-2 first:pt-0 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
                    <dt className="font-semibold text-[var(--text)]">Sync contínua &amp; 30 min</dt>
                    <dd className="m-0 text-[var(--muted)]">
                      Grava apenas alterações reais (diff incremental) em{' '}
                      <span className="font-mono-num text-[var(--text)]">central_estudos_sync_latest.json</span>{' '}
                      e snapshots datados na pasta Backups, sem sobrescrever históricos anteriores.
                    </dd>
                  </div>
                  <div className="py-2 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
                    <dt className="font-semibold text-[var(--text)]">Escopo salvo</dt>
                    <dd className="m-0 text-[var(--muted)]">
                      Questões, simulados, histórico, tempo de estudo, Caderno de Erros, Súmulas, Concursos, Editais, Cronograma, Metas, Lei Seca (incluindo datas de leitura por artigo e grifos), resumos, frases e preferências.
                    </dd>
                  </div>
                  <div className="py-2 last:pb-0 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1">
                    <dt className="font-semibold text-[var(--text)]">PDFs e arquivos binários</dt>
                    <dd className="m-0 text-[var(--muted)]">
                      Ficam armazenados separadamente do JSON (com deduplicação SHA-256). Use &ldquo;Enviar PDFs locais faltantes&rdquo; na seção de nuvem quando quiser garantir que todos os anexos locais estejam no Drive.
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
