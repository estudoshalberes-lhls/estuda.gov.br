import React from 'react';
import {
  CareerSummary,
  MEDAL_TIER_LABELS,
  MedalCategory,
  formatCareerDateBr,
} from '../../lib/careerGamification';
import { formatClock } from '../../lib/parsers';

interface CareerOfficialPrintSheetProps {
  summary: CareerSummary;
  holderName: string;
}

const CATEGORY_LABELS: Record<MedalCategory, string> = {
  metas: 'Metas',
  horas: 'Horas',
  consistencia: 'Consistência',
  excelencia: 'Excelência',
  dominio: 'Domínio & Lei',
};

export const CareerOfficialPrintSheet: React.FC<CareerOfficialPrintSheetProps> = ({
  summary,
  holderName,
}) => {
  const emissionStamp = new Date().toLocaleString('pt-BR');
  const protocolCode = `CAR-NV${String(summary.currentLevel.level).padStart(2, '0')}-${String(
    summary.unlockedMedalsCount,
  ).padStart(2, '0')}-${String(summary.totalXp % 10000).padStart(4, '0')}`;

  const unlockedMedals = summary.medals.filter((m) => m.unlocked);
  const activeXpSources = summary.xpSources.filter((src) => src.xp > 0);

  return (
    <section
      className="gov-print-sheet hidden print:block bg-white text-[#071D41]"
      aria-label="Portaria Oficial de Promoção e Quadro de Condecorações para Impressão A4"
    >
      {/* Official Gov.br Header */}
      <header className="border border-[#071D41] mb-3">
        <div className="bg-[#071D41] text-white px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[8.5pt] font-bold tracking-[0.14em] uppercase text-[#FFCD07]">
              PORTAL ÚNICO DO ESTUDANTE · ESTUDA.GOV.BR
            </div>
            <h1 className="m-0 mt-0.5 text-[13.5pt] font-extrabold tracking-[-0.01em] text-white">
              PORTARIA DE PROMOÇÃO E QUADRO OFICIAL DE CONDECORAÇÕES
            </h1>
            <div className="text-[8pt] text-[#DCE6F5] mt-0.5">
              Registro consolidado de Carreira do Concurseiro, Origem de XP e Medalhas de Mérito
            </div>
          </div>

          <div className="text-right shrink-0 border-l border-white/25 pl-3">
            <div className="text-[7.5pt] uppercase tracking-[0.1em] text-[#FFCD07] font-bold">
              Portaria nº
            </div>
            <div className="font-mono text-[9.5pt] font-bold text-white">{protocolCode}</div>
            <div className="text-[7.5pt] text-[#DCE6F5] mt-0.5">{emissionStamp}</div>
          </div>
        </div>

        <div className="gov-brasil-stripe" />

        <div className="grid grid-cols-4 divide-x divide-[#B6C6DC] bg-[#F7F9FC] text-[8.5pt]">
          <div className="px-3 py-1.5">
            <div className="text-[7pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Titular da Carreira
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight truncate">
              {holderName}
            </div>
          </div>
          <div className="px-3 py-1.5">
            <div className="text-[7pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Cargo Atual
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight">
              Nv. {summary.currentLevel.level}/{summary.allLevels.length} ·{' '}
              {summary.currentLevel.title}
            </div>
          </div>
          <div className="px-3 py-1.5">
            <div className="text-[7pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Pontuação Total
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight font-mono">
              {summary.totalXp.toLocaleString('pt-BR')} XP
            </div>
          </div>
          <div className="px-3 py-1.5">
            <div className="text-[7pt] font-bold uppercase tracking-[0.06em] text-[#3D4F6B]">
              Condecorações
            </div>
            <div className="font-bold text-[#071D41] mt-0.5 leading-tight font-mono">
              {summary.unlockedMedalsCount} / {summary.medals.length} medalhas
            </div>
          </div>
        </div>
      </header>

      {/* Section 1: Progressão & Vitrine de Honra */}
      <section className="border border-[#9BB0CD] p-3 mb-3 break-inside-avoid">
        <div className="flex items-baseline justify-between gap-2 border-b border-[#DCE5F0] pb-1.5 mb-2">
          <h2 className="m-0 text-[9.5pt] font-extrabold uppercase tracking-[0.04em] text-[#071D41]">
            1. Progressão de Carreira e Indicadores Consolidados
          </h2>
          <span className="font-mono text-[8pt] font-bold text-[#1351B4]">
            {summary.nextLevel
              ? `Próximo cargo: Nv. ${summary.nextLevel.level} (${summary.nextLevel.title}) · faltam ${summary.xpRemaining.toLocaleString('pt-BR')} XP`
              : 'Patamar máximo da carreira atingido'}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 text-[8.2pt] mb-2.5">
          <div className="border border-[#DCE5F0] bg-[#F7F9FC] px-2.5 py-1.5">
            <div className="text-[7pt] uppercase text-[#4B5E7A] font-bold">Horas Líquidas</div>
            <div className="font-mono text-[10pt] font-extrabold text-[#071D41] mt-0.5">
              {formatClock(summary.metrics.totalStudySeconds)}
            </div>
          </div>
          <div className="border border-[#DCE5F0] bg-[#F7F9FC] px-2.5 py-1.5">
            <div className="text-[7pt] uppercase text-[#4B5E7A] font-bold">Metas Batidas</div>
            <div className="font-mono text-[10pt] font-extrabold text-[#071D41] mt-0.5">
              {summary.metrics.completedGoals.toLocaleString('pt-BR')}
            </div>
          </div>
          <div className="border border-[#DCE5F0] bg-[#F7F9FC] px-2.5 py-1.5">
            <div className="text-[7pt] uppercase text-[#4B5E7A] font-bold">Questões / Acerto</div>
            <div className="font-mono text-[10pt] font-extrabold text-[#071D41] mt-0.5">
              {summary.metrics.totalAnswered.toLocaleString('pt-BR')} ({summary.metrics.accuracyPct}%)
            </div>
          </div>
          <div className="border border-[#DCE5F0] bg-[#F7F9FC] px-2.5 py-1.5">
            <div className="text-[7pt] uppercase text-[#4B5E7A] font-bold">Constância</div>
            <div className="font-mono text-[10pt] font-extrabold text-[#071D41] mt-0.5">
              {summary.metrics.currentStreak}d (máx {summary.metrics.bestStreak}d)
            </div>
          </div>
        </div>

        {summary.showcaseMedals.length > 0 && (
          <div className="pt-2 border-t border-[#DCE5F0] text-[8.2pt]">
            <div className="text-[7.5pt] font-bold uppercase tracking-[0.04em] text-[#3D4F6B] mb-1">
              Vitrine de Honra {summary.hasCustomPinnedMedals ? '(Medalhas Fixadas)' : '(Destaques)'}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {summary.showcaseMedals.map((m) => (
                <div key={m.id} className="border border-[#9BB0CD] bg-[#F7F9FC] px-2.5 py-1.5">
                  <div className="font-bold text-[#071D41] truncate">{m.title}</div>
                  <div className="text-[7.5pt] text-[#3D4F6B] font-mono">
                    {MEDAL_TIER_LABELS[m.tier]} · +{m.bonusXp} XP
                    {m.unlockedAt ? ` · ${formatCareerDateBr(m.unlockedAt)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Section 2: Raio-X do XP + Missões da Semana */}
      <div className="grid grid-cols-2 gap-3 mb-3 break-inside-avoid">
        <section className="border border-[#9BB0CD] p-3">
          <h2 className="m-0 text-[9pt] font-extrabold uppercase tracking-[0.04em] text-[#071D41] border-b border-[#DCE5F0] pb-1 mb-2">
            2. Raio-X de Origem do XP
          </h2>
          {activeXpSources.length === 0 ? (
            <p className="m-0 text-[8pt] text-[#4B5E7A] italic">Nenhum XP contabilizado ainda.</p>
          ) : (
            <table className="w-full border-collapse text-[8pt]">
              <thead>
                <tr className="border-b border-[#B6C6DC] text-left text-[7.2pt] uppercase text-[#4B5E7A]">
                  <th className="py-1 font-bold">Fonte</th>
                  <th className="py-1 text-right font-bold">XP</th>
                  <th className="py-1 text-right font-bold">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6ECF4]">
                {activeXpSources.map((src) => (
                  <tr key={src.id}>
                    <td className="py-1 pr-2">
                      <span className="font-semibold text-[#071D41]">{src.label}</span>
                      <span className="block text-[7pt] text-[#4B5E7A]">{src.detail}</span>
                    </td>
                    <td className="py-1 text-right font-mono font-bold text-[#071D41]">
                      +{src.xp.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-1 text-right font-mono text-[#3D4F6B]">{src.sharePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="border border-[#9BB0CD] p-3">
          <div className="flex items-baseline justify-between gap-2 border-b border-[#DCE5F0] pb-1 mb-2">
            <h2 className="m-0 text-[9pt] font-extrabold uppercase tracking-[0.04em] text-[#071D41]">
              3. Missões da Semana
            </h2>
            <span className="font-mono text-[7.5pt] text-[#3D4F6B]">
              {summary.weekRangeLabel} · {summary.weeklyCompletedCount}/{summary.weeklyMissions.length}
            </span>
          </div>

          <div className="flex flex-col gap-1.5 text-[8pt]">
            {summary.weeklyMissions.map((m) => (
              <div
                key={m.id}
                className="border border-[#DCE5F0] bg-[#F7F9FC] px-2.5 py-1.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-bold text-[#071D41]">
                    [{m.completed ? 'X' : ' '}] {m.title}
                  </div>
                  <div className="text-[7.2pt] text-[#4B5E7A]">{m.progressLabel}</div>
                </div>
                <span className="font-mono text-[7.8pt] font-bold text-[#1351B4] shrink-0">
                  +{m.xpReward} XP
                </span>
              </div>
            ))}
          </div>

          {summary.almostThereMedals.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-[#DCE5F0]">
              <div className="text-[7.5pt] font-bold uppercase tracking-[0.04em] text-[#3D4F6B] mb-1">
                Próximas Condecorações (Quase Lá)
              </div>
              <div className="flex flex-col gap-1 text-[7.8pt]">
                {summary.almostThereMedals.map((m) => (
                  <div key={m.id} className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-[#071D41] truncate">{m.title}</span>
                    <span className="font-mono text-[7.3pt] text-[#3D4F6B] shrink-0">
                      {m.progressPct}% · {m.remainingLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Section 4: Quadro de Medalhas Conquistadas */}
      <section className="mb-3">
        <div className="bg-[#EDF2F8] border border-[#071D41] px-3 py-1.5 mb-2 flex items-center justify-between gap-2 break-after-avoid">
          <strong className="text-[9.5pt] font-extrabold uppercase tracking-[0.03em] text-[#071D41]">
            4. Quadro de Medalhas de Mérito Conquistadas
          </strong>
          <span className="font-mono text-[8pt] font-bold text-[#1351B4]">
            {unlockedMedals.length} de {summary.medals.length} · +
            {summary.xpBreakdown.medalsBonusXp.toLocaleString('pt-BR')} XP em bônus
          </span>
        </div>

        {unlockedMedals.length === 0 ? (
          <div className="border border-[#B6C6DC] p-3 text-[8.5pt] text-[#3D4F6B] italic">
            Nenhuma medalha de mérito conquistada até o momento. Continue registrando metas, horas e
            questões para homologar suas primeiras condecorações.
          </div>
        ) : (
          <table className="w-full border-collapse border border-[#9BB0CD] text-[8pt]">
            <thead>
              <tr className="bg-[#F7F9FC] border-b border-[#071D41] text-left text-[7.2pt] uppercase text-[#3D4F6B]">
                <th className="px-2 py-1.5 font-bold">Condecoração</th>
                <th className="px-2 py-1.5 font-bold">Categoria</th>
                <th className="px-2 py-1.5 font-bold">Grau</th>
                <th className="px-2 py-1.5 text-right font-bold">Bônus XP</th>
                <th className="px-2 py-1.5 text-right font-bold">Data de Concessão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCE5F0]">
              {unlockedMedals.map((m) => (
                <tr key={m.id} className="break-inside-avoid">
                  <td className="px-2 py-1.5">
                    <div className="font-bold text-[#071D41]">{m.title}</div>
                    <div className="text-[7.2pt] text-[#4B5E7A]">{m.description}</div>
                  </td>
                  <td className="px-2 py-1.5 text-[#3D4F6B]">{CATEGORY_LABELS[m.category]}</td>
                  <td className="px-2 py-1.5 font-bold text-[#071D41]">
                    {MEDAL_TIER_LABELS[m.tier]}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono font-bold text-[#1351B4]">
                    +{m.bonusXp} XP
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[#3D4F6B]">
                    {m.unlockedAt ? formatCareerDateBr(m.unlockedAt) : 'Homologada'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="mt-4 pt-2 border-t border-[#071D41] flex items-center justify-between text-[7.5pt] text-[#3D4F6B]">
        <div>estuda.gov.br · Folha Oficial A4 · Portaria de Promoção &amp; Condecorações</div>
        <div className="font-mono">Assinatura do Candidato: ___________________________</div>
      </footer>
    </section>
  );
};
