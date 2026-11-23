import React, { useCallback, useMemo } from 'react';
import { BarChart3, Printer } from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { PageHeader } from '../components/ui/PageHeader';
import { CareerAchievementsBanner } from '../components/performance/CareerAchievementsBanner';
import { CareerOfficialPrintSheet } from '../components/print/CareerOfficialPrintSheet';
import { MAX_PINNED_MEDALS, computeCareerSummary } from '../lib/careerGamification';

export const CareerPage: React.FC = () => {
  const { db, setActivePage, updatePreferences, googleUser, toast } = useStudy();

  const careerSummary = useMemo(() => computeCareerSummary(db), [db]);
  const pinnedMedalIds = db.preferences?.career_meta?.pinned_medals || [];
  const holderName =
    googleUser?.displayName || googleUser?.email || 'Cidadão-Estudante · Sessão Local';

  const handleTogglePinMedal = useCallback(
    (medalId: string) => {
      const meta = db.preferences?.career_meta || {};
      const current = Array.isArray(meta.pinned_medals) ? meta.pinned_medals : [];
      if (current.includes(medalId)) {
        updatePreferences({
          career_meta: {
            ...meta,
            pinned_medals: current.filter((id) => id !== medalId),
          },
        });
        toast('Medalha removida da Vitrine de Honra.');
        return;
      }
      if (current.length >= MAX_PINNED_MEDALS) {
        toast(
          `A Vitrine de Honra exibe até ${MAX_PINNED_MEDALS} medalhas. Remova uma antes de fixar outra.`,
          true,
        );
        return;
      }
      updatePreferences({
        career_meta: {
          ...meta,
          pinned_medals: [...current, medalId],
        },
      });
      toast('Medalha fixada na Vitrine de Honra da tela inicial.');
    },
    [db.preferences?.career_meta, toast, updatePreferences],
  );

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          eyebrow="Guichê do Cidadão-Estudante · Progressão até o Nível 100"
          title="Carreira do Concurseiro & Medalhas de Mérito"
          description="Acompanhe sua ascensão pelas 10 patentes (Nível 1 ao 100), conquiste objetivos de alta dificuldade e personalize sua Vitrine de Honra."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActivePage('Monitor de Desempenho')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] hover:border-[var(--accent)] text-[12px] font-bold text-[var(--text)] whitespace-nowrap transition-colors cursor-pointer"
              >
                <BarChart3 className="w-3.5 h-3.5 text-[var(--accent)]" />
                Portal da Transparência
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[12px] font-bold text-white whitespace-nowrap transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir Portaria (A4)
              </button>
            </div>
          }
        />

        <CareerAchievementsBanner
          db={db}
          onNavigate={setActivePage}
          onPrintOfficial={() => window.print()}
          pinnedMedalIds={pinnedMedalIds}
          onTogglePinMedal={handleTogglePinMedal}
          fullPage
        />
      </div>

      <CareerOfficialPrintSheet summary={careerSummary} holderName={holderName} />
    </>
  );
};
