import React, { useState } from 'react';
import { Download, MoreVertical, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'topbar' | 'sidebar' | 'login';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'topbar' }) => {
  const { isInstallable, isInstalled, isIOS, isMobile, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Já instalado em modo standalone -> suprime o botão
  if (isInstalled) {
    return null;
  }

  // No topbar/login exibimos quando há suporte direto (beforeinstallprompt) ou iOS/mobile;
  // se desktop sem beforeinstallprompt ainda, só mostra na sidebar quando instalável/iOS.
  const canShow = isInstallable || isIOS || (variant === 'login' && isMobile);
  if (!canShow) {
    return null;
  }

  const handleAction = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuideModal(true);
  };

  const renderTrigger = () => {
    if (variant === 'topbar') {
      return (
        <button
          type="button"
          onClick={() => void handleAction()}
          aria-label={isIOS ? 'Instalar no iPhone / iPad' : 'Instalar aplicativo no celular'}
          title={isIOS ? 'Instalar no iPhone / iPad' : 'Instalar aplicativo (PWA)'}
          className="inline-flex items-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3 rounded-xl border border-[#1351B4]/40 bg-[#1351B4]/10 text-[#1351B4] dark:text-[#60A5FA] hover:bg-[#1351B4] hover:text-white text-[11px] font-bold transition-colors shrink-0 whitespace-nowrap cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{isIOS ? 'Instalar no iOS' : 'Instalar App'}</span>
        </button>
      );
    }

    if (variant === 'sidebar') {
      return (
        <button
          type="button"
          onClick={() => void handleAction()}
          className="nav-link group flex items-center gap-2.5 w-full min-h-[34px] px-2.5 py-1.5 mt-1 rounded-[6px] border border-[#1351B4]/35 bg-[#1351B4]/10 text-[#1351B4] hover:bg-[#1351B4] hover:text-white text-left text-[12.5px] font-bold transition-colors cursor-pointer"
          title="Instalar como aplicativo no dispositivo"
        >
          <span className="nav-icon grid place-items-center w-5 h-5 shrink-0">
            <Download className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="nav-label truncate">
            {isIOS ? 'Instalar no iPhone' : 'Instalar Aplicativo'}
          </span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => void handleAction()}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-[#1351B4]/40 bg-[#EDF3FC] hover:bg-[#DCE8FA] text-[#1351B4] px-4 py-2 text-[13px] font-bold transition-colors cursor-pointer"
      >
        <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{isIOS ? 'Instalar no iPhone / iPad' : 'Instalar Aplicativo no Celular'}</span>
      </button>
    );
  };

  return (
    <>
      {renderTrigger()}

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] p-6 shadow-2xl text-[var(--text)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-[#1351B4]/12 text-[#1351B4] shrink-0">
                  <Smartphone className="w-5 h-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 id="pwa-guide-title" className="m-0 font-display text-[16px] font-extrabold leading-tight">
                    {isIOS ? 'Instalar no iPhone / iPad' : 'Instalar no Celular'}
                  </h3>
                  <p className="m-0 mt-0.5 text-[11.5px] text-[var(--muted)]">
                    Adicione o estuda.gov.br à sua tela inicial
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Fechar instruções"
                className="grid place-items-center w-8 h-8 rounded-lg border border-transparent text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-2.5 text-[13px] leading-relaxed text-[var(--text)] pl-4 list-decimal">
                <li>
                  Abra este portal no <strong>Safari</strong>.
                </li>
                <li>
                  Toque no botão{' '}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--panel-soft)] border border-[var(--line)] font-semibold text-[12px]">
                    <Share className="w-3.5 h-3.5 text-[#1351B4]" aria-hidden="true" /> Compartilhar
                  </span>{' '}
                  na barra inferior do Safari.
                </li>
                <li>
                  Role as opções e toque em <strong>Adicionar à Tela de Início</strong>.
                </li>
                <li>
                  Confirme em <strong>Adicionar</strong> para abrir como aplicativo sem barra do navegador.
                </li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2.5 text-[13px] leading-relaxed text-[var(--text)] pl-4 list-decimal">
                <li>
                  Abra este portal no <strong>Google Chrome</strong> ou <strong>Microsoft Edge</strong>.
                </li>
                <li>
                  Toque no menu{' '}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--panel-soft)] border border-[var(--line)] font-semibold text-[12px]">
                    <MoreVertical className="w-3.5 h-3.5 text-[#1351B4]" aria-hidden="true" /> Mais opções
                  </span>{' '}
                  no canto superior direito.
                </li>
                <li>
                  Toque em <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="mt-5 w-full rounded-full bg-[#1351B4] hover:bg-[#0C326F] py-2.5 text-[13px] font-bold text-white transition-colors cursor-pointer"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
};
