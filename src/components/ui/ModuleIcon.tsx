import React, { useState } from 'react';
import {
  Activity,
  BarChart2,
  BookOpen,
  Bookmark,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Database,
  FileText,
  Folder,
  Home,
  Library,
  ListChecks,
  MapPin,
  PenLine,
  Scale,
  Search,
  Settings,
  Sparkles,
  Target,
  Wrench,
} from 'lucide-react';

import govSealPortal from '../../assets/images/gov_seal_portal_1795184493833.jpg';
import govSealTransparencia from '../../assets/images/gov_seal_transparencia_1795184496302.jpg';
import govSealExames from '../../assets/images/gov_seal_exames_1795184496062.jpg';
import govSealProvas from '../../assets/images/gov_seal_provas_1795184500079.jpg';
import govSealLegislacao from '../../assets/images/gov_seal_legislacao_1795184496247.jpg';
import govSealOuvidoria from '../../assets/images/gov_seal_ouvidoria_1795184496306.jpg';
import govSealAcervo from '../../assets/images/gov_seal_acervo_1795184497086.jpg';
import govSealExpediente from '../../assets/images/gov_seal_expediente_1795184495940.jpg';
import govSealSecretaria from '../../assets/images/gov_seal_secretaria_1795184496101.jpg';

interface SealSpec {
  src: string;
  label: string;
  /** Slight zoom to crop away outer rounded/framed light borders on specific generated badges */
  imgScaleClass: string;
}

const SEAL_BY_ICON: Record<string, SealSpec> = {
  home: {
    src: govSealPortal,
    label: 'Brasão Portal Único do Estudante',
    imgScaleClass: 'scale-[1.06]',
  },
  activity: {
    src: govSealTransparencia,
    label: 'Portal da Transparência e Desempenho',
    imgScaleClass: 'scale-[1.06]',
  },
  chart: {
    src: govSealTransparencia,
    label: 'Boletim e Estatísticas Oficiais',
    imgScaleClass: 'scale-[1.06]',
  },
  scale: {
    src: govSealTransparencia,
    label: 'Censo e Matriz de Incidência',
    imgScaleClass: 'scale-[1.06]',
  },
  target: {
    src: govSealExames,
    label: 'Banco Oficial de Questões',
    imgScaleClass: 'scale-[1.06]',
  },
  check: {
    src: govSealExames,
    label: 'Atestado de Cumprimento',
    imgScaleClass: 'scale-[1.06]',
  },
  clipboard: {
    src: govSealProvas,
    label: 'Prova Lacrada',
    imgScaleClass: 'scale-[1.15]',
  },
  file: {
    src: govSealProvas,
    label: 'Arquivo Nacional de Provas',
    imgScaleClass: 'scale-[1.15]',
  },
  checklist: {
    src: govSealProvas,
    label: 'Diário de Editais',
    imgScaleClass: 'scale-[1.15]',
  },
  pen: {
    src: govSealPortal,
    label: 'Ofício e Discursiva',
    imgScaleClass: 'scale-[1.06]',
  },
  book: {
    src: govSealLegislacao,
    label: 'Diário Oficial e Lei Seca',
    imgScaleClass: 'scale-[1.15]',
  },
  bookmark: {
    src: govSealLegislacao,
    label: 'Corte Superior e Súmulas',
    imgScaleClass: 'scale-[1.15]',
  },
  search: {
    src: govSealOuvidoria,
    label: 'Ouvidoria e Caderno de Erros',
    imgScaleClass: 'scale-[1.16]',
  },
  clock: {
    src: govSealOuvidoria,
    label: 'Pendências em Diligência',
    imgScaleClass: 'scale-[1.16]',
  },
  sparkles: {
    src: govSealPortal,
    label: 'Alertas Ministeriais',
    imgScaleClass: 'scale-[1.06]',
  },
  folder: {
    src: govSealAcervo,
    label: 'Acervo de Apostilas',
    imgScaleClass: 'scale-[1.15]',
  },
  library: {
    src: govSealAcervo,
    label: 'Dossiê de Resumos e Mapas',
    imgScaleClass: 'scale-[1.15]',
  },
  database: {
    src: govSealAcervo,
    label: 'Guarda Permanente e Backup',
    imgScaleClass: 'scale-[1.15]',
  },
  calendar: {
    src: govSealExpediente,
    label: 'Expediente e Cronograma',
    imgScaleClass: 'scale-[1.06]',
  },
  pin: {
    src: govSealExpediente,
    label: 'Protocolo, Datas e Locais',
    imgScaleClass: 'scale-[1.06]',
  },
  tools: {
    src: govSealSecretaria,
    label: 'Balcão de Protocolo e Utilidades',
    imgScaleClass: 'scale-[1.06]',
  },
  settings: {
    src: govSealSecretaria,
    label: 'Preferências do Portal',
    imgScaleClass: 'scale-[1.06]',
  },
};

function renderFallbackSvg(name: string, className: string): React.ReactNode {
  const props = { className, strokeWidth: 1.75, 'aria-hidden': true as const };

  switch (name) {
    case 'home':
      return <Home {...props} />;
    case 'target':
      return <Target {...props} />;
    case 'clipboard':
      return <ClipboardList {...props} />;
    case 'chart':
      return <BarChart2 {...props} />;
    case 'activity':
      return <Activity {...props} />;
    case 'pen':
      return <PenLine {...props} />;
    case 'file':
      return <FileText {...props} />;
    case 'search':
      return <Search {...props} />;
    case 'bookmark':
      return <Bookmark {...props} />;
    case 'pin':
      return <MapPin {...props} />;
    case 'checklist':
      return <ListChecks {...props} />;
    case 'calendar':
      return <Calendar {...props} />;
    case 'check':
      return <CheckCircle2 {...props} />;
    case 'clock':
      return <Clock {...props} />;
    case 'book':
      return <BookOpen {...props} />;
    case 'scale':
      return <Scale {...props} />;
    case 'folder':
      return <Folder {...props} />;
    case 'library':
      return <Library {...props} />;
    case 'sparkles':
      return <Sparkles {...props} />;
    case 'tools':
      return <Wrench {...props} />;
    case 'database':
      return <Database {...props} />;
    case 'settings':
      return <Settings {...props} />;
    default:
      return <FileText {...props} />;
  }
}

interface ModuleIconProps {
  name: string;
  className?: string;
}

export const ModuleIcon: React.FC<ModuleIconProps> = ({
  name,
  className = 'w-5 h-5 rounded-[6px]',
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const spec = SEAL_BY_ICON[name] || SEAL_BY_ICON.home;

  if (imgFailed || !spec) {
    return (
      <span
        className={`inline-grid place-items-center bg-[#071D41] text-[#E6B800] border border-[#D4AF37]/50 shrink-0 ${className}`}
        aria-hidden="true"
      >
        {renderFallbackSvg(name, 'w-[62%] h-[62%] shrink-0')}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden bg-[#071D41] border border-[#D4AF37]/55 shadow-xs shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      <img
        src={spec.src}
        alt=""
        referrerPolicy="no-referrer"
        loading="eager"
        decoding="async"
        draggable={false}
        onError={() => setImgFailed(true)}
        className={`w-full h-full object-cover ${spec.imgScaleClass}`}
      />
    </span>
  );
};
