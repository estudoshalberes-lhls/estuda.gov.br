import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Eye, FileUp, Folder, FolderPlus, Highlighter, Maximize2, Minimize2, Pencil, RefreshCw, Trash2, X } from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { getFileBlob, triggerBlobDownload } from '../lib/fileStorage';
import { getKnownStudyDriveFolderNames, getPreferredStudyFolder } from '../lib/googleDrive';
import { formatUploadSize, isReservedBackupFolderName, visibleName } from '../lib/parsers';
import { PersonalPdfFile } from '../types/study';
import { PdfAnnotatorViewer } from '../components/ui/PdfAnnotatorViewer';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';

export const PersonalPdfsPage: React.FC = () => {
  const {
    db,
    moduleVisibility,
    requestConfirm,
    createPdfFolder,
    renamePdfFolder,
    uploadPersonalPdfs,
    replacePersonalPdf,
    deletePersonalPdf,
    deletePdfFolder,
    toast,
    driveConnected,
    activeDriveFolderName,
    driveFolderUrl,
    connectGoogleDrive,
    syncAllLocalFilesToDrive,
    isSyncingDrive,
    examFocusMode,
    setExamFocusMode,
  } = useStudy();

  useEffect(() => {
    if (!examFocusMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExamFocusMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [examFocusMode, setExamFocusMode]);

  useEffect(() => () => setExamFocusMode(false), [setExamFocusMode]);

  const hideUpload = moduleVisibility('PDFs Pessoais').hide_upload;
  const folderNames = useMemo(() => {
    const extraBaseNames = [
      activeDriveFolderName,
      getPreferredStudyFolder().name,
      ...getKnownStudyDriveFolderNames(),
    ];
    return Object.keys(db.pdfFolders)
      .filter((name) => !isReservedBackupFolderName(name, extraBaseNames, db.pdfFolders[name]))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [activeDriveFolderName, db.pdfFolders]);

  const [selectedFolder, setSelectedFolder] = useState<string>(folderNames[0] || '');
  const activeFolder = folderNames.includes(selectedFolder)
    ? selectedFolder
    : folderNames[0] || '';

  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renamedValue, setRenamedValue] = useState('');
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [previewPdf, setPreviewPdf] = useState<PersonalPdfFile | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [replaceFileId, setReplaceFileId] = useState<string | null>(null);

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) {
      toast('Informe o nome da pasta.', true);
      return;
    }
    const created = createPdfFolder(newFolderName);
    setSelectedFolder(created);
    setNewFolderName('');
  };

  const handleFilesUpload = async (targetFolder: string, files: File[]) => {
    if (!targetFolder || !files.length) return;
    try {
      const count = await uploadPersonalPdfs(targetFolder, files);
      toast(`${count} PDF(s) salvo(s) na pasta "${visibleName(targetFolder)}".`);
      setSelectedFolder(targetFolder);
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const handleDownload = async (file: PersonalPdfFile) => {
    const blob = await getFileBlob(file.blobKey);
    if (!blob) {
      toast('PDF não encontrado no armazenamento local.', true);
      return;
    }
    triggerBlobDownload(blob, file.name);
  };

  const handleDeleteFolder = async (folder: string) => {
    const ok = await requestConfirm({
      title: 'Remover pasta de PDFs',
      description: `Deseja excluir a pasta "${visibleName(folder)}" e todos os arquivos dentro dela?`,
      confirmLabel: 'Remover pasta',
      danger: true,
    });
    if (!ok) return;
    const removed = await deletePdfFolder(folder);
    toast(`Pasta "${visibleName(folder)}" e ${removed} arquivo(s) removidos.`);
    if (previewPdf) setPreviewPdf(null);
  };

  const handleReplaceTrigger = (id: string) => {
    setReplaceFileId(id);
    replaceInputRef.current?.click();
  };

  const handleReplaceChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = replaceFileId;
    e.target.value = '';
    setReplaceFileId(null);
    if (!file || !id || !activeFolder) return;
    try {
      await replacePersonalPdf(activeFolder, id, file);
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const activeFiles = activeFolder ? db.pdfFolders[activeFolder] || [] : [];
  const activePreviewFile = previewPdf
    ? activeFiles.find((f) => f.id === previewPdf.id) || previewPdf
    : null;

  return (
    <div>
      {examFocusMode ? (
        <div className="mb-3 pb-2.5 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <div className="flex items-center gap-2 font-extrabold uppercase tracking-[0.05em] text-[var(--accent)]">
            <Maximize2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>
              Modo Leitura ·{' '}
              {activePreviewFile
                ? visibleName(activePreviewFile.name)
                : activeFolder
                  ? visibleName(activeFolder)
                  : 'PDFs Pessoais'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExamFocusMode(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] cursor-pointer"
          >
            <Minimize2 className="w-3.5 h-3.5 text-[var(--accent)]" />
            Sair do Modo Leitura (Esc)
          </button>
        </div>
      ) : (
        <PageHeader
          eyebrow="ACERVO PRIVADO · PDFS PESSOAIS"
          title="Biblioteca pessoal de apostilas e materiais"
          description="Organize apostilas em pastas temáticas, arraste arquivos diretamente para qualquer setor, visualize inline e atualize versões."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setExamFocusMode(true)}
                title="Ativar Modo Leitura (oculta barras laterais e cabeçalho para maximizar a leitura)"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shadow-xs cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                Modo Leitura
              </button>
              {driveConnected ? (
                <>
                  {driveFolderUrl && (
                    <a
                      href={driveFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors shadow-xs"
                    >
                      Pasta no Drive ↗
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void syncAllLocalFilesToDrive()}
                    disabled={isSyncingDrive}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[11.5px] font-bold hover:opacity-90 disabled:opacity-60 transition-all shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDrive ? 'animate-spin' : ''}`} />
                    {isSyncingDrive ? 'Sincronizando...' : 'Sincronizar com Drive'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => connectGoogleDrive()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shadow-xs"
                >
                  Vincular ao Google Drive
                </button>
              )}
            </div>
          }
        />
      )}

      <input
        ref={replaceInputRef}
        type="file"
        accept=".pdf"
        onChange={(e) => void handleReplaceChange(e)}
        className="hidden"
      />

      {!hideUpload && !examFocusMode && (
        <Panel title="Pastas" className="mb-4">
          <form onSubmit={handleCreateFolder} className="flex flex-wrap gap-2 mb-3.5">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nome da nova pasta (ex.: Direito_Tributario)"
              className="ce-input flex-1 min-w-[220px]"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 h-[38px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Criar pasta
            </button>
          </form>

          {folderNames.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {folderNames.map((folder) => {
                const count = (db.pdfFolders[folder] || []).length;
                const isSelected = folder === activeFolder;
                const isDrag = dragOverTarget === folder;
                const isRenaming = renamingFolder === folder;

                return (
                  <div
                    key={folder}
                    onClick={() => {
                      if (!isRenaming) {
                        setSelectedFolder(folder);
                        setPreviewPdf(null);
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverTarget(folder);
                    }}
                    onDragLeave={() => setDragOverTarget(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverTarget(null);
                      const files = Array.from(e.dataTransfer.files);
                      void handleFilesUpload(folder, files);
                    }}
                    className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                      isDrag
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : isSelected
                          ? 'border-[var(--accent)] bg-[var(--panel-soft)]'
                          : 'border-[var(--line)] bg-[var(--panel-soft)] hover:border-[var(--line-strong)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {isRenaming ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (renamedValue.trim()) {
                              const newKey = renamePdfFolder(folder, renamedValue);
                              setSelectedFolder(newKey);
                            }
                            setRenamingFolder(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 flex-1 min-w-0"
                        >
                          <input
                            type="text"
                            value={renamedValue}
                            onChange={(e) => setRenamedValue(e.target.value)}
                            className="ce-input h-7 py-0 px-2 text-[12.5px] flex-1 min-w-0"
                            autoFocus
                          />
                          <button
                            type="submit"
                            className="p-1 rounded bg-[var(--accent)] text-white hover:opacity-90 shrink-0"
                            title="Salvar novo nome"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingFolder(null)}
                            className="p-1 rounded bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)] shrink-0"
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Folder className="w-4 h-4 text-[var(--accent)] shrink-0" />
                            <strong className="text-[13.5px] font-bold text-[var(--text)] truncate">
                              {visibleName(folder)}
                            </strong>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingFolder(folder);
                                setRenamedValue(visibleName(folder));
                              }}
                              aria-label={`Renomear pasta ${visibleName(folder)}`}
                              title="Renomear pasta"
                              className="p-1 rounded text-[var(--muted)] hover:text-[var(--accent)]"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteFolder(folder);
                              }}
                              aria-label={`Remover pasta ${visibleName(folder)}`}
                              title="Excluir pasta"
                              className="p-1 rounded text-[var(--muted)] hover:text-[var(--bad)]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="mt-1.5 text-[11.5px] text-[var(--muted)] tabular-nums">
                      {count} {count === 1 ? 'PDF salvo' : 'PDFs salvos'} · Solte arquivos aqui
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {activeFolder ? (
        <Panel
          title={`Pasta selecionada: ${visibleName(activeFolder)}`}
          subtitle={`${activeFiles.length} documento(s)`}
        >
          {!hideUpload && !examFocusMode && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverTarget('__dropzone__');
              }}
              onDragLeave={() => setDragOverTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverTarget(null);
                void handleFilesUpload(activeFolder, Array.from(e.dataTransfer.files));
              }}
              className={`mb-4 rounded-xl border border-dashed p-5 text-center transition-colors ${
                dragOverTarget === '__dropzone__'
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--line-strong)] bg-[var(--panel-soft)]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                onChange={(e) => {
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  e.target.value = '';
                  void handleFilesUpload(activeFolder, files);
                }}
                className="hidden"
              />
              <FileUp className="w-5 h-5 text-[var(--accent)] mx-auto mb-2" />
              <div className="text-[13px] font-semibold text-[var(--text)]">
                Arraste PDFs para cá ou clique para adicionar em {visibleName(activeFolder)}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2.5 px-3.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
              >
                Selecionar PDF(s)
              </button>
            </div>
          )}

          {activePreviewFile && (
            <PdfAnnotatorViewer
              folder={activeFolder}
              file={activePreviewFile}
              onClose={() => setPreviewPdf(null)}
            />
          )}

          {activeFiles.length ? (
            <div className="mt-4 flex flex-col gap-2.5">
              {activeFiles.map((file) => {
                const fileAnn = db.pdfAnnotations?.[file.blobKey];
                const annotationCount =
                  (fileAnn?.strokes?.length || 0) + (fileAnn?.notes?.length || 0);
                const isAnnotated = annotationCount > 0 || Boolean(file.hasAnnotations);

                return (
                <div
                  key={file.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3"
                >
                  <div className="min-w-[min(100%,240px)] flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <strong className="text-[13.5px] font-bold leading-snug text-[var(--text)] break-words">
                        {visibleName(file.name)}
                      </strong>
                      {isAnnotated && (
                        <span
                          title="PDF com marcações salvas automaticamente"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-[var(--accent)]/35 bg-[var(--accent-soft)] text-[10.5px] font-bold text-[var(--accent)] shrink-0"
                        >
                          <Highlighter className="w-3 h-3" />
                          {annotationCount > 0 ? `${annotationCount} marcação(ões)` : 'Marcado'}
                        </span>
                      )}
                    </div>
                    <span className="block text-[11.5px] text-[var(--muted)] font-mono-num">
                      {formatUploadSize(file.size)} · Enviado em {file.createdAt}
                      {file.updatedAt ? ` · Atualizado em ${new Date(file.updatedAt).toLocaleDateString('pt-BR')}` : ''}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 min-w-0 max-w-full">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewPdf(previewPdf?.id === file.id ? null : file)
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {previewPdf?.id === file.id ? 'Fechar' : 'Abrir / Marcar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownload(file)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReplaceTrigger(file.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Substituir
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePersonalPdf(activeFolder, file.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <EmptyState message="Esta pasta ainda não possui PDFs salvos." />
          )}
        </Panel>
      ) : (
        <EmptyState message="Crie uma pasta acima para armazenar seus PDFs pessoais." />
      )}
    </div>
  );
};
