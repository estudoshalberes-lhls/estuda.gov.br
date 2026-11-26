import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  FileText,
  Focus,
  Gavel,
  Keyboard,
  Palette,
  Pause,
  Play,
  Scale,
  Search,
  X,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { ModuleName, ThemeId } from '../../types/study';
import { MODULES, getGovModuleLabel } from '../../data/seedData';
import { WEEKDAYS, normalizeSearch, visibleName } from '../../lib/parsers';
import { prefetchModulePage } from '../../lib/routePrefetch';
import { ModuleIcon } from '../ui/ModuleIcon';

interface CommandPaletteModalProps {
  open: boolean;
  onClose: () => void;
  studyFocusMode: boolean;
  onToggleStudyFocus: () => void;
  onOpenShortcuts: () => void;
}

interface PaletteItem {
  id: string;
  group:
    | 'Módulos'
    | 'Ações Rápidas'
    | 'Cronograma'
    | 'Lei Seca'
    | 'Resumos & Mapas'
    | 'Súmulas'
    | 'Caderno de Erros'
    | 'Editais';
  title: string;
  subtitle?: string;
  searchTokens: string;
  icon: React.ReactNode;
  targetModule?: ModuleName;
  onSelect: () => void;
}

const THEME_CYCLE: ReadonlyArray<{ id: ThemeId; label: string }> = [
  { id: 'gov-padrao', label: 'Claro' },
  { id: 'gov-escuro', label: 'Escuro' },
  { id: 'reading-comfort', label: 'Leitura' },
];

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  open,
  onClose,
  studyFocusMode,
  onToggleStudyFocus,
  onOpenShortcuts,
}) => {
  const {
    db,
    activePage,
    setActivePage,
    openLawAt,
    openContestEdital,
    timerRunning,
    toggleTimer,
    updatePreferences,
    toast,
  } = useStudy();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
    const raf = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  const allItems = useMemo<PaletteItem[]>(() => {
    if (!open) return [];
    const items: PaletteItem[] = [];

    // 1. Módulos (23)
    MODULES.forEach((mod) => {
      const govLabel = getGovModuleLabel(mod.name);
      items.push({
        id: `mod-${mod.name}`,
        group: 'Módulos',
        title: govLabel,
        subtitle:
          govLabel !== mod.name
            ? `${mod.name}${mod.name === activePage ? ' · Atual' : ''}`
            : mod.name === activePage
              ? 'Módulo atual'
              : 'Módulo do portal',
        searchTokens: normalizeSearch(`${govLabel} ${mod.name} modulo`),
        icon: <ModuleIcon name={mod.icon} className="w-4 h-4 shrink-0" />,
        targetModule: mod.name,
        onSelect: () => {
          setActivePage(mod.name);
          onClose();
        },
      });
    });

    // 2. Ações Rápidas
    items.push({
      id: 'act-timer',
      group: 'Ações Rápidas',
      title: timerRunning ? 'Pausar cronômetro de estudos' : 'Iniciar cronômetro de estudos',
      subtitle: 'Atalho Alt+P',
      searchTokens: normalizeSearch('cronometro timer iniciar pausar foco estudo alt p'),
      icon: timerRunning ? (
        <Pause className="w-4 h-4 text-[var(--accent)] shrink-0" />
      ) : (
        <Play className="w-4 h-4 text-[var(--accent)] shrink-0" />
      ),
      onSelect: () => {
        toggleTimer();
        toast(timerRunning ? 'Cronômetro pausado.' : 'Cronômetro iniciado.');
        onClose();
      },
    });

    items.push({
      id: 'act-focus',
      group: 'Ações Rápidas',
      title: studyFocusMode ? 'Sair do Modo Foco' : 'Ativar Modo Foco sem distrações',
      subtitle: 'Atalho Alt+Shift+F',
      searchTokens: normalizeSearch('modo foco concentracao tela limpa zen alt shift f'),
      icon: <Focus className="w-4 h-4 text-[var(--accent)] shrink-0" />,
      onSelect: () => {
        onToggleStudyFocus();
        onClose();
      },
    });

    const curTheme = db.preferences?.tema || 'gov-padrao';
    const nextTheme =
      THEME_CYCLE[(THEME_CYCLE.findIndex((t) => t.id === curTheme) + 1) % THEME_CYCLE.length];
    items.push({
      id: 'act-theme',
      group: 'Ações Rápidas',
      title: `Alternar tema visual para ${nextTheme.label}`,
      subtitle: 'Claro · Escuro · Conforto de Leitura',
      searchTokens: normalizeSearch('tema escuro claro dark mode leitura aparencia'),
      icon: <Palette className="w-4 h-4 text-[var(--accent)] shrink-0" />,
      onSelect: () => {
        updatePreferences({ tema: nextTheme.id });
        toast(`Tema alterado para ${nextTheme.label}.`);
        onClose();
      },
    });

    items.push({
      id: 'act-shortcuts',
      group: 'Ações Rápidas',
      title: 'Abrir guia de atalhos de teclado',
      subtitle: 'Tecla ?',
      searchTokens: normalizeSearch('atalhos teclado ajuda comandos shortcuts'),
      icon: <Keyboard className="w-4 h-4 text-[var(--accent)] shrink-0" />,
      onSelect: () => {
        onClose();
        onOpenShortcuts();
      },
    });

    // 3. Tópicos do Cronograma Semanal
    WEEKDAYS.forEach((day) => {
      const topics = db.schedule?.[day] || [];
      topics.forEach((topic) => {
        const subject = visibleName(topic.disciplina_fixa || topic.materia || 'Tópico');
        const detail = topic.materia?.trim() ? visibleName(topic.materia) : subject;
        items.push({
          id: `sch-${day}-${topic.id}`,
          group: 'Cronograma',
          title: detail,
          subtitle: `${day} · ${subject}${topic.concurso_alvo ? ` · ${topic.concurso_alvo}` : ''}`,
          searchTokens: normalizeSearch(
            `${detail} ${subject} ${day} ${topic.observacoes || ''} ${topic.concurso_alvo || ''}`,
          ),
          icon: <Calendar className="w-4 h-4 text-[var(--accent)] shrink-0" />,
          targetModule: 'Cronograma',
          onSelect: () => {
            setActivePage('Cronograma');
            onClose();
          },
        });
      });
    });

    // 4. Lei Seca (pastas e normas)
    Object.entries(db.laws || {}).forEach(([folder, folderData]) => {
      const folderLabel = visibleName(folderData?.name || folder);
      items.push({
        id: `law-folder-${folder}`,
        group: 'Lei Seca',
        title: folderLabel,
        subtitle: `Lei Seca · ${folderData?.items?.length || 0} dispositivos`,
        searchTokens: normalizeSearch(`${folderLabel} ${folder} lei seca artigo legislacao`),
        icon: <Scale className="w-4 h-4 text-[var(--accent)] shrink-0" />,
        targetModule: 'Lei Seca',
        onSelect: () => {
          openLawAt(folder);
          onClose();
        },
      });
      (folderData?.items || []).slice(0, 25).forEach((lawItem) => {
        const title = `${folderLabel} — ${lawItem.dispositivo || lawItem.artigo_base || 'Dispositivo'}`;
        items.push({
          id: `law-${folder}-${lawItem.id}`,
          group: 'Lei Seca',
          title,
          subtitle: lawItem.texto ? lawItem.texto.slice(0, 80) : folderLabel,
          searchTokens: normalizeSearch(
            `${title} ${lawItem.artigo_base || ''} ${lawItem.texto?.slice(0, 160) || ''}`,
          ),
          icon: <Scale className="w-4 h-4 text-[var(--accent)] shrink-0" />,
          targetModule: 'Lei Seca',
          onSelect: () => {
            openLawAt(folder, lawItem.artigo_base || lawItem.dispositivo);
            onClose();
          },
        });
      });
    });

    // 5. Resumos & Mapas
    Object.entries(db.summaryFolders || {}).forEach(([folder, sumFiles]) => {
      (sumFiles || []).forEach((s) => {
        const title = visibleName(s.name || 'Resumo');
        items.push({
          id: `sum-${folder}-${s.id}`,
          group: 'Resumos & Mapas',
          title,
          subtitle: `${visibleName(folder)} · ${s.mindMap ? 'Mapa Mental' : 'Anotação / Documento'}`,
          searchTokens: normalizeSearch(`${title} ${folder} resumo mapa mental docx`),
          icon: <FileText className="w-4 h-4 text-[var(--accent)] shrink-0" />,
          targetModule: 'Resumos & Mapas',
          onSelect: () => {
            setActivePage('Resumos & Mapas');
            onClose();
          },
        });
      });
    });

    // 6. Editais & Concursos
    (db.contests || []).forEach((c) => {
      items.push({
        id: `edital-${c.id}`,
        group: 'Editais',
        title: c.concurso || 'Concurso / Edital',
        subtitle:
          [c.local_prova, c.data_abertura, c.edital_pontos?.length ? `${c.edital_pontos.length} pontos` : '']
            .filter(Boolean)
            .join(' · ') || 'Edital cadastrado',
        searchTokens: normalizeSearch(`${c.concurso} ${c.local_prova || ''} ${c.observacoes || ''} edital prova`),
        icon: <BookOpen className="w-4 h-4 text-[var(--accent)] shrink-0" />,
        targetModule: 'Editais',
        onSelect: () => {
          openContestEdital(c.id);
          onClose();
        },
      });
    });

    // 7. Súmulas e Jurisprudência (limitado aos primeiros 120 para busca instantânea)
    (db.caseLaw || []).slice(0, 120).forEach((cl) => {
      const label = [cl.tribunal, cl.identificador, cl.titulo].filter(Boolean).join(' · ') || 'Súmula / Informativo';
      items.push({
        id: `cl-${cl.id}`,
        group: 'Súmulas',
        title: label,
        subtitle: `${cl.materia || cl.categoria || 'Jurisprudência'}${cl.texto ? ` · ${cl.texto.slice(0, 75)}` : ''}`,
        searchTokens: normalizeSearch(`${label} ${cl.materia || ''} ${cl.categoria || ''} ${cl.texto?.slice(0, 200) || ''}`),
        icon: <Gavel className="w-4 h-4 text-[var(--accent)] shrink-0" />,
        targetModule: 'Súmulas e Jurisprudência',
        onSelect: () => {
          setActivePage('Súmulas e Jurisprudência');
          onClose();
        },
      });
    });

    // 8. Caderno de Erros (primeiros 100)
    (db.annotations || []).slice(0, 100).forEach((errItem) => {
      const label = (errItem.questao?.enunciado || errItem.texto || 'Registro do Caderno de Erros')
        .trim()
        .slice(0, 88);
      items.push({
        id: `err-${errItem.id}`,
        group: 'Caderno de Erros',
        title: label,
        subtitle: `${errItem.materia || 'Geral'}${errItem.banca ? ` · ${errItem.banca}` : ''}`,
        searchTokens: normalizeSearch(
          `${errItem.materia || ''} ${errItem.tipo || ''} ${errItem.texto || ''} ${errItem.questao?.enunciado || ''}`,
        ),
        icon: <AlertTriangle className="w-4 h-4 text-[var(--warning)] shrink-0" />,
        targetModule: 'Caderno de Erros',
        onSelect: () => {
          setActivePage('Caderno de Erros');
          onClose();
        },
      });
    });

    return items;
  }, [
    open,
    activePage,
    db.preferences?.tema,
    db.schedule,
    db.laws,
    db.summaryFolders,
    db.contests,
    db.caseLaw,
    db.annotations,
    timerRunning,
    studyFocusMode,
    setActivePage,
    openLawAt,
    openContestEdital,
    toggleTimer,
    updatePreferences,
    onToggleStudyFocus,
    onOpenShortcuts,
    onClose,
    toast,
  ]);

  const filteredItems = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) {
      // Sem filtro: mostra Ações Rápidas + Módulos principais + tópicos de hoje
      const quick = allItems.filter((i) => i.group === 'Ações Rápidas');
      const mods = allItems.filter((i) => i.group === 'Módulos');
      return [...quick, ...mods].slice(0, 28);
    }
    const terms = q.split(/\s+/).filter(Boolean);
    const scored: Array<{ item: PaletteItem; score: number }> = [];
    for (const item of allItems) {
      if (!terms.every((t) => item.searchTokens.includes(t))) continue;
      const normTitle = normalizeSearch(item.title);
      let score = 10;
      if (normTitle.startsWith(q)) score += 30;
      else if (normTitle.includes(q)) score += 15;
      if (item.group === 'Módulos') score += 8;
      if (item.group === 'Ações Rápidas') score += 6;
      scored.push({ item, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 40).map((s) => s.item);
  }, [allItems, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const active = filteredItems[selectedIndex];
    if (active?.targetModule) {
      prefetchModulePage(active.targetModule);
    }
    const activeEl = listRef.current?.querySelector<HTMLElement>(`[data-palette-idx="${selectedIndex}"]`);
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [open, selectedIndex, filteredItems]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((idx) => (filteredItems.length ? (idx + 1) % filteredItems.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((idx) =>
          filteredItems.length ? (idx - 1 + filteredItems.length) % filteredItems.length : 0,
        );
      } else if (e.key === 'Enter') {
        const chosen = filteredItems[selectedIndex];
        if (chosen) {
          e.preventDefault();
          chosen.onSelect();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, filteredItems, selectedIndex, onClose]);

  if (!open) return null;

  return (
    <div
      className="ce-backdrop-enter fixed inset-0 z-[75] flex items-start justify-center pt-[10vh] px-4 bg-black/55 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Busca Global e Paleta de Comandos"
    >
      <div
        className="ce-modal-enter w-full max-w-[640px] rounded-[var(--radius-lg)] border border-[var(--line-strong)] bg-[var(--panel)] shadow-2xl overflow-hidden flex flex-col max-h-[76vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--line)]">
          <Search className="w-4.5 h-4.5 text-[var(--accent)] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ir para módulo, lei, resumo, súmula, tópico do cronograma ou ação..."
            aria-label="Pesquisar no estuda.gov.br"
            className="flex-1 bg-transparent border-0 outline-none text-[14px] font-medium text-[var(--text)] placeholder:text-[var(--muted)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpar busca"
              className="grid place-items-center w-7 h-7 rounded-md text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-soft)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-[var(--line-strong)] bg-[var(--panel-soft)] font-mono-num text-[10.5px] font-bold text-[var(--muted)]">
            Esc
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-2 px-2">
          {filteredItems.length === 0 ? (
            <div className="py-10 px-4 text-center">
              <p className="m-0 text-[13.5px] font-semibold text-[var(--text)]">
                Nenhum resultado encontrado para "{query}".
              </p>
              <p className="m-0 mt-1 text-[12px] text-[var(--muted)]">
                Tente buscar por nome do módulo, matéria, lei, súmula ou assunto do cronograma.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filteredItems.map((item, idx) => {
                const showGroupHeader = idx === 0 || filteredItems[idx - 1].group !== item.group;
                const isSelected = idx === selectedIndex;

                return (
                  <React.Fragment key={item.id}>
                    {showGroupHeader && (
                      <div className="px-2.5 pt-2.5 pb-1 text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[var(--muted)]">
                        {item.group}
                      </div>
                    )}
                    <button
                      type="button"
                      data-palette-idx={idx}
                      onMouseEnter={() => {
                        setSelectedIndex(idx);
                        if (item.targetModule) prefetchModulePage(item.targetModule);
                      }}
                      onClick={item.onSelect}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--accent-soft)] text-[var(--text)]'
                          : 'bg-transparent text-[var(--text)] hover:bg-[var(--panel-soft)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="grid place-items-center w-7 h-7 rounded-md bg-[var(--panel-soft)] border border-[var(--line)] shrink-0">
                          {item.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold text-[var(--text)] truncate">
                            {item.title}
                          </div>
                          {item.subtitle && (
                            <div className="text-[11.5px] text-[var(--muted)] truncate">
                              {item.subtitle}
                            </div>
                          )}
                        </div>
                      </div>
                      <ArrowRight
                        className={`w-3.5 h-3.5 shrink-0 transition-opacity ${
                          isSelected ? 'opacity-100 text-[var(--accent)]' : 'opacity-0'
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2.5 border-t border-[var(--line)] bg-[var(--panel-soft)]/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
          <div className="flex items-center gap-3">
            <span>↑↓ navegar</span>
            <span aria-hidden="true">·</span>
            <span>Enter abrir</span>
            <span aria-hidden="true">·</span>
            <span>Esc fechar</span>
          </div>
          <span className="font-mono-num tabular-nums">
            {filteredItems.length} {filteredItems.length === 1 ? 'resultado' : 'resultados'}
          </span>
        </div>
      </div>
    </div>
  );
};
