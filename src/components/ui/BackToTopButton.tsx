import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export const BackToTopButton: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 360);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Voltar ao topo da página"
      title="Voltar ao topo"
      className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] text-[12px] font-bold shadow-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors cursor-pointer"
    >
      <ArrowUp className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden="true" />
      <span className="hidden sm:inline">Topo</span>
    </button>
  );
};
