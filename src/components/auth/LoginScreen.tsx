import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Server,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
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
    title: 'Google Drive + Apps Script em Nuvem',
    description:
      'Sincronize todas as tabelas, PDFs, Post-it e backups automáticos direto no seu Google Drive, sem popups OAuth.',
  },
] as const;

export const LoginScreen: React.FC<LoginScreenProps> = ({ onContinueOffline }) => {
  const {
    gasConnected,
    gasSession,
    connectAppsScript,
    authError,
    lastCloudSyncAt,
  } = useStudy();

  const [gasLoading, setGasLoading] = useState(false);
  const [gasUsername, setGasUsername] = useState('estudos.halberes@gmail.com');
  const [gasPassword, setGasPassword] = useState('');
  const [showGasPassword, setShowGasPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const handleAppsScriptLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gasUsername.trim() || !gasPassword.trim()) {
      setErrorMessage('Informe usuário e senha para acessar sua nuvem no Google Drive.');
      return;
    }
    setGasLoading(true);
    setErrorMessage(null);
    try {
      const res = await connectAppsScript(gasUsername.trim(), gasPassword.trim());
      if (res.ok) {
        onContinueOffline();
      } else {
        setErrorMessage(res.error || 'Usuário ou senha incorretos.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Falha ao conectar com o Google Apps Script.');
    } finally {
      setGasLoading(false);
    }
  };

  const displayedError = errorMessage || authError;

  return (
    <div className="min-h-screen w-full bg-[var(--page)] text-[var(--text)] flex flex-col justify-between">
      <div>
        <GovFederalBar />

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

      <main className="flex-1 w-full max-w-[1180px] mx-auto px-5 py-8 sm:px-8 lg:py-12 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_410px] gap-8 lg:gap-12 items-start">
        <section className="flex flex-col gap-6 min-w-0">
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
                  Emita seu comprovante de regularidade no edital, consulte a lei seca sem fila de espera e sincronize seu acervo de provas e simulados direto no Google Drive com zero burocracia.
                </p>
                <div className="mt-4 pt-3 border-t border-[var(--line)] text-[11.5px] font-semibold text-[var(--accent)]">
                  Programa Bolsa-Questão &amp; Café Forte · Exercício 2026
                </div>
              </div>
            </div>
          </div>

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

        <aside className="w-full lg:sticky lg:top-6">
          <section
            aria-labelledby="login-card-title"
            className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-6 sm:p-7 shadow-[0_2px_12px_rgba(7,29,65,0.08)]"
          >
            <h2
              id="login-card-title"
              className="m-0 font-display text-[18px] font-bold tracking-[-0.015em] text-[var(--text)]"
            >
              Identifique-se no estuda.gov.br:
            </h2>

            <div className="mt-4 pb-4 border-b border-[var(--line)]">
              {gasConnected && gasSession ? (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={onContinueOffline}
                    className="w-full min-h-[44px] px-5 py-2.5 rounded-full border border-[var(--good)] bg-[var(--good)] text-white text-[13.5px] font-bold flex items-center justify-center gap-2 hover:opacity-95 transition-opacity cursor-pointer shadow-xs"
                  >
                    <Server className="w-4 h-4 shrink-0" />
                    <span>Entrar no Portal ({gasSession.username})</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                  <p className="m-0 text-[11px] text-center text-[var(--muted)]">
                    Modo 100% Google Apps Script ativo · Pasta {gasSession.folderName}
                  </p>
                </div>
              ) : (
                <form onSubmit={handleAppsScriptLogin} className="space-y-3">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-[var(--accent)]">
                    <KeyRound className="w-3.5 h-3.5 shrink-0" />
                    <span>Acesso Universal (Google Drive · Apps Script)</span>
                  </div>

                  <div>
                    <label htmlFor="login-gas-user" className="block text-[11.5px] font-semibold text-[var(--muted)] mb-1">
                      Usuário
                    </label>
                    <input
                      id="login-gas-user"
                      type="text"
                      autoComplete="username"
                      value={gasUsername}
                      onChange={(e) => setGasUsername(e.target.value)}
                      placeholder="estudos.halberes@gmail.com"
                      className="ce-input"
                    />
                  </div>

                  <div>
                    <label htmlFor="login-gas-pass" className="block text-[11.5px] font-semibold text-[var(--muted)] mb-1">
                      Senha
                    </label>
                    <div className="relative">
                      <input
                        id="login-gas-pass"
                        type={showGasPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={gasPassword}
                        onChange={(e) => setGasPassword(e.target.value)}
                        placeholder="Digite sua senha de acesso"
                        className="ce-input pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGasPassword((v) => !v)}
                        aria-label={showGasPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--text)] bg-transparent border-0 p-1 cursor-pointer"
                      >
                        {showGasPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={gasLoading}
                    className="w-full min-h-[44px] px-5 py-2.5 rounded-full border border-[var(--accent)] bg-[var(--accent)] text-white text-[13.5px] font-bold flex items-center justify-center gap-2 hover:bg-[var(--accent-hover)] transition-colors cursor-pointer disabled:opacity-60 shadow-xs"
                  >
                    <span>{gasLoading ? 'Sincronizando com o Drive…' : 'Entrar e Sincronizar Nuvem'}</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                </form>
              )}
            </div>

            {displayedError && (
              <div
                role="alert"
                className="mt-4 rounded border border-[var(--bad)]/40 bg-[var(--bad)]/10 p-3 text-[12px] text-[var(--bad)] flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="leading-relaxed">{displayedError}</span>
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-[var(--line)]">
              <div className="text-[12.5px] font-semibold text-[var(--text)] mb-2">
                Outras opções de acesso:
              </div>

              <button
                type="button"
                onClick={onContinueOffline}
                className="w-full py-2.5 px-1 text-left flex items-center gap-2.5 text-[13px] font-medium text-[var(--text)] hover:text-[var(--accent)] transition-colors cursor-pointer bg-transparent border-0"
              >
                <ArrowRight className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
                <span>Entrar direto no navegador (modo local / configurar Backup)</span>
              </button>

              <div className="mt-3">
                <PWAInstallButton variant="login" />
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-[var(--line)] flex flex-col gap-2.5 text-[11px] text-[var(--muted)] leading-relaxed">
              <div className="flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong className="font-semibold text-[var(--text)]">Guarda Permanente no Google Drive:</strong>{' '}
                  suas alterações, cronograma, leis, questões, Post-it, PDFs e backups são sincronizados diretamente com o seu Google Drive via Apps Script, além do cache offline no navegador.
                </span>
              </div>

              {lastCloudSyncAt && (
                <div className="rounded border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-2 text-[10.5px] text-[var(--muted)] flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <strong className="text-[var(--text)] font-bold">Última Sincronização:</strong>
                  <span>
                    Google Drive:{' '}
                    <strong className="font-mono-num text-[var(--text)]">
                      {new Date(lastCloudSyncAt).toLocaleString('pt-BR')}
                    </strong>
                  </span>
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
            Sincronização 100% Google Apps Script &amp; Google Drive
          </span>
        </div>
      </footer>
    </div>
  );
};
