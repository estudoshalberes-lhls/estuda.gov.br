import React, { useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Check, ChevronDown, ChevronUp, Grid3X3, LayoutGrid } from 'lucide-react';
import { IncidenceGrade, LawFolderData, LawItem } from '../../types/study';
import { formatIsoDateBr, sortLawItemsInOrder, visibleName } from '../../lib/parsers';
import { Panel } from '../ui/PageHeader';
import { INCIDENCE_GRADE_CONFIG, useContainerWidth } from './d3Utils';

interface IncidenceD3PanelsProps {
  laws: Record<string, LawFolderData>;
  readLawItems?: Record<string, string[]>;
  activeFolder: string;
  activeGradeFilter: 'Todas' | IncidenceGrade;
  onSelectLawAndGrade: (folder: string, grade: 'Todas' | IncidenceGrade) => void;
  onSelectArticle: (articleKey: string) => void;
}

type VizTab = 'treemap' | 'heatmap';
type TreemapMetric = 'count' | 'weighted';
type HeatmapFilter = 'all' | 'high' | 'unread-high';

interface TreemapLeafDatum {
  name: string;
  folder: string;
  grade: IncidenceGrade;
  count: number;
  readCount: number;
  value: number;
}

interface TreemapGroupDatum {
  name: string;
  folder?: string;
  children?: Array<TreemapGroupDatum | TreemapLeafDatum>;
}

interface ArticleHeatCell {
  key: string;
  shortLabel: string;
  topGrade: IncidenceGrade;
  devicesCount: number;
  readDevicesCount: number;
  isRead: boolean;
  latestReadDate?: string;
}

function isItemRead(item: LawItem, readSet: Set<string>): boolean {
  return readSet.has(item.id) || Boolean(item.leituras && item.leituras.length > 0);
}

function compactArticleLabel(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/art\.?\s*(\d+[a-z\-º°]*)/i);
  if (match) return match[1].replace(/[º°]/g, '');
  if (trimmed.length <= 7) return trimmed;
  return `${trimmed.slice(0, 6)}…`;
}

export const IncidenceD3Panels: React.FC<IncidenceD3PanelsProps> = ({
  laws,
  readLawItems,
  activeFolder,
  activeGradeFilter,
  onSelectLawAndGrade,
  onSelectArticle,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<VizTab>('treemap');
  const [treemapMetric, setTreemapMetric] = useState<TreemapMetric>('count');
  const [heatmapFilter, setHeatmapFilter] = useState<HeatmapFilter>('all');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const width = useContainerWidth(containerRef, 760);

  const [hoveredLeaf, setHoveredLeaf] = useState<{
    leaf: TreemapLeafDatum;
    x: number;
    y: number;
    folderTotal: number;
  } | null>(null);
  const [hoveredArticle, setHoveredArticle] = useState<ArticleHeatCell | null>(null);

  // --------------------------------------------------------------------------
  // 1. D3 Hierarchy Treemap Data
  // --------------------------------------------------------------------------
  const treemapLayout = useMemo(() => {
    const folders = Object.keys(laws).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const children: TreemapGroupDatum[] = [];

    folders.forEach((folderName) => {
      const items = laws[folderName]?.items || [];
      if (!items.length) return;
      const readSet = new Set(readLawItems?.[folderName] || []);
      const byGrade = new Map<IncidenceGrade, { count: number; readCount: number }>();

      items.forEach((item) => {
        const g = item.grau || 'Não Classificado';
        const cur = byGrade.get(g) || { count: 0, readCount: 0 };
        cur.count += 1;
        if (isItemRead(item, readSet)) cur.readCount += 1;
        byGrade.set(g, cur);
      });

      const leaves: TreemapLeafDatum[] = [];
      byGrade.forEach((stats, grade) => {
        const weight = INCIDENCE_GRADE_CONFIG[grade]?.weight ?? 1;
        leaves.push({
          name: grade,
          folder: folderName,
          grade,
          count: stats.count,
          readCount: stats.readCount,
          value: treemapMetric === 'weighted' ? Math.max(1, stats.count * weight) : stats.count,
        });
      });

      if (leaves.length) {
        children.push({
          name: visibleName(folderName),
          folder: folderName,
          children: leaves,
        });
      }
    });

    if (!children.length) return null;

    const h = Math.max(260, Math.min(380, 170 + children.length * 24));
    const root = d3
      .hierarchy<TreemapGroupDatum | TreemapLeafDatum>({
        name: 'Legislação',
        children,
      })
      .sum((d) => ('value' in d ? d.value : 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const layout = d3
      .treemap<TreemapGroupDatum | TreemapLeafDatum>()
      .tile(d3.treemapSquarify)
      .size([Math.max(280, width), h])
      .paddingOuter(4)
      .paddingTop(22)
      .paddingInner(2)
      .round(true)(root);

    const folderTotals = new Map<string, number>();
    folders.forEach((f) => folderTotals.set(f, (laws[f]?.items || []).length));

    return {
      height: h,
      groups: layout.children || [],
      folderTotals,
    };
  }, [laws, readLawItems, treemapMetric, width]);

  // --------------------------------------------------------------------------
  // 2. D3 Article Heatmap Data (for activeFolder)
  // --------------------------------------------------------------------------
  const articleHeat = useMemo(() => {
    const folder = activeFolder ? laws[activeFolder] : undefined;
    if (!folder || !folder.items.length) {
      return {
        cells: [] as ArticleHeatCell[],
        totalArticles: 0,
        readArticles: 0,
        highTotal: 0,
        highRead: 0,
      };
    }

    const readSet = new Set(readLawItems?.[activeFolder] || []);
    const ordered = sortLawItemsInOrder(folder.items);
    const byArticle = new Map<string, LawItem[]>();

    ordered.forEach((item) => {
      const key = (item.artigo_base || item.dispositivo || 'Outros').trim();
      const list = byArticle.get(key) || [];
      list.push(item);
      byArticle.set(key, list);
    });

    const allCells: ArticleHeatCell[] = [];
    byArticle.forEach((items, key) => {
      let topGrade: IncidenceGrade = 'Não Classificado';
      let topRank = -1;
      let readCount = 0;
      let latestDate: string | undefined;

      items.forEach((it) => {
        const g = it.grau || 'Não Classificado';
        const r = INCIDENCE_GRADE_CONFIG[g]?.rank ?? 0;
        if (r > topRank) {
          topRank = r;
          topGrade = g;
        }
        if (isItemRead(it, readSet)) readCount += 1;
        (it.leituras || []).forEach((l) => {
          if (l.data && (!latestDate || l.data > latestDate)) latestDate = l.data;
        });
      });

      allCells.push({
        key,
        shortLabel: compactArticleLabel(key),
        topGrade,
        devicesCount: items.length,
        readDevicesCount: readCount,
        isRead: readCount > 0,
        latestReadDate: latestDate,
      });
    });

    const highCells = allCells.filter(
      (c) => c.topGrade === 'Muito Alto' || c.topGrade === 'Alto',
    );
    const filteredCells = allCells.filter((c) => {
      if (heatmapFilter === 'high') {
        return c.topGrade === 'Muito Alto' || c.topGrade === 'Alto';
      }
      if (heatmapFilter === 'unread-high') {
        return (c.topGrade === 'Muito Alto' || c.topGrade === 'Alto') && !c.isRead;
      }
      return true;
    });

    return {
      cells: filteredCells,
      totalArticles: allCells.length,
      readArticles: allCells.filter((c) => c.isRead).length,
      highTotal: highCells.length,
      highRead: highCells.filter((c) => c.isRead).length,
    };
  }, [activeFolder, heatmapFilter, laws, readLawItems]);

  const totalDevicesAcrossLaws = useMemo(
    () => d3.sum(Object.values(laws), (f) => f.items.length),
    [laws],
  );

  if (totalDevicesAcrossLaws === 0) return null;

  return (
    <Panel
      className="mb-3.5"
      title="Mapa Visual de Incidência & Cobertura de Leitura"
      subtitle="Explore a distribuição hierárquica entre normas ou identifique artigos de alta cobrança ainda não lidos."
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          {expanded && (
            <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('treemap')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                  activeTab === 'treemap'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                Treemap por Norma
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('heatmap')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                  activeTab === 'heatmap'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                <Grid3X3 className="w-3 h-3" />
                Heatmap de Artigos
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Ocultar
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                Mostrar mapas
              </>
            )}
          </button>
        </div>
      }
    >
      {expanded && (
        <div ref={containerRef} className="relative w-full">
          {activeTab === 'treemap' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 text-[11px]">
                <div className="flex flex-wrap items-center gap-2.5 text-[var(--muted)]">
                  {(['Muito Alto', 'Alto', 'Médio', 'Baixo', 'Não Classificado'] as const).map(
                    (g) => (
                      <span key={g} className="inline-flex items-center gap-1">
                        <span
                          className="w-2.5 h-2.5 rounded-xs inline-block"
                          style={{ backgroundColor: INCIDENCE_GRADE_CONFIG[g].color }}
                        />
                        {g}
                      </span>
                    ),
                  )}
                </div>

                <div className="inline-flex rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setTreemapMetric('count')}
                    className={`px-2 py-0.5 rounded text-[10.5px] font-bold whitespace-nowrap ${
                      treemapMetric === 'count'
                        ? 'bg-[var(--panel-raised)] text-[var(--text)]'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    Por quantidade
                  </button>
                  <button
                    type="button"
                    onClick={() => setTreemapMetric('weighted')}
                    className={`px-2 py-0.5 rounded text-[10.5px] font-bold whitespace-nowrap ${
                      treemapMetric === 'weighted'
                        ? 'bg-[var(--panel-raised)] text-[var(--text)]'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    Peso de cobrança
                  </button>
                </div>
              </div>

              {treemapLayout && (
                <svg
                  width={Math.max(280, width)}
                  height={treemapLayout.height}
                  role="img"
                  aria-label="Treemap hierárquico de legislação por grau de incidência"
                  className="block rounded-lg overflow-hidden select-none"
                  onMouseLeave={() => setHoveredLeaf(null)}
                >
                  {treemapLayout.groups.map((group) => {
                    const groupData = group.data as TreemapGroupDatum;
                    const folderName = groupData.folder || groupData.name;
                    const gw = Math.max(0, group.x1 - group.x0);
                    const gh = Math.max(0, group.y1 - group.y0);
                    const isActiveFolder = folderName === activeFolder;
                    const folderTotal = treemapLayout.folderTotals.get(folderName) || 0;

                    return (
                      <g key={folderName}>
                        <rect
                          x={group.x0}
                          y={group.y0}
                          width={gw}
                          height={gh}
                          rx={6}
                          fill="var(--panel-soft)"
                          stroke={isActiveFolder ? 'var(--accent)' : 'var(--line-strong)'}
                          strokeWidth={isActiveFolder ? 1.8 : 1}
                        />
                        {gw > 64 && (
                          <g
                            className="cursor-pointer"
                            onClick={() => onSelectLawAndGrade(folderName, 'Todas')}
                          >
                            <clipPath id={`clip-grp-${folderName.replace(/[^a-zA-Z0-9]/g, '_')}`}>
                              <rect x={group.x0 + 4} y={group.y0} width={Math.max(0, gw - 8)} height={20} />
                            </clipPath>
                            <text
                              x={group.x0 + 6}
                              y={group.y0 + 14}
                              fontSize={10.5}
                              fontWeight={800}
                              fill={isActiveFolder ? 'var(--accent)' : 'var(--text)'}
                              clipPath={`url(#clip-grp-${folderName.replace(/[^a-zA-Z0-9]/g, '_')})`}
                            >
                              {groupData.name} ({folderTotal})
                            </text>
                          </g>
                        )}

                        {(group.children || []).map((leafNode) => {
                          const leaf = leafNode.data as TreemapLeafDatum;
                          const lw = Math.max(0, leafNode.x1 - leafNode.x0);
                          const lh = Math.max(0, leafNode.y1 - leafNode.y0);
                          const cfg = INCIDENCE_GRADE_CONFIG[leaf.grade];
                          const isExactSelected =
                            leaf.folder === activeFolder && activeGradeFilter === leaf.grade;
                          const isHover =
                            hoveredLeaf?.leaf.folder === leaf.folder &&
                            hoveredLeaf?.leaf.grade === leaf.grade;

                          return (
                            <g
                              key={`${leaf.folder}-${leaf.grade}`}
                              className="cursor-pointer"
                              onClick={() => onSelectLawAndGrade(leaf.folder, leaf.grade)}
                              onMouseEnter={() =>
                                setHoveredLeaf({
                                  leaf,
                                  x: leafNode.x0 + lw / 2,
                                  y: leafNode.y0,
                                  folderTotal,
                                })
                              }
                            >
                              <rect
                                x={leafNode.x0}
                                y={leafNode.y0}
                                width={lw}
                                height={lh}
                                rx={4}
                                fill={cfg.color}
                                fillOpacity={isHover || isExactSelected ? 0.88 : 0.68}
                                stroke={isExactSelected ? 'var(--text)' : 'var(--panel)'}
                                strokeWidth={isExactSelected ? 1.8 : 0.8}
                              />
                              {lw > 46 && lh > 28 && (
                                <text
                                  x={leafNode.x0 + 6}
                                  y={leafNode.y0 + 15}
                                  fontSize={10}
                                  fontWeight={700}
                                  fill="#ffffff"
                                >
                                  {cfg.shortLabel}
                                </text>
                              )}
                              {lw > 46 && lh > 42 && (
                                <text
                                  x={leafNode.x0 + 6}
                                  y={leafNode.y0 + 28}
                                  fontSize={10}
                                  fill="rgba(255,255,255,0.9)"
                                  className="font-mono-num"
                                >
                                  {leaf.count} disp.
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}
                </svg>
              )}

              {hoveredLeaf && (
                <div
                  className="pointer-events-none absolute top-9 z-20 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] px-3 py-2 shadow-lg text-[11.5px] min-w-[210px]"
                  style={{
                    left:
                      hoveredLeaf.x > width * 0.56
                        ? Math.max(8, hoveredLeaf.x - 224)
                        : Math.min(width - 224, hoveredLeaf.x + 12),
                  }}
                >
                  <div className="font-bold text-[var(--text)] truncate">
                    {visibleName(hoveredLeaf.leaf.folder)}
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-1 font-mono-num text-[var(--muted)]">
                    <span>Grau:</span>
                    <strong style={{ color: INCIDENCE_GRADE_CONFIG[hoveredLeaf.leaf.grade].color }}>
                      {hoveredLeaf.leaf.grade}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between gap-3 font-mono-num text-[var(--muted)]">
                    <span>Dispositivos:</span>
                    <strong className="text-[var(--text)]">
                      {hoveredLeaf.leaf.count} (
                      {Math.round((hoveredLeaf.leaf.count / Math.max(1, hoveredLeaf.folderTotal)) * 100)}
                      %)
                    </strong>
                  </div>
                  <div className="flex items-center justify-between gap-3 font-mono-num text-[var(--muted)]">
                    <span>Já lidos:</span>
                    <strong className="text-[var(--good)]">
                      {hoveredLeaf.leaf.readCount}/{hoveredLeaf.leaf.count}
                    </strong>
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--accent)] font-semibold">
                    Clique para abrir lei e filtrar este grau
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Tab 2: D3 Article Incidence × Reading Heatmap */
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3">
                <div className="flex flex-wrap items-center gap-3 text-[11.5px] font-mono-num">
                  <span className="text-[var(--muted)]">
                    Lei ativa: <strong className="font-sans text-[var(--text)]">{visibleName(activeFolder)}</strong>
                  </span>
                  <span className="text-[var(--muted)]">
                    Leitura geral:{' '}
                    <strong className="text-[var(--good)]">
                      {articleHeat.readArticles}/{articleHeat.totalArticles} (
                      {Math.round(
                        (articleHeat.readArticles / Math.max(1, articleHeat.totalArticles)) * 100,
                      )}
                      %)
                    </strong>
                  </span>
                  <span className="text-[var(--muted)]">
                    Alta incidência lida:{' '}
                    <strong
                      className={
                        articleHeat.highTotal > 0 && articleHeat.highRead < articleHeat.highTotal
                          ? 'text-[var(--warning)]'
                          : 'text-[var(--good)]'
                      }
                    >
                      {articleHeat.highRead}/{articleHeat.highTotal}
                    </strong>
                  </span>
                </div>

                <div className="inline-flex rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-0.5 text-[10.5px]">
                  {(
                    [
                      { id: 'all', label: 'Todos' },
                      { id: 'high', label: 'Muito Alto / Alto' },
                      { id: 'unread-high', label: 'Críticos não lidos' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setHeatmapFilter(opt.id)}
                      className={`px-2 py-0.5 rounded font-bold whitespace-nowrap transition-colors ${
                        heatmapFilter === opt.id
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--muted)] hover:text-[var(--text)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {articleHeat.cells.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] py-8 px-4 text-center text-[12px] text-[var(--muted)]">
                  Nenhum artigo corresponde a este filtro na legislação selecionada.
                </div>
              ) : (
                <div
                  className="grid gap-1.5 max-h-[260px] overflow-y-auto pr-1"
                  style={{
                    gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
                  }}
                  onMouseLeave={() => setHoveredArticle(null)}
                >
                  {articleHeat.cells.map((cell) => {
                    const cfg = INCIDENCE_GRADE_CONFIG[cell.topGrade];
                    return (
                      <button
                        key={cell.key}
                        type="button"
                        onClick={() => onSelectArticle(cell.key)}
                        onMouseEnter={() => setHoveredArticle(cell)}
                        className="relative h-9 rounded-md border px-1.5 flex items-center justify-center font-mono-num text-[11px] font-bold transition-transform hover:scale-[1.04] cursor-pointer"
                        style={{
                          backgroundColor: cfg.softBg,
                          borderColor: cell.isRead ? 'var(--good)' : cfg.color,
                          color: 'var(--text)',
                        }}
                        title={`${cell.key} · ${cell.topGrade} · ${cell.isRead ? 'Lido' : 'Não lido'}`}
                      >
                        <span className="truncate">{cell.shortLabel}</span>
                        {cell.isRead && (
                          <span
                            className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[var(--good)] text-white grid place-items-center"
                            aria-hidden="true"
                          >
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {hoveredArticle && (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] px-3 py-1.5 text-[11.5px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <strong className="text-[var(--text)] truncate">{hoveredArticle.key}</strong>
                    <span
                      className="font-bold text-[11px]"
                      style={{ color: INCIDENCE_GRADE_CONFIG[hoveredArticle.topGrade].color }}
                    >
                      {hoveredArticle.topGrade}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 font-mono-num text-[var(--muted)]">
                    <span>
                      Dispositivos:{' '}
                      <strong className="text-[var(--text)]">{hoveredArticle.devicesCount}</strong>
                    </span>
                    <span>
                      Status:{' '}
                      <strong
                        className={
                          hoveredArticle.isRead ? 'text-[var(--good)]' : 'text-[var(--warning)]'
                        }
                      >
                        {hoveredArticle.isRead
                          ? `Lido (${hoveredArticle.readDevicesCount}/${hoveredArticle.devicesCount})${
                              hoveredArticle.latestReadDate
                                ? ` · ${formatIsoDateBr(hoveredArticle.latestReadDate)}`
                                : ''
                            }`
                          : 'Ainda não lido'}
                      </strong>
                    </span>
                    <span className="text-[var(--accent)] font-sans font-semibold">
                      Clique para ir ao artigo
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};
