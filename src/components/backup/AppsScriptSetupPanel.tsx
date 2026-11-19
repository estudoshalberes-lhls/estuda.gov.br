import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  CloudDownload,
  CloudUpload,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FolderSync,
  KeyRound,
  LogOut,
  RefreshCw,
  Server,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { APPS_SCRIPT_CODE_GS, APPS_SCRIPT_CODE_VERSION } from '../../lib/appsScriptCode';
import { API_URL as DEFAULT_API_URL } from '../../lib/appsScriptBackend';
import { Panel } from '../ui/PageHeader';

export const AppsScriptSetupPanel: React.FC = () => {
  const {
    gasSession,
    gasConnected,
    gasApiUrl,
    setGasApiUrl,
    connectAppsScript,
    disconnectAppsScript,
    testAppsScriptConnection,
    setAppsScriptStudyFolder,
    setupAppsScriptDailyBackup,
    resolveVersionDivergenceKeepLocal,
    resolveVersionDivergenceKeepDrive,
    lastCloudSyncAt,
    isSyncingDrive,
    hasPendingCloudChanges,
    requestConfirm,
    toast,
  } = useStudy();

  const [urlInput, setUrlInput] = useState(gasApiUrl || DEFAULT_API_URL);
  const [username, setUsername] = useState('estudos.halberes@gmail.com');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [testingPing, setTestingPing] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [folderInput, setFolderInput] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);
  const [enablingTrigger, setEnablingTrigger] = useState(false);
  const [syncingAction, setSyncingAction] = useState<'push' | 'pull' | null>(null);

  const handleTestConnection = async () => {
    setTestingPing(true);
    setPingResult(null);
    try {
      const target = urlInput.trim() || DEFAULT_API_URL;
      setGasApiUrl(target);
      const res = await testAppsScriptConnection(target);
      setPingResult({ ok: res.ok, message: res.message });
    } finally {
      setTestingPing(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast('Informe seu usuário e senha para conectar ao Google Apps Script.', true);
      return;
    }
    setConnecting(true);
    try {
      const target = urlInput.trim() || DEFAULT_API_URL;
      setGasApiUrl(target);
      const res = await connectAppsScript(username.trim(), password.trim(), target);
      if (res.ok) {
        setPassword('');
      } else if (res.error) {
        toast(res.error, true);
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleCopyCodeGs = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_CODE_GS);
      setCopiedCode(true);
      toast(`Código Code.gs (v${APPS_SCRIPT_CODE_VERSION}) copiado! Cole no seu projeto do Google Apps Script.`);
      window.setTimeout(() => setCopiedCode(false), 2600);
    } catch {
      toast('Não foi possível copiar automaticamente. Use o botão "Baixar Code.gs".', true);
    }
  };

  const handleDownloadCodeGs = () => {
    const blob = new Blob([APPS_SCRIPT_CODE_GS], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Code.gs';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Arquivo Code.gs baixado com sucesso!');
  };

  const handleSaveDefaultFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderInput.trim()) return;
    setSavingFolder(true);
    try {
      const ok = await setAppsScriptStudyFolder(folderInput.trim());
      if (ok) setFolderInput('');
    } finally {
      setSavingFolder(false);
    }
  };

  const handleForcePush = async () => {
    const ok = await requestConfirm({
      title: 'Enviar versão Local para o Google Drive (Apps Script)',
      description:
        'Esta ação gravará o estado atual deste dispositivo no Google Drive (e atualizará os módulos separados e a planilha oculta). Continuar?',
      confirmLabel: 'Enviar agora',
    });
    if (!ok) return;
    setSyncingAction('push');
    try {
      await resolveVersionDivergenceKeepLocal();
    } finally {
      setSyncingAction(null);
    }
  };

  const handlePullCloud = async () => {
    const ok = await requestConfirm({
      title: 'Baixar versão mais recente do Google Drive',
      description:
        'Esta ação substituirá o estado local pela versão salva no Google Drive. Um ponto de restauração local de segurança será criado automaticamente antes da troca. Continuar?',
      confirmLabel: 'Baixar do Drive',
    });
    if (!ok) return;
    setSyncingAction('pull');
    try {
      await resolveVersionDivergenceKeepDrive();
    } finally {
      setSyncingAction(null);
    }
  };

  return (
    <Panel
      title="Modo 100% Google Apps Script (Drive + Planilha Oculta)"
      subtitle="Sincronização permanente multi-dispositivo sem desconexões de 1 hora, sem erros de permissão do Drive e com trava de concorrência no servidor."
      className="mb-4"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCopyCodeGs()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap cursor-pointer"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCode ? 'Code.gs copiado!' : `Copiar Code.gs (v${APPS_SCRIPT_CODE_VERSION})`}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadCodeGs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-semibold hover:border-[var(--accent)] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Baixar Code.gs</span>
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Linha limpa de status da conexão (sem cards empilhados) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--line)]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
            <span className="inline-flex items-center gap-1.5 font-bold text-[var(--text)]">
              <Server
                className={`w-4 h-4 ${gasConnected ? 'text-[var(--good)]' : 'text-[var(--muted)]'}`}
                aria-hidden="true"
              />
              {gasConnected ? 'Conectado via Google Apps Script' : 'Aguardando autenticação no Apps Script'}
            </span>
            {gasConnected && gasSession && (
              <>
                <span className="text-[var(--subtle)]">·</span>
                <span className="text-[var(--muted)]">
                  Conta: <strong className="text-[var(--text)]">{gasSession.username}</strong>
                </span>
                <span className="text-[var(--subtle)]">·</span>
                <span className="text-[var(--muted)]">
                  Pasta:{' '}
                  {gasSession.folderUrl ? (
                    <a
                      href={gasSession.folderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                    >
                      {gasSession.folderName}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <strong className="text-[var(--text)]">{gasSession.folderName}</strong>
                  )}
                </span>
                <span className="text-[var(--subtle)]">·</span>
                <span className="font-mono-num text-[var(--muted)]">
                  Revisão v{gasSession.serverVersion || 0}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11.5px] font-mono-num text-[var(--muted)]">
            {gasConnected && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--good)]">
                <Cloud className="w-3.5 h-3.5" />
                {isSyncingDrive
                  ? 'Salvando na nuvem…'
                  : hasPendingCloudChanges
                    ? 'Alterações pendentes'
                    : lastCloudSyncAt
                      ? `Salvo às ${new Date(lastCloudSyncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                      : 'Salvo na nuvem'}
              </span>
            )}
          </div>
        </div>

        {/* Configuração da URL + Teste Ping */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-2.5 items-end">
          <div>
            <label
              htmlFor="gas-api-url-input"
              className="block text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--muted)] mb-1"
            >
              URL da Implantação Web App (API_URL)
            </label>
            <input
              id="gas-api-url-input"
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="ce-input font-mono-num text-[12px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleTestConnection()}
              disabled={testingPing}
              className="inline-flex items-center gap-1.5 h-[38px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[var(--accent)] ${testingPing ? 'animate-spin' : ''}`} />
              <span>{testingPing ? 'Testando…' : 'Testar conexão'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCodePreview((prev) => !prev)}
              className="inline-flex items-center gap-1.5 h-[38px] px-3 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--text)] text-[12px] font-semibold whitespace-nowrap cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>{showCodePreview ? 'Ocultar Code.gs' : 'Ver Code.gs'}</span>
            </button>
          </div>
        </div>

        {pingResult && (
          <div
            className={`rounded-lg border px-3 py-2 text-[12px] flex items-start gap-2 ${
              pingResult.ok
                ? 'border-[var(--good)]/40 bg-[var(--good)]/10 text-[var(--text)]'
                : 'border-[var(--bad)]/40 bg-[var(--bad)]/10 text-[var(--bad)]'
            }`}
          >
            {pingResult.ok ? (
              <CheckCircle2 className="w-4 h-4 text-[var(--good)] shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[var(--bad)] shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{pingResult.message}</span>
          </div>
        )}

        {/* Área de Login rápido (se desconectado) OU Ações de Sincronização e Pasta Padrão (se conectado) */}
        {!gasConnected ? (
          <form
            onSubmit={handleLoginSubmit}
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 space-y-3"
          >
            <div className="flex items-center gap-2 text-[12.5px] font-bold text-[var(--text)]">
              <KeyRound className="w-4 h-4 text-[var(--accent)]" />
              <span>Conectar com Usuário e Senha (sessão permanente de 30 dias)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2.5 items-end">
              <div>
                <label htmlFor="gas-backup-user" className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                  Usuário
                </label>
                <input
                  id="gas-backup-user"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="ce-input"
                  placeholder="estudos.halberes@gmail.com"
                />
              </div>
              <div>
                <label htmlFor="gas-backup-pass" className="block text-[11px] font-semibold text-[var(--muted)] mb-1">
                  Senha (padrão inicial no Code.gs: estuda2026)
                </label>
                <input
                  id="gas-backup-pass"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="ce-input"
                  placeholder="Digite sua senha"
                />
              </div>
              <button
                type="submit"
                disabled={connecting}
                className="h-[38px] px-4 rounded-lg border border-[var(--good)] bg-[var(--good)] text-white text-[12.5px] font-bold hover:opacity-95 disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                {connecting ? 'Conectando…' : 'Conectar agora'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleForcePush()}
                disabled={syncingAction !== null}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                <CloudUpload className="w-3.5 h-3.5" />
                <span>{syncingAction === 'push' ? 'Enviando…' : 'Enviar estado local agora'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handlePullCloud()}
                disabled={syncingAction !== null}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                <CloudDownload className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>{syncingAction === 'pull' ? 'Baixando…' : 'Puxar versão do Drive'}</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  setEnablingTrigger(true);
                  try {
                    await setupAppsScriptDailyBackup();
                  } finally {
                    setEnablingTrigger(false);
                  }
                }}
                disabled={enablingTrigger}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-semibold hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-[var(--good)]" />
                <span>{enablingTrigger ? 'Ativando…' : 'Ativar backup diário automático (03h)'}</span>
              </button>

              <button
                type="button"
                onClick={() => void disconnectAppsScript()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/50 text-[12px] font-semibold whitespace-nowrap cursor-pointer ml-auto"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Encerrar sessão</span>
              </button>
            </div>

            {/* Definir pasta padrão do Google Drive para TODOS os computadores */}
            <form
              onSubmit={handleSaveDefaultFolder}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-[var(--line)]"
            >
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text)] shrink-0">
                <FolderSync className="w-4 h-4 text-[var(--accent)]" />
                <span>Fixar pasta padrão no Drive (todos os PCs):</span>
              </div>
              <input
                type="text"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="Cole o link ou ID da pasta do Google Drive (ou digite um novo nome)"
                className="ce-input flex-1 min-w-0 text-[12px]"
              />
              <button
                type="submit"
                disabled={savingFolder || !folderInput.trim()}
                className="h-[38px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] text-[12px] font-bold hover:border-[var(--accent)] disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                {savingFolder ? 'Salvando…' : 'Salvar pasta padrão'}
              </button>
            </form>
          </div>
        )}

        {/* Guia direto de 3 passos para atualizar a implantação existente mantendo a mesma URL */}
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3.5 py-3 text-[11.5px] text-[var(--muted)] leading-relaxed">
          <div className="flex items-center gap-1.5 font-bold text-[var(--text)] mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--good)]" />
            <span>Como ativar/atualizar o Code.gs na sua implantação (mantendo exatamente a mesma URL):</span>
          </div>
          <ol className="m-0 pl-4 space-y-0.5 list-decimal">
            <li>
              Clique em <strong className="text-[var(--text)]">Copiar Code.gs</strong> acima e cole substituindo tudo no editor do seu projeto em{' '}
              <strong className="text-[var(--text)]">script.google.com</strong> (opcionalmente troque <code className="font-mono-num">AUTH_PASS</code> no topo).
            </li>
            <li>
              Clique em <strong className="text-[var(--text)]">Implantar → Gerenciar implantações → ícone de lápis (Editar) → Versão: Nova versão → Implantar</strong>.
            </li>
            <li>
              Clique em <strong className="text-[var(--text)]">Testar conexão</strong> acima e entre com seu usuário e senha. A partir daí, Drive, Planilha oculta, Post-it.txt, Leis, Cronograma e PDFs funcionam 100% sem expirar!
            </li>
          </ol>
        </div>

        {showCodePreview && (
          <div className="rounded-lg border border-[var(--line)] bg-[var(--page)] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--line)] bg-[var(--panel-soft)] text-[11.5px]">
              <strong className="font-mono-num text-[var(--text)]">
                Code.gs · v{APPS_SCRIPT_CODE_VERSION} (pronto para produção)
              </strong>
              <button
                type="button"
                onClick={() => void handleCopyCodeGs()}
                className="text-[var(--accent)] font-bold hover:underline bg-transparent border-0 cursor-pointer"
              >
                {copiedCode ? 'Copiado!' : 'Copiar tudo'}
              </button>
            </div>
            <pre className="m-0 p-3 max-h-[320px] overflow-auto text-[11px] font-mono-num text-[var(--text)] leading-relaxed">
              {APPS_SCRIPT_CODE_GS}
            </pre>
          </div>
        )}
      </div>
    </Panel>
  );
};
