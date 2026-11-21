import React, { useMemo, useState } from 'react';
import { AlertTriangle, Calculator, CheckCircle2, ShieldAlert } from 'lucide-react';
import { CompletedSimulation } from '../../types/study';
import { analyzeSimulationGuessingAndCutoff } from '../../lib/studyTools';

interface SimulationGuessingSimulatorPanelProps {
  sim: CompletedSimulation;
  cutoffPercent: number;
}

export const SimulationGuessingSimulatorPanel: React.FC<SimulationGuessingSimulatorPanelProps> = ({
  sim,
  cutoffPercent,
}) => {
  const [leaveBlankPct, setLeaveBlankPct] = useState<number>(50);
  const [customCutoff, setCustomCutoff] = useState<number>(cutoffPercent);

  const analysis = useMemo(
    () => analyzeSimulationGuessingAndCutoff(sim, customCutoff, leaveBlankPct),
    [sim, customCutoff, leaveBlankPct],
  );

  return (
    <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--panel-soft)] p-3.5 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--accent)]">
            <Calculator className="w-3.5 h-3.5 shrink-0" />
            <span>
              Simulador de Nota de Corte &amp; Análise &ldquo;E se eu não chutasse?&rdquo;
            </span>
          </div>
          <p className="m-0 mt-0.5 text-[11.5px] text-[var(--muted)]">
            {analysis.isCespeStyle
              ? 'Modelo Cebraspe detectado (1 errada anula 1 certa). Simule o ganho líquido ao deixar chutes incertos em branco.'
              : 'Diagnóstico de rentabilidade por disciplina e comparação direta contra a nota de corte escolhida.'}
          </p>
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-2.5 py-1 text-[11px] font-bold">
          <span className="text-[var(--muted)]">Corte simulado:</span>
          <input
            type="number"
            min={30}
            max={95}
            step={1}
            value={customCutoff}
            onChange={(e) => setCustomCutoff(Math.max(30, Math.min(95, Number(e.target.value) || 70)))}
            className="w-11 bg-transparent text-center font-mono-num font-extrabold text-[var(--accent)] outline-none"
          />
          <span className="text-[var(--muted)]">% ({analysis.cutoffPoints} pts)</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2.5">
          <span className="block text-[10px] font-bold uppercase text-[var(--muted)]">
            {analysis.isCespeStyle ? 'Nota Líquida Real' : 'Acertos Reais'}
          </span>
          <strong className="font-mono-num text-[15px] font-extrabold text-[var(--text)]">
            {analysis.currentNetScore} pts ({analysis.currentNetPct}%)
          </strong>
          <span className="block text-[10.5px] text-[var(--muted)]">
            {analysis.correct}C · {analysis.wrong}E · {analysis.blank}B
          </span>
        </div>

        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2.5">
          <span className="block text-[10px] font-bold uppercase text-[var(--muted)]">
            {analysis.isCespeStyle ? 'Pontos Perdidos por Penalidade' : 'Questões Erradas'}
          </span>
          <strong className="font-mono-num text-[15px] font-extrabold text-[var(--bad)]">
            {analysis.isCespeStyle ? `-${analysis.pointsLostToPenalties} pts` : `${analysis.wrong} erros`}
          </strong>
          <span className="block text-[10.5px] text-[var(--muted)]">
            {analysis.isCespeStyle ? 'Cada erro anulou 1 acerto' : 'Sem fator de correção negativo'}
          </span>
        </div>

        <div className="rounded-lg border border-[var(--accent)]/35 bg-[var(--accent-soft)]/40 p-2.5">
          <span className="block text-[10px] font-bold uppercase text-[var(--accent)]">
            Nota Simulada (Sem Chute)
          </span>
          <strong className="font-mono-num text-[15px] font-extrabold text-[var(--accent)]">
            {analysis.simulatedNetScore} pts ({analysis.simulatedNetPct}%)
          </strong>
          <span className="block text-[10.5px] text-[var(--text)]">
            {analysis.isCespeStyle
              ? `+${analysis.simulatedGainPoints} pts deixando ${analysis.avoidedWrongCount} em branco`
              : 'Múltipla escolha: chutar não desconta ponto'}
          </span>
        </div>

        <div
          className={`rounded-lg border p-2.5 ${
            analysis.simulatedApproved
              ? 'border-[var(--good)]/40 bg-[var(--good)]/10'
              : 'border-[var(--warning)]/40 bg-[var(--warning)]/10'
          }`}
        >
          <span className="block text-[10px] font-bold uppercase text-[var(--muted)]">
            Status vs Corte ({customCutoff}%)
          </span>
          <strong
            className={`inline-flex items-center gap-1 text-[13px] font-extrabold mt-0.5 ${
              analysis.simulatedApproved ? 'text-[var(--good)]' : 'text-[var(--warning)]'
            }`}
          >
            {analysis.simulatedApproved ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                {analysis.currentApproved ? 'Aprovado' : 'Passaria no corte!'}
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Faltam {Math.max(0, analysis.cutoffPoints - analysis.simulatedNetScore)} pts
              </>
            )}
          </strong>
          <span className="block text-[10.5px] text-[var(--muted)]">
            Corte exigido: {analysis.cutoffPoints} pts
          </span>
        </div>
      </div>

      {/* Interactive Slider (Cebraspe counterfactual) */}
      {analysis.isCespeStyle && analysis.wrong > 0 && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] mb-1.5">
            <span className="font-bold text-[var(--text)]">
              Simulador de Chute: se você tivesse deixado{' '}
              <strong className="font-mono-num text-[var(--accent)]">{leaveBlankPct}%</strong> dos seus erros em branco ({analysis.avoidedWrongCount} de {analysis.wrong} itens)
            </span>
            <span className="font-mono-num font-extrabold text-[var(--good)]">
              +{analysis.simulatedGainPoints} ponto(s) líquidos
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={leaveBlankPct}
            onChange={(e) => setLeaveBlankPct(Number(e.target.value))}
            className="w-full accent-[var(--accent)] cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-mono-num text-[var(--muted)] mt-0.5">
            <span>0% (como fez)</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>100% (zero erros)</span>
          </div>
        </div>
      )}

      {/* Per-Subject Guessing Profitability Table */}
      {analysis.subjectInsights.length > 0 && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <strong className="text-[12px] font-bold text-[var(--text)]">
              Rentabilidade do Chute por Disciplina
            </strong>
            {analysis.dangerSubjectsCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bad)]/12 text-[var(--bad)] text-[10.5px] font-extrabold">
                <ShieldAlert className="w-3 h-3" />
                {analysis.dangerSubjectsCount} disciplina(s) com chute negativo (&lt; 50%)
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11.5px]">
              <thead>
                <tr className="border-b border-[var(--line)] text-[10.5px] font-bold text-[var(--muted)]">
                  <th className="text-left py-1.5 pr-2">Disciplina</th>
                  <th className="text-right py-1.5 px-2">C / E / B</th>
                  <th className="text-right py-1.5 px-2">Acerto (Marcadas)</th>
                  <th className="text-right py-1.5 px-2">Saldo Cespe</th>
                  <th className="text-right py-1.5 pl-2">Estratégia</th>
                </tr>
              </thead>
              <tbody>
                {analysis.subjectInsights.map((row) => (
                  <tr key={row.subject} className="border-b border-[var(--line)]/50 last:border-b-0">
                    <td className="py-1.5 pr-2 font-semibold text-[var(--text)]">{row.subject}</td>
                    <td className="py-1.5 px-2 text-right font-mono-num text-[var(--muted)]">
                      {row.correct}/{row.wrong}/{row.blank}
                    </td>
                    <td
                      className={`py-1.5 px-2 text-right font-mono-num font-bold ${
                        row.answeredAccuracyPct < 50
                          ? 'text-[var(--bad)]'
                          : row.answeredAccuracyPct < 65
                          ? 'text-[var(--warning)]'
                          : 'text-[var(--good)]'
                      }`}
                    >
                      {row.answeredAccuracyPct}%
                    </td>
                    <td
                      className={`py-1.5 px-2 text-right font-mono-num font-extrabold ${
                        row.netCespeScore < 0
                          ? 'text-[var(--bad)]'
                          : row.netCespeScore > 0
                          ? 'text-[var(--good)]'
                          : 'text-[var(--muted)]'
                      }`}
                    >
                      {row.netCespeScore > 0 ? `+${row.netCespeScore}` : row.netCespeScore}
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      {row.recommendation === 'deixar-em-branco' ? (
                        <span className="inline-flex px-2 py-0.5 rounded bg-[var(--bad)]/12 text-[var(--bad)] text-[10px] font-extrabold">
                          Não chutar (deixar em branco)
                        </span>
                      ) : row.recommendation === 'cautela' ? (
                        <span className="inline-flex px-2 py-0.5 rounded bg-[var(--warning)]/12 text-[var(--warning)] text-[10px] font-extrabold">
                          Cautela na dúvida
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded bg-[var(--good)]/12 text-[var(--good)] text-[10px] font-extrabold">
                          Rentável arriscar
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
