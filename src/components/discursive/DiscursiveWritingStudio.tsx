import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  FileText,
  FileUp,
  Pause,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react';
import { SubmitEssayOptions } from '../../context/StudyContext';
import {
  CONNECTIVES_BANK,
  ESSAY_BANKS,
  ESSAY_SKELETONS,
  ESSAY_TYPES,
  estimateSheetMetrics,
  FINAL_REVIEW_CHECKLIST,
  formatTimerClock,
  LINE_LIMIT_OPTIONS,
} from '../../lib/discursiveHelpers';
import { clearFieldDraft, readFieldDraft, writeFieldDraft } from '../../lib/draftStorage';
import { EssayType } from '../../types/study';
import { Panel } from '../ui/PageHeader';

interface DiscursiveWritingStudioProps {
  disciplines: string[];
  guideOpen: boolean;
  onToggleGuide: () => void;
  onSubmitEssay: (
    titulo: string,
    file: File | null,
    options?: SubmitEssayOptions,
  ) => Promise<void>;
  onNotify: (message: string, isError?: boolean) => void;
}

interface StudioDraft {
  mode: 'editor' | 'upload';
  titulo: string;
  banca: string;
  tipo: EssayType;
  disciplina: string;
  limiteLinhas: number;
  proposta: string;
  espelho: string;
  textoOriginal: string;
  targetMinutes: number;
}

const DRAFT_KEY = 'discursive_writing_studio_v1';

const DEFAULT_DRAFT: StudioDraft = {
  mode: 'editor',
  titulo: '',
  banca: 'Cebraspe (CESPE)',
  tipo: 'Dissertação',
  disciplina: '',
  limiteLinhas: 30,
  proposta: '',
  espelho: '',
  textoOriginal: '',
  targetMinutes: 60,
};

const TIMER_PRESETS = [30, 45, 60, 90] as const;

export const DiscursiveWritingStudio: React.FC<DiscursiveWritingStudioProps> = ({
  disciplines,
  guideOpen,
  onToggleGuide,
  onSubmitEssay,
  onNotify,
}) => {
  const initialDraft = useMemo(() => {
    const saved = readFieldDraft<Partial<StudioDraft>>(DRAFT_KEY);
    return { ...DEFAULT_DRAFT, ...(saved || {}) };
  }, []);

  const [mode, setMode] = useState<'editor' | 'upload'>(initialDraft.mode);
  const [titulo, setTitulo] = useState(initialDraft.titulo);
  const [banca, setBanca] = useState(initialDraft.banca);
  const [tipo, setTipo] = useState<EssayType>(initialDraft.tipo);
  const [disciplina, setDisciplina] = useState(initialDraft.disciplina);
  const [limiteLinhas, setLimiteLinhas] = useState<number>(initialDraft.limiteLinhas || 30);
  const [proposta, setProposta] = useState(initialDraft.proposta);
  const [espelho, setEspelho] = useState(initialDraft.espelho);
  const [textoOriginal, setTextoOriginal] = useState(initialDraft.textoOriginal);
  const [essayFile, setEssayFile] = useState<File | null>(null);
  const [showPromptBox, setShowPromptBox] = useState(
    Boolean(initialDraft.proposta || initialDraft.espelho),
  );
  const [submitting, setSubmitting] = useState(false);

  // Discursive timer state
  const [targetMinutes, setTargetMinutes] = useState<number>(initialDraft.targetMinutes || 60);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [logToTransparency, setLogToTransparency] = useState(true);

  // Guide drawer state
  const [guideTab, setGuideTab] = useState<'connectives' | 'skeletons' | 'checklist'>('connectives');
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Persist draft automatically
  useEffect(() => {
    writeFieldDraft<StudioDraft>(DRAFT_KEY, {
      mode,
      titulo,
      banca,
      tipo,
      disciplina,
      limiteLinhas,
      proposta,
      espelho,
      textoOriginal,
      targetMinutes,
    });
  }, [mode, titulo, banca, tipo, disciplina, limiteLinhas, proposta, espelho, textoOriginal, targetMinutes]);

  // Run timer interval
  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  const metrics = useMemo(() => estimateSheetMetrics(textoOriginal), [textoOriginal]);
  const lineRatio = limiteLinhas > 0 ? metrics.estimatedLines / limiteLinhas : 0;
  const isOverLimit = metrics.estimatedLines > limiteLinhas;

  const targetSeconds = targetMinutes * 60;
  const remainingSeconds = targetSeconds - elapsedSeconds;
  const timerOver = remainingSeconds < 0;
  const timerProgressPct = Math.min(100, Math.round((elapsedSeconds / Math.max(1, targetSeconds)) * 100));

  const checkedCount = Object.values(checkedItems).filter(Boolean).length;

  const handleInsertConnective = (phrase: string) => {
    if (mode !== 'editor') {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(phrase);
        onNotify(`Conectivo copiado: "${phrase}"`);
      }
      return;
    }
    const el = editorRef.current;
    if (!el) {
      setTextoOriginal((prev) => (prev ? `${prev} ${phrase} ` : `${phrase} `));
      return;
    }
    const start = el.selectionStart ?? textoOriginal.length;
    const end = el.selectionEnd ?? textoOriginal.length;
    const before = textoOriginal.slice(0, start);
    const after = textoOriginal.slice(end);
    const needsLeadingSpace = before.length > 0 && !/[\s\n]$/.test(before);
    const insertion = `${needsLeadingSpace ? ' ' : ''}${phrase} `;
    const next = `${before}${insertion}${after}`;
    setTextoOriginal(next);
    window.requestAnimationFrame(() => {
      el.focus();
      const pos = before.length + insertion.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleApplySkeleton = (template: string, name: string) => {
    setMode('editor');
    setTextoOriginal((prev) => (prev.trim() ? `${prev.trim()}\n\n${template}` : template));
    onNotify(`Esqueleto "${name}" inserido na folha de redação.`);
  };

  const handleClearDraft = () => {
    setTitulo('');
    setProposta('');
    setEspelho('');
    setTextoOriginal('');
    setEssayFile(null);
    setElapsedSeconds(0);
    setTimerRunning(false);
    setCheckedItems({});
    if (fileInputRef.current) fileInputRef.current.value = '';
    clearFieldDraft(DRAFT_KEY);
    onNotify('Rascunho limpo.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      onNotify('Informe o título ou tema da redação.', true);
      return;
    }
    if (mode === 'upload' && !essayFile) {
      onNotify('Anexe o arquivo da redação (.txt, .pdf ou .docx).', true);
      return;
    }
    if (mode === 'editor' && !textoOriginal.trim()) {
      onNotify('Escreva sua redação na folha integrada antes de protocolar.', true);
      return;
    }

    setSubmitting(true);
    setTimerRunning(false);
    try {
      await onSubmitEssay(titulo, mode === 'upload' ? essayFile : null, {
        banca,
        tipo,
        disciplina,
        proposta,
        espelho,
        texto_original: mode === 'editor' ? textoOriginal : undefined,
        limite_linhas: limiteLinhas,
        linhas_escritas: mode === 'editor' ? metrics.estimatedLines : undefined,
        tempo_segundos: elapsedSeconds > 0 ? elapsedSeconds : undefined,
        logToTransparency,
      });
      setTitulo('');
      setProposta('');
      setEspelho('');
      setTextoOriginal('');
      setEssayFile(null);
      setElapsedSeconds(0);
      setCheckedItems({});
      if (fileInputRef.current) fileInputRef.current.value = '';
      clearFieldDraft(DRAFT_KEY);
    } catch (err) {
      onNotify((err as Error).message, true);
    } finally {
      setSubmitting(false);
    }
  };

  const lineNumbers = useMemo(
    () => Array.from({ length: Math.max(limiteLinhas, metrics.estimatedLines) }, (_, i) => i + 1),
    [limiteLinhas, metrics.estimatedLines],
  );

  return (
    <Panel
      title="Estúdio de Redação · Novo protocolo"
      className="mb-4 print:hidden"
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)] p-0.5">
            <button
              type="button"
              onClick={() => setMode('editor')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-bold transition-colors ${
                mode === 'editor'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Folha Pautada
            </button>
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-bold transition-colors ${
                mode === 'upload'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              <FileUp className="w-3.5 h-3.5" />
              Anexar Arquivo
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleGuide}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11.5px] font-bold transition-colors ${
              guideOpen
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Guia & Conectivos
          </button>
        </div>
      }
    >
      <div className={`grid grid-cols-1 ${guideOpen ? 'xl:grid-cols-[1fr_340px]' : ''} gap-4 items-start`}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 min-w-0">
          {/* Metadata row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-2.5">
            <div className="lg:col-span-5">
              <label
                htmlFor="essay-title"
                className="block text-[11px] font-bold text-[var(--muted)] mb-1"
              >
                Título / Tema da proposta *
              </label>
              <input
                id="essay-title"
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex.: Controle de Constitucionalidade e Segurança Jurídica"
                className="ce-input"
              />
            </div>

            <div className="lg:col-span-2">
              <label
                htmlFor="essay-bank"
                className="block text-[11px] font-bold text-[var(--muted)] mb-1"
              >
                Banca
              </label>
              <select
                id="essay-bank"
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

            <div className="lg:col-span-2">
              <label
                htmlFor="essay-type"
                className="block text-[11px] font-bold text-[var(--muted)] mb-1"
              >
                Tipo de prova
              </label>
              <select
                id="essay-type"
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

            <div className="lg:col-span-2">
              <label
                htmlFor="essay-subject"
                className="block text-[11px] font-bold text-[var(--muted)] mb-1"
              >
                Disciplina
              </label>
              <input
                id="essay-subject"
                type="text"
                list="discursive-subjects-list"
                value={disciplina}
                onChange={(e) => setDisciplina(e.target.value)}
                placeholder="Ex.: Direito Administrativo"
                className="ce-input"
              />
              <datalist id="discursive-subjects-list">
                {disciplines.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>

            <div className="lg:col-span-1">
              <label
                htmlFor="essay-limit"
                className="block text-[11px] font-bold text-[var(--muted)] mb-1"
              >
                Linhas
              </label>
              <select
                id="essay-limit"
                value={limiteLinhas}
                onChange={(e) => setLimiteLinhas(Number(e.target.value) || 30)}
                className="ce-input font-mono-num tabular-nums"
              >
                {LINE_LIMIT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}L
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Collapsible Proposta & Espelho */}
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)]">
            <button
              type="button"
              onClick={() => setShowPromptBox((prev) => !prev)}
              className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left text-[11.5px] font-bold text-[var(--text)]"
            >
              <span>
                Enunciado / Proposta da Banca & Espelho de Referência{' '}
                <span className="font-normal text-[var(--muted)]">(opcional)</span>
              </span>
              {showPromptBox ? (
                <ChevronUp className="w-4 h-4 text-[var(--muted)]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--muted)]" />
              )}
            </button>
            {showPromptBox && (
              <div className="px-3 pb-3 pt-1 border-t border-[var(--line)] grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                    Enunciado / Quesitos exigidos pela banca
                  </label>
                  <textarea
                    value={proposta}
                    onChange={(e) => setProposta(e.target.value)}
                    rows={3}
                    placeholder="Cole o comando da questão e os tópicos obrigatórios (a, b, c)..."
                    className="ce-textarea text-[12.5px]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                    Espelho de referência / Padrão de resposta
                  </label>
                  <textarea
                    value={espelho}
                    onChange={(e) => setEspelho(e.target.value)}
                    rows={3}
                    placeholder="Artigos esperados, súmulas, teses ou critérios do padrão oficial..."
                    className="ce-textarea text-[12.5px]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Discursive Timer Bar */}
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-[var(--text)]">
                <Clock className={`w-4 h-4 ${timerRunning ? 'text-[var(--good)] animate-pulse' : 'text-[var(--accent)]'}`} />
                <span>Cronômetro Discursivo</span>
              </div>

              <div className="inline-flex items-center gap-1">
                {TIMER_PRESETS.map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setTargetMinutes(min)}
                    className={`px-2 py-0.5 rounded-md border text-[11px] font-bold tabular-nums transition-colors ${
                      targetMinutes === min
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {min}m
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 font-mono-num tabular-nums text-[13px] font-extrabold">
                <span className="text-[var(--text)]">{formatTimerClock(elapsedSeconds)}</span>
                <span
                  className={`text-[11.5px] font-semibold ${
                    timerOver ? 'text-[var(--bad)]' : 'text-[var(--muted)]'
                  }`}
                >
                  {timerOver
                    ? `(+${formatTimerClock(Math.abs(remainingSeconds))} além da meta)`
                    : `(restam ${formatTimerClock(remainingSeconds)})`}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTimerRunning((prev) => !prev)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11.5px] font-bold ${
                  timerRunning
                    ? 'border-[var(--warning)]/60 bg-[var(--warning)]/15 text-[var(--warning)]'
                    : 'border-[var(--accent)] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                }`}
              >
                {timerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {timerRunning ? 'Pausar' : elapsedSeconds > 0 ? 'Retomar' : 'Iniciar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTimerRunning(false);
                  setElapsedSeconds(0);
                }}
                disabled={elapsedSeconds === 0}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-45"
              >
                <RotateCcw className="w-3 h-3" />
                Zerar
              </button>

              <label className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--muted)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={logToTransparency}
                  onChange={(e) => setLogToTransparency(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Lançar no Portal da Transparência
              </label>
            </div>

            {elapsedSeconds > 0 && (
              <div className="w-full h-1 rounded-full bg-[var(--panel-raised)] overflow-hidden">
                <div
                  className={`h-full transition-all ${timerOver ? 'bg-[var(--bad)]' : 'bg-[var(--accent)]'}`}
                  style={{ width: `${timerProgressPct}%` }}
                />
              </div>
            )}
          </div>

          {/* Mode: Lined Sheet Editor OR File Upload */}
          {mode === 'editor' ? (
            <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--line)] bg-[var(--panel-raised)] flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                <div className="flex flex-wrap items-center gap-2 font-mono-num tabular-nums">
                  <span
                    className={`font-bold ${
                      isOverLimit
                        ? 'text-[var(--bad)]'
                        : lineRatio >= 0.85
                          ? 'text-[var(--warning)]'
                          : 'text-[var(--text)]'
                    }`}
                  >
                    {metrics.estimatedLines} / {limiteLinhas} linhas estimadas
                  </span>
                  <span className="text-[var(--muted)]">·</span>
                  <span className="text-[var(--muted)]">{metrics.words} palavras</span>
                  <span className="text-[var(--muted)]">·</span>
                  <span className="text-[var(--muted)]">{metrics.paragraphs} parágrafo(s)</span>
                  <span className="text-[var(--muted)]">·</span>
                  <span className="text-[var(--muted)]">{metrics.chars} caracteres</span>
                </div>

                {isOverLimit && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--bad)]">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Acima do limite de {limiteLinhas} linhas
                  </span>
                )}
              </div>

              <div className="grid grid-cols-[44px_1fr] max-h-[440px] overflow-y-auto">
                <div
                  aria-hidden="true"
                  className="select-none border-r border-[var(--line)] bg-[var(--panel)] py-3 text-right pr-2.5 font-mono-num tabular-nums text-[11px] leading-[28px] text-[var(--muted)]"
                >
                  {lineNumbers.map((n) => (
                    <div
                      key={n}
                      className={n > limiteLinhas ? 'text-[var(--bad)] font-bold' : undefined}
                    >
                      {String(n).padStart(2, '0')}
                    </div>
                  ))}
                </div>
                <textarea
                  ref={editorRef}
                  value={textoOriginal}
                  onChange={(e) => setTextoOriginal(e.target.value)}
                  rows={Math.max(14, Math.min(24, limiteLinhas))}
                  placeholder="Redija aqui sua resposta discursiva. Use o botão 'Guia & Conectivos' acima para inserir conectivos ou modelos estruturais em 1 clique..."
                  className="w-full min-h-[360px] resize-y bg-transparent px-4 py-3 text-[13.5px] leading-[28px] text-[var(--text)] placeholder:text-[var(--muted)]/70 focus:outline-none"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(to bottom, transparent 0px, transparent 27px, var(--line) 27px, var(--line) 28px)',
                    backgroundPositionY: '12px',
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--panel-soft)] p-4">
              <label
                htmlFor="essay-file"
                className="block text-[11.5px] font-bold text-[var(--text)] mb-1.5"
              >
                Arquivo da redação (.txt, .pdf ou .docx)
              </label>
              <input
                ref={fileInputRef}
                id="essay-file"
                type="file"
                accept=".txt,.pdf,.docx"
                onChange={(e) => setEssayFile(e.target.files?.[0] || null)}
                className="ce-input file:mr-3 file:rounded-md file:border-0 file:bg-[var(--panel-raised)] file:px-2.5 file:py-1 file:text-[11px] file:font-bold file:text-[var(--text)]"
              />
              <p className="mt-1.5 text-[11.5px] text-[var(--muted)]">
                O arquivo será armazenado localmente e sincronizado automaticamente na pasta Discursivas do Google Drive.
              </p>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleClearDraft}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar rascunho
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {checkedCount > 0 && (
                <span className="text-[11.5px] text-[var(--good)] font-semibold tabular-nums">
                  Checklist: {checkedCount}/{FINAL_REVIEW_CHECKLIST.length}
                </span>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-1.5 h-[38px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap"
              >
                <FileUp className="w-3.5 h-3.5" />
                {submitting ? 'Protocolando…' : 'Protocolar redação'}
              </button>
            </div>
          </div>
        </form>

        {/* Quick Reference Drawer (Connectives, Skeletons & Final Checklist) */}
        {guideOpen && (
          <aside className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel-soft)] p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-[12px] font-extrabold uppercase tracking-wider text-[var(--text)]">
                Guia Rápido Discursivo
              </strong>
              <span className="text-[10.5px] text-[var(--muted)]">
                {mode === 'editor' ? 'Clique para inserir' : 'Clique para copiar'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-0.5">
              <button
                type="button"
                onClick={() => setGuideTab('connectives')}
                className={`py-1 rounded-md text-[11px] font-bold transition-colors ${
                  guideTab === 'connectives'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Conectivos
              </button>
              <button
                type="button"
                onClick={() => setGuideTab('skeletons')}
                className={`py-1 rounded-md text-[11px] font-bold transition-colors ${
                  guideTab === 'skeletons'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Esqueletos
              </button>
              <button
                type="button"
                onClick={() => setGuideTab('checklist')}
                className={`py-1 rounded-md text-[11px] font-bold transition-colors tabular-nums ${
                  guideTab === 'checklist'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Revisão ({checkedCount}/{FINAL_REVIEW_CHECKLIST.length})
              </button>
            </div>

            <div className="max-h-[430px] overflow-y-auto pr-1 flex flex-col gap-2.5">
              {guideTab === 'connectives' &&
                CONNECTIVES_BANK.map((group) => (
                  <div key={group.category}>
                    <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-[var(--muted)] mb-1">
                      {group.category}
                    </div>
                    <div className="flex flex-col gap-1">
                      {group.items.map((phrase) => (
                        <button
                          key={phrase}
                          type="button"
                          onClick={() => handleInsertConnective(phrase)}
                          className="w-full text-left px-2.5 py-1.5 rounded-md border border-[var(--line)] bg-[var(--panel)] text-[11.5px] text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] flex items-center justify-between gap-2 transition-colors"
                        >
                          <span className="leading-snug">{phrase}</span>
                          <Copy className="w-3 h-3 text-[var(--muted)] shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

              {guideTab === 'skeletons' &&
                ESSAY_SKELETONS.map((sk) => (
                  <div
                    key={sk.id}
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2.5 flex flex-col gap-1.5"
                  >
                    <div className="text-[12px] font-bold text-[var(--text)]">{sk.name}</div>
                    <p className="m-0 text-[11px] leading-snug text-[var(--muted)]">
                      {sk.description}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleApplySkeleton(sk.template, sk.name)}
                      className="mt-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors"
                    >
                      <Check className="w-3 h-3" />
                      Carregar na folha pautada
                    </button>
                  </div>
                ))}

              {guideTab === 'checklist' && (
                <div className="flex flex-col gap-1.5">
                  {FINAL_REVIEW_CHECKLIST.map((item, idx) => {
                    const checked = Boolean(checkedItems[idx]);
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() =>
                          setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }))
                        }
                        className={`w-full text-left px-2.5 py-2 rounded-lg border flex items-start gap-2 text-[11.5px] leading-snug transition-colors ${
                          checked
                            ? 'border-[var(--good)]/50 bg-[var(--good)]/10 text-[var(--text)]'
                            : 'border-[var(--line)] bg-[var(--panel)] text-[var(--text)] hover:border-[var(--line-strong)]'
                        }`}
                      >
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-[var(--good)] shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-4 h-4 text-[var(--muted)] shrink-0 mt-0.5" />
                        )}
                        <span className={checked ? 'line-through opacity-75' : undefined}>
                          {item}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </Panel>
  );
};
