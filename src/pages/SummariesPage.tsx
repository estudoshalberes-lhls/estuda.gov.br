import React, { useMemo, useRef, useState } from 'react';
import { Download, Eye, FileUp, FolderPlus, Trash2 } from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { getFileBlob, triggerBlobDownload } from '../lib/fileStorage';
import { formatUploadSize, visibleName } from '../lib/parsers';
import { SummaryFile } from '../types/study';
import { FilePreview } from '../components/ui/FilePreview';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';

export const SummariesPage: React.FC = () => {
  const {
    db,
    moduleVisibility,
    createSummaryFolder,
    uploadSummaryFile,
    deleteSummaryFile,
    toast,
  } = useStudy();

  const hideUpload = moduleVisibility('Resumos & Mapas').hide_upload;
  const folderNames = useMemo(
    () => Object.keys(db.summaryFolders).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [db.summaryFolders],
  );

  const [selectedFolder, setSelectedFolder] = useState(folderNames[0] || '');
  const activeFolder = folderNames.includes(selectedFolder)
    ? selectedFolder
    : folderNames[0] || '';

  const [newFolderName, setNewFolderName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const [previewItem, setPreviewItem] = useState<SummaryFile | null>(null);

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const created = createSummaryFolder(newFolderName);
    setSelectedFolder(created);
    setNewFolderName('');
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFolder || !uploadFile) {
      toast('Selecione uma disciplina e um arquivo (PDF, PNG, JPG, WEBP).', true);
      return;
    }
    setUploading(true);
    try {
      await uploadSummaryFile(activeFolder, uploadFile);
      setUploadFile(null);
      if (uploadRef.current) uploadRef.current.value = '';
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (file: SummaryFile) => {
    const blob = await getFileBlob(file.blobKey);
    if (!blob) {
      toast('Arquivo não encontrado no armazenamento local.', true);
      return;
    }
    triggerBlobDownload(blob, file.name);
  };

  const files = activeFolder ? db.summaryFolders[activeFolder] || [] : [];

  return (
    <div>
      <PageHeader
        eyebrow="DOSSIÊ VISUAL · RESUMOS & MAPAS"
        title="Mapas mentais, quadros sinóticos e resumos"
        description="Arquive PDFs e quadros esquematizados divididos por disciplina com visualização rápida inline."
      />

      {!hideUpload && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-4 items-start">
          <Panel title="Nova pasta por disciplina">
            <form onSubmit={handleCreateFolder} className="flex gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Ex.: Direito_Penal, Auditoria..."
                className="ce-input flex-1"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 h-[38px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
              >
                <FolderPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                Criar pasta
              </button>
            </form>
          </Panel>

          <Panel title="Enviar resumo ou mapa mental (.pdf, .png, .jpg, .webp)">
            <form onSubmit={handleUpload} className="flex flex-wrap gap-2 items-center">
              <input
                ref={uploadRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="ce-input flex-1 min-w-[200px]"
              />
              <button
                type="submit"
                disabled={uploading || !activeFolder}
                className="inline-flex items-center gap-1.5 h-[38px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap"
              >
                <FileUp className="w-3.5 h-3.5" />
                {uploading ? 'Enviando…' : 'Enviar arquivo'}
              </button>
            </form>
          </Panel>
        </div>
      )}

      {folderNames.length ? (
        <Panel
          title="Arquivos na disciplina"
          action={
            <select
              aria-label="Selecionar pasta de resumos"
              value={activeFolder}
              onChange={(e) => {
                setSelectedFolder(e.target.value);
                setPreviewItem(null);
              }}
              className="ce-select w-auto min-w-[200px]"
            >
              {folderNames.map((name) => (
                <option key={name} value={name}>
                  {visibleName(name)} ({db.summaryFolders[name].length})
                </option>
              ))}
            </select>
          }
        >
          {previewItem && (
            <FilePreview
              blobKey={previewItem.blobKey}
              filename={previewItem.name}
              mimeType={previewItem.mimeType}
              title={visibleName(previewItem.name)}
              onClose={() => setPreviewItem(null)}
            />
          )}

          {files.length ? (
            <div className="mt-3 flex flex-col gap-2.5">
              {files.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3"
                >
                  <div className="min-w-0">
                    <strong className="block text-[13.5px] font-bold text-[var(--text)] truncate">
                      {visibleName(item.name)}
                    </strong>
                    <span className="block text-[11.5px] text-[var(--muted)] font-mono-num">
                      {formatUploadSize(item.size)} · Adicionado em {item.createdAt}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewItem(previewItem?.id === item.id ? null : item)
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {previewItem?.id === item.id ? 'Fechar' : 'Visualizar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownload(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSummaryFile(activeFolder, item.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="Esta disciplina ainda não possui mapas ou resumos enviados." />
          )}
        </Panel>
      ) : (
        <EmptyState message="Crie uma pasta acima para guardar seus resumos e mapas mentais." />
      )}
    </div>
  );
};
