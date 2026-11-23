import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Eye,
  FileText,
  FileUp,
  Loader2,
  Paperclip,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { cleanSafeName, formatUploadSize, visibleName } from '../../lib/parsers';
import { getSummaryDisplayTitle, getSummaryItemKind } from '../../lib/summaryPdfExport';
import { SummaryFile } from '../../types/study';
import { EmptyState, Panel } from '../ui/PageHeader';

interface PdfAttachmentPanelProps {
  summaryFolders: Record<string, SummaryFile[]>;
  disciplines: string[];
  activeFolder: string;
  hideUpload?: boolean;
  mode?: 'compact' | 'full';
  previewItemId?: string | null;
  onCreateFolder: (rawName: string) => string;
  onUploadFiles: (folderKey: string, files: File[]) => Promise<number>;
  onMoveFile?: (fromFolder: string, fileId: string, toFolderKey: string) => void;
  onPreviewItem: (item: SummaryFile) => void;
  onDownloadItem: (folderKey: string, item: SummaryFile) => Promise<void>;
  onOpenAiStudio?: (folderKey: string, item: SummaryFile) => void;
  onDeleteItem: (folderKey: string, item: SummaryFile) => void;
  onOpenFullAttachmentsTab?: () => void;
  onNotify: (msg: string, isErr?: boolean) => void;
}

const NEW_DISCIPLINE_SENTINEL = '__NEW_DISCIPLINE__';

export const PdfAttachmentPanel: React.FC<PdfAttachmentPanelProps> = ({
  summaryFolders,
  disciplines,
  activeFolder,
  hideUpload = false,
  mode = 'full',
  previewItemId = null,
  onCreateFolder,
  onUploadFiles,
  onMoveFile,
  onPreviewItem,
  onDownloadItem,
  onOpenAiStudio,
  onDeleteItem,
  onOpenFullAttachmentsTab,
  onNotify,
}) => {
  const folderKeys = useMemo(
    () =>
      Object.keys(summaryFolders).sort((a, b) =>
        visibleName(a).localeCompare(visibleName(b), 'pt-BR'),
      ),
    [summaryFolders],
  );

  // Unified list of disciplines (existing summary folders + global study disciplines)
  const disciplineOptions = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; hasFolder: boolean }>();
    folderKeys.forEach((key) => {
      byKey.set(key, { key, label: visibleName(key), hasFolder: true });
    });
    disciplines.forEach((raw) => {
      const label = visibleName(raw).trim();
      if (!label) return;
      const key = cleanSafeName(label, 'Resumo').replace(/\s+/g, '_');
      if (!byKey.has(key)) {
        byKey.set(key, { key, label, hasFolder: false });
      }
    });
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [disciplines, folderKeys]);

  const defaultDisciplineKey = useMemo(() => {
    if (activeFolder && activeFolder !== '__ALL__') return activeFolder;
    return disciplineOptions[0]?.key || NEW_DISCIPLINE_SENTINEL;
  }, [activeFolder, disciplineOptions]);

  const [selectedDiscipline, setSelectedDiscipline] = useState<string>(defaultDisciplineKey);
  const [customDisciplineName, setCustomDisciplineName] = useState('');
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Library filters (full mode)
  const [filterDiscipline, setFilterDiscipline] = useState<string>(
    activeFolder && activeFolder !== '__ALL__' ? activeFolder : '__ALL__',
  );
  const [searchQuery, setSearchQuery] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (activeFolder && activeFolder !== '__ALL__') {
      setSelectedDiscipline(activeFolder);
      setFilterDiscipline(activeFolder);
    } else if (selectedDiscipline !== NEW_DISCIPLINE_SENTINEL && !disciplineOptions.some((d) => d.key === selectedDiscipline)) {
      setSelectedDiscipline(disciplineOptions[0]?.key || NEW_DISCIPLINE_SENTINEL);
    }
  }, [activeFolder, disciplineOptions, selectedDiscipline]);

  const allPdfEntries = useMemo(() => {
    const entries: Array<{ folder: string; item: SummaryFile }> = [];
    for (const folder of folderKeys) {
      for (const item of summaryFolders[folder] || []) {
        if (getSummaryItemKind(item) === 'pdf') {
          entries.push({ folder, item });
        }
      }
    }
    return entries.sort((a, b) => (b.item.updatedAt || b.item.createdAt).localeCompare(a.item.updatedAt || a.item.createdAt));
  }, [folderKeys, summaryFolders]);

  const filteredPdfEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allPdfEntries.filter(({ folder, item }) => {
      if (filterDiscipline !== '__ALL__' && folder !== filterDiscipline) return false;
      if (!q) return true;
      return [visibleName(folder), getSummaryDisplayTitle(item), item.name]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [allPdfEntries, filterDiscipline, searchQuery]);

  const totalPdfBytes = useMemo(
    () => filteredPdfEntries.reduce((sum, e) => sum + (e.item.size || 0), 0),
    [filteredPdfEntries],
  );

  const enqueueSelectedFiles = (incoming: File[]) => {
    if (!incoming.length) return;
    const onlyPdfs = incoming.filter(
      (f) => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf',
    );
    const rejectedCount = incoming.length - onlyPdfs.length;
    if (rejectedCount > 0) {
      onNotify(
        rejectedCount === incoming.length
          ? 'Selecione apenas arquivos no formato PDF (.pdf).'
          : `${rejectedCount} arquivo(s) ignorado(s): apenas PDFs (.pdf) são aceitos neste anexo.`,
        true,
      );
    }
    if (onlyPdfs.length === 0) return;

    setQueuedFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}::${f.size}`));
      const uniqueNew = onlyPdfs.filter((f) => !existingKeys.has(`${f.name}::${f.size}`));
      return [...prev, ...uniqueNew];
    });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    enqueueSelectedFiles(dropped);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (queuedFiles.length === 0) {
      onNotify('Selecione ou arraste ao menos um arquivo PDF para anexar.', true);
      return;
    }

    let targetFolderKey = '';
    if (selectedDiscipline === NEW_DISCIPLINE_SENTINEL) {
      const cleanCustom = customDisciplineName.trim();
      if (!cleanCustom) {
        onNotify('Digite o nome da nova disciplina para associar o PDF.', true);
        return;
      }
      targetFolderKey = onCreateFolder(cleanCustom);
      setCustomDisciplineName('');
      setSelectedDiscipline(targetFolderKey);
    } else {
      const chosen = disciplineOptions.find((d) => d.key === selectedDiscipline);
      if (!chosen) {
        onNotify('Selecione uma disciplina para associar o PDF.', true);
        return;
      }
      targetFolderKey = chosen.hasFolder ? chosen.key : onCreateFolder(chosen.label);
    }

    setUploading(true);
    try {
      await onUploadFiles(targetFolderKey, queuedFiles);
      setQueuedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      onNotify((err as Error).message || 'Falha ao anexar arquivo(s) PDF.', true);
    } finally {
      setUploading(false);
    }
  };

  const handleMoveDiscipline = (fromFolder: string, fileId: string, toValue: string) => {
    if (!onMoveFile || !toValue || toValue === fromFolder) return;
    const chosen = disciplineOptions.find((d) => d.key === toValue);
    const targetKey = chosen ? (chosen.hasFolder ? chosen.key : onCreateFolder(chosen.label)) : toValue;
    onMoveFile(fromFolder, fileId, targetKey);
  };

  const uploaderCard = !hideUpload ? (
    <Panel
      title="Anexar PDF por Disciplina"
      subtitle="Faça upload local de apostilas, resumos ou provas em PDF; os arquivos ficam salvos no navegador e prontos para download futuro."
      action={
        mode === 'compact' && onOpenFullAttachmentsTab && allPdfEntries.length > 0 ? (
          <button
            type="button"
            onClick={onOpenFullAttachmentsTab}
            className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--accent)] hover:underline whitespace-nowrap cursor-pointer"
          >
            <Paperclip className="w-3.5 h-3.5" />
            Ver todos ({allPdfEntries.length})
          </button>
        ) : undefined
      }
    >
      <form onSubmit={handleUploadSubmit} className="flex flex-col gap-3">
        {/* Step 1: Select or Create Discipline */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className={selectedDiscipline === NEW_DISCIPLINE_SENTINEL ? '' : 'sm:col-span-2'}>
            <label
              htmlFor={`pdf-attach-discipline-${mode}`}
              className="block text-[11px] font-bold text-[var(--muted)] mb-1"
            >
              Disciplina associada *
            </label>
            <select
              id={`pdf-attach-discipline-${mode}`}
              value={selectedDiscipline}
              onChange={(e) => setSelectedDiscipline(e.target.value)}
              className="ce-select text-[12.5px] font-semibold"
            >
              {disciplineOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                  {opt.hasFolder
                    ? ` (${(summaryFolders[opt.key] || []).filter((i) => getSummaryItemKind(i) === 'pdf').length} PDF)`
                    : ' (criar pasta)'}
                </option>
              ))}
              <option value={NEW_DISCIPLINE_SENTINEL}>+ Informar nova disciplina...</option>
            </select>
          </div>

          {selectedDiscipline === NEW_DISCIPLINE_SENTINEL && (
            <div>
              <label
                htmlFor={`pdf-attach-new-discipline-${mode}`}
                className="block text-[11px] font-bold text-[var(--muted)] mb-1"
              >
                Nome da nova disciplina *
              </label>
              <input
                id={`pdf-attach-new-discipline-${mode}`}
                type="text"
                value={customDisciplineName}
                onChange={(e) => setCustomDisciplineName(e.target.value)}
                placeholder="Ex.: Direito Processual Penal"
                className="ce-input text-[12.5px]"
              />
            </div>
          )}
        </div>

        {/* Step 2: Drag-and-Drop / Local PDF Picker */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
              : 'border-[var(--line-strong)] bg-[var(--panel-soft)] hover:border-[var(--accent)]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              enqueueSelectedFiles(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />
          <UploadCloud className="w-6 h-6 mx-auto mb-1.5 text-[var(--accent)]" />
          <div className="text-[12.5px] font-bold text-[var(--text)]">
            Arraste arquivos PDF aqui ou clique para selecionar do computador
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            Aceita múltiplos arquivos .pdf · Armazenamento local persistente para download futuro
          </div>
        </div>

        {/* Queued Files List */}
        {queuedFiles.length > 0 && (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-2.5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-[var(--muted)] px-1">
              <span>{queuedFiles.length} PDF(s) pronto(s) para anexar</span>
              <button
                type="button"
                onClick={() => setQueuedFiles([])}
                className="text-[var(--bad)] hover:underline cursor-pointer"
              >
                Limpar fila
              </button>
            </div>
            {queuedFiles.map((file, idx) => (
              <div
                key={`${file.name}-${file.size}-${idx}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span className="text-[12px] font-semibold text-[var(--text)] truncate">
                    {file.name}
                  </span>
                  <span className="text-[11px] font-mono-num text-[var(--muted)] shrink-0">
                    {formatUploadSize(file.size)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setQueuedFiles((prev) => prev.filter((_, i) => i !== idx))
                  }
                  aria-label={`Remover ${file.name}`}
                  className="p-1 rounded text-[var(--muted)] hover:text-[var(--bad)] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <span className="text-[11px] text-[var(--muted)]">
            {mode === 'compact'
              ? 'Disponível para visualização, IA e download imediato ou futuro.'
              : 'Os PDFs ficam vinculados à disciplina e podem ser baixados separadamente ou no dossiê consolidado.'}
          </span>
          <button
            type="submit"
            disabled={uploading || queuedFiles.length === 0}
            className="inline-flex items-center gap-1.5 h-[36px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-55 whitespace-nowrap cursor-pointer"
          >
            {uploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Anexando…
              </>
            ) : (
              <>
                <FileUp className="w-3.5 h-3.5" />
                {queuedFiles.length > 1
                  ? `Anexar ${queuedFiles.length} PDFs`
                  : 'Anexar PDF'}
              </>
            )}
          </button>
        </div>
      </form>
    </Panel>
  ) : null;

  if (mode === 'compact') {
    return uploaderCard;
  }

  // FULL MODE: Uploader + Dedicated Discipline-Indexed PDF Library for Future Downloads
  return (
    <div className="flex flex-col gap-4">
      {uploaderCard}

      <Panel
        title={`Anexos PDF salvos (${filteredPdfEntries.length})`}
        subtitle={
          filteredPdfEntries.length > 0
            ? `Armazenamento local pronto para download · ${formatUploadSize(totalPdfBytes)}`
            : 'Nenhum PDF anexado para o filtro atual'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filtrar anexos por disciplina"
              value={filterDiscipline}
              onChange={(e) => setFilterDiscipline(e.target.value)}
              className="ce-select h-[34px] w-auto max-w-[220px] text-[12px]"
            >
              <option value="__ALL__">Todas as disciplinas ({allPdfEntries.length})</option>
              {folderKeys.map((fk) => {
                const count = (summaryFolders[fk] || []).filter(
                  (i) => getSummaryItemKind(i) === 'pdf',
                ).length;
                if (count === 0) return null;
                return (
                  <option key={fk} value={fk}>
                    {visibleName(fk)} ({count})
                  </option>
                );
              })}
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar PDF ou disciplina..."
                className="ce-input pl-8 h-[34px] w-[200px] text-[12px]"
              />
            </div>
          </div>
        }
      >
        {filteredPdfEntries.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {filteredPdfEntries.map(({ folder, item }) => {
              const displayTitle = getSummaryDisplayTitle(item);
              const isPreviewOpen = previewItemId === item.id;
              return (
                <div
                  key={`${folder}-${item.id}`}
                  className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5 min-w-[min(100%,250px)] flex-1">
                    <span className="grid place-items-center w-9 h-9 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--accent)] shrink-0 mt-0.5">
                      <FileText className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <strong className="block text-[13.5px] font-bold text-[var(--text)] truncate">
                        {displayTitle}
                      </strong>
                      <div className="mt-0.5 text-[11.5px] text-[var(--muted)] font-mono-num tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-sans font-semibold text-[var(--accent)]">
                          {visibleName(folder)}
                        </span>
                        <span>·</span>
                        <span>{item.name}</span>
                        <span>·</span>
                        <span>{formatUploadSize(item.size)}</span>
                        <span>·</span>
                        <span>Anexado em {item.createdAt}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {onMoveFile && disciplineOptions.length > 1 && !hideUpload && (
                      <select
                        aria-label={`Disciplina de ${displayTitle}`}
                        title="Alterar disciplina associada a este PDF"
                        value={folder}
                        onChange={(e) => handleMoveDiscipline(folder, item.id, e.target.value)}
                        className="ce-select h-[31px] py-0 text-[11px] w-auto max-w-[175px]"
                      >
                        {disciplineOptions.map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.key === folder ? opt.label : `Mover → ${opt.label}`}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      onClick={() => onPreviewItem(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {isPreviewOpen ? 'Fechar' : 'Visualizar'}
                    </button>

                    {onOpenAiStudio && (
                      <button
                        type="button"
                        onClick={() => onOpenAiStudio(folder, item)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[11.5px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white whitespace-nowrap cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        IA
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void onDownloadItem(folder, item)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar PDF
                    </button>

                    {!hideUpload && (
                      <button
                        type="button"
                        onClick={() => onDeleteItem(folder, item)}
                        aria-label={`Excluir ${displayTitle}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            message={
              allPdfEntries.length > 0
                ? 'Nenhum PDF encontrado para a disciplina ou busca selecionada.'
                : 'Nenhum PDF anexado ainda. Use a área acima para enviar seus arquivos PDF e associá-los a uma disciplina.'
            }
          />
        )}
      </Panel>
    </div>
  );
};
