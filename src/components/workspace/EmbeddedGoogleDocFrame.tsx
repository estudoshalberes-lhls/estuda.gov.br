import React, { useState } from 'react';
import {
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Presentation,
  RefreshCw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  getEmbeddedGoogleUrl,
  getExternalGoogleUrl,
  GOOGLE_DOC_MIME,
  GOOGLE_SHEET_MIME,
  GOOGLE_SLIDE_MIME,
} from '../../lib/workspaceDriveAuth';

interface EmbeddedGoogleDocFrameProps {
  fileId: string;
  title: string;
  mimeType?: string;
  webViewLink?: string;
  subtitle?: string;
  defaultExpanded?: boolean;
  onSyncToApp?: () => Promise<void> | void;
  isSyncingToApp?: boolean;
  onClose?: () => void;
}

export const EmbeddedGoogleDocFrame: React.FC<EmbeddedGoogleDocFrameProps> = ({
  fileId,
  title,
  mimeType = GOOGLE_DOC_MIME,
  webViewLink,
  subtitle,
  defaultExpanded = false,
  onSyncToApp,
  isSyncingToApp = false,
  onClose,
}) => {
  const [compactToolbar, setCompactToolbar] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [showBrowserTip, setShowBrowserTip] = useState(false);

  const isDoc = mimeType === GOOGLE_DOC_MIME;
  const isSheet = mimeType === GOOGLE_SHEET_MIME;
  const isSlide = mimeType === GOOGLE_SLIDE_MIME;
  const isWorkspaceEditable = isDoc || isSheet || isSlide;

  const baseEmbedUrl = getEmbeddedGoogleUrl(fileId, mimeType, compactToolbar);
  const iframeSrc =
    reloadNonce > 0
      ? `${baseEmbedUrl}${baseEmbedUrl.includes('?') ? '&' : '?'}ce_r=${reloadNonce}`
      : baseEmbedUrl;
  const externalUrl = getExternalGoogleUrl(fileId, mimeType, webViewLink);

  const typeLabel = isDoc
    ? 'Google Docs'
    : isSheet
      ? 'Google Planilhas'
      : isSlide
        ? 'Google Apresentações'
        : 'Visualizador Google Drive';

  const TypeIcon = isSheet ? FileSpreadsheet : isSlide ? Presentation : FileText;
  const iconTone = isSheet
    ? 'text-emerald-600 dark:text-emerald-400'
    : isSlide
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-blue-600 dark:text-blue-400';

  return (
    <div
      className={`flex flex-col rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] overflow-hidden ${
        expanded ? 'fixed inset-3 z-50 shadow-2xl' : 'w-full'
      }`}
    >
      {/* Top Document Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b border-[var(--line)] bg-[var(--panel-soft)]">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <TypeIcon className={`w-4 h-4 shrink-0 ${iconTone}`} aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold text-[var(--text)] truncate">
              {title}
            </div>
            <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--muted)] truncate">
              <span>{typeLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{subtitle || 'Salvo automaticamente no Google Drive'}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {isWorkspaceEditable && (
            <button
              type="button"
              onClick={() => {
                setIframeLoaded(false);
                setCompactToolbar((v) => !v);
              }}
              title="Alternar entre barra completa e modo compacto do Google Docs"
              className="inline-flex items-center gap-1.5 h-[32px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--muted)]" />
              {compactToolbar ? 'Barra completa' : 'Modo compacto'}
            </button>
          )}

          {onSyncToApp && isDoc && (
            <button
              type="button"
              onClick={() => void onSyncToApp()}
              disabled={isSyncingToApp}
              title="Importar a versão mais recente escrita no Google Docs para o resumo salvo no app"
              className="inline-flex items-center gap-1.5 h-[32px] px-2.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isSyncingToApp ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {isSyncingToApp ? 'Sincronizando…' : 'Sincronizar texto'}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setIframeLoaded(false);
              setReloadNonce((n) => n + 1);
            }}
            title="Recarregar quadro do documento"
            className="inline-flex items-center justify-center w-[32px] h-[32px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Restaurar tamanho' : 'Expandir editor na tela toda'}
            className="inline-flex items-center gap-1.5 h-[32px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {expanded ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                Restaurar
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                Tela cheia
              </>
            )}
          </button>

          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-[32px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir no Google
          </a>

          <button
            type="button"
            onClick={() => setShowBrowserTip((v) => !v)}
            title="Ajuda caso o documento não apareça embutido"
            className={`inline-flex items-center justify-center w-[32px] h-[32px] rounded-lg border transition-colors cursor-pointer ${
              showBrowserTip
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Fechar visualização do documento"
              className="inline-flex items-center justify-center w-[32px] h-[32px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {showBrowserTip && (
        <div className="px-3.5 py-2 border-b border-[var(--line)] bg-[var(--panel-raised)] text-[12px] text-[var(--muted)] flex flex-wrap items-center justify-between gap-2">
          <span>
            O editor embutido usa a sua sessão do Google no navegador. Se o quadro ficar em branco ou
            pedir acesso (comum em Safari/aba anônima com bloqueio de cookies de terceiros), use o
            botão <strong className="text-[var(--text)]">Abrir no Google</strong> ao lado.
          </span>
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--accent)] hover:underline whitespace-nowrap"
          >
            Abrir em nova aba ↗
          </a>
        </div>
      )}

      {/* Embedded Live Google Docs / Drive Frame */}
      <div
        className={`relative w-full bg-white ${
          expanded ? 'flex-1 min-h-0' : 'h-[72vh] min-h-[560px]'
        }`}
      >
        {!iframeLoaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[var(--panel-soft)] text-[var(--muted)] text-[12.5px]">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
            <span>Carregando {typeLabel}…</span>
          </div>
        )}
        <iframe
          key={`${fileId}-${compactToolbar ? 'compact' : 'full'}-${reloadNonce}`}
          src={iframeSrc}
          title={title}
          onLoad={() => setIframeLoaded(true)}
          className="w-full h-full border-0 block"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
};
