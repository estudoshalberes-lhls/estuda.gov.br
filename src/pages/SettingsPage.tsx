import React from 'react';
import { THEMES } from '../data/seedData';
import { useStudy } from '../context/StudyContext';
import { ModuleName } from '../types/study';
import { PageHeader, Panel } from '../components/ui/PageHeader';
import { GoogleDriveOAuthPanel } from '../components/settings/GoogleDriveOAuthPanel';

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
    toast,
  } = useStudy();
  const prefs = db.preferences;

  const allModulesHidden = CONFIGURABLE_MODULES.every((mod) => {
    const vis = moduleVisibility(mod.name);
    return (!mod.hasUpload || vis.hide_upload) && (!mod.hasSearch || vis.hide_search);
  });

  const anyModuleHidden = CONFIGURABLE_MODULES.some((mod) => {
    const vis = moduleVisibility(mod.name);
    return (mod.hasUpload && vis.hide_upload) || (mod.hasSearch && vis.hide_search);
  });

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
        title="Conta Google, aparência e controles por módulo"
        description="Gerencie a conexão OAuth do Google Drive, personalize o tema institucional, a barra lateral e os painéis visíveis."
      />

      <div className="grid grid-cols-1 gap-4">
        <GoogleDriveOAuthPanel />

        <Panel title="Tema visual" subtitle="Alterações aplicadas imediatamente em toda a interface.">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {THEMES.map((theme) => {
              const active = prefs.tema === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => updatePreferences({ tema: theme.id })}
                  className={`flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-colors ${
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
          title="Visibilidade de envio e busca por módulo"
          subtitle="Modo limpeza: oculte formulários de upload ou campos de filtro quando estiver apenas revisando."
          action={
            <div className="flex flex-wrap items-center gap-2">
              {anyModuleHidden && (
                <button
                  type="button"
                  onClick={() => setAllModulesVisibility(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap transition-colors"
                >
                  Mostrar todos
                </button>
              )}
              <button
                type="button"
                onClick={() => setAllModulesVisibility(true)}
                disabled={allModulesHidden}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-50 whitespace-nowrap transition-colors"
              >
                Ocultar todos
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {CONFIGURABLE_MODULES.map((mod) => {
              const vis = moduleVisibility(mod.name);
              return (
                <div
                  key={mod.name}
                  className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 flex flex-col gap-2.5"
                >
                  <strong className="text-[13px] font-bold text-[var(--text)]">
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
        </Panel>
      </div>
    </div>
  );
};
