import { useEffect, useState, type RefObject } from 'react';
import * as d3 from 'd3';
import { IncidenceGrade } from '../../types/study';

export function useContainerWidth(
  ref: RefObject<HTMLElement | null>,
  fallbackWidth = 640,
): number {
  const [width, setWidth] = useState(fallbackWidth);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let rafId = 0;
    const commitWidth = (raw: number) => {
      const next = Math.floor(raw);
      if (next <= 0) return;
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        setWidth((prev) => (Math.abs(prev - next) >= 2 ? next : prev));
      });
    };

    const initial = Math.floor(el.getBoundingClientRect().width);
    if (initial > 0) setWidth(initial);

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) commitWidth(last.contentRect.width);
      });
      observer.observe(el);
      return () => {
        if (rafId) window.cancelAnimationFrame(rafId);
        observer.disconnect();
      };
    }

    const onResize = () => commitWidth(el.getBoundingClientRect().width);
    window.addEventListener('resize', onResize);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, [ref]);

  return width;
}

const accuracyColorInterpolator = d3.interpolateRgbBasis([
  '#dc2626', // 0%
  '#ea580c', // 33%
  '#d97706', // 66%
  '#16a34a', // 100%
]);

const intensityColorInterpolator = d3.interpolateRgbBasis([
  '#3b82f6', // low
  '#f59e0b', // medium
  '#dc2626', // high
]);

export function accuracyHeatColor(pct: number | null): {
  bg: string;
  border: string;
  text: string;
} {
  if (pct === null || !Number.isFinite(pct)) {
    return {
      bg: 'transparent',
      border: 'var(--line)',
      text: 'var(--muted)',
    };
  }
  const t = Math.max(0, Math.min(1, pct / 100));
  const rgb = d3.color(accuracyColorInterpolator(t))?.rgb();
  const alpha = 0.16;
  const bg = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : 'transparent';
  const border = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.42)` : 'var(--line)';
  const text =
    pct >= 80 ? 'var(--good)' : pct >= 60 ? 'var(--warning)' : 'var(--bad)';
  return { bg, border, text };
}

export function intensityHeatColor(ratio: number): {
  bg: string;
  border: string;
  solid: string;
} {
  const t = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const rgb = d3.color(intensityColorInterpolator(t))?.rgb();
  if (!rgb) {
    return { bg: 'transparent', border: 'var(--line)', solid: 'var(--accent)' };
  }
  return {
    bg: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.09 + t * 0.2})`,
    border: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.25 + t * 0.35})`,
    solid: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
  };
}

export interface NumericDistributionStats {
  count: number;
  sum: number;
  mean: number;
  median: number;
  q1: number;
  q3: number;
  min: number;
  max: number;
}

export function computeDistributionStats(values: number[]): NumericDistributionStats {
  const clean = values.filter((v) => Number.isFinite(v)).sort(d3.ascending);
  if (!clean.length) {
    return { count: 0, sum: 0, mean: 0, median: 0, q1: 0, q3: 0, min: 0, max: 0 };
  }
  return {
    count: clean.length,
    sum: d3.sum(clean),
    mean: d3.mean(clean) ?? 0,
    median: d3.median(clean) ?? 0,
    q1: d3.quantile(clean, 0.25) ?? clean[0],
    q3: d3.quantile(clean, 0.75) ?? clean[clean.length - 1],
    min: clean[0],
    max: clean[clean.length - 1],
  };
}

export function formatIsoShortBr(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function formatIsoFullBr(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export const INCIDENCE_GRADE_CONFIG: Record<
  IncidenceGrade,
  {
    rank: number;
    weight: number;
    color: string;
    softBg: string;
    shortLabel: string;
  }
> = {
  'Muito Alto': {
    rank: 4,
    weight: 4,
    color: '#dc2626',
    softBg: 'rgba(220, 38, 38, 0.24)',
    shortLabel: 'M. Alto',
  },
  Alto: {
    rank: 3,
    weight: 3,
    color: '#ea580c',
    softBg: 'rgba(234, 88, 12, 0.22)',
    shortLabel: 'Alto',
  },
  Médio: {
    rank: 2,
    weight: 2,
    color: '#d97706',
    softBg: 'rgba(217, 119, 6, 0.2)',
    shortLabel: 'Médio',
  },
  Baixo: {
    rank: 1,
    weight: 1,
    color: '#2563eb',
    softBg: 'rgba(37, 99, 235, 0.18)',
    shortLabel: 'Baixo',
  },
  'Não Classificado': {
    rank: 0,
    weight: 0.6,
    color: '#64748b',
    softBg: 'rgba(100, 116, 139, 0.16)',
    shortLabel: 'N/C',
  },
};
