import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Cloud,
  FileText,
  Folder,
  LayoutGrid,
  ListChecks,
  Palette,
  Scale,
  Search,
  Sparkles,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { MODULES, THEMES, getGovModuleLabel } from '../../data/seedData';
import { useStudy } from '../../context/StudyContext';
import { getKnownStudyDriveFolderNames, getPreferredStudyFolder } from '../../lib/googleDrive';
import { formatSequentialDeviceLabel, isReservedBackupFolderName, normalizeSearch, visibleName } from '../../lib/parsers';
import { ModuleName } from '../../types/study';
import { ModuleIcon } from '../ui/ModuleIcon';

type SearchCategory = 'Tudo' | 'Módulos' | 'Leis' | 'Artigos' | 'Funções' | 'Conteúdo';

interface SearchResultItem {
  id: string;
  category: Exclude<SearchCategory, 'Tudo'>;
  title: string;
  subtitle: string;
  meta?: string;
  keywords: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

const MODULE_DESCRIPTIONS: Record<ModuleName, { desc: string; keywords: string }> = {
  'Início': { desc: 'Visão geral, resumo do dia e atalhos principais', keywords: 'home dashboard inicio resumo' },
  'Carreira & Mérito': {
    desc: 'Trilha de carreira até o nível 100, medalhas de mérito, objetivos de alta dificuldade e missões semanais',
    keywords: 'carreira merito medalhas nivel 100 xp patente missoes trofeus condecoracoes portaria',
  },
  'Treino Diário': { desc: 'Responder questões do banco com filtro por disciplina', keywords: 'questoes resolver pratica banco estudo' },
  'Simulado Fechado': { desc: 'Provas fechadas, modo CESPE (certo/errado) e ABCDE', keywords: 'simulado prova cespe multipla escolha exame' },
  'Simulados Realizados': { desc: 'Histórico, notas líquidas, acertos e revisão de provas', keywords: 'historico notas cespe pontos liquidos desempenho' },
  'Monitor de Desempenho': { desc: 'Gráficos de evolução, tempo de estudo e acertos por matéria', keywords: 'estatisticas graficos evolucao tempo rendimento' },
  'Discursiva': { desc: 'Redações, envio de textos e correções salvas', keywords: 'redacao dissertacao peca texto' },
  'Provas': { desc: 'Banco de provas em PDF e gabaritos para consulta', keywords: 'provas pdf gabarito banca download' },
  'Caderno de Erros': { desc: 'Questões erradas pendentes de correção e revisadas', keywords: 'erros pendentes revisao anotacoes correcao' },
  'Súmulas e Jurisprudência': { desc: 'STF, STJ, informativos e enunciados organizados', keywords: 'stf stj sumula jurisprudencia tese informativo' },
  'Datas & Locais': { desc: 'Agenda de concursos, inscrições, pagamentos e locais', keywords: 'concursos datas locais inscricao pagamento' },
  'Editais': { desc: 'Editais por concurso e controle dos pontos estudados', keywords: 'edital editais topicos pontos estudados concurso planejamento' },
  'Cronograma': { desc: 'Planejamento semanal por dia da semana e metas', keywords: 'agenda semana planejamento horario metas' },
  'Metas Concluídas': { desc: 'Registro de tópicos e metas finalizadas com sucesso', keywords: 'metas concluidas historico semana' },
  'Metas Não Concluídas': { desc: 'Tópicos arquivados pendentes para retomada', keywords: 'metas atrasadas pendentes arquivadas' },
  'Lei Seca': { desc: 'Leitura de leis, artigos, parágrafos, incisos e marca-texto', keywords: 'legislacao lei artigo paragrafo inciso vade mecum grifo' },
  'Matriz de Incidência': { desc: 'Classificação por grau de cobrança (Muito Alto a Baixo)', keywords: 'incidencia estatistica cobranca artigos mais cobrados' },
  'PDFs Pessoais': { desc: 'Apostilas, materiais pessoais e pastas sincronizadas', keywords: 'pdfs apostilas arquivos documentos leitura' },
  'Resumos & Mapas': { desc: 'Mapas mentais, esquemas e resumos por disciplina', keywords: 'resumos mapas mentais esquemas revisao' },
  'Pontos Críticos': { desc: 'Pegadinhas, prazos e detalhes decisivos de prova', keywords: 'pontos criticos pegadinhas dicas atencao' },
  'Utilidades': { desc: 'Importadores .txt, conversores de PDF e cadastro manual', keywords: 'importar converter pdf txt utilidades ferramentas' },
  'Backup e Restauração': { desc: 'Sincronização Google Drive, restauração e JSON local', keywords: 'backup restaurar google drive nuvem json exportar' },
  'Configurações': { desc: 'Temas (Leitura Confortável, Preto e rosa, azul, vermelho), layout e módulos', keywords: 'configuracoes tema aparencia leitura conforto sepia preferencias google' },
};

export const GlobalSearch: React.FC = () => {
  const {
    db,
    activeDriveFolderName,
    setActivePage,
    openLawAt,
    openContestEdital,
    toggleTimer,
    resetTimer,
    timerRunning,
    changeFocusQuote,
    updatePreferences,
    restoreAllFromGoogleDrive,
    saveCloudBackup,
    toast,
  } = useStudy();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('Tudo');
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Global keyboard shortcut: Ctrl+K / Cmd+K (and Escape to close)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  const closeSearch = () => {
    setOpen(false);
    setQuery('');
    setCategory('Tudo');
  };

  // Catalog of Modules + Functions + Laws + Articles + Saved Content
  const baseItems = useMemo<SearchResultItem[]>(() => {
    const items: SearchResultItem[] = [];

    // 1. Módulos
    for (const mod of MODULES) {
      const info = MODULE_DESCRIPTIONS[mod.name];
      const displayLabel = getGovModuleLabel(mod.name);
      items.push({
        id: `mod-${mod.name}`,
        category: 'Módulos',
        title: displayLabel,
        subtitle: info.desc,
        meta: displayLabel !== mod.name ? mod.name : 'Módulo',
        keywords: `${displayLabel} ${mod.name} ${info.desc} ${info.keywords}`,
        icon: <ModuleIcon name={mod.icon} className="w-[18px] h-[18px] shrink-0" />,
        onSelect: () => {
          setActivePage(mod.name);
          closeSearch();
        },
      });
    }

    // 2. Funções e Ações Rápidas
    const functions: Array<Omit<SearchResultItem, 'category'>> = [
      {
        id: 'fn-timer-toggle',
        title: timerRunning ? 'Pausar cronômetro de estudo' : 'Iniciar cronômetro de estudo',
        subtitle: 'Controlar contagem de tempo no menu superior',
        meta: 'Ação imediata',
        keywords: 'cronometro timer iniciar pausar tempo estudo relogio',
        icon: <Zap className="w-4 h-4" />,
        onSelect: () => {
          toggleTimer();
          closeSearch();
        },
      },
      {
        id: 'fn-timer-reset',
        title: 'Zerar cronômetro de estudo',
        subtitle: 'Reiniciar contador de estudo atual para 00:00:00',
        meta: 'Ação imediata',
        keywords: 'zerar resetar cronometro timer',
        icon: <Zap className="w-4 h-4" />,
        onSelect: () => {
          resetTimer();
          closeSearch();
        },
      },
      {
        id: 'fn-quote',
        title: 'Trocar frase do Foco do Dia',
        subtitle: 'Exibir uma nova frase motivacional na barra superior',
        meta: 'Ação imediata',
        keywords: 'foco do dia frase motivacao trocar atualizar',
        icon: <Sparkles className="w-4 h-4" />,
        onSelect: () => {
          changeFocusQuote();
          closeSearch();
        },
      },
      {
        id: 'fn-drive-restore',
        title: 'Restaurar dados e arquivos do Google Drive',
        subtitle: 'Baixar banco de dados e PDFs vinculados à sua conta Google',
        meta: 'Sincronização',
        keywords: 'restaurar google drive nuvem recuperar arquivos pdf sincronizar',
        icon: <Cloud className="w-4 h-4" />,
        onSelect: () => {
          closeSearch();
          void restoreAllFromGoogleDrive();
        },
      },
      {
        id: 'fn-drive-backup',
        title: 'Salvar backup completo no Google Drive',
        subtitle: 'Enviar snapshot atualizado do banco de dados para a nuvem',
        meta: 'Sincronização',
        keywords: 'salvar backup google drive nuvem snapshot enviar',
        icon: <Cloud className="w-4 h-4" />,
        onSelect: () => {
          closeSearch();
          void saveCloudBackup();
        },
      },
      {
        id: 'fn-util-import-questions',
        title: 'Importar questões (.txt) ou converter prova PDF',
        subtitle: 'Abastecer banco de questões ou criar Simulado Fechado',
        meta: 'Utilidades',
        keywords: 'importar questoes txt converter pdf prova simulado abcde cespe',
        icon: <Wrench className="w-4 h-4" />,
        onSelect: () => {
          setActivePage('Utilidades');
          closeSearch();
        },
      },
      {
        id: 'fn-util-import-law',
        title: 'Importar Lei Seca (.txt / PDF) ou excluir legislação',
        subtitle: 'Estruturar artigos com grau de incidência ou gerenciar leis salvas',
        meta: 'Utilidades',
        keywords: 'importar lei seca txt pdf excluir legislacao grau incidencia',
        icon: <Wrench className="w-4 h-4" />,
        onSelect: () => {
          setActivePage('Utilidades');
          closeSearch();
        },
      },
      {
        id: 'fn-util-import-schedule',
        title: 'Importar cronograma semanal (.txt)',
        subtitle: 'Carregar dias, matérias e metas em lote',
        meta: 'Utilidades',
        keywords: 'importar cronograma txt agenda planejamento',
        icon: <Wrench className="w-4 h-4" />,
        onSelect: () => {
          setActivePage('Utilidades');
          closeSearch();
        },
      },
      {
        id: 'fn-util-manual-question',
        title: 'Adicionar questão manualmente',
        subtitle: 'Cadastrar enunciado, alternativas A–E ou Certo/Errado',
        meta: 'Utilidades',
        keywords: 'adicionar cadastrar questao manual enunciado gabarito',
        icon: <Wrench className="w-4 h-4" />,
        onSelect: () => {
          setActivePage('Utilidades');
          closeSearch();
        },
      },
      {
        id: 'fn-errors-pending',
        title: 'Revisar Caderno de Erros (Pendentes de Correção)',
        subtitle: 'Corrigir erros de treinos e simulados fechados',
        meta: 'Caderno de Erros',
        keywords: 'caderno de erros pendentes correcao revisao corrigidos',
        icon: <BookOpen className="w-4 h-4" />,
        onSelect: () => {
          setActivePage('Caderno de Erros');
          closeSearch();
        },
      },
      {
        id: 'fn-toggle-top-nav',
        title: db.preferences.modules_top ? 'Ocultar atalhos de módulos no topo' : 'Exibir módulos no topo',
        subtitle: 'Alternar barra expansível de módulos abaixo do menu superior',
        meta: 'Aparência',
        keywords: 'modulos no topo barra superior menu atalhos layout',
        icon: <LayoutGrid className="w-4 h-4" />,
        onSelect: () => {
          updatePreferences({ modules_top: !db.preferences.modules_top });
          toast(db.preferences.modules_top ? 'Atalhos no topo ocultados.' : 'Módulos no topo ativados.');
          closeSearch();
        },
      },
    ];

    // Add direct theme-switch functions for every theme (including Preto e rosa)
    for (const theme of THEMES) {
      functions.push({
        id: `fn-theme-${theme.id}`,
        title: `Aplicar tema: ${theme.name}`,
        subtitle: theme.description,
        meta: 'Tema visual',
        keywords: `tema cor aparencia ${theme.name} ${theme.id}`,
        icon: <Palette className="w-4 h-4" />,
        onSelect: () => {
          updatePreferences({ tema: theme.id });
          toast(`Tema "${theme.name}" aplicado.`);
          closeSearch();
        },
      });
    }

    for (const fn of functions) {
      items.push({ ...fn, category: 'Funções' });
    }

    // 3. Leis (Pastas em db.laws)
    const sortedFolders = Object.keys(db.laws).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    for (const folder of sortedFolders) {
      const lawData = db.laws[folder];
      const name = visibleName(folder);
      items.push({
        id: `law-${folder}`,
        category: 'Leis',
        title: name,
        subtitle: `${lawData.items?.length || 0} dispositivo(s)${lawData.pdfs?.length ? ` · ${lawData.pdfs.length} PDF(s)` : ''}`,
        meta: 'Lei Seca',
        keywords: `${name} ${folder} lei legislacao codigo estatuto`,
        icon: <Scale className="w-4 h-4" />,
        onSelect: () => {
          openLawAt(folder);
          closeSearch();
        },
      });
    }

    // 4. Súmulas & Jurisprudência, Pontos Críticos, PDFs e Provas
    for (const item of db.caseLaw) {
      items.push({
        id: `case-${item.id}`,
        category: 'Conteúdo',
        title: `${item.identificador ? `${item.identificador} · ` : ''}${item.titulo || item.categoria}`,
        subtitle: `${item.tribunal} — ${item.texto.slice(0, 95)}${item.texto.length > 95 ? '…' : ''}`,
        meta: 'Jurisprudência',
        keywords: `${item.categoria} ${item.titulo} ${item.tribunal} ${item.identificador} ${item.texto}`,
        icon: <BookOpen className="w-4 h-4" />,
        onSelect: () => {
          setActivePage('Súmulas e Jurisprudência');
          closeSearch();
        },
      });
    }

    for (const cp of db.criticalPoints) {
      items.push({
        id: `cp-${cp.id}`,
        category: 'Conteúdo',
        title: cp.titulo,
        subtitle: `${cp.materia} — ${cp.texto.slice(0, 95)}${cp.texto.length > 95 ? '…' : ''}`,
        meta: 'Ponto Crítico',
        keywords: `${cp.materia} ${cp.titulo} ${cp.texto}`,
        icon: <Sparkles className="w-4 h-4" />,
        onSelect: () => {
          setActivePage('Pontos Críticos');
          closeSearch();
        },
      });
    }

    const knownBackupRoots = [
      activeDriveFolderName,
      getPreferredStudyFolder().name,
      ...getKnownStudyDriveFolderNames(),
    ];
    for (const [folderName, files] of Object.entries(db.pdfFolders)) {
      if (isReservedBackupFolderName(folderName, knownBackupRoots, files)) continue;
      for (const f of files) {
        items.push({
          id: `pdf-${f.id}`,
          category: 'Conteúdo',
          title: f.name,
          subtitle: `Pasta: ${visibleName(folderName)}`,
          meta: 'PDF Pessoal',
          keywords: `${f.name} ${visibleName(folderName)} pdf apostila`,
          icon: <Folder className="w-4 h-4" />,
          onSelect: () => {
            setActivePage('PDFs Pessoais');
            closeSearch();
          },
        });
      }
    }

    for (const pf of db.proofFiles) {
      items.push({
        id: `proof-${pf.id}`,
        category: 'Conteúdo',
        title: pf.name,
        subtitle: `Banca: ${pf.bank}`,
        meta: 'Prova PDF',
        keywords: `${pf.name} ${pf.bank} prova gabarito`,
        icon: <FileText className="w-4 h-4" />,
        onSelect: () => {
          setActivePage('Provas');
          closeSearch();
        },
      });
    }

    for (const contest of db.contests) {
      const pontos = contest.edital_pontos || [];
      const done = pontos.filter((p) => p.estudado).length;
      items.push({
        id: `edital-${contest.id}`,
        category: 'Conteúdo',
        title: `Edital · ${contest.concurso}`,
        subtitle: pontos.length
          ? `${done}/${pontos.length} ponto(s) estudado(s)${contest.data_abertura ? ` · ${contest.data_abertura}` : ''}`
          : 'Sem pontos cadastrados ainda — clique para adicionar edital',
        meta: 'Editais',
        keywords: `edital ${contest.concurso} ${contest.local_prova} ${pontos.map((p) => `${p.materia} ${p.titulo}`).join(' ')}`,
        icon: <ListChecks className="w-4 h-4" />,
        onSelect: () => {
          openContestEdital(contest.id);
          closeSearch();
        },
      });
    }

    return items;
  }, [
    db.laws,
    db.caseLaw,
    db.criticalPoints,
    db.pdfFolders,
    activeDriveFolderName,
    db.proofFiles,
    db.contests,
    db.preferences.modules_top,
    timerRunning,
    setActivePage,
    openLawAt,
    openContestEdital,
    toggleTimer,
    resetTimer,
    changeFocusQuote,
    restoreAllFromGoogleDrive,
    saveCloudBackup,
    updatePreferences,
    toast,
  ]);

  // Dynamic search across baseItems + all Law Articles / Devices
  const { results, counts } = useMemo(() => {
    const term = normalizeSearch(query);
    const matchesBase = term
      ? baseItems.filter((item) => normalizeSearch(`${item.title} ${item.subtitle} ${item.keywords}`).includes(term))
      : baseItems;

    // Search articles across all laws (when query has >= 2 chars, or show top highlighted/first articles when filtering 'Artigos')
    const articleMatches: SearchResultItem[] = [];
    const shouldScanArticles = term.length >= 2 || category === 'Artigos';
    if (shouldScanArticles) {
      const sortedFolders = Object.keys(db.laws).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      for (const folder of sortedFolders) {
        const lawName = visibleName(folder);
        const lawItems = db.laws[folder]?.items || [];
        for (const lawItem of lawItems) {
          const deviceLabel = formatSequentialDeviceLabel(lawItem.dispositivo, lawItem.artigo_base);
          const searchable = normalizeSearch(
            `${lawName} ${deviceLabel} ${lawItem.dispositivo} ${lawItem.artigo_base} ${lawItem.texto} ${lawItem.dica} ${lawItem.observacao} ${lawItem.grau}`,
          );
          if (!term || searchable.includes(term)) {
            articleMatches.push({
              id: `art-${folder}-${lawItem.id}`,
              category: 'Artigos',
              title: `${deviceLabel} · ${lawName}`,
              subtitle: `${lawItem.texto.slice(0, 115)}${lawItem.texto.length > 115 ? '…' : ''}`,
              meta: lawItem.grau !== 'Não Classificado' ? lawItem.grau : 'Dispositivo',
              keywords: searchable,
              icon: <FileText className="w-4 h-4" />,
              onSelect: () => {
                openLawAt(folder, lawItem.dispositivo || lawItem.artigo_base || query.trim());
                closeSearch();
              },
            });
            if (articleMatches.length >= 30) break;
          }
        }
        if (articleMatches.length >= 30) break;
      }
    }

    const combined = [...matchesBase, ...articleMatches];
    const nextCounts: Record<SearchCategory, number> = {
      Tudo: combined.length,
      Módulos: matchesBase.filter((i) => i.category === 'Módulos').length,
      Leis: matchesBase.filter((i) => i.category === 'Leis').length,
      Artigos: articleMatches.length,
      Funções: matchesBase.filter((i) => i.category === 'Funções').length,
      Conteúdo: matchesBase.filter((i) => i.category === 'Conteúdo').length,
    };

    const filtered =
      category === 'Tudo'
        ? term
          ? combined.slice(0, 40)
          : [
              ...matchesBase.filter((i) => i.category === 'Funções').slice(0, 5),
              ...matchesBase.filter((i) => i.category === 'Leis').slice(0, 4),
              ...matchesBase.filter((i) => i.category === 'Módulos').slice(0, 6),
            ]
        : combined.filter((i) => i.category === category).slice(0, 40);

    return { results: filtered, counts: nextCounts };
  }, [baseItems, db.laws, query, category, openLawAt]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query, category]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((prev) => (results.length ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((prev) => (results.length ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter' && results[activeIdx]) {
      e.preventDefault();
      results[activeIdx].onSelect();
    }
  };

  return (
    <>
      {/* Trigger in Topbar */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Busca geral: módulos, artigos, leis ou funções"
        title="Busca geral (Ctrl+K)"
        className="group flex items-center justify-between gap-2 w-full h-10 px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] hover:border-[var(--accent)] text-[var(--muted)] hover:text-[var(--text)] transition-colors min-w-0 cursor-pointer"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Search className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
          <span className="text-[12.5px] font-medium truncate leading-none">
            Buscar no portal (módulos, leis, artigos)…
          </span>
        </span>
        <kbd className="hidden xl:inline-flex items-center justify-center h-5 px-1.5 rounded border border-[var(--line)] bg-[var(--panel-soft)] text-[10px] font-mono font-bold text-[var(--subtle)] leading-none shrink-0">
          Ctrl+K
        </kbd>
      </button>

      {/* Spotlight Search Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-3 sm:px-4 bg-black/65 backdrop-blur-xs"
          onClick={closeSearch}
          role="dialog"
          aria-modal="true"
          aria-label="Busca geral no sistema"
        >
          <div
            className="w-full max-w-[680px] rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--line)] bg-[var(--panel-soft)]">
              <Search className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Digite módulo, lei, artigo (ex.: Art. 5º), função ou conteúdo…"
                className="flex-1 bg-transparent border-0 outline-none text-[13.5px] font-medium text-[var(--text)] placeholder:text-[var(--subtle)]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-[11px] font-semibold text-[var(--muted)] hover:text-[var(--text)] px-1.5 py-0.5 rounded bg-[var(--panel-raised)] border border-[var(--line)]"
                >
                  Limpar
                </button>
              )}
              <button
                type="button"
                onClick={closeSearch}
                aria-label="Fechar busca"
                className="grid place-items-center w-7 h-7 rounded-lg border border-[var(--line)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-[var(--line)]/70 bg-[var(--panel)]">
              {(['Tudo', 'Módulos', 'Leis', 'Artigos', 'Funções', 'Conteúdo'] as SearchCategory[]).map((cat) => {
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`inline-flex items-center gap-1 h-[26px] px-2.5 rounded-lg text-[11px] font-bold transition-colors ${
                      active
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--panel-soft)] text-[var(--muted)] border border-[var(--line)] hover:text-[var(--text)] hover:border-[var(--line-strong)]'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className={`text-[10px] tabular-nums ${active ? 'text-white/85' : 'text-[var(--subtle)]'}`}>
                      {counts[cat]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1">
              {!query && category === 'Tudo' && (
                <div className="px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider text-[var(--subtle)]">
                  Acesso rápido — digite para pesquisar artigos específicos, leis ou funções
                </div>
              )}

              {results.length > 0 ? (
                results.map((item, idx) => {
                  const selected = idx === activeIdx;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={item.onSelect}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                        selected
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'border-transparent hover:border-[var(--line)] hover:bg-[var(--panel-soft)]'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className={`grid place-items-center w-8 h-8 rounded-lg border shrink-0 mt-0.5 ${
                            selected
                              ? 'border-[var(--accent)]/50 bg-[var(--panel)] text-[var(--accent)]'
                              : 'border-[var(--line)] bg-[var(--panel-raised)] text-[var(--muted)]'
                          }`}
                        >
                          {item.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <strong className="text-[13px] font-bold text-[var(--text)] truncate">
                              {item.title}
                            </strong>
                            <span className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--subtle)]">
                              · {item.category}
                            </span>
                            {item.meta && item.meta !== item.category && (
                              <span className="text-[10.5px] font-semibold text-[var(--accent)]">
                                · {item.meta}
                              </span>
                            )}
                          </div>
                          <p className="m-0 mt-0.5 text-[11.5px] text-[var(--muted)] line-clamp-2 leading-snug">
                            {item.subtitle}
                          </p>
                        </div>
                      </div>
                      <ArrowRight
                        className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                          selected ? 'text-[var(--accent)] translate-x-0.5' : 'text-[var(--subtle)]'
                        }`}
                      />
                    </button>
                  );
                })
              ) : (
                <div className="py-10 px-4 text-center">
                  <p className="m-0 text-[13px] font-semibold text-[var(--text)]">
                    Nenhum resultado encontrado para “{query}”.
                  </p>
                  <p className="m-0 mt-1 text-[11.5px] text-[var(--muted)]">
                    Tente buscar pelo nome de um módulo, artigo (ex.: Art. 5º), lei cadastrada ou ação do sistema.
                  </p>
                </div>
              )}
            </div>

            {/* Footer Hints */}
            <div className="px-4 py-2 border-t border-[var(--line)] bg-[var(--panel-soft)] flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-[var(--subtle)]">
              <div className="flex items-center gap-3">
                <span>↑↓ navegar</span>
                <span>Enter abrir</span>
                <span>Esc fechar</span>
              </div>
              <span>
                {Object.keys(db.laws).length} lei(s) indexada(s) · {MODULES.length} módulos
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
