import React, { useMemo, useState } from 'react';
import { Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';
import { ErrorParetoD3Panel, ParetoDatum } from '../components/charts/ErrorParetoD3Panel';

export const CriticalPointsPage: React.FC = () => {
  const { db, disciplines, addCriticalPoint, deleteCriticalPoint } = useStudy();

  const [data, setData] = useState(String(new Date().getFullYear()));
  const [materia, setMateria] = useState(disciplines[0] || 'Direito Constitucional');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');

  const [paretoGroupBy, setParetoGroupBy] = useState<'materia' | 'ano'>('materia');
  const [selectedFilterKey, setSelectedFilterKey] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addCriticalPoint(data, materia, titulo, texto);
    if (titulo.trim() && texto.trim()) {
      setTitulo('');
      setTexto('');
    }
  };

  const paretoItems = useMemo<ParetoDatum[]>(() => {
    const counts = new Map<string, number>();
    db.criticalPoints.forEach((item) => {
      const key =
        paretoGroupBy === 'materia'
          ? (item.materia || 'Geral').trim()
          : (item.data || 'Sem ano').trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()].map(([key, count]) => ({
      key,
      label: key,
      count,
    }));
  }, [db.criticalPoints, paretoGroupBy]);

  const filteredCriticalPoints = useMemo(() => {
    if (!selectedFilterKey) return db.criticalPoints;
    return db.criticalPoints.filter((item) => {
      const key =
        paretoGroupBy === 'materia'
          ? (item.materia || 'Geral').trim()
          : (item.data || 'Sem ano').trim();
      return key === selectedFilterKey;
    });
  }, [db.criticalPoints, paretoGroupBy, selectedFilterKey]);

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

      {db.criticalPoints.length > 0 && (
        <ErrorParetoD3Panel
          title="Pareto 80/20 · Concentração de Pontos Críticos"
          subtitle="Veja quais disciplinas ou anos de vigência concentram ~80% das novidades registradas. Clique em uma barra ou linha para filtrar."
          items={paretoItems}
          unitLabel="pontos"
          selectedKey={selectedFilterKey}
          onSelectKey={(key) =>
            setSelectedFilterKey((prev) => (prev === key ? null : key))
          }
          headerExtra={
            <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
              <button
                type="button"
                onClick={() => {
                  setParetoGroupBy('materia');
                  setSelectedFilterKey(null);
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                  paretoGroupBy === 'materia'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Por disciplina
              </button>
              <button
                type="button"
                onClick={() => {
                  setParetoGroupBy('ano');
                  setSelectedFilterKey(null);
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap ${
                  paretoGroupBy === 'ano'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Por ano / vigência
              </button>
            </div>
          }
        />
      )}

      {selectedFilterKey && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3.5 py-2 text-[12px]">
          <span className="text-[var(--text)]">
            Filtrando por{' '}
            <strong>
              {paretoGroupBy === 'materia' ? 'disciplina' : 'ano/vigência'}: {selectedFilterKey}
            </strong>{' '}
            ({filteredCriticalPoints.length} de {db.criticalPoints.length})
          </span>
          <button
            type="button"
            onClick={() => setSelectedFilterKey(null)}
            className="inline-flex items-center gap-1 font-bold text-[var(--accent)] hover:underline whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            Limpar filtro
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {filteredCriticalPoints.length ? (
          filteredCriticalPoints.map((item) => (
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
