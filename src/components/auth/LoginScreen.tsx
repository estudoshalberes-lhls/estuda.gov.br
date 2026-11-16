import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  FolderCheck,
  FolderOpen,
  FolderSync,
  HardDrive,
  Lock,
} from 'lucide-react';
import firebaseConfig from '../../../firebase-applet-config.json';
import { useStudy } from '../../context/StudyContext';
import { CANONICAL_LOCAL_SUBFOLDERS, getLocalCategoryList } from '../../lib/localFolderSync';
import { GovFederalBar } from '../layout/GovFederalBar';
import { PWAInstallButton } from '../ui/PWAInstallButton';

interface LoginScreenProps {
  onContinueOffline: () => void;
}

const WORKSPACE_PILLARS = [
  {
    index: '01.',
    title: 'Editais & Diário de Provas',
    description:
      'Protocole concursos, prazos de boleto e locais de prova e dê baixa em cada tópico diretamente no edital.',
  },
  {
    index: '02.',
    title: 'Lei Seca & Matriz de Incidência',
    description:
      'Registre os dias de leitura por lei e por artigo individual, com filtros múltiplos por dispositivo.',
  },
  {
    index: '03.',
    title: 'Simulados & Ouvidoria de Erros',
    description:
      'Resolva questões com ponto eletrônico, lousa interativa e revisão espaçada dos pontos críticos.',
  },
  {
    index: '04.',
    title: 'Arquivo em Pasta Local & Nuvem',
    description:
      'Leia diretamente sua pasta do computador identificando todos os módulos e grave tudo localmente sem burocracia.',
  },
] as const;

export const LoginScreen: React.FC<LoginScreenProps> = ({ onContinueOffline }) => {
  const {
    googleUser,
    firebaseConnected,
    driveConnected,
    connectGoogleDrive,
    authError,
    toast,
    localFolderConnected,
    localFolderWritable,
    localFolderName,
    localFolderSummary,
    savedLocalFolderMeta,
    hasSavedLocalFolderHandle,
    isSyncingLocalFolder,
    lastLocalFolderSyncAt,
    lastLocalIncrementalBackupAt,
    lastCloudSyncAt,
    restoreProgress,
    connectLocalStudyFolder,
    reconnectLocalStudyFolder,
    importLocalStudyFolderFromFiles,
  } = useStudy();

  const [loading, setLoading] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedHost, setCopiedHost] = useState(false);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const handleSelectLocalFolder = async () => {
    setLocalLoading(true);
    setErrorMessage(null);
    try {
      const res = await connectLocalStudyFolder();
      if (res.needsInputFallback) {
        folderInputRef.current?.click();
      } else if (res.ok) {
        onContinueOffline();
      }
    } finally {
      setLocalLoading(false);
    }
  };

  const handleReconnectSavedLocalFolder = async () => {
    setLocalLoading(true);
    setErrorMessage(null);
    try {
      const ok = await reconnectLocalStudyFolder();
      if (ok) {
        onContinueOffline();
      } else {
        const pickRes = await connectLocalStudyFolder();
        if (pickRes.needsInputFallback) {
          folderInputRef.current?.click();
        } else if (pickRes.ok) {
          onContinueOffline();
        }
      }
    } finally {
      setLocalLoading(false);
    }
  };

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setLocalLoading(true);
    setErrorMessage(null);
    try {
      const ok = await importLocalStudyFolderFromFiles(files);
      if (ok) {
        onContinueOffline();
      }
    } finally {
      setLocalLoading(false);
      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }
    }
  };

  const handleGoogleLogin = async (forceAccountPicker = false) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const ok = await connectGoogleDrive({ forceAccountPicker });
      if (ok) {
        onContinueOffline();
      } else {
        setErrorMessage(null);
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('auth/unauthorized-domain') || err?.code === 'auth/unauthorized-domain') {
        const host = window.location.hostname || 'seu-site.vercel.app';
        setErrorMessage(
          `O domínio "${host}" não está na lista de Domínios Autorizados do Firebase. Adicione "${host}" no Firebase Console > Authentication > Settings > Authorized Domains ou use a leitura da Pasta Local abaixo.`,
        );
      } else {
        setErrorMessage(msg || 'Falha ao autenticar com o Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  const displayedError = errorMessage || authError;
  const isOriginMismatchError = Boolean(
    displayedError &&
      (displayedError.toLowerCase().includes('origin_mismatch') ||
        displayedError.toLowerCase().includes('origens javascript autorizadas') ||
        displayedError.toLowerCase().includes('redirect_uri_mismatch')),
  );
  const isUnauthorizedDomainError = Boolean(
    displayedError &&
      (displayedError.includes('auth/unauthorized-domain') ||
        displayedError.includes('Domínios Autorizados') ||
        displayedError.includes('não autorizado no Firebase Authentication')),
  );
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const copyValue = isOriginMismatchError ? currentOrigin : currentHost;
  const firebaseAuthSettingsUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;
  const googleCloudCredentialsUrl = `https://console.cloud.google.com/apis/credentials?project=${firebaseConfig.projectId}`;

  const handleCopyHost = async () => {
    if (!copyValue) return;
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopiedHost(true);
      toast(`${isOriginMismatchError ? 'Origem' : 'Domínio'} "${copyValue}" copiado!`);
      window.setTimeout(() => setCopiedHost(false), 2000);
    } catch {
      toast('Não foi possível copiar automaticamente. Selecione e copie o endereço exibido.', true);
    }
  };

  const activeSummary = localFolderSummary || savedLocalFolderMeta;
  const isBusyLocal = localLoading || isSyncingLocalFolder;

  return (
    <div className="min-h-screen w-full bg-[var(--page)] text-[var(--text)] flex flex-col justify-between">
      <div>
        <GovFederalBar />

        {/* Sub-barra limpa estilo gov.br com a marca MEC/estuda.gov.br */}
        <div className="w-full bg-[var(--panel)] border-b border-[var(--line)] shadow-[0_1px_4px_rgba(7,29,65,0.05)]">
          <div className="max-w-[1180px] mx-auto px-3 sm:px-8 min-h-[54px] py-2 flex items-center justify-between gap-2.5 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <span className="inline-flex items-center justify-center rounded-md bg-white px-1.5 sm:px-2 py-1 border border-[var(--line)] shrink-0">
                <img
                  src="/assets/aistudio/MEC-GOV-2025-Positivo-Horizontal_0f35c2cb.png"
                  alt="Ministério da Educação · Governo do Brasil"
                  className="h-5 sm:h-7 w-auto object-contain"
                />
              </span>
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-display text-[15px] sm:text-[17px] font-extrabold tracking-[-0.02em] text-[var(--text)] truncate">
                  estuda.gov.br
                </span>
                <span className="hidden md:inline text-[11.5px] font-medium text-[var(--muted)] truncate">
                  · Programa Nacional de Sobrevivência Acadêmica (Paródia)
                </span>
              </div>
            </div>

            <span className="hidden sm:inline font-mono-num text-[11px] font-semibold text-[var(--accent)] whitespace-nowrap shrink-0">
              Atendimento 24h
            </span>
          </div>
        </div>
      </div>

      {/* Input oculto para fallback ou seleção direta de pasta completa com subpastas */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        onChange={handleFolderInputChange}
        className="hidden"
        {...({ webkitdirectory: '', directory: '' } as any)}
      />

      <main className="flex-1 w-full max-w-[1180px] mx-auto px-5 py-8 sm:px-8 lg:py-12 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_410px] gap-8 lg:gap-12 items-start">
        {/* Coluna Esquerda: Vitrine Visual Institucional + Pilares do Portal */}
        <section className="flex flex-col gap-6 min-w-0">
          {/* Bloco Hero estilo Banner gov.br */}
          <div className="rounded-md overflow-hidden border border-[var(--line)] bg-[var(--panel)] shadow-[0_2px_10px_rgba(7,29,65,0.06)]">
            <div className="grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr] items-stretch">
              <div className="bg-white flex items-center justify-center p-4 sm:p-5 border-b md:border-b-0 md:border-r border-[var(--line)]">
                {!heroImgFailed ? (
                  <img
                    src="/assets/aistudio/MEC-GOV-205-Box-Horizontal_8384b2a7.png"
                    alt="Ministério da Educação · Governo do Brasil — Do lado do povo brasileiro"
                    onError={() => setHeroImgFailed(true)}
                    className="block w-full h-auto object-contain"
                  />
                ) : (
                  <div className="w-full py-10 px-6 bg-gradient-to-br from-[#071D41] via-[#1351B4] to-[#168821] flex flex-col items-center justify-center text-white text-center rounded">
                    <BookOpen className="w-9 h-9 mb-2 opacity-90" aria-hidden="true" />
                    <span className="font-display text-[15px] font-bold">
                      Ministério da Educação · estuda.gov.br
                    </span>
                  </div>
                )}
              </div>

              <div className="p-6 sm:p-7 flex flex-col justify-center bg-[var(--panel)]">
                <h1 className="m-0 font-display text-[26px] sm:text-[30px] font-extrabold leading-[1.16] tracking-[-0.02em] text-[var(--text)] [text-wrap:balance]">
                  Portal Único do Estudante Federal.
                </h1>
                <p className="mt-3 mb-0 text-[14px] leading-relaxed text-[var(--muted)]">
                  Emita seu comprovante de regularidade no edital, consulte a lei seca sem fila de espera e sincronize seu acervo local de provas e simulados com zero burocracia.
                </p>
                <div className="mt-4 pt-3 border-t border-[var(--line)] text-[11.5px] font-semibold text-[var(--accent)]">
                  Programa Bolsa-Questão &amp; Café Forte · Exercício 2026
                </div>
              </div>
            </div>
          </div>

          {/* Lista Limpa dos 4 Serviços do Portal */}
          <section
            aria-label="Serviços do portal"
            className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 pt-2"
          >
            {WORKSPACE_PILLARS.map((item) => (
              <div key={item.index} className="flex flex-col gap-1 border-t border-[var(--line)] pt-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono-num text-[12px] font-bold text-[var(--accent)]">
                    {item.index}
                  </span>
                  <h3 className="m-0 text-[13.5px] font-bold text-[var(--text)]">
                    {item.title}
                  </h3>
                </div>
                <p className="m-0 text-[12.5px] leading-relaxed text-[var(--muted)]">
                  {item.description}
                </p>
              </div>
            ))}
          </section>
        </section>

        {/* Coluna Direita: Cartão Limpo de Identificação estilo gov.br */}
        <aside className="w-full lg:sticky lg:top-6">
          <section
            aria-labelledby="login-card-title"
            className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-6 sm:p-7 shadow-[0_2px_12px_rgba(7,29,65,0.08)]"
          >
            <h2
              id="login-card-title"
              className="m-0 font-display text-[18px] font-bold tracking-[-0.015em] text-[var(--text)]"
            >
              Identifique-se no estuda.gov.br com:
            </h2>

            {/* Botão Principal: Entrar com Conta Google (Firebase Firestore + Google Drive) */}
            <div className="mt-4 pb-4 border-b border-[var(--line)]">
              {(firebaseConnected || driveConnected) && googleUser?.email ? (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={onContinueOffline}
                    className="w-full min-h-[44px] px-5 py-2.5 rounded-full border border-[var(--good)] bg-[var(--good)] text-white text-[13.5px] font-bold flex items-center justify-center gap-2 hover:opacity-95 transition-opacity cursor-pointer shadow-xs"
                  >
                    <span>Entrar no Portal ({googleUser.email})</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGoogleLogin(true)}
                    disabled={loading || isBusyLocal}
                    className="w-full py-1.5 text-[11.5px] font-semibold text-[var(--accent)] hover:underline bg-transparent border-0 cursor-pointer"
                  >
                    Trocar de conta Google
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleGoogleLogin()}
                  disabled={loading || isBusyLocal}
                  className="w-full min-h-[44px] px-5 py-2.5 rounded-full border border-[var(--line-strong)] bg-white text-[#1f1f1f] hover:border-[var(--accent)] text-[13.5px] font-bold flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60 shadow-xs"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    className="w-4 h-4 shrink-0"
                    aria-hidden="true"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>{loading ? 'Autenticando no Google…' : 'Entrar com Conta Google (Firebase & Drive)'}</span>
                </button>
              )}
            </div>

            {/* Método Principal: Pasta Local */}
            <div className="mt-4">
              <div className="flex items-center gap-2.5 text-[var(--text)]">
                <HardDrive className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
                <strong className="text-[13.5px] font-bold">
                  Pasta Local do Computador
                </strong>
                <span className="text-[11px] font-semibold text-[var(--good)]">
                  · Gravação direta
                </span>
              </div>
              <p className="mt-1.5 mb-3 text-[12px] leading-relaxed text-[var(--muted)]">
                Identifica automaticamente todas as subpastas e arquivos usados pelo portal e salva suas alterações diretamente no computador e no navegador.
              </p>

              {/* Pasta local já vinculada / reconhecida */}
              {(hasSavedLocalFolderHandle || activeSummary) && (
                <div className="mb-3 rounded border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FolderCheck className="w-4 h-4 text-[var(--good)] shrink-0" />
                      <span className="text-[12px] font-bold text-[var(--text)] truncate">
                        Pasta vinculada: {localFolderName || activeSummary?.rootFolderName || 'Pasta de Estudos'}
                      </span>
                    </div>
                    {activeSummary && (
                      <span className="font-mono-num text-[11px] font-semibold text-[var(--accent)] shrink-0">
                        {activeSummary.totalFiles} arquivo(s) · {activeSummary.totalFolders} pasta(s)
                      </span>
                    )}
                  </div>

                  {activeSummary && (
                    <div className="text-[11px] text-[var(--muted)] leading-relaxed">
                      {getLocalCategoryList(activeSummary)
                        .filter((cat) => cat.fileCount > 0)
                        .map((cat, idx) => (
                          <React.Fragment key={cat.key}>
                            {idx > 0 && <span aria-hidden="true"> · </span>}
                            <span>
                              {cat.label}: <strong className="font-mono-num text-[var(--text)]">{cat.fileCount}</strong>
                            </span>
                          </React.Fragment>
                        ))}
                    </div>
                  )}

                  {localFolderConnected ? (
                    <button
                      type="button"
                      onClick={onContinueOffline}
                      className="w-full min-h-[40px] px-5 py-2 rounded-full border border-[var(--good)] bg-[var(--good)] text-white text-[13px] font-bold flex items-center justify-center gap-2 hover:opacity-95 transition-opacity cursor-pointer"
                    >
                      <span>Entrar com a pasta &ldquo;{localFolderName}&rdquo;</span>
                      <ArrowRight className="w-4 h-4 shrink-0" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleReconnectSavedLocalFolder()}
                      disabled={isBusyLocal}
                      className="w-full min-h-[40px] px-5 py-2 rounded-full border border-[var(--accent)] bg-[var(--accent)] text-white text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-[var(--accent-hover)] transition-colors cursor-pointer disabled:opacity-60"
                    >
                      <FolderSync className={`w-4 h-4 shrink-0 ${isBusyLocal ? 'animate-spin' : ''}`} />
                      <span>
                        {isBusyLocal
                          ? 'Lendo pasta local…'
                          : `Abrir pasta "${activeSummary?.rootFolderName || 'Pasta Local'}"`}
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* Botão Primário estilo "Continuar" gov.br */}
              <button
                type="button"
                onClick={() => void handleSelectLocalFolder()}
                disabled={isBusyLocal}
                className="w-full min-h-[42px] px-6 py-2 rounded-full border border-[var(--accent)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[13.5px] font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait whitespace-nowrap shadow-xs"
              >
                <FolderOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  {isBusyLocal
                    ? 'Identificando arquivos…'
                    : hasSavedLocalFolderHandle || activeSummary
                    ? 'Selecionar outra Pasta'
                    : 'Entrar com Pasta Local'}
                </span>
              </button>

              {restoreProgress && (
                <div className="mt-3 rounded border border-[var(--accent)]/40 bg-[var(--panel-soft)] p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-[var(--text)] mb-1">
                    <span className="truncate">{restoreProgress.label}</span>
                    <span className="font-mono-num text-[var(--accent)] shrink-0">
                      {restoreProgress.current}/{restoreProgress.total}
                    </span>
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
            </div>

            {displayedError && (
              <div
                role="alert"
                className="mt-4 rounded border border-[var(--bad)]/40 bg-[var(--bad)]/10 p-3 text-[12px] text-[var(--bad)] flex flex-col gap-2"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="leading-relaxed">{displayedError}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(isUnauthorizedDomainError || isOriginMismatchError) && copyValue && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleCopyHost()}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-[var(--bad)]/35 bg-[var(--panel)] text-[var(--text)] text-[11.5px] font-semibold hover:border-[var(--accent)] transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {copiedHost ? (
                          <Check className="w-3.5 h-3.5 text-[var(--good)]" aria-hidden="true" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden="true" />
                        )}
                        <span>
                          {copiedHost
                            ? isOriginMismatchError
                              ? 'Origem copiada'
                              : 'Domínio copiado'
                            : isOriginMismatchError
                              ? 'Copiar origem'
                              : 'Copiar domínio'}
                        </span>
                      </button>
                      <a
                        href={isOriginMismatchError ? googleCloudCredentialsUrl : firebaseAuthSettingsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-semibold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap"
                      >
                        <span>
                          {isOriginMismatchError ? 'Abrir Google Cloud Console' : 'Abrir Firebase Console'}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      </a>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSelectLocalFolder()}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-semibold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Abrir Pasta Local</span>
                  </button>
                </div>
              </div>
            )}

            {/* Lista limpa estilo "Outras opções de identificação:" */}
            <div className="mt-6 pt-4 border-t border-[var(--line)]">
              <div className="text-[12.5px] font-semibold text-[var(--text)] mb-2.5">
                Outras opções de identificação:
              </div>

              <div className="flex flex-col divide-y divide-[var(--line)]/60">
                <button
                  type="button"
                  onClick={() => void handleGoogleLogin(false)}
                  disabled={loading || isBusyLocal}
                  className="w-full py-2.5 px-1 text-left flex items-center justify-between gap-2 text-[13px] font-medium text-[var(--text)] hover:text-[var(--accent)] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait bg-transparent border-0"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      className="w-4 h-4 shrink-0"
                      aria-hidden="true"
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                    <span className="truncate">
                      {loading ? 'Autenticando no Google…' : 'Conectar com Google Drive'}
                    </span>
                  </span>
                  <span className="text-[11px] font-bold text-[var(--good)] shrink-0">
                    Nuvem
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={isBusyLocal}
                  title="Importar pasta local inteira pelo seletor de diretório do navegador"
                  className="w-full py-2.5 px-1 text-left flex items-center gap-2.5 text-[13px] font-medium text-[var(--text)] hover:text-[var(--accent)] transition-colors cursor-pointer disabled:opacity-60 bg-transparent border-0"
                >
                  <FolderSync className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
                  <span>Importar pasta pelo seletor do navegador</span>
                </button>

                <button
                  type="button"
                  onClick={onContinueOffline}
                  className="w-full py-2.5 px-1 text-left flex items-center gap-2.5 text-[13px] font-medium text-[var(--text)] hover:text-[var(--accent)] transition-colors cursor-pointer bg-transparent border-0"
                >
                  <ArrowRight className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
                  <span>Entrar direto no navegador (sem cadastro)</span>
                </button>
              </div>

              <div className="mt-3">
                <PWAInstallButton variant="login" />
              </div>
            </div>

            {/* Informações técnicas e sigilo preservadas no rodapé do cartão */}
            <div className="mt-5 pt-4 border-t border-[var(--line)] flex flex-col gap-2.5 text-[11px] text-[var(--muted)] leading-relaxed">
              <div>
                <span className="font-bold text-[var(--text)]">Subpastas reconhecidas: </span>
                <span className="text-[var(--subtle)]">{CANONICAL_LOCAL_SUBFOLDERS.join(' · ')}</span>
              </div>

              <div className="flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong className="font-semibold text-[var(--text)]">Sigilo e Guarda Local Garantidos:</strong>{' '}
                  {localFolderWritable
                    ? 'sua pasta local está vinculada com gravação automática direta em disco e no banco IndexedDB do navegador.'
                    : 'todas as alterações, PDFs, leis, questões e backups são gravados automaticamente na pasta local selecionada e no banco local do navegador.'}
                </span>
              </div>

              {(lastLocalFolderSyncAt || lastLocalIncrementalBackupAt || lastCloudSyncAt) && (
                <div className="rounded border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-2 text-[10.5px] text-[var(--muted)] flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <strong className="text-[var(--text)] font-bold">Diagnóstico de Salvamento:</strong>
                  {lastLocalFolderSyncAt && (
                    <span>
                      Pasta local:{' '}
                      <strong className="font-mono-num text-[var(--text)]">
                        {new Date(lastLocalFolderSyncAt).toLocaleString('pt-BR')}
                      </strong>
                    </span>
                  )}
                  {lastLocalIncrementalBackupAt && (
                    <span>
                      Backup incremental:{' '}
                      <strong className="font-mono-num text-[var(--text)]">
                        {new Date(lastLocalIncrementalBackupAt).toLocaleString('pt-BR')}
                      </strong>
                    </span>
                  )}
                  {lastCloudSyncAt && (
                    <span>
                      Nuvem Drive:{' '}
                      <strong className="font-mono-num text-[var(--text)]">
                        {new Date(lastCloudSyncAt).toLocaleString('pt-BR')}
                      </strong>
                    </span>
                  )}
                </div>
              )}
            </div>
          </section>
        </aside>
      </main>

      <footer className="w-full border-t border-[var(--line)] bg-[var(--panel)] px-5 py-4 sm:px-8">
        <div className="max-w-[1180px] mx-auto flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--muted)]">
          <span>
            <strong className="text-[var(--text)]">estuda.gov.br</strong> · Ministério da Aprovação, Café Forte e Madrugadas (Paródia)
          </span>
          <span className="text-[var(--subtle)]">
            Leitura e Gravação Direta em Pasta Local · Sincronização Opcional via Google Drive
          </span>
        </div>
      </footer>
    </div>
  );
};
