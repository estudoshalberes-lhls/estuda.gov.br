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

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const ok = await connectGoogleDrive();
      if (!ok) {
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
  const isUnauthorizedDomainError = Boolean(
    displayedError &&
      (displayedError.includes('auth/unauthorized-domain') ||
        displayedError.includes('Domínios Autorizados') ||
        displayedError.includes('não autorizado no Firebase Authentication')),
  );
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const firebaseAuthSettingsUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;

  const handleCopyHost = async () => {
    if (!currentHost) return;
    try {
      await navigator.clipboard.writeText(currentHost);
      setCopiedHost(true);
      toast(`Domínio "${currentHost}" copiado!`);
      window.setTimeout(() => setCopiedHost(false), 2000);
    } catch {
      toast('Não foi possível copiar automaticamente. Selecione e copie o domínio exibido.', true);
    }
  };

  const activeSummary = localFolderSummary || savedLocalFolderMeta;
  const isBusyLocal = localLoading || isSyncingLocalFolder;

  return (
    <div className="min-h-screen w-full bg-[var(--page)] text-[var(--text)] flex flex-col justify-between">
      <GovFederalBar />

      {/* Input oculto para fallback ou seleção direta de pasta completa com subpastas */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        onChange={handleFolderInputChange}
        className="hidden"
        {...({ webkitdirectory: '', directory: '' } as any)}
      />

      <div className="w-full max-w-[1160px] mx-auto my-auto px-5 py-8 sm:px-8 lg:px-10 grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] lg:grid-rows-[auto_1fr] gap-8 lg:gap-x-12 lg:gap-y-6 items-start">
        {/* Intro & Brand Header */}
        <header className="lg:col-start-1 lg:row-start-1 flex flex-col items-start">
          <div className="flex flex-wrap items-center gap-3.5 mb-4">
            <span className="inline-flex items-center justify-center rounded-xl border border-[var(--line-strong)] bg-white px-3 py-1.5 shadow-xs shrink-0">
              <img
                src="/assets/aistudio/MEC-GOV-2025-Positivo-Horizontal_0f35c2cb.png"
                alt="Ministério da Educação · Governo do Brasil"
                className="h-8 sm:h-9 w-auto object-contain"
              />
            </span>
            <div>
              <span className="block font-display text-[19px] font-extrabold tracking-[-0.02em] text-[var(--text)] leading-none">
                estuda.gov.br
              </span>
              <span className="block text-[11.5px] font-medium text-[var(--muted)] mt-1">
                Programa Nacional de Sobrevivência Acadêmica (Paródia)
              </span>
            </div>
          </div>

          <h1 className="m-0 font-display text-[28px] sm:text-[34px] lg:text-[38px] font-extrabold leading-[1.14] tracking-[-0.025em] text-[var(--text)] [text-wrap:balance] max-w-[20ch]">
            Portal Único do Estudante Federal.
          </h1>
          <p className="mt-3 mb-0 text-[14.5px] sm:text-[15.5px] leading-relaxed text-[var(--muted)] max-w-[50ch]">
            Emita seu comprovante de regularidade no edital, consulte a lei seca sem fila de espera e sincronize seu acervo local de provas e simulados com zero burocracia.
          </p>

          {/* Identidade Institucional MEC / Governo Federal */}
          <div className="mt-5 w-full rounded-xl overflow-hidden border border-[var(--line-strong)] bg-[var(--panel)] shadow-[var(--shadow-sm)]">
            {!heroImgFailed ? (
              <div className="w-full bg-white">
                <img
                  src="/assets/aistudio/MEC-GOV-205-Box-Horizontal_8384b2a7.png"
                  alt="Ministério da Educação · Governo do Brasil — Do lado do povo brasileiro"
                  onError={() => setHeroImgFailed(true)}
                  className="block w-full h-auto object-contain"
                />
              </div>
            ) : (
              <div className="w-full py-8 px-6 bg-gradient-to-br from-[#071D41] via-[#1351B4] to-[#168821] flex flex-col items-center justify-center text-white text-center">
                <BookOpen className="w-9 h-9 mb-2 opacity-90" aria-hidden="true" />
                <span className="font-display text-[15px] font-bold">
                  Ministério da Educação · estuda.gov.br
                </span>
              </div>
            )}
            <div className="border-t border-[var(--line)] bg-[var(--panel-soft)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11.5px] font-semibold text-[var(--text)]">
                Programa Bolsa-Questão &amp; Café Forte · Exercício 2026
              </span>
              <span className="font-mono-num text-[11px] font-semibold text-[var(--accent)] whitespace-nowrap">
                Atendimento 24h
              </span>
            </div>
          </div>
        </header>

        {/* Login Card (acesso.gov.br parody) */}
        <main className="lg:col-start-2 lg:row-start-1 lg:row-span-2 w-full">
          <section
            aria-labelledby="login-card-title"
            className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 sm:p-7 shadow-[var(--shadow)]"
          >
            <div className="mb-5 pb-4 border-b border-[var(--line)]">
              <p className="m-0 text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent)]">
                Acesso Único · Sem senha de cartório
              </p>
              <h2
                id="login-card-title"
                className="mt-1.5 mb-0 font-display text-[22px] sm:text-[24px] font-extrabold tracking-[-0.02em] text-[var(--text)]"
              >
                Identifique-se no estuda.gov.br
              </h2>
              <p className="mt-1.5 mb-0 text-[13px] leading-relaxed text-[var(--muted)]">
                Selecione uma pasta local do computador para carregar e gravar automaticamente seus dados, ou acesse via Google Drive.
              </p>
            </div>

            {/* Bloco Principal: Leitura e Salvamento em Pasta Local */}
            <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-4 mb-4 flex flex-col gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className="w-9 h-9 rounded-lg border border-[var(--accent)]/30 bg-[var(--panel)] text-[var(--accent)] grid place-items-center shrink-0 mt-0.5">
                  <HardDrive className="w-4 h-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <strong className="text-[13.5px] font-bold text-[var(--text)]">
                      Pasta Local do Computador
                    </strong>
                    <span className="text-[11px] font-semibold text-[var(--good)]">
                      · Gravação direta em disco
                    </span>
                  </div>
                  <p className="m-0 mt-1 text-[12px] text-[var(--muted)] leading-relaxed">
                    Identifica automaticamente todas as subpastas e arquivos usados pelo portal e salva suas alterações diretamente no computador e no navegador.
                  </p>
                </div>
              </div>

              {/* Caso já exista uma pasta local reconhecida/vinculada */}
              {(hasSavedLocalFolderHandle || activeSummary) && (
                <div className="rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] p-3 flex flex-col gap-2">
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

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {localFolderConnected ? (
                      <button
                        type="button"
                        onClick={onContinueOffline}
                        className="flex-1 min-h-[40px] px-4 py-2 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[13px] font-bold flex items-center justify-center gap-2 hover:opacity-95 transition-opacity cursor-pointer"
                      >
                        <span>Entrar com a pasta &ldquo;{localFolderName}&rdquo;</span>
                        <ArrowRight className="w-4 h-4 shrink-0" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleReconnectSavedLocalFolder()}
                        disabled={isBusyLocal}
                        className="flex-1 min-h-[40px] px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-[var(--accent-hover)] transition-colors cursor-pointer disabled:opacity-60"
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
                </div>
              )}

              {/* Botões para selecionar pasta local */}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => void handleSelectLocalFolder()}
                  disabled={isBusyLocal}
                  className="flex-1 min-h-[44px] px-4 py-2.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait whitespace-nowrap"
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

                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={isBusyLocal}
                  title="Importar pasta local inteira pelo seletor de diretório do navegador"
                  className="min-h-[44px] px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] hover:border-[var(--accent)] text-[var(--text)] text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 shrink-0 whitespace-nowrap"
                >
                  <FolderSync className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                  <span>Importar pasta</span>
                </button>
              </div>

              {restoreProgress && (
                <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--panel)] p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-[var(--text)] mb-1">
                    <span className="truncate">{restoreProgress.label}</span>
                    <span className="font-mono-num text-[var(--accent)] shrink-0">
                      {restoreProgress.current}/{restoreProgress.total}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--panel-soft)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)] transition-all duration-200"
                      style={{
                        width: `${Math.round((restoreProgress.current / Math.max(1, restoreProgress.total)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Pastas e arquivos reconhecidos pelo site */}
              <div className="pt-2 border-t border-[var(--line)]">
                <div className="text-[11px] font-bold text-[var(--muted)] mb-1">
                  Subpastas reconhecidas no dossiê local:
                </div>
                <p className="m-0 text-[11px] text-[var(--subtle)] leading-relaxed">
                  {CANONICAL_LOCAL_SUBFOLDERS.join(' · ')}
                </p>
              </div>
            </div>

            {displayedError && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-[var(--bad)]/40 bg-[var(--bad)]/10 p-3.5 text-[12.5px] text-[var(--bad)] flex flex-col gap-2.5"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="leading-relaxed">{displayedError}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isUnauthorizedDomainError && currentHost && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleCopyHost()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--bad)]/35 bg-[var(--panel)] text-[var(--text)] text-[12px] font-semibold hover:border-[var(--accent)] transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {copiedHost ? (
                          <Check className="w-3.5 h-3.5 text-[var(--good)]" aria-hidden="true" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden="true" />
                        )}
                        <span>{copiedHost ? 'Domínio copiado' : 'Copiar domínio'}</span>
                      </button>
                      <a
                        href={firebaseAuthSettingsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-semibold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap"
                      >
                        <span>Abrir Firebase Console</span>
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      </a>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSelectLocalFolder()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-semibold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Abrir Pasta Local</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 my-3.5" aria-hidden="true">
              <span className="h-px flex-1 bg-[var(--line)]" />
              <span className="text-[11px] font-medium text-[var(--subtle)]">
                ou outras modalidades de acesso
              </span>
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading || isBusyLocal}
                className="w-full min-h-[44px] px-4 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] text-[var(--text)] text-[13px] font-semibold flex items-center justify-center gap-2.5 whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer disabled:opacity-60 disabled:cursor-wait"
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
                <span>{loading ? 'Autenticando no Google…' : 'Conectar com Google Drive'}</span>
              </button>

              <button
                type="button"
                onClick={onContinueOffline}
                className="w-full min-h-[42px] px-4 py-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] hover:border-[var(--line-strong)] hover:text-[var(--text)] text-[var(--muted)] text-[12.5px] font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer"
              >
                <span>Entrar direto no navegador (sem cadastro)</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 pt-4 border-t border-[var(--line)] flex flex-col gap-2 text-[11.5px] text-[var(--muted)] leading-relaxed">
              <div className="flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong className="font-semibold text-[var(--text)]">Sigilo e Guarda Local Garantidos:</strong>{' '}
                  {localFolderWritable
                    ? 'sua pasta local está vinculada com gravação automática direta em disco e no banco IndexedDB do navegador.'
                    : 'todas as alterações, PDFs, leis, questões e backups são gravados automaticamente na pasta local selecionada e no banco local do navegador.'}
                </span>
              </div>
              {(lastLocalFolderSyncAt || lastLocalIncrementalBackupAt || lastCloudSyncAt) && (
                <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 text-[11px] text-[var(--muted)] flex flex-wrap items-center gap-x-3 gap-y-1">
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
        </main>

        {/* Workspace Highlights */}
        <section
          aria-label="Serviços do portal"
          className="lg:col-start-1 lg:row-start-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 pt-5 border-t border-[var(--line)]"
        >
          {WORKSPACE_PILLARS.map((item) => (
            <div key={item.index} className="flex flex-col gap-1">
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
      </div>

      <footer className="w-full border-t border-[var(--line)] bg-[var(--panel)] px-5 py-4 sm:px-8 lg:px-10">
        <div className="max-w-[1160px] mx-auto flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--muted)]">
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
