import React from 'react';

interface ModuleIconProps {
  name: string;
  className?: string;
}

const STROKE_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.65,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function renderMinimalGovPaths(name: string): React.ReactNode {
  switch (name) {
    // 1. Início (Meu Cadastro) — Fachada Institucional
    case 'home':
      return (
        <>
          <path {...STROKE_PROPS} d="M3.5 10.5L12 4l8.5 6.5" />
          <path {...STROKE_PROPS} d="M5.5 9.5V19.5h13V9.5" />
          <path {...STROKE_PROPS} d="M9.75 19.5v-5.5h4.5v5.5" />
        </>
      );

    // 2. Monitor de Desempenho (Portal da Transparência) — Tendência Contínua
    case 'activity':
      return (
        <>
          <path {...STROKE_PROPS} d="M3.5 19.5h17" />
          <path {...STROKE_PROPS} d="M4.5 15l4.8-4.8 3.6 3.2L19.5 6.5" />
          <path {...STROKE_PROPS} d="M15.5 6.5h4v4" />
        </>
      );

    // 3. Treino Diário (Banco Oficial de Questões) — Alvo Concêntrico
    case 'target':
      return (
        <>
          <circle {...STROKE_PROPS} cx="12" cy="12" r="8.25" />
          <circle {...STROKE_PROPS} cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="1.25" fill="currentColor" />
        </>
      );

    // 4. Simulado Fechado (Prova Lacrada) — Prancheta Oficial
    case 'clipboard':
      return (
        <>
          <rect {...STROKE_PROPS} x="8.5" y="3.25" width="7" height="3" rx="1" />
          <path {...STROKE_PROPS} d="M8.5 4.75H6.5A1.75 1.75 0 0 0 4.75 6.5v12.25A1.75 1.75 0 0 0 6.5 20.5h11a1.75 1.75 0 0 0 1.75-1.75V6.5a1.75 1.75 0 0 0-1.75-1.75h-2" />
          <line {...STROKE_PROPS} x1="8.5" y1="11" x2="15.5" y2="11" />
          <line {...STROKE_PROPS} x1="8.5" y1="15" x2="13.5" y2="15" />
        </>
      );

    // 5. Simulados Realizados (Boletim de Ocorrências) — Colunas Estatísticas
    case 'chart':
      return (
        <>
          <line {...STROKE_PROPS} x1="3.5" y1="19.5" x2="20.5" y2="19.5" />
          <rect {...STROKE_PROPS} x="5.25" y="12.5" width="3" height="7" rx="0.5" />
          <rect {...STROKE_PROPS} x="10.5" y="8.25" width="3" height="11.25" rx="0.5" />
          <rect {...STROKE_PROPS} x="15.75" y="4.75" width="3" height="14.75" rx="0.5" />
        </>
      );

    // 6. Discursiva (Ofício & Discursiva) — Caneta / Redação
    case 'pen':
      return (
        <>
          <path {...STROKE_PROPS} d="M15.75 4.5l3.75 3.75L9 18.75l-4.5 1 1-4.5L15.75 4.5Z" />
          <line {...STROKE_PROPS} x1="13.5" y1="6.75" x2="17.25" y2="10.5" />
          <line {...STROKE_PROPS} x1="13" y1="19.75" x2="19.75" y2="19.75" />
        </>
      );

    // 7. Provas (Arquivo Nacional de Provas) — Documento Oficial
    case 'file':
      return (
        <>
          <path {...STROKE_PROPS} d="M6.5 3.75h7.25L18.25 8.25v10.5A1.5 1.5 0 0 1 16.75 20.25H6.5A1.5 1.5 0 0 1 5 18.75V5.25A1.5 1.5 0 0 1 6.5 3.75Z" />
          <path {...STROKE_PROPS} d="M13.75 3.75v4.5h4.5" />
          <line {...STROKE_PROPS} x1="8.5" y1="12" x2="14.75" y2="12" />
          <line {...STROKE_PROPS} x1="8.5" y1="15.75" x2="14.75" y2="15.75" />
        </>
      );

    // 8. Caderno de Erros (Ouvidoria) — Lupa Analítica
    case 'search':
      return (
        <>
          <circle {...STROKE_PROPS} cx="10.75" cy="10.75" r="6.25" />
          <line {...STROKE_PROPS} x1="15.25" y1="15.25" x2="20" y2="20" />
          <line {...STROKE_PROPS} x1="10.75" y1="8.25" x2="10.75" y2="11" />
          <circle cx="10.75" cy="13.25" r="0.85" fill="currentColor" />
        </>
      );

    // 9. Súmulas e Jurisprudência (Corte Superior) — Marcador / Enunciado
    case 'bookmark':
      return (
        <>
          <path {...STROKE_PROPS} d="M6.5 4.25h11a1 1 0 0 1 1 1v14.75l-6.5-3.75-6.5 3.75V5.25a1 1 0 0 1 1-1Z" />
          <line {...STROKE_PROPS} x1="9" y1="9" x2="15" y2="9" />
        </>
      );

    // 10. Datas & Locais (Protocolo & GRUs) — Localização Oficial
    case 'pin':
      return (
        <>
          <path {...STROKE_PROPS} d="M12 20.25s6.5-5.1 6.5-10.25a6.5 6.5 0 1 0-13 0c0 5.15 6.5 10.25 6.5 10.25Z" />
          <circle {...STROKE_PROPS} cx="12" cy="10" r="2.25" />
        </>
      );

    // 11. Editais (Diário de Editais) — Lista Homologada
    case 'checklist':
      return (
        <>
          <path {...STROKE_PROPS} d="M4.5 7l1.5 1.5 2.75-2.75" />
          <line {...STROKE_PROPS} x1="11.25" y1="7.25" x2="19.5" y2="7.25" />
          <path {...STROKE_PROPS} d="M4.5 12l1.5 1.5 2.75-2.75" />
          <line {...STROKE_PROPS} x1="11.25" y1="12.25" x2="19.5" y2="12.25" />
          <path {...STROKE_PROPS} d="M4.5 17l1.5 1.5 2.75-2.75" />
          <line {...STROKE_PROPS} x1="11.25" y1="17.25" x2="19.5" y2="17.25" />
        </>
      );

    // 12. Cronograma (Expediente) — Agenda Institucional
    case 'calendar':
      return (
        <>
          <rect {...STROKE_PROPS} x="4.25" y="5.5" width="15.5" height="14.5" rx="1.75" />
          <line {...STROKE_PROPS} x1="8.25" y1="3.5" x2="8.25" y2="7" />
          <line {...STROKE_PROPS} x1="15.75" y1="3.5" x2="15.75" y2="7" />
          <line {...STROKE_PROPS} x1="4.25" y1="10" x2="19.75" y2="10" />
          <line {...STROKE_PROPS} x1="8" y1="14" x2="11" y2="14" />
          <line {...STROKE_PROPS} x1="13" y1="14" x2="16" y2="14" />
        </>
      );

    // 13. Metas Concluídas (Atestado de Cumprimento) — Conformidade
    case 'check':
      return (
        <>
          <circle {...STROKE_PROPS} cx="12" cy="12" r="8.25" />
          <path {...STROKE_PROPS} d="M8.5 12.25l2.4 2.4 4.8-5" />
        </>
      );

    // 14. Metas Não Concluídas (Dívida Ativa) — Prazo Pendente
    case 'clock':
      return (
        <>
          <circle {...STROKE_PROPS} cx="12" cy="12" r="8.25" />
          <polyline {...STROKE_PROPS} points="12,7.5 12,12.25 15.25,14" />
        </>
      );

    // 15. Lei Seca (Diário Oficial) — Código Aberto
    case 'book':
      return (
        <>
          <path {...STROKE_PROPS} d="M4 5.75C6.6 4.9 9.75 5.25 12 6.8c2.25-1.55 5.4-1.9 8-1.05v12.5c-2.6-.85-5.75-.5-8 1.05-2.25-1.55-5.4-1.9-8-1.05V5.75Z" />
          <line {...STROKE_PROPS} x1="12" y1="6.8" x2="12" y2="19.2" />
        </>
      );

    // 16. Matriz de Incidência (Censo de Incidência) — Balança Simétrica
    case 'scale':
      return (
        <>
          <line {...STROKE_PROPS} x1="12" y1="4.25" x2="12" y2="19.5" />
          <line {...STROKE_PROPS} x1="8" y1="19.5" x2="16" y2="19.5" />
          <line {...STROKE_PROPS} x1="5.5" y1="7.25" x2="18.5" y2="7.25" />
          <path {...STROKE_PROPS} d="M5.5 7.25L3.5 13a2.25 2.25 0 0 0 4 0L5.5 7.25Z" />
          <path {...STROKE_PROPS} d="M18.5 7.25L16.5 13a2.25 2.25 0 0 0 4 0l-2-5.75Z" />
        </>
      );

    // 17. PDFs Pessoais (Acervo de Apostilas) — Pasta de Arquivo
    case 'folder':
      return (
        <>
          <path {...STROKE_PROPS} d="M3.75 6.5A1.5 1.5 0 0 1 5.25 5h4l1.75 2h7.75a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18.75 19H5.25a1.5 1.5 0 0 1-1.5-1.5v-11Z" />
          <line {...STROKE_PROPS} x1="8" y1="13" x2="16" y2="13" />
        </>
      );

    // 18. Resumos & Mapas (Dossiê de Resumos) — Volumes Estruturados
    case 'library':
      return (
        <>
          <rect {...STROKE_PROPS} x="4.5" y="5.5" width="4" height="13.5" rx="0.6" />
          <rect {...STROKE_PROPS} x="10" y="4.25" width="4" height="14.75" rx="0.6" />
          <path {...STROKE_PROPS} d="M15.75 6.5l3.5-.75 1.75 12.75-3.5.5-1.75-12.5Z" />
        </>
      );

    // 19. Pontos Críticos (Alertas Ministeriais) — Escudo de Alerta
    case 'sparkles':
      return (
        <>
          <path {...STROKE_PROPS} d="M12 3.75L18.5 6.5v5.25c0 4-2.75 7.15-6.5 8.5-3.75-1.35-6.5-4.5-6.5-8.5V6.5L12 3.75Z" />
          <line {...STROKE_PROPS} x1="12" y1="8.75" x2="12" y2="12.75" />
          <circle cx="12" cy="15.5" r="0.9" fill="currentColor" />
        </>
      );

    // 20. Utilidades (Balcão de Protocolo) — Ferramenta Técnica
    case 'tools':
      return (
        <>
          <path {...STROKE_PROPS} d="M14.5 5.5a4 4 0 0 0-4.9 4.9l-4.6 4.6a1.5 1.5 0 0 0 2.12 2.12l4.6-4.6a4 4 0 0 0 4.9-4.9l-2.1 2.1-2.12-2.12 2.1-2.1Z" />
        </>
      );

    // 21. Backup e Restauração (Guarda Permanente) — Repositório Seguro
    case 'database':
      return (
        <>
          <ellipse {...STROKE_PROPS} cx="12" cy="6.5" rx="6.75" ry="2.25" />
          <path {...STROKE_PROPS} d="M5.25 6.5v5.25c0 1.25 3.02 2.25 6.75 2.25s6.75-1 6.75-2.25V6.5" />
          <path {...STROKE_PROPS} d="M5.25 11.75V17c0 1.25 3.02 2.25 6.75 2.25s6.75-1 6.75-2.25v-5.25" />
        </>
      );

    // 22. Configurações (Preferências do Portal) — Engrenagem Limpa
    case 'settings':
      return (
        <>
          <circle {...STROKE_PROPS} cx="12" cy="12" r="2.75" />
          <path
            {...STROKE_PROPS}
            d="M19.4 13.5a7.6 7.6 0 0 0 .1-3l1.6-1.2-1.5-2.6-1.9.7a7.5 7.5 0 0 0-2.6-1.5L14.7 4h-3l-.4 1.9a7.5 7.5 0 0 0-2.6 1.5l-1.9-.7-1.5 2.6 1.6 1.2a7.6 7.6 0 0 0 0 3l-1.6 1.2 1.5 2.6 1.9-.7a7.5 7.5 0 0 0 2.6 1.5l.4 1.9h3l.4-1.9a7.5 7.5 0 0 0 2.6-1.5l1.9.7 1.5-2.6-1.7-1.2Z"
          />
        </>
      );

    default:
      return (
        <>
          <rect {...STROKE_PROPS} x="5.5" y="4" width="13" height="16" rx="1.5" />
          <line {...STROKE_PROPS} x1="8.75" y1="9" x2="15.25" y2="9" />
          <line {...STROKE_PROPS} x1="8.75" y1="13" x2="15.25" y2="13" />
        </>
      );
  }
}

export const ModuleIcon: React.FC<ModuleIconProps> = ({
  name,
  className = 'w-5 h-5 shrink-0',
}) => {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`text-[var(--gov-icon)] ${className}`}
      aria-hidden="true"
      shapeRendering="geometricPrecision"
    >
      {renderMinimalGovPaths(name)}
    </svg>
  );
};
