import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookMarked,
  Columns2,
  GitCompare,
  Plus,
  Save,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { UpdateEssayCorrectionOptions } from '../../context/StudyContext';
import { reviewEssayWithAi } from '../../lib/aiApi';
import {
  computeRubricFinalScore,
  ESSAY_BANKS,
  ESSAY_ERROR_TAGS,
  ESSAY_TYPES,
  estimateSheetMetrics,
  roundScore,
} from '../../lib/discursiveHelpers';
import { getFileBlob } from '../../lib/fileStorage';
import { formatCorrectionTextStructured } from '../../lib/legalTextFormatter';
import { visibleName } from '../../lib/parsers';
import { readStudyBlobText } from '../../lib/pdfExtract';
import { EssayRecord, EssayRubricMode, EssayType } from '../../types/study';

interface DiscursiveCorrectionDrawerProps {
  essay: EssayRecord;
  initialTab?: 'rubric' | 'rewrite';
  disciplines: string[];
  onSave: (
    essayId: string,
    feedback: string,
    correctedFile: File | null,
    options: UpdateEssayCorrectionOptions,
  ) => Promise<void>;
  onSendToErrorNotebook: (essay: EssayRecord, tags: string[], feedbackText: string) => void;
  onClose: () => void;
  onNotify: (message: string, isError?: boolean) => void;
}

export const DiscursiveCorrectionDrawer: React.FC<DiscursiveCorrectionDrawerProps> = ({
  essay,
  initialTab = 'rubric',
  disciplines,
  onSave,
  onSendToErrorNotebook,
  onClose,
  onNotify,
}) => {
  const [tab, setTab] = useState<'rubric' | 'rewrite'>(initialTab);
  const [saving, setSaving] = useState(false);
  const [aiReviewing, setAiReviewing] = useState(false);

  // Editable metadata & prompt
  const [banca, setBanca] = useState(essay.banca || 'Cebraspe (CESPE)');
  const [tipo, setTipo] = useState<EssayType>(essay.tipo || 'Dissertação');
  const [disciplina, setDisciplina] = useState(essay.disciplina || '');
  const [proposta, setProposta] = useState(essay.proposta || '');
  const [espelho, setEspelho] = useState(essay.espelho || '');
  const [showContextFields, setShowContextFields] = useState(
    Boolean(essay.proposta || essay.espelho),
  );

  // Rubric state
  const [useRubric, setUseRubric] = useState<boolean>(Boolean(essay.rubrica));
  const [rubricMode, setRubricMode] = useState<EssayRubricMode>(
    essay.rubrica?.mode || (essay.banca?.toLowerCase().includes('cebraspe') ? 'cebraspe' : 'criteria'),
  );
  const [notaMaxima, setNotaMaxima] = useState<string>(String(essay.rubrica?.notaMaxima ?? 30));
  const [notaConteudo, setNotaConteudo] = useState<string>(
    essay.rubrica?.notaConteudo !== undefined ? String(essay.rubrica.notaConteudo) : '',
  );
  const [notaEstrutura, setNotaEstrutura] = useState<string>(
    essay.rubrica?.notaEstrutura !== undefined ? String(essay.rubrica.notaEstrutura) : '',
  );
  const [notaGramatica, setNotaGramatica] = useState<string>(
    essay.rubrica?.notaGramatica !== undefined ? String(essay.rubrica.notaGramatica) : '',
  );
  const [numErros, setNumErros] = useState<string>(
    essay.rubrica?.numErrosGramaticais !== undefined
      ? String(essay.rubrica.numErrosGramaticais)
      : '0',
  );
  const [totalLinhas, setTotalLinhas] = useState<string>(
    String(essay.rubrica?.totalLinhas ?? essay.linhas_escritas ?? essay.limite_linhas ?? 30),
  );
  const [notaDireta, setNotaDireta] = useState<string>(
    essay.rubrica?.notaFinal !== undefined ? String(essay.rubrica.notaFinal) : '',
  );

  // Error tags & feedback
  const [errorTags, setErrorTags] = useState<string[]>(essay.erros_tags || []);
  const [customTag, setCustomTag] = useState('');
  const [feedbackDraft, setFeedbackDraft] = useState(essay.feedback || '');
  const [correctedFile, setCorrectedFile] = useState<File | null>(null);

  // Rewrite V2 state
  const [rewriteText, setRewriteText] = useState(essay.reescrita?.texto || '');
  const [rewriteFile, setRewriteFile] = useState<File | null>(null);
  const [rewriteScore, setRewriteScore] = useState<string>(
    essay.reescrita?.notaFinal !== undefined ? String(essay.reescrita.notaFinal) : '',
  );
  const [rewriteNotes, setRewriteNotes] = useState(essay.reescrita?.observacoes || '');
  const [showSideBySide, setShowSideBySide] = useState(false);

  const computedRubric = useMemo(() => {
    if (!useRubric) return null;
    return computeRubricFinalScore({
      mode: rubricMode,
      notaMaxima: Number(notaMaxima.replace(',', '.')) || 30,
      notaConteudo: Number(notaConteudo.replace(',', '.')) || 0,
      notaEstrutura: Number(notaEstrutura.replace(',', '.')) || 0,
      notaGramatica: Number(notaGramatica.replace(',', '.')) || 0,
      numErrosGramaticais: Number(numErros) || 0,
      totalLinhas: Number(totalLinhas) || 30,
      notaFinal: Number(notaDireta.replace(',', '.')) || 0,
    });
  }, [
    useRubric,
    rubricMode,
    notaMaxima,
    notaConteudo,
    notaEstrutura,
    notaGramatica,
    numErros,
    totalLinhas,
    notaDireta,
  ]);

  const computedPct = useMemo(() => {
    if (!computedRubric || computedRubric.notaMaxima <= 0) return null;
    return Math.min(
      100,
      Math.max(0, Math.round((computedRubric.notaFinal / computedRubric.notaMaxima) * 100)),
    );
  }, [computedRubric]);

  const cebraspePenalty = useMemo(() => {
    if (rubricMode !== 'cebraspe') return 0;
    const ne = Math.max(0, Math.round(Number(numErros) || 0));
    const tl = Math.max(1, Math.round(Number(totalLinhas) || 30));
    return roundScore((2 * ne) / tl);
  }, [rubricMode, numErros, totalLinhas]);

  const rewriteMetrics = useMemo(() => estimateSheetMetrics(rewriteText), [rewriteText]);

  const rewriteDelta = useMemo(() => {
    const rwNum = Number(rewriteScore.replace(',', '.'));
    if (!rewriteScore.trim() || !Number.isFinite(rwNum)) return null;
    const v1Score = computedRubric?.notaFinal ?? essay.rubrica?.notaFinal;
    if (typeof v1Score !== 'number') return null;
    return roundScore(rwNum - v1Score);
  }, [rewriteScore, computedRubric, essay.rubrica]);

  const toggleTag = (tag: string) => {
    setErrorTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleAddCustomTag = () => {
    const clean = customTag.trim();
    if (!clean) return;
    if (!errorTags.includes(clean)) {
      setErrorTags((prev) => [...prev, clean]);
    }
    setCustomTag('');
  };

  const handleAiReview = async () => {
    setAiReviewing(true);
    try {
      let essayText = essay.texto_original?.trim() || '';
      if (!essayText) {
        const blob = await getFileBlob(essay.original_blobKey);
        if (!blob) {
          onNotify('Texto ou arquivo original da redação não encontrado localmente.', true);
          return;
        }
        const lower = essay.original_arquivo.toLowerCase();
        if (lower.endsWith('.docx')) {
          onNotify('Para correção automática com IA, envie a redação em .txt, .pdf selecionável ou escreva na Folha Pautada.', true);
          return;
        }
        essayText = await readStudyBlobText(blob, essay.original_arquivo, essay.original_mime);
      }

      const enrichedParts: string[] = [];
      if (proposta.trim()) enrichedParts.push(`ENUNCIADO / PROPOSTA DA BANCA:\n${proposta.trim()}`);
      if (espelho.trim()) enrichedParts.push(`ESPELHO DE REFERÊNCIA:\n${espelho.trim()}`);
      enrichedParts.push(`REDAÇÃO DO CANDIDATO:\n${essayText}`);

      const res = await reviewEssayWithAi({
        title: visibleName(essay.titulo),
        essayText: enrichedParts.join('\n\n'),
        banca,
      });

      const sections: string[] = [];
      if (res.scoreEstimate) sections.push(`Nota estimada: ${res.scoreEstimate}`);
      if (res.feedback) sections.push(res.feedback);
      if (res.strengths?.length) {
        sections.push(`Pontos fortes:\n- ${res.strengths.join('\n- ')}`);
      }
      if (res.improvements?.length) {
        sections.push(`Pontos a melhorar:\n- ${res.improvements.join('\n- ')}`);
      }
      setFeedbackDraft(sections.join('\n\n'));
      onNotify('Parecer preliminar gerado por IA. Revise e ajuste o espelho antes de salvar.');
    } catch (err) {
      onNotify((err as Error).message || 'Falha ao corrigir redação com IA.', true);
    } finally {
      setAiReviewing(false);
    }
  };

  const handleFormatFeedback = () => {
    if (!feedbackDraft.trim()) return;
    setFeedbackDraft(formatCorrectionTextStructured(feedbackDraft));
    onNotify('Parecer estruturado com quebras de artigos e tópicos.');
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const parsedRewriteScore = rewriteScore.trim()
        ? Number(rewriteScore.replace(',', '.'))
        : undefined;
      const hasRewriteData = Boolean(
        rewriteText.trim() ||
          rewriteFile ||
          rewriteNotes.trim() ||
          (parsedRewriteScore !== undefined && Number.isFinite(parsedRewriteScore)) ||
          essay.reescrita?.arquivo,
      );

      await onSave(essay.id, feedbackDraft, correctedFile, {
        banca,
        tipo,
        disciplina,
        proposta,
        espelho,
        rubrica: computedRubric,
        erros_tags: errorTags,
        reescrita: hasRewriteData
          ? {
              texto: rewriteText.trim() || undefined,
              notaFinal:
                parsedRewriteScore !== undefined && Number.isFinite(parsedRewriteScore)
                  ? roundScore(parsedRewriteScore)
                  : undefined,
              observacoes: rewriteNotes.trim() || undefined,
              linhas_escritas: rewriteText.trim() ? rewriteMetrics.estimatedLines : undefined,
            }
          : essay.reescrita
            ? null
            : undefined,
        rewriteFile,
      });
      setCorrectedFile(null);
      setRewriteFile(null);
      onClose();
    } catch (err) {
      onNotify((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  const allTagOptions = useMemo(() => {
    const base: string[] = [...ESSAY_ERROR_TAGS];
    for (const t of errorTags) {
      if (!base.includes(t)) base.push(t);
    }
    return base;
  }, [errorTags]);

  return (
    <div className="mt-3 pt-3 border-t border-[var(--line)] flex flex-col gap-3">
      {/* Drawer Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
          <button
            type="button"
            onClick={() => setTab('rubric')}
            className={`px-3 py-1 rounded-md text-[11.5px] font-bold transition-colors ${
              tab === 'rubric'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            Espelho & Parecer
          </button>
          <button
            type="button"
            onClick={() => setTab('rewrite')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11.5px] font-bold transition-colors ${
              tab === 'rewrite'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            Reescrita (V2) & Comparativo
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSendToErrorNotebook(essay, errorTags, feedbackDraft)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--warning)]/50 bg-[var(--warning)]/10 text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--warning)]"
        >
          <BookMarked className="w-3.5 h-3.5 text-[var(--warning)]" />
          Enviar ao Caderno de Erros
        </button>
      </div>

      {tab === 'rubric' ? (
        <div className="flex flex-col gap-3">
          {/* Metadata classification */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">Banca</label>
              <select
                value={banca}
                onChange={(e) => setBanca(e.target.value)}
                className="ce-input"
              >
                {ESSAY_BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">Tipo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as EssayType)}
                className="ce-input"
              >
                {ESSAY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                Disciplina
              </label>
              <input
                type="text"
                list="discursive-drawer-subjects"
                value={disciplina}
                onChange={(e) => setDisciplina(e.target.value)}
                placeholder="Ex.: Direito Constitucional"
                className="ce-input"
              />
              <datalist id="discursive-drawer-subjects">
                {disciplines.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Rubric Calculator */}
          <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-[12px] font-bold text-[var(--text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={useRubric}
                  onChange={(e) => setUseRubric(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Registrar Espelho de Notas Estruturado
              </label>

              {useRubric && (
                <div className="inline-flex rounded-lg border border-[var(--line)] bg-[var(--panel)] p-0.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setRubricMode('cebraspe')}
                    className={`px-2.5 py-1 rounded-md ${
                      rubricMode === 'cebraspe'
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    Fórmula Cebraspe
                  </button>
                  <button
                    type="button"
                    onClick={() => setRubricMode('criteria')}
                    className={`px-2.5 py-1 rounded-md ${
                      rubricMode === 'criteria'
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    Critérios
                  </button>
                  <button
                    type="button"
                    onClick={() => setRubricMode('simple')}
                    className={`px-2.5 py-1 rounded-md ${
                      rubricMode === 'simple'
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    Nota Direta
                  </button>
                </div>
              )}
            </div>

            {useRubric && (
              <>
                {rubricMode === 'cebraspe' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                        Nota Máxima
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        value={notaMaxima}
                        onChange={(e) => setNotaMaxima(e.target.value)}
                        className="ce-input font-mono-num tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                        Nota Conteúdo (NC)
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={notaConteudo}
                        onChange={(e) => setNotaConteudo(e.target.value)}
                        placeholder="Ex.: 26.5"
                        className="ce-input font-mono-num tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                        Erros Gramat. (NE)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={numErros}
                        onChange={(e) => setNumErros(e.target.value)}
                        className="ce-input font-mono-num tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                        Total Linhas (TL)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={totalLinhas}
                        onChange={(e) => setTotalLinhas(e.target.value)}
                        className="ce-input font-mono-num tabular-nums"
                      />
                    </div>
                  </div>
                )}

                {rubricMode === 'criteria' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                        Nota Máxima
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        value={notaMaxima}
                        onChange={(e) => setNotaMaxima(e.target.value)}
                        className="ce-input font-mono-num tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                        Conteúdo / Domínio
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={notaConteudo}
                        onChange={(e) => setNotaConteudo(e.target.value)}
                        placeholder="Ex.: 16"
                        className="ce-input font-mono-num tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                        Estrutura / Coesão
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={notaEstrutura}
                        onChange={(e) => setNotaEstrutura(e.target.value)}
                        placeholder="Ex.: 7.5"
                        className="ce-input font-mono-num tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                        Gramática / Norma
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={notaGramatica}
                        onChange={(e) => setNotaGramatica(e.target.value)}
                        placeholder="Ex.: 4.5"
                        className="ce-input font-mono-num tabular-nums"
                      />
                    </div>
                  </div>
                )}

                {rubricMode === 'simple' && (
                  <div className="grid grid-cols-2 gap-2.5 max-w-[360px]">
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                        Nota Máxima
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        value={notaMaxima}
                        onChange={(e) => setNotaMaxima(e.target.value)}
                        className="ce-input font-mono-num tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                        Nota Obtida
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        value={notaDireta}
                        onChange={(e) => setNotaDireta(e.target.value)}
                        placeholder="Ex.: 24.5"
                        className="ce-input font-mono-num tabular-nums"
                      />
                    </div>
                  </div>
                )}

                {computedRubric && (
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
                    <div className="text-[var(--muted)] font-mono-num tabular-nums">
                      {rubricMode === 'cebraspe' ? (
                        <span>
                          Fórmula: NC ({(computedRubric.notaConteudo ?? 0).toFixed(2)}) − 2×
                          {computedRubric.numErrosGramaticais ?? 0}/{computedRubric.totalLinhas ?? 30}{' '}
                          (−{cebraspePenalty.toFixed(2)} pts)
                        </span>
                      ) : rubricMode === 'criteria' ? (
                        <span>
                          Soma: Conteúdo {(computedRubric.notaConteudo ?? 0).toFixed(2)} + Estrutura{' '}
                          {(computedRubric.notaEstrutura ?? 0).toFixed(2)} + Gramática{' '}
                          {(computedRubric.notaGramatica ?? 0).toFixed(2)}
                        </span>
                      ) : (
                        <span>Pontuação direta registrada no espelho</span>
                      )}
                    </div>
                    <div className="font-mono-num tabular-nums font-extrabold text-[13.5px] text-[var(--text)]">
                      Nota Final:{' '}
                      <span
                        className={
                          computedPct !== null && computedPct >= 70
                            ? 'text-[var(--good)]'
                            : 'text-[var(--warning)]'
                        }
                      >
                        {computedRubric.notaFinal.toFixed(2)} / {computedRubric.notaMaxima}
                        {computedPct !== null ? ` (${computedPct}%)` : ''}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Error Tags Checklist */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="text-[11px] font-bold text-[var(--muted)]">
                Checklist de falhas identificadas (alimenta o painel de erros recorrentes)
              </label>
              <span className="text-[11px] text-[var(--muted)] tabular-nums">
                {errorTags.length} selecionada(s)
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allTagOptions.map((tag) => {
                const active = errorTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-2.5 py-1 rounded-md border text-[11px] font-bold transition-colors ${
                      active
                        ? 'border-[var(--bad)]/60 bg-[var(--bad)]/12 text-[var(--bad)]'
                        : 'border-[var(--line)] bg-[var(--panel-soft)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--line-strong)]'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-1.5 max-w-[340px]">
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomTag();
                  }
                }}
                placeholder="Adicionar outra falha (ex.: Paralelismo)..."
                className="ce-input text-[11.5px] py-1"
              />
              <button
                type="button"
                onClick={handleAddCustomTag}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
              >
                <Plus className="w-3 h-3" />
                Incluir
              </button>
            </div>
          </div>

          {/* Optional Proposta & Espelho edit */}
          <div>
            <button
              type="button"
              onClick={() => setShowContextFields((prev) => !prev)}
              className="text-[11.5px] font-bold text-[var(--accent)] hover:underline"
            >
              {showContextFields
                ? 'Ocultar enunciado e espelho de referência'
                : '+ Editar enunciado da proposta e espelho de referência'}
            </button>
            {showContextFields && (
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                    Enunciado / Proposta
                  </label>
                  <textarea
                    value={proposta}
                    onChange={(e) => setProposta(e.target.value)}
                    rows={3}
                    className="ce-textarea text-[12px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                    Espelho de Referência
                  </label>
                  <textarea
                    value={espelho}
                    onChange={(e) => setEspelho(e.target.value)}
                    rows={3}
                    className="ce-textarea text-[12px]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Feedback / Parecer */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="block text-[11px] font-bold text-[var(--muted)]">
                Parecer e apontamentos da correção
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleFormatFeedback}
                  disabled={!feedbackDraft.trim()}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-45"
                >
                  <Wand2 className="w-3 h-3" />
                  Estruturar texto
                </button>
                <button
                  type="button"
                  disabled={aiReviewing}
                  onClick={() => void handleAiReview()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-55 whitespace-nowrap"
                >
                  <Sparkles className={`w-3 h-3 ${aiReviewing ? 'animate-pulse' : ''}`} />
                  {aiReviewing ? 'Analisando redação…' : 'Corrigir com IA'}
                </button>
              </div>
            </div>
            <textarea
              value={feedbackDraft}
              onChange={(e) => setFeedbackDraft(e.target.value)}
              rows={5}
              placeholder="Análise de conteúdo, fundamentação jurídica, estruturação dos parágrafos, desvios gramaticais e recomendações para a reescrita..."
              className="ce-textarea"
            />
          </div>

          {/* Optional corrected file */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                Anexar folha corrigida pelo professor (opcional · .txt, .pdf, .docx)
              </label>
              <input
                type="file"
                accept=".txt,.pdf,.docx"
                onChange={(e) => setCorrectedFile(e.target.files?.[0] || null)}
                className="ce-input"
              />
            </div>
          </div>
        </div>
      ) : (
        /* TAB 2: REWRITE V2 & SIDE-BY-SIDE COMPARISON */
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <div className="flex items-center gap-2 text-[var(--text)]">
              <AlertCircle className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span>
                Reescreva a redação corrigindo os desvios apontados no parecer e registre a nova nota para medir sua evolução.
              </span>
            </div>
            {essay.texto_original && (
              <button
                type="button"
                onClick={() => setShowSideBySide((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold ${
                  showSideBySide
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)]'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
                {showSideBySide ? 'Ocultar V1 ao lado' : 'Comparar V1 × V2'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                Nova nota após reescrita (V2)
              </label>
              <input
                type="number"
                step="0.25"
                min="0"
                value={rewriteScore}
                onChange={(e) => setRewriteScore(e.target.value)}
                placeholder={computedRubric ? `Máx.: ${computedRubric.notaMaxima}` : 'Ex.: 28.5'}
                className="ce-input font-mono-num tabular-nums"
              />
              {rewriteDelta !== null && (
                <div
                  className={`mt-1 text-[11px] font-bold font-mono-num tabular-nums ${
                    rewriteDelta >= 0 ? 'text-[var(--good)]' : 'text-[var(--bad)]'
                  }`}
                >
                  Evolução vs V1: {rewriteDelta >= 0 ? '+' : ''}
                  {rewriteDelta.toFixed(2)} pts
                </div>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                O que foi ajustado nesta reescrita?
              </label>
              <input
                type="text"
                value={rewriteNotes}
                onChange={(e) => setRewriteNotes(e.target.value)}
                placeholder="Ex.: Inseri o art. 37, § 6º da CF, corrigi crases e reduzi para 29 linhas."
                className="ce-input"
              />
            </div>
          </div>

          <div
            className={`grid grid-cols-1 ${
              showSideBySide && essay.texto_original ? 'lg:grid-cols-2' : ''
            } gap-3`}
          >
            {showSideBySide && essay.texto_original && (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)] mb-2">
                  Versão 1 (Original) · {essay.linhas_escritas || estimateSheetMetrics(essay.texto_original).estimatedLines} linhas
                </div>
                <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--text)]/85 max-h-[320px] overflow-y-auto pr-1">
                  {essay.texto_original}
                </div>
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label className="text-[11px] font-bold text-[var(--muted)]">
                  Texto da Reescrita (Versão 2)
                </label>
                <span className="text-[11px] font-mono-num tabular-nums text-[var(--muted)]">
                  {rewriteMetrics.estimatedLines} / {essay.limite_linhas || 30} linhas ·{' '}
                  {rewriteMetrics.words} palavras
                </span>
              </div>
              <textarea
                value={rewriteText}
                onChange={(e) => setRewriteText(e.target.value)}
                rows={10}
                placeholder="Redija aqui a versão aprimorada da sua redação..."
                className="ce-textarea leading-relaxed"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
              Ou anexe o arquivo da reescrita V2 (opcional · .txt, .pdf, .docx)
            </label>
            <input
              type="file"
              accept=".txt,.pdf,.docx"
              onChange={(e) => setRewriteFile(e.target.files?.[0] || null)}
              className="ce-input"
            />
          </div>
        </div>
      )}

      {/* Unified Save Footer */}
      <div className="pt-2 border-t border-[var(--line)] flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-[36px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSaveAll()}
          className="inline-flex items-center gap-1.5 h-[36px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Salvando…' : 'Salvar espelho, parecer e reescrita'}
        </button>
      </div>
    </div>
  );
};
