import React, { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';
import { ModuleName } from '../../types/study';

export interface ShortcutEntry {
  keys: string[];
  label: string;
  description?: string;
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutEntry[];
}

export const MODULE_NUMBER_SHORTCUTS: ReadonlyArray<{ digit: string; page: ModuleName; label: string }> = [
  { digit: '1', page: 'Início', label: 'Início' },
  { digit: '2', page: 'Cronograma', label: 'Cronograma' },
  { digit: '3', page: 'Lei Seca', label: 'Lei Seca' },
  { digit: '4', page: 'Resumos & Mapas', label: 'Resumos & Mapas' },
  { digit: '5', page: 'Treino Diário', label: 'Treino Diário' },
  { digit: '6', page: 'Caderno de Erros', label: 'Caderno de Erros' },
  { digit: '7', page: 'Monitor de Desempenho', label: 'Monitor de Desempenho' },
];

export const KEYBOARD_SHORTCUT_GROUPS: ReadonlyArray<ShortcutGroup> = [
  {
    title: 'Estudo & Foco',
    items: [
      { keys: ['Alt', 'P'], label: 'Iniciar ou pausar o cronômetro de estudos' },
      { keys: ['Alt', 'Shift', 'F'], label: 'Ativar ou sair do Modo Foco' },
      { keys: ['?'], label: 'Abrir ou fechar este guia de atalhos' },
    ],
  },
  {
    title: 'Navegação Rápida entre Módulos',
    items: MODULE_NUMBER_SHORTCUTS.map((m) => ({
      keys: ['Alt', m.digit],
      label: `Ir para ${m.label}`,
    })),
  },
  {
    title: 'Editor de Resumos e Observações (.docx)',
    items: [
      { keys: ['Ctrl', 'B'], label: 'Negrito no trecho selecionado' },
      { keys: ['Ctrl', 'I'], label: 'Itálico no trecho selecionado' },
      { keys: ['Ctrl', 'U'], label: 'Sublinhado no trecho selecionado' },
      { keys: ['Ctrl', 'S'], label: 'Salvar documento imediatamente' },
      { keys: ['Tab'], label: 'Avançar para a próxima célula da tabela' },
    ],
  },
];

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
    >
      <div
        className="w-full max-w-[580px] max-h-[85vh] overflow-y-auto rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Keyboard className="w-4.5 h-4.5 text-[var(--accent)] shrink-0" aria-hidden="true" />
            <div>
              <h2
                id="keyboard-shortcuts-title"
                className="m-0 text-[15px] font-extrabold text-[var(--text)] leading-tight"
              >
                Atalhos de Teclado
              </h2>
              <p className="m-0 mt-0.5 text-[11.5px] text-[var(--muted)]">
                Desativados automaticamente enquanto você digita em campos de texto.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar guia de atalhos"
            className="grid place-items-center w-8 h-8 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {KEYBOARD_SHORTCUT_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="m-0 mb-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--muted)]">
                {group.title}
              </h3>
              <div className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-lg bg-[var(--panel-soft)]/50">
                {group.items.map((item) => (
                  <div
                    key={item.keys.join('+')}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[12.5px]"
                  >
                    <span className="text-[var(--text)] font-medium">{item.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, idx) => (
                        <React.Fragment key={`${k}-${idx}`}>
                          {idx > 0 && <span className="text-[10px] text-[var(--muted)]">+</span>}
                          <kbd className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded border border-[var(--line-strong)] bg-[var(--panel)] font-mono-num text-[11px] font-bold text-[var(--text)] shadow-[0_1px_0_var(--line-strong)]">
                            {k}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-[var(--line)] bg-[var(--panel-soft)]/60 flex items-center justify-between text-[11.5px] text-[var(--muted)]">
          <span>Pressione Esc ou ? para fechar</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
