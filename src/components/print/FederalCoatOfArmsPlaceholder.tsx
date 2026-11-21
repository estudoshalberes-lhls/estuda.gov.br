import React from 'react';

interface FederalCoatOfArmsPlaceholderProps {
  size?: number;
}

/**
 * Placeholder oficial estilizado do Brasão de Armas da República Federativa do Brasil
 * para simulação de documentos oficiais A4 do Governo Federal.
 */
export const FederalCoatOfArmsPlaceholder: React.FC<FederalCoatOfArmsPlaceholderProps> = ({
  size = 54,
}) => (
  <div
    className="flex flex-col items-center justify-center shrink-0"
    aria-label="Brasão da República (Placeholder Oficial)"
  >
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Placeholder do Brasão da República"
    >
      {/* Halo externo circular sutil */}
      <circle
        cx="40"
        cy="39"
        r="35"
        stroke="#071D41"
        strokeWidth="1.1"
        strokeDasharray="2.5 2"
        opacity="0.45"
      />

      {/* Ramos estilizados (louro / café e tabaco) */}
      <path
        d="M21 56C13 48 11 35 16 24C18.5 18.5 23 15 27 13"
        stroke="#168821"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M59 56C67 48 69 35 64 24C61.5 18.5 57 15 53 13"
        stroke="#168821"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Folhas laterais simétricas */}
      <path
        d="M16 44L10 40M15 35L10 32M18 26L14 22"
        stroke="#168821"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M64 44L70 40M65 35L70 32M62 26L66 22"
        stroke="#168821"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* Estrela de cinco pontas (base heráldica) */}
      <polygon
        points="40,8 46.8,26.2 66,26.8 50.8,38.4 56.2,57 40,46 23.8,57 29.2,38.4 14,26.8 33.2,26.2"
        fill="#FFCD07"
        stroke="#071D41"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* Escudo central azul celeste */}
      <circle cx="40" cy="36" r="13.5" fill="#1351B4" stroke="#071D41" strokeWidth="1.5" />
      <circle
        cx="40"
        cy="36"
        r="10.8"
        stroke="#FFFFFF"
        strokeWidth="0.7"
        strokeDasharray="1.8 1.8"
        opacity="0.85"
      />

      {/* Cruzeiro do Sul simplificado */}
      <circle cx="40" cy="30.5" r="1.35" fill="#FFFFFF" />
      <circle cx="40" cy="41.5" r="1.45" fill="#FFFFFF" />
      <circle cx="35.2" cy="35.5" r="1.25" fill="#FFFFFF" />
      <circle cx="44.8" cy="35.5" r="1.25" fill="#FFFFFF" />
      <circle cx="42.4" cy="38.2" r="0.95" fill="#FFCD07" />

      {/* Faixa inferior oficial */}
      <path
        d="M17 61.5C25 57.8 55 57.8 63 61.5L60.5 68.5C53 65.2 27 65.2 19.5 68.5L17 61.5Z"
        fill="#071D41"
        stroke="#071D41"
        strokeWidth="1"
      />
      <text
        x="40"
        y="65.2"
        textAnchor="middle"
        fill="#FFCD07"
        fontSize="5.4"
        fontWeight="800"
        letterSpacing="0.8"
        fontFamily="Rawline, system-ui, sans-serif"
      >
        BRASÃO OFICIAL
      </text>
    </svg>
  </div>
);
