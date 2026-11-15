import React, { useState } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';

export const CriticalPointsPage: React.FC = () => {
  const { db, disciplines, addCriticalPoint, deleteCriticalPoint } = useStudy();

  const [data, setData] = useState(String(new Date().getFullYear()));
  const [materia, setMateria] = useState(disciplines[0] || 'Direito Constitucional');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addCriticalPoint(data, materia, titulo, texto);
    if (titulo.trim() && texto.trim()) {
      setTitulo('');
      setTexto('');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="ALERTA MINISTERIAL · PONTOS CRÍTICOS"
        title="Novidades legislativas e mudanças de entendimento"
        description="Protocole alterações recentes de leis, emendas constitucionais e viradas jurisprudenciais com alta probabilidade de cobrança."
      />

      <Panel title="Registrar ponto crítico" className="mb-4">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
              Ano / vigência
            </label>
            <input
              type="text"
              value={data}
              onChange={(e) => setData(e.target.value)}
              placeholder="Ex.: 2026"
              className="ce-input font-mono-num"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
              Disciplina
            </label>
            <input
              type="text"
              list="cp-disciplines"
              value={materia}
              onChange={(e) => setMateria(e.target.value)}
              className="ce-input"
            />
            <datalist id="cp-disciplines">
              {disciplines.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
              Título / norma
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: EC 132/2023 ou Nova Lei de Licitações"
              className="ce-input"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
              O que mudou / como cai em prova
            </label>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              placeholder="Resumo objetivo da mudança normativa e diferenças para o regime anterior..."
              className="ce-textarea"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Cadastrar ponto crítico
            </button>
          </div>
        </form>
      </Panel>

      <div className="flex flex-col gap-3">
        {db.criticalPoints.length ? (
          db.criticalPoints.map((item) => (
            <Panel key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-2.5 mb-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[10.5px] font-bold font-mono-num text-[var(--accent)]">
                      <Sparkles className="w-3 h-3" />
                      {item.data}
                    </span>
                    <span className="text-[12px] font-bold text-[var(--muted)]">
                      {item.materia}
                    </span>
                  </div>
                  <h3 className="m-0 font-display text-[15px] font-bold text-[var(--text)]">
                    {item.titulo}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => deleteCriticalPoint(item.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir
                </button>
              </div>
              <p className="m-0 text-[13.5px] leading-relaxed text-[var(--text)] whitespace-pre-wrap">
                {item.texto}
              </p>
            </Panel>
          ))
        ) : (
          <EmptyState message="Nenhuma atualização legislativa cadastrada." />
        )}
      </div>
    </div>
  );
};
