import React from 'react';
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

interface ModuleIconProps {
  name: string;
  className?: string;
}

export const ModuleIcon: React.FC<ModuleIconProps> = ({ name, className = 'w-4 h-4 shrink-0' }) => {
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
};
