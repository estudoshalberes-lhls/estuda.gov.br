import React, { useMemo, useState } from 'react';
import { THEMES } from '../data/seedData';
import { useStudy } from '../context/StudyContext';
import { ModuleName } from '../types/study';
import {
  ChevronDown,
  Cloud,
  ExternalLink,
  Keyboard,
  LogOut,
  Server,
  SlidersHorizontal,
} from 'lucide-react';
import { PageHeader, Panel } from '../components/ui/PageHeader';
import { KEYBOARD_SHORTCUT_GROUPS } from '../components/layout/KeyboardShortcutsModal';

const CONFIGURABLE_MODULES: ReadonlyArray<{
  name: ModuleName;
  hasUpload: boolean;
  hasSearch: boolean;
}> = [
  { name: 'Discursiva', hasUpload: true, hasSearch: false },
  { name: 'Provas', hasUpload: true, hasSearch: false },
  { name: 'Caderno de Erros', hasUpload: false, hasSearch: true },
  { name: 'Súmulas e Jurisprudência', hasUpload: false, hasSearch: true },
  { name: 'Lei Seca', hasUpload: false, hasSearch: true },
  { name: 'Matriz de Incidência', hasUpload: true, hasSearch: true },
  { name: 'PDFs Pessoais', hasUpload: true, hasSearch: false },
  { name: 'Resumos & Mapas', hasUpload: true, hasSearch: false },
  { name: 'Utilidades', hasUpload: true, hasSearch: false },
];

export const SettingsPage: React.FC = () => {
  const {
    db,
    moduleVisibility,
    updatePreferences,
    updateModuleVisibility,
    gasConnected,
    gasSession,
    driveFolderUrl,
    activeDriveFolderName,
    lastCloudSyncAt,
    disconnectAppsScript,
    setActivePage,
    toast,
  } = useStudy();
  const prefs = db.preferences;

  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const hiddenControlsCount = useMemo(() => {
    let count = 0;
    for (const mod of CONFIGURABLE_MODULES) {
      const vis = moduleVisibility(mod.name);
      if (mod.hasUpload && vis.hide_upload) count += 1;
      if (mod.hasSearch && vis.hide_search) count += 1;
    }
    return count;
  }, [moduleVisibility]);

  const allModulesHidden = CONFIGURABLE_MODULES.every((mod) => {
    const vis = moduleVisibility(mod.name);
    return (!mod.hasUpload || vis.hide_upload) && (!mod.hasSearch || vis.hide_search);
  });

  const anyModuleHidden = hiddenControlsCount > 0;

  const setAllModulesVisibility = (hide: boolean) => {
    const nextModules = { ...(prefs.modules || {}) };
    for (const mod of CONFIGURABLE_MODULES) {
      const current = nextModules[mod.name] || { hide_upload: false, hide_search: false };
      nextModules[mod.name] = {
        hide_upload: mod.hasUpload ? hide : current.hide_upload,
        hide_search: mod.hasSearch ? hide : current.hide_search,
      };
    }
    updatePreferences({ modules: nextModules });
    toast(
      hide
        ? 'Envio e busca ocultados em todos os módulos.'
        : 'Envio e busca exibidos novamente em todos os módulos.',
    );
  };

  const handleToggleFullscreen = (checked: boolean) => {
    updatePreferences({ fullscreen: checked });
    if (checked && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        toast('Modo tela cheia não permitido automaticamente pelo navegador.', true);
      });
    } else if (!checked && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="PREFERÊNCIAS DO PORTAL · CONFIGURAÇÕES"
        title="Nuvem, aparência e controles da interface"
        description="Gerencie a conexão com o Google Apps Script, tema visual, navegação e atalhos de produtividade."
      />

      <div className="grid grid-cols-1 gap-4">
        <Panel
          title="Conexão em Nuvem"
          subtitle="Sincronização direta com seu Google Drive via Apps Script (sessão de 30 dias)."
          action={
            <button
              type="button"
              onClick={() => setActivePage('Backup e Restauração')}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap cursor-pointer"
            >
              <Server className="w-3.5 h-3.5 shrink-0" />
              <span>Gerenciar em Backup</span>
            </button>
          }
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-4 py-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <span
                className={`grid place-items-center w-9 h-9 rounded-lg border shrink-0 ${
                  gasConnected
                    ? 'border-[var(--good)]/40 bg-[var(--good)]/12 text-[var(--good)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel)] text-[var(--muted)]'
                }`}
              >
                <Cloud className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <strong className="block text-[13px] font-bold text-[var(--text)] truncate">
                  {gasConnected && gasSession
                    ? `Conectado como ${gasSession.username}`
                    : 'Desconectado (modo local)'}
                </strong>
                <span className="block text-[11.5px] text-[var(--muted)] mt-0.5">
                  {gasConnected && gasSession
                    ? `Pasta ativa: "${activeDriveFolderName}"${
                        lastCloudSyncAt
                          ? ` · Última sincronização: ${new Date(lastCloudSyncAt).toLocaleString('pt-BR')}`
                          : ''
                      }`
                    : 'Acesse Backup e Restauração ou a Tela Inicial para entrar com usuário e senha.'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {driveFolderUrl && (
                <a
                  href={driveFolderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[11.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)] transition-colors whitespace-nowrap"
                >
                  <span>Abrir Drive</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {gasConnected && (
                <button
                  type="button"
                  onClick={() => void disconnectAppsScript()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[11.5px] font-semibold text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/40 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </button>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Tema visual" subtitle="Alterações aplicadas imediatamente em toda a interface.">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {THEMES.map((theme) => {
              const active = prefs.tema === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => updatePreferences({ tema: theme.id })}
                  className={`flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--line)] bg-[var(--panel-soft)] hover:border-[var(--line-strong)]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {theme.colors.map((c, idx) => (
                      <span
                        key={idx}
                        style={{ backgroundColor: c }}
                        className="w-5 h-5 rounded-md border border-black/20"
                      />
                    ))}
                  </div>
                  <div>
                    <strong className="block text-[13.5px] font-bold text-[var(--text)]">
                      {theme.name}
                    </strong>
                    <small className="block text-[11.5px] text-[var(--muted)] mt-0.5">
                      {theme.description}
                    </small>
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Navegação e interface">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 cursor-pointer">
              <div>
                <strong className="block text-[13px] font-bold text-[var(--text)]">
                  Exibir módulos no topo
                </strong>
                <small className="block text-[11.5px] text-[var(--muted)] mt-0.5">
                  Adiciona a barra superior expansível de atalho rápido para os módulos.
                </small>
              </div>
              <span className="ce-switch">
                <input
                  type="checkbox"
                  checked={prefs.modules_top}
                  onChange={(e) => updatePreferences({ modules_top: e.target.checked })}
                />
                <span className="ce-switch-track">
                  <span className="ce-switch-thumb" />
                </span>
              </span>
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 cursor-pointer">
              <div>
                <strong className="block text-[13px] font-bold text-[var(--text)]">
                  Ocultar menu lateral
                </strong>
                <small className="block text-[11.5px] text-[var(--muted)] mt-0.5">
                  Libera toda a largura da tela (recomendado com os módulos no topo ativos).
                </small>
              </div>
              <span className="ce-switch">
                <input
                  type="checkbox"
                  checked={prefs.sidebar_hidden}
                  onChange={(e) => updatePreferences({ sidebar_hidden: e.target.checked })}
                />
                <span className="ce-switch-track">
                  <span className="ce-switch-thumb" />
                </span>
              </span>
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 cursor-pointer">
              <div>
                <strong className="block text-[13px] font-bold text-[var(--text)]">
                  Modo tela cheia
                </strong>
                <small className="block text-[11.5px] text-[var(--muted)] mt-0.5">
                  Alterna a janela do navegador para leitura focada sem distrações.
                </small>
              </div>
              <span className="ce-switch">
                <input
                  type="checkbox"
                  checked={prefs.fullscreen}
                  onChange={(e) => handleToggleFullscreen(e.target.checked)}
                />
                <span className="ce-switch-track">
                  <span className="ce-switch-thumb" />
                </span>
              </span>
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 cursor-pointer">
              <div>
                <strong className="block text-[13px] font-bold text-[var(--text)]">
                  Quadro branco na Prova Lacrada (Simulado)
                </strong>
                <small className="block text-[11.5px] text-[var(--muted)] mt-0.5">
                  Exibe área de rascunho com canetas e borracha ao lado das questões do simulado.
                </small>
              </div>
              <span className="ce-switch">
                <input
                  type="checkbox"
                  checked={prefs.whiteboard_enabled !== false}
                  onChange={(e) => updatePreferences({ whiteboard_enabled: e.target.checked })}
                />
                <span className="ce-switch-track">
                  <span className="ce-switch-thumb" />
                </span>
              </span>
            </label>

          </div>
        </Panel>

        <Panel
          title="Preferências de Exibição"
          subtitle="Defina a largura da área útil e das margens laterais do conteúdo em todas as páginas."
          action={
            <div
              role="radiogroup"
              aria-label="Alternar entre Bordas Reduzidas e Bordas Centralizadas"
              className="inline-flex items-center gap-1 p-1 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)]"
            >
              {(
                [
                  { id: 'compact', label: 'Bordas Reduzidas' },
                  { id: 'classic', label: 'Bordas Centralizadas' },
                ] as const
              ).map((opt) => {
                const active = (prefs.content_margins || 'compact') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      updatePreferences({ content_margins: opt.id });
                      toast(
                        opt.id === 'classic'
                          ? 'Preferência salva: Bordas Centralizadas (1440px).'
                          : 'Preferência salva: Bordas Reduzidas (largura total).',
                      );
                    }}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[var(--accent)] text-white shadow-xs'
                        : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                {
                  id: 'compact',
                  title: 'Bordas Reduzidas',
                  description:
                    'Aproveita toda a largura disponível da tela com margens laterais compactas (12px–16px).',
                  previewClass: 'w-full',
                },
                {
                  id: 'classic',
                  title: 'Bordas Centralizadas',
                  description:
                    'Centraliza o conteúdo em até 1440px com margens laterais mais amplas em monitores largos.',
                  previewClass: 'w-[68%] mx-auto',
                },
              ] as const
            ).map((option) => {
              const active = (prefs.content_margins || 'compact') === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    updatePreferences({ content_margins: option.id });
                    toast(
                      option.id === 'classic'
                        ? 'Preferência salva: Bordas Centralizadas (1440px).'
                        : 'Preferência salva: Bordas Reduzidas (largura total).',
                    );
                  }}
                  aria-pressed={active}
                  className={`flex flex-col items-start gap-2.5 rounded-xl border p-3.5 text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--line)] bg-[var(--panel-soft)] hover:border-[var(--line-strong)]'
                  }`}
                >
                  <div className="w-full h-9 rounded-md border border-[var(--line)] bg-[var(--panel)] p-1.5 flex items-center">
                    <div
                      className={`h-full rounded-[4px] border transition-all ${option.previewClass} ${
                        active
                          ? 'border-[var(--accent)]/50 bg-[var(--accent)]/20'
                          : 'border-[var(--line-strong)] bg-[var(--panel-raised)]'
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <strong className="block text-[13px] font-bold text-[var(--text)]">
                      {option.title}
                    </strong>
                    <small className="block text-[11.5px] text-[var(--muted)] mt-0.5 leading-relaxed">
                      {option.description}
                    </small>
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Controles Avançados (Progressive Disclosure — evita poluição visual) */}
        <section className="ce-panel rounded-xl overflow-hidden divide-y divide-[var(--line)]">
          {/* Drawer 1: Visibilidade de envio e busca por módulo */}
          <div>
            <button
              type="button"
              onClick={() => setVisibilityOpen((v) => !v)}
              aria-expanded={visibilityOpen}
              className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-[var(--panel-soft)]/70 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <SlidersHorizontal className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <strong className="block text-[13.5px] font-bold text-[var(--text)]">
                    Modo limpeza por módulo (envio e busca)
                  </strong>
                  <span className="block text-[11.5px] text-[var(--muted)] mt-0.5">
                    Oculte formulários de upload ou campos de filtro individualmente em {CONFIGURABLE_MODULES.length} módulos.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="text-[11.5px] font-semibold text-[var(--muted)] tabular-nums">
                  {hiddenControlsCount === 0
                    ? 'Todos visíveis'
                    : `${hiddenControlsCount} oculto(s)`}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-[var(--muted)] transition-transform ${
                    visibilityOpen ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>

            {visibilityOpen && (
              <div className="px-4 sm:px-5 pb-4 pt-2 border-t border-[var(--line)]/60">
                <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
                  {anyModuleHidden && (
                    <button
                      type="button"
                      onClick={() => setAllModulesVisibility(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap transition-colors cursor-pointer"
                    >
                      Mostrar todos
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAllModulesVisibility(true)}
                    disabled={allModulesHidden}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-50 whitespace-nowrap transition-colors cursor-pointer"
                  >
                    Ocultar todos
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {CONFIGURABLE_MODULES.map((mod) => {
                    const vis = moduleVisibility(mod.name);
                    return (
                      <div
                        key={mod.name}
                        className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3.5 py-3 flex flex-col gap-2"
                      >
                        <strong className="text-[12.5px] font-bold text-[var(--text)]">
                          {mod.name}
                        </strong>
                        {mod.hasUpload && (
                          <label className="flex items-center justify-between gap-2 text-[12px] text-[var(--muted)] cursor-pointer">
                            <span>Ocultar envio</span>
                            <span className="ce-switch">
                              <input
                                type="checkbox"
                                checked={vis.hide_upload}
                                onChange={(e) =>
                                  updateModuleVisibility(mod.name, 'hide_upload', e.target.checked)
                                }
                              />
                              <span className="ce-switch-track">
                                <span className="ce-switch-thumb" />
                              </span>
                            </span>
                          </label>
                        )}
                        {mod.hasSearch && (
                          <label className="flex items-center justify-between gap-2 text-[12px] text-[var(--muted)] cursor-pointer">
                            <span>Ocultar busca</span>
                            <span className="ce-switch">
                              <input
                                type="checkbox"
                                checked={vis.hide_search}
                                onChange={(e) =>
                                  updateModuleVisibility(mod.name, 'hide_search', e.target.checked)
                                }
                              />
                              <span className="ce-switch-track">
                                <span className="ce-switch-thumb" />
                              </span>
                            </span>
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Drawer 2: Atalhos de Teclado */}
          <div>
            <button
              type="button"
              onClick={() => setShortcutsOpen((v) => !v)}
              aria-expanded={shortcutsOpen}
              className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-[var(--panel-soft)]/70 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Keyboard className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <strong className="block text-[13.5px] font-bold text-[var(--text)]">
                    Atalhos de teclado
                  </strong>
                  <span className="block text-[11.5px] text-[var(--muted)] mt-0.5">
                    Controle cronômetro, Modo Foco e troca de módulos sem tirar as mãos do teclado (pressione ? a qualquer hora).
                  </span>
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-[var(--muted)] shrink-0 transition-transform ${
                  shortcutsOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {shortcutsOpen && (
              <div className="px-4 sm:px-5 pb-4 pt-3 border-t border-[var(--line)]/60 grid grid-cols-1 md:grid-cols-2 gap-4">
                {KEYBOARD_SHORTCUT_GROUPS.map((group) => (
                  <div key={group.title}>
                    <h4 className="m-0 mb-2 text-[11px] font-extrabold uppercase tracking-[0.07em] text-[var(--muted)]">
                      {group.title}
                    </h4>
                    <div className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-lg bg-[var(--panel-soft)]">
                      {group.items.map((item) => (
                        <div
                          key={item.keys.join('+')}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-[12px]"
                        >
                          <span className="text-[var(--text)]">{item.label}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {item.keys.map((k, idx) => (
                              <React.Fragment key={`${k}-${idx}`}>
                                {idx > 0 && <span className="text-[10px] text-[var(--muted)]">+</span>}
                                <kbd className="inline-flex items-center justify-center min-w-[22px] px-1.5 py-0.5 rounded border border-[var(--line-strong)] bg-[var(--panel)] font-mono-num text-[10.5px] font-bold text-[var(--text)]">
                                  {k}
                                </kbd>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
