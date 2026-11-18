import React, { useCallback, useEffect, useState } from 'react';
import { CloudDownload, Download, FileText, FolderOpen, X } from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { getFileBlob, triggerBlobDownload } from '../../lib/fileStorage';
import { visibleName } from '../../lib/parsers';

interface FilePreviewProps {
  blobKey: string;
  filename: string;
  mimeType?: string;
  title?: string;
  onClose: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  blobKey,
  filename,
  mimeType,
  title,
  onClose,
}) => {
  const {
    driveConnected,
    recoverFileFromDrive,
    pickDriveFolderOrFiles,
    toast,
  } = useStudy();
  const [url, setUrl] = useState<string>('');
  const [textPreview, setTextPreview] = useState<string>('');
  const [blobRef, setBlobRef] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [authorizingDrive, setAuthorizingDrive] = useState(false);

  const lower = filename.toLowerCase();
  const isPdf = lower.endsWith('.pdf') || mimeType === 'application/pdf';
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(lower) || Boolean(mimeType?.startsWith('image/'));
  const isText = /\.(txt|md)$/i.test(lower) || Boolean(mimeType?.startsWith('text/'));

  const bindBlob = useCallback(
    async (blob: Blob | null, isActive: () => boolean): Promise<string> => {
      setBlobRef(blob);
      if (!blob) return '';
      if (isText) {
        const text = await blob.text();
        if (isActive()) setTextPreview(text);
        return '';
      }
      const objectUrl = URL.createObjectURL(blob);
      if (isActive()) setUrl(objectUrl);
      return objectUrl;
    },
    [isText],
  );

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setLoading(true);
    setUrl('');
    setTextPreview('');

    getFileBlob(blobKey).then(async (blob) => {
      if (!active) return;
      if (blob) {
        objectUrl = await bindBlob(blob, () => active);
        if (active) setLoading(false);
        return;
      }
      if (driveConnected) {
        const recovered = await recoverFileFromDrive(blobKey, filename);
        if (!active) return;
        objectUrl = await bindBlob(recovered, () => active);
      } else {
        setBlobRef(null);
      }
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bindBlob, blobKey, driveConnected, filename, recoverFileFromDrive]);

  const handleManualRecover = async () => {
    setRecovering(true);
    try {
      const recovered = await recoverFileFromDrive(blobKey, filename);
      if (!recovered) {
        return;
      }
      await bindBlob(recovered, () => true);
      toast('Arquivo restaurado do Google Drive!');
    } finally {
      setRecovering(false);
    }
  };

  const handleAuthorizeDriveFile = async () => {
    setAuthorizingDrive(true);
    try {
      const res = await pickDriveFolderOrFiles({ mode: 'files-only' });
      if (!res) return;
      const blob = await getFileBlob(blobKey) || (await recoverFileFromDrive(blobKey, filename));
      if (blob) {
        await bindBlob(blob, () => true);
        toast('Arquivo autorizado e carregado do Google Drive!');
      }
    } finally {
      setAuthorizingDrive(false);
    }
  };

  const handleDownload = () => {
    if (blobRef) {
      triggerBlobDownload(blobRef, filename);
    }
  };

  return (
    <section className="mt-4 rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--line)]">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <div className="min-w-0">
            <strong className="block text-[12.5px] font-bold text-[var(--text)] truncate">
              {title || visibleName(filename)}
            </strong>
            <span className="block text-[11px] text-[var(--muted)] truncate">
              {visibleName(filename)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {blobRef && (
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar arquivo
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar visualizador"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-[13px] text-[var(--muted)]">
          Carregando visualização…
        </div>
      ) : !blobRef ? (
        <div className="py-10 text-center text-[13px] text-[var(--muted)] flex flex-col items-center gap-3">
          <span>
            Conteúdo do arquivo não encontrado no cache deste navegador.
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {driveConnected && (
              <>
                <button
                  type="button"
                  onClick={() => void handleManualRecover()}
                  disabled={recovering || authorizingDrive}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60"
                >
                  <CloudDownload className="w-3.5 h-3.5" />
                  {recovering ? 'Buscando no Google Drive…' : 'Restaurar do Google Drive'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleAuthorizeDriveFile()}
                  disabled={recovering || authorizingDrive}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-60"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {authorizingDrive ? 'Abrindo seletor…' : 'Selecionar arquivo no Drive'}
                </button>
              </>
            )}
          </div>
        </div>
      ) : isText ? (
        <pre className="mt-3 max-h-[60vh] overflow-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 text-[12.5px] leading-relaxed text-[var(--text)] whitespace-pre-wrap font-sans">
          {textPreview}
        </pre>
      ) : isImage && url ? (
        <div className="mt-3 flex justify-center rounded-lg border border-[var(--line)] bg-black/20 p-3">
          <img
            src={url}
            alt={visibleName(filename)}
            className="max-h-[70vh] w-auto object-contain rounded"
          />
        </div>
      ) : isPdf && url ? (
        <iframe
          src={url}
          title={title || visibleName(filename)}
          className="mt-3 w-full h-[min(74vh,880px)] rounded-lg border border-[var(--line)] bg-white"
        />
      ) : (
        <div className="mt-3 p-6 text-center text-[13px] text-[var(--muted)]">
          Visualização direta indisponível para este formato ({filename}). Clique em <strong>Baixar arquivo</strong> acima.
        </div>
      )}
    </section>
  );
};
