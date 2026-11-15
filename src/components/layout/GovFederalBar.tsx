import React, { useEffect, useState } from 'react';
import { Contrast, ExternalLink } from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { ModuleName } from '../../types/study';

interface GovFederalBarProps {
  insideApp?: boolean;
}

const GOV_BAR_LINKS: ReadonlyArray<{ label: string; target: ModuleName }> = [
  { label: 'Diário Oficial (Lei Seca)', target: 'Lei Seca' },
  { label: 'Portal da Transparência', target: 'Monitor de Desempenho' },
  { label: 'Ouvidoria (Erros)', target: 'Caderno de Erros' },
  { label: 'Diário de Editais', target: 'Editais' },
];

const FONT_SCALE_STORAGE_KEY = 'estuda-gov-font-scale';
const FONT_SCALES = [92, 100, 108, 116] as const;

export const GovFederalBar: React.FC<GovFederalBarProps> = ({ insideApp = false }) => {
  const { db, setActivePage, updatePreferences, toast } = useStudy();
  const isHighContrast = db.preferences.tema === 'gov-escuro';

  const [fontScale, setFontScale] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(FONT_SCALE_STORAGE_KEY));
      return (FONT_SCALES as readonly number[]).includes(saved) ? saved : 100;
    } catch {
      return 100;
    }
  });

  useEffect(() => {
    document.documentElement.style.fontSize = fontScale === 100 ? '' : `${fontScale}%`;
    try {
      localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(fontScale));
    } catch {
      // Ignore storage error
    }
  }, [fontScale]);

  const stepFontScale = (delta: -1 | 1) => {
    const idx = FONT_SCALES.indexOf(fontScale as (typeof FONT_SCALES)[number]);
    const currentIdx = idx >= 0 ? idx : 1;
    const nextIdx = Math.min(FONT_SCALES.length - 1, Math.max(0, currentIdx + delta));
    const nextScale = FONT_SCALES[nextIdx];
    if (nextScale !== fontScale) {
      setFontScale(nextScale);
      toast(`Tamanho da fonte ajustado para ${nextScale}%.`);
    }
  };

  const resetFontScale = () => {
    setFontScale(100);
    toast('Tamanho da fonte restaurado para o padrão (100%).');
  };

  const handleToggleContrast = () => {
    const next = isHighContrast ? 'gov-padrao' : 'gov-escuro';
    updatePreferences({ tema: next });
    toast(
      next === 'gov-escuro'
        ? 'Modo Alto Contraste Federal ativado.'
        : 'Tema Portal Federal Padrão restaurado.',
    );
  };

  return (
    <div className="w-full bg-[#071D41] text-white shrink-0">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-7 min-h-[34px] py-1.5 flex items-center justify-between gap-4 text-[11px]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center gap-1.5 font-display font-extrabold tracking-[0.06em] uppercase whitespace-nowrap shrink-0">
            <svg
              viewBox="0 0 24 16"
              className="w-[18px] h-[12px] rounded-[2px] shrink-0"
              aria-hidden="true"
            >
              <rect width="24" height="16" fill="#168821" />
              <polygon points="12,2 21,8 12,14 3,8" fill="#FFCD07" />
              <circle cx="12" cy="8" r="3.4" fill="#1351B4" />
            </svg>
            <span>BRASIL</span>
          </span>
          <span className="text-white/40 hidden sm:inline" aria-hidden="true">
            |
          </span>
          <span className="text-white/85 font-medium truncate hidden sm:inline">
            Ministério da Aprovação, Café Forte e Madrugadas
          </span>
        </div>

        <nav className="flex items-center gap-3 sm:gap-4 shrink-0" aria-label="Atalhos institucionais e acessibilidade">
          {insideApp &&
            GOV_BAR_LINKS.map((item) => (
              <button
                key={item.target}
                type="button"
                onClick={() => setActivePage(item.target)}
                className="hidden lg:inline-flex items-center text-[11px] font-medium text-white/85 hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {item.label}
              </button>
            ))}

          <a
            href="https://ministerio-da-fazenda-eight.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            title="Acessar portal do Ministério da Fazenda"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/95 hover:text-[#FFCD07] hover:underline underline-offset-4 whitespace-nowrap shrink-0 transition-colors"
          >
            <span>Ministério da Fazenda</span>
            <ExternalLink className="w-3 h-3 shrink-0 opacity-85" aria-hidden="true" />
          </a>

          <div
            className="inline-flex items-center gap-1 border-l border-r border-white/20 px-2.5 shrink-0"
            role="group"
            aria-label="Tamanho do texto"
          >
            <button
              type="button"
              onClick={() => stepFontScale(-1)}
              disabled={fontScale === FONT_SCALES[0]}
              title="Diminuir tamanho da fonte"
              aria-label="Diminuir tamanho da fonte"
              className="px-1.5 py-0.5 rounded text-[11px] font-bold text-white/90 hover:bg-white/15 disabled:opacity-40 whitespace-nowrap cursor-pointer"
            >
              A-
            </button>
            <button
              type="button"
              onClick={resetFontScale}
              title={`Fonte atual: ${fontScale}% (clique para restaurar 100%)`}
              aria-label="Restaurar tamanho padrão da fonte"
              className="px-1.5 py-0.5 rounded text-[11px] font-bold text-white/90 hover:bg-white/15 whitespace-nowrap cursor-pointer tabular-nums"
            >
              {fontScale === 100 ? 'A' : `${fontScale}%`}
            </button>
            <button
              type="button"
              onClick={() => stepFontScale(1)}
              disabled={fontScale === FONT_SCALES[FONT_SCALES.length - 1]}
              title="Aumentar tamanho da fonte"
              aria-label="Aumentar tamanho da fonte"
              className="px-1.5 py-0.5 rounded text-[11px] font-bold text-white/90 hover:bg-white/15 disabled:opacity-40 whitespace-nowrap cursor-pointer"
            >
              A+
            </button>
          </div>

          <button
            type="button"
            onClick={handleToggleContrast}
            aria-pressed={isHighContrast}
            title="Alternar entre Portal Padrão e Alto Contraste Federal"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#FFCD07] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Contrast className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{isHighContrast ? 'Portal Padrão' : 'Alto Contraste'}</span>
          </button>
        </nav>
      </div>
      <div className="gov-brasil-stripe" aria-hidden="true" />
    </div>
  );
};
