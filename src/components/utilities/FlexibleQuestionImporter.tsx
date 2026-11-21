import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext';
import { triggerBlobDownload } from '../../lib/fileStorage';
import {
  displayBaseName,
  normalizeAnswer,
  normalizeSearch,
  parseAnswerKeyWithMode,
  parseUploadedQuestions,
  splitExamQuestion,
  uid,
  visibleName,
} from '../../lib/parsers';
import { Question, QuestionAlternative, QuestionType } from '../../types/study';

interface DraftQuestion {
  id: string;
  numero: number;
  materia: string;
  enunciado: string;
  alternativasText: string;
  gabarito: string;
  comentario: string;
  tipo: QuestionType;
}

interface DraftValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
  parsedAlternatives: QuestionAlternative[];
  normalizedAnswer: string;
}

const INPUT_CLS =
  'w-full h-[34px] px-2.5 py-1 border border-[var(--line-strong)] rounded-lg bg-[var(--panel-soft)] text-[var(--text)] text-[12px] outline-none transition-colors focus:border-[var(--accent)] file:mr-2 file:py-0.5 file:px-2 file:rounded file:border file:border-[var(--line-strong)] file:text-[11px] file:font-semibold file:bg-[var(--panel-raised)] file:text-[var(--text)]';

const TEXTAREA_CLS =
  'w-full px-2.5 py-2 border border-[var(--line-strong)] rounded-lg bg-[var(--panel-soft)] text-[var(--text)] text-[12px] leading-snug outline-none transition-colors focus:border-[var(--accent)] resize-y';

const LABEL_CLS = 'block text-[10.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1';

function alternativesToText(alts: QuestionAlternative[]): string {
  return (alts || []).map((a) => `${a.letra}) ${a.texto}`).join('\n');
}

function parseAlternativesText(raw: string): {
  alternatives: QuestionAlternative[];
  invalidLines: number;
} {
  const alternatives: QuestionAlternative[] = [];
  let invalidLines = 0;
  const pattern = /^\s*(?:\[([A-E])\]|([A-E])[).:\-])\s*(.+?)\s*$/i;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(pattern);
    if (!m) {
      invalidLines += 1;
      continue;
    }
    alternatives.push({
      letra: (m[1] || m[2]).toUpperCase(),
      texto: m[3].trim(),
    });
  }
  return { alternatives, invalidLines };
}

function validateDraft(d: DraftQuestion): DraftValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const statement = d.enunciado.trim();
  const normalizedAnswer = normalizeAnswer(d.gabarito);
  const { alternatives, invalidLines } = parseAlternativesText(d.alternativasText);

  if (!statement) {
    errors.push('Enunciado vazio');
  } else if (statement.length < 12) {
    warnings.push('Enunciado muito curto');
  }

  if (d.tipo === 'ME') {
    if (invalidLines > 0) {
      errors.push(`${invalidLines} linha(s) de alternativa fora do padrão "A) texto"`);
    }
    if (alternatives.length < 2) {
      errors.push('Múltipla escolha exige ao menos 2 alternativas');
    } else {
      const letters = new Set(alternatives.map((a) => a.letra));
      if (letters.size !== alternatives.length) {
        errors.push('Alternativas com letras repetidas');
      }
      if (!letters.has(normalizedAnswer)) {
        errors.push('Gabarito não corresponde às alternativas');
      }
    }
  } else {
    if (!['C', 'E'].includes(normalizedAnswer)) {
      errors.push('Gabarito CE deve ser C (Certo) ou E (Errado)');
    }
  }

  if (!d.materia.trim()) {
    warnings.push('Sem disciplina definida');
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    parsedAlternatives: d.tipo === 'ME' ? alternatives : [],
    normalizedAnswer,
  };
}

/**
 * Fallback splitter for pasted text where questions might lack a gabarito so the user
 * can still see them in the preview table and fill/fix them directly before importing.
 */
function parseFlexibleQuestionsForPreview(
  rawText: string,
  defaultSubject: string,
  separateAnswerKey: string,
): DraftQuestion[] {
  let externalMap: Record<number, string> | undefined;
  if (separateAnswerKey.trim()) {
    try {
      const res = parseAnswerKeyWithMode(separateAnswerKey);
      if (Object.keys(res.answers).length > 0) {
        externalMap = res.answers;
      }
    } catch {
      externalMap = undefined;
    }
  }

  const strict = parseUploadedQuestions(rawText, defaultSubject, externalMap);
  if (strict.length > 0) {
    return strict.map((q, idx) => ({
      id: q.id || uid(16),
      numero: q.numero || idx + 1,
      materia: q.materia || defaultSubject,
      enunciado: q.enunciado,
      alternativasText: alternativesToText(q.alternativas),
      gabarito: q.gabarito || '',
      comentario: q.comentario || '',
      tipo: q.alternativas.length >= 2 ? 'ME' : q.tipo || 'CE',
    }));
  }

  // Lenient block split for numbered or blank-line separated raw questions without gabarito yet
  const cleaned = rawText
    .replace(/^\ufeff/, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n')
    .trim();

  if (!cleaned) return [];

  const blocks = cleaned
    .split(/\n(?=(?:quest(?:ão|ao)\s*\d+|\d{1,3}\s*[).\-]\s+\S))/i)
    .map((b) => b.trim())
    .filter(Boolean);

  const chunks = blocks.length > 1 ? blocks : cleaned.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return chunks.map((block, idx) => {
    const numMatch = block.match(/^(?:quest(?:ão|ao)\s*(\d+)|(\d{1,3})\s*[).\-])\s*/i);
    const num = numMatch ? Number(numMatch[1] || numMatch[2]) || idx + 1 : idx + 1;
    let body = numMatch ? block.slice(numMatch[0].length).trim() : block;

    let gabarito = externalMap?.[num] || externalMap?.[idx + 1] || '';
    let comentario = '';

    const gabMatch = body.match(/^[ \t]*(?:gabarito|resp(?:osta)?)\s*[:\-]\s*(.+)$/im);
    if (gabMatch) {
      gabarito = normalizeAnswer(gabMatch[1]) || gabMatch[1].trim();
      body = body.replace(gabMatch[0], '').trim();
    }

    const comMatch = body.match(/^[ \t]*(?:coment(?:ário|ario)|justificativa)\s*[:\-]\s*([\s\S]+)$/im);
    if (comMatch) {
      comentario = comMatch[1].trim();
      body = body.replace(comMatch[0], '').trim();
    }

    const split = splitExamQuestion(body);
    const tipo: QuestionType = split.alternatives.length >= 2 ? 'ME' : 'CE';

    return {
      id: uid(16),
      numero: num,
      materia: defaultSubject,
      enunciado: split.statement || body,
      alternativasText: alternativesToText(split.alternatives),
      gabarito,
      comentario,
      tipo,
    };
  });
}

interface FlexibleQuestionImporterProps {
  defaultAsSimulation?: boolean;
  defaultInputMode?: 'paste' | 'file';
  showTemplateSample?: boolean;
  onImported?: (result: { count: number; materia: string; simulado: boolean }) => void;
}

const SAMPLE_QUESTIONS_TEMPLATE = `# FORMATO 1 (Padrão): Blocos Numerados (Certo/Errado ou Múltipla Escolha)
Questão 1
A prática do racismo constitui crime inafiançável e imprescritível, sujeito à pena de reclusão, nos termos da lei.
Gabarito: Certo
Comentário: CF/88, Art. 5º, XLII - O racismo é crime inafiançável e imprescritível.

Questão 2
Em relação aos direitos e garantias fundamentais, assinale a opção correta:
[A] Ninguém será privado de direitos por motivo de crença religiosa em qualquer hipótese.
[B] A casa é asilo inviolável do indivíduo, salvo em caso de flagrante delito ou desastre.
[C] É livre a manifestação do pensamento, sendo permitido o anonimato.
[D] Homens e mulheres têm direitos e obrigações desiguais perante a lei.
Gabarito: B
Comentário: CF/88, Art. 5º, XI.

# FORMATO 2: Linha Única com Divisor Pipe (|)
# A soberania popular será exercida pelo voto direto e secreto. | C | CF/88, Art. 14.`;

export const FlexibleQuestionImporter: React.FC<FlexibleQuestionImporterProps> = ({
  defaultAsSimulation = false,
  defaultInputMode = 'paste',
  showTemplateSample = true,
  onImported,
}) => {
  const { disciplines, fixedSubjects, importParsedQuestions, toast } = useStudy();

  const availableDisciplines = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    const pushUnique = (raw?: string) => {
      const clean = visibleName(String(raw || ''));
      if (!clean) return;
      const key = normalizeSearch(clean);
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(clean);
    };
    disciplines.forEach(pushUnique);
    fixedSubjects.forEach(pushUnique);
    return merged.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [disciplines, fixedSubjects]);

  const [inputMode, setInputMode] = useState<'paste' | 'file'>(defaultInputMode);
  const [pastedText, setPastedText] = useState('');
  const [separateKey, setSeparateKey] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [subjectSelect, setSubjectSelect] = useState<string>(
    () => availableDisciplines[0] || '__NEW__',
  );
  const [customSubject, setCustomSubject] = useState('');
  const [asSimulation, setAsSimulation] = useState<boolean>(defaultAsSimulation);
  const [simTitle, setSimTitle] = useState('');

  // Preview / Review stage
  const [drafts, setDrafts] = useState<DraftQuestion[] | null>(null);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'issues'>('all');
  const [sourceFileLabel, setSourceFileLabel] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedSample, setCopiedSample] = useState(false);

  useEffect(() => {
    if (
      subjectSelect === '__NEW__' &&
      !customSubject.trim() &&
      availableDisciplines.length > 0
    ) {
      setSubjectSelect(availableDisciplines[0]);
    }
  }, [availableDisciplines, customSubject, subjectSelect]);

  const resolvedSubject = useMemo(() => {
    if (subjectSelect === '__FILENAME__') return '';
    if (subjectSelect === '__NEW__') return visibleName(customSubject);
    return visibleName(subjectSelect);
  }, [customSubject, subjectSelect]);

  const validatedDrafts = useMemo(() => {
    if (!drafts) return [];
    return drafts.map((d) => ({ draft: d, check: validateDraft(d) }));
  }, [drafts]);

  const validCount = useMemo(
    () => validatedDrafts.filter((item) => item.check.valid).length,
    [validatedDrafts],
  );
  const issueCount = validatedDrafts.length - validCount;

  const visibleDrafts = useMemo(() => {
    if (previewFilter === 'issues') {
      return validatedDrafts.filter((item) => !item.check.valid || item.check.warnings.length > 0);
    }
    return validatedDrafts;
  }, [previewFilter, validatedDrafts]);

  const handleGeneratePreview = async () => {
    if (subjectSelect === '__NEW__' && !resolvedSubject) {
      toast('Informe o nome da nova disciplina ou escolha uma existente.', true);
      return;
    }

    setIsParsing(true);
    try {
      if (inputMode === 'paste') {
        if (!pastedText.trim()) {
          toast('Cole o texto das questões na caixa antes de pré-visualizar.', true);
          return;
        }
        const fallbackSubject = resolvedSubject || 'Geral';
        const parsed = parseFlexibleQuestionsForPreview(pastedText, fallbackSubject, separateKey);
        if (!parsed.length) {
          toast(
            'Não foi possível detectar questões no texto colado. Verifique o formato ou use o modelo de exemplo.',
            true,
          );
          return;
        }
        setDrafts(parsed);
        setSourceFileLabel('');
        setPreviewFilter('all');
        if (asSimulation && !simTitle.trim()) {
          setSimTitle(`Simulado - ${fallbackSubject}`);
        }
      } else {
        if (!selectedFiles.length) {
          toast('Selecione ao menos um arquivo .txt ou .md.', true);
          return;
        }
        const combined: DraftQuestion[] = [];
        for (const file of selectedFiles) {
          const text = await file.text();
          const fileSubj = resolvedSubject || displayBaseName(file.name) || 'Geral';
          const items = parseFlexibleQuestionsForPreview(text, fileSubj, separateKey);
          items.forEach((item) => {
            combined.push({
              ...item,
              numero: combined.length + 1,
            });
          });
        }
        if (!combined.length) {
          toast(
            'Nenhuma questão reconhecida nos arquivos selecionados. Revise o texto ou cole diretamente.',
            true,
          );
          return;
        }
        const firstFile = selectedFiles[0];
        setDrafts(combined);
        setSourceFileLabel(selectedFiles.length === 1 ? firstFile.name : '');
        setPreviewFilter('all');
        if (asSimulation && !simTitle.trim()) {
          setSimTitle(displayBaseName(firstFile.name));
        }
      }
    } catch (err) {
      toast((err as Error).message || 'Erro ao analisar questões.', true);
    } finally {
      setIsParsing(false);
    }
  };

  const updateDraft = (id: string, patch: Partial<DraftQuestion>) => {
    setDrafts((prev) =>
      prev ? prev.map((item) => (item.id === id ? { ...item, ...patch } : item)) : prev,
    );
  };

  const removeDraft = (id: string) => {
    setDrafts((prev) =>
      prev
        ? prev
            .filter((item) => item.id !== id)
            .map((item, idx) => ({ ...item, numero: idx + 1 }))
        : prev,
    );
  };

  const addBlankDraft = () => {
    setDrafts((prev) => {
      const list = prev || [];
      return [
        ...list,
        {
          id: uid(16),
          numero: list.length + 1,
          materia: resolvedSubject || availableDisciplines[0] || 'Geral',
          enunciado: '',
          alternativasText: '',
          gabarito: 'C',
          comentario: '',
          tipo: 'CE',
        },
      ];
    });
  };

  const applySubjectToAllDrafts = () => {
    const target = resolvedSubject;
    if (!target) {
      toast('Selecione ou digite uma disciplina para aplicar ao lote.', true);
      return;
    }
    setDrafts((prev) => (prev ? prev.map((d) => ({ ...d, materia: target })) : prev));
    toast(`Disciplina "${target}" aplicada a todas as questões da pré-visualização.`);
  };

  const handleConfirmImport = async () => {
    if (!drafts || drafts.length === 0) return;

    const readyQuestions: Question[] = [];
    validatedDrafts.forEach(({ draft, check }) => {
      if (!check.valid) return;
      readyQuestions.push({
        id: draft.id || uid(20),
        numero: readyQuestions.length + 1,
        materia: draft.materia.trim() || resolvedSubject || 'Geral',
        enunciado: draft.enunciado.trim(),
        alternativas: check.parsedAlternatives,
        gabarito: check.normalizedAnswer,
        comentario: draft.comentario.trim(),
        tipo: draft.tipo,
      });
    });

    if (!readyQuestions.length) {
      toast(
        'Corrija os alertas antes de importar: nenhuma questão está válida no momento.',
        true,
      );
      setPreviewFilter('issues');
      return;
    }

    setIsSaving(true);
    try {
      const res = await importParsedQuestions(readyQuestions, {
        subject: resolvedSubject || readyQuestions[0].materia || 'Geral',
        asSimulation,
        title: asSimulation ? simTitle.trim() || undefined : undefined,
        sourceFileName: sourceFileLabel || undefined,
      });
      toast(
        res.simulado
          ? `Simulado salvo com ${res.count} questão(ões) em "${res.materia}".`
          : `${res.count} questão(ões) importada(s) diretamente em "${res.materia}".`,
      );
      setDrafts(null);
      setPastedText('');
      setSeparateKey('');
      setSelectedFiles([]);
      setSimTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onImported) onImported(res);
    } catch (err) {
      toast((err as Error).message || 'Falha ao confirmar importação.', true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopySample = async () => {
    try {
      await navigator.clipboard.writeText(SAMPLE_QUESTIONS_TEMPLATE);
      setCopiedSample(true);
      toast('Modelo de questões copiado para a área de transferência!');
      window.setTimeout(() => setCopiedSample(false), 2400);
    } catch {
      toast('Não foi possível copiar o modelo.', true);
    }
  };

  const handlePasteSampleIntoBox = () => {
    setInputMode('paste');
    setPastedText(SAMPLE_QUESTIONS_TEMPLATE);
    toast('Exemplo inserido na caixa de texto. Clique em "Pré-visualizar e revisar".');
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Seletor de modo: Colar texto vs Arquivo .txt */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex p-0.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)]">
          <button
            type="button"
            onClick={() => setInputMode('paste')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-bold transition-colors whitespace-nowrap ${
              inputMode === 'paste'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <ClipboardPaste className="w-3.5 h-3.5 shrink-0" />
            Colar questões direto
          </button>
          <button
            type="button"
            onClick={() => setInputMode('file')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-bold transition-colors whitespace-nowrap ${
              inputMode === 'file'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            <Upload className="w-3.5 h-3.5 shrink-0" />
            Enviar arquivo (.txt/.md)
          </button>
        </div>

        <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={asSimulation}
            onChange={(e) => setAsSimulation(e.target.checked)}
            className="accent-[var(--accent)] w-3.5 h-3.5"
          />
          Salvar como Simulado Fechado (Enviado)
        </label>
      </div>

      {/* Destino + título opcional do simulado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className={LABEL_CLS}>Disciplina de destino</label>
          <select
            aria-label="Disciplina de destino das questões"
            value={
              subjectSelect === '__NEW__' ||
              subjectSelect === '__FILENAME__' ||
              availableDisciplines.includes(subjectSelect)
                ? subjectSelect
                : '__NEW__'
            }
            onChange={(e) => {
              const val = e.target.value;
              setSubjectSelect(val);
              if (val !== '__NEW__') setCustomSubject('');
            }}
            className={INPUT_CLS}
          >
            {availableDisciplines.length > 0 && (
              <optgroup label="Disciplinas existentes / fixadas">
                {availableDisciplines.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Outras opções">
              <option value="__NEW__">+ Nova disciplina personalizada…</option>
              {inputMode === 'file' && (
                <option value="__FILENAME__">Usar nome de cada arquivo (.txt)</option>
              )}
            </optgroup>
          </select>
        </div>

        {subjectSelect === '__NEW__' ? (
          <div>
            <label className={LABEL_CLS}>Nome da nova disciplina</label>
            <input
              type="text"
              value={customSubject}
              onChange={(e) => setCustomSubject(e.target.value)}
              placeholder="Ex.: Direito Previdenciário"
              className={INPUT_CLS}
            />
          </div>
        ) : asSimulation ? (
          <div>
            <label className={LABEL_CLS}>Título do simulado (opcional)</label>
            <input
              type="text"
              value={simTitle}
              onChange={(e) => setSimTitle(e.target.value)}
              placeholder="Ex.: Simulado PF — Bloco Jurídico 01"
              className={INPUT_CLS}
            />
          </div>
        ) : (
          <div>
            <label className={LABEL_CLS}>Gabarito separado (opcional)</label>
            <input
              type="text"
              value={separateKey}
              onChange={(e) => setSeparateKey(e.target.value)}
              placeholder="Ex.: 1-C, 2-E, 3-B, 4-A..."
              className={INPUT_CLS}
            />
          </div>
        )}
      </div>

      {asSimulation && subjectSelect === '__NEW__' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className={LABEL_CLS}>Título do simulado (opcional)</label>
            <input
              type="text"
              value={simTitle}
              onChange={(e) => setSimTitle(e.target.value)}
              placeholder="Ex.: Simulado PF — Bloco Jurídico 01"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Gabarito separado (opcional)</label>
            <input
              type="text"
              value={separateKey}
              onChange={(e) => setSeparateKey(e.target.value)}
              placeholder="Ex.: 1-C, 2-E, 3-B, 4-A..."
              className={INPUT_CLS}
            />
          </div>
        </div>
      )}

      {asSimulation && subjectSelect !== '__NEW__' && (
        <div>
          <label className={LABEL_CLS}>Gabarito separado (opcional — se não estiver no texto)</label>
          <input
            type="text"
            value={separateKey}
            onChange={(e) => setSeparateKey(e.target.value)}
            placeholder="Ex.: 1-C, 2-E, 3-B, 4-A..."
            className={INPUT_CLS}
          />
        </div>
      )}

      {/* Entrada principal: Texto colado ou Arquivo */}
      {inputMode === 'paste' ? (
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--muted)]">
              Cole aqui as questões (numeradas, com pipe | ou prova completa)
            </label>
            {showTemplateSample && (
              <button
                type="button"
                onClick={handlePasteSampleIntoBox}
                className="text-[11px] font-bold text-[var(--accent)] hover:underline whitespace-nowrap"
              >
                Inserir exemplo
              </button>
            )}
          </div>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={6}
            placeholder={
              'Questão 1\nA casa é asilo inviolável do indivíduo...\nGabarito: C\nComentário: CF/88, Art. 5º, XI.\n\nOu cole questões numeradas e informe o gabarito acima (1-C, 2-E...).'
            }
            className={`${TEXTAREA_CLS} font-mono text-[11.5px] min-h-[120px]`}
          />
        </div>
      ) : (
        <div>
          <label className={LABEL_CLS}>Arquivo(s) .txt / .md</label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md"
            onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
            className={INPUT_CLS}
          />
          {selectedFiles.length > 0 && (
            <div className="mt-1.5 text-[11px] text-[var(--muted)] tabular-nums">
              {selectedFiles.length} arquivo(s) selecionado(s):{' '}
              <strong className="text-[var(--text)]">
                {selectedFiles.map((f) => f.name).join(', ')}
              </strong>
            </div>
          )}
        </div>
      )}

      {/* Ação de pré-visualização */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-[var(--muted)]">
          Você poderá revisar e corrigir qualquer questão fora do padrão antes de salvar.
        </span>
        <button
          type="button"
          onClick={() => void handleGeneratePreview()}
          disabled={isParsing}
          className="inline-flex items-center justify-center gap-1.5 h-[34px] px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap transition-colors"
        >
          <Eye className="w-3.5 h-3.5 shrink-0" />
          {isParsing ? 'Analisando…' : 'Pré-visualizar e revisar'}
        </button>
      </div>

      {/* Etapa de Pré-visualização e Correção Inline */}
      {drafts !== null && (
        <div className="mt-1 pt-3 border-t border-[var(--line-strong)] flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="m-0 font-display text-[13.5px] font-extrabold text-[var(--text)]">
                Pré-visualização antes da importação
              </h4>
              <div className="text-[11.5px] text-[var(--muted)] tabular-nums mt-0.5">
                <strong className="text-[var(--text)]">{drafts.length}</strong> detectada(s) ·{' '}
                <strong className="text-[var(--good)]">{validCount}</strong> pronta(s) ·{' '}
                <strong className={issueCount > 0 ? 'text-[var(--bad)]' : 'text-[var(--muted)]'}>
                  {issueCount}
                </strong>{' '}
                com alerta
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex p-0.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-soft)]">
                <button
                  type="button"
                  onClick={() => setPreviewFilter('all')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap ${
                    previewFilter === 'all'
                      ? 'bg-[var(--panel-raised)] text-[var(--text)]'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  Todas ({drafts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter('issues')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap ${
                    previewFilter === 'issues'
                      ? 'bg-[var(--panel-raised)] text-[var(--text)]'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  Com alerta ({issueCount})
                </button>
              </div>

              {resolvedSubject && (
                <button
                  type="button"
                  onClick={applySubjectToAllDrafts}
                  className="h-[28px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                  title="Aplicar a disciplina selecionada acima a todas as questões listadas"
                >
                  Aplicar “{resolvedSubject}” a todas
                </button>
              )}

              <button
                type="button"
                onClick={addBlankDraft}
                className="inline-flex items-center gap-1 h-[28px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
              >
                <Plus className="w-3 h-3" />
                Questão
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto flex flex-col gap-2.5 pr-1">
            {visibleDrafts.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-[var(--muted)] rounded-lg border border-dashed border-[var(--line)]">
                Nenhuma questão neste filtro.
              </div>
            ) : (
              visibleDrafts.map(({ draft, check }) => (
                <div
                  key={draft.id}
                  className={`rounded-xl border p-3 flex flex-col gap-2 ${
                    check.valid
                      ? 'border-[var(--line)] bg-[var(--panel-soft)]'
                      : 'border-[var(--bad)]/60 bg-[var(--bad)]/5'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-[var(--line)]/60">
                    <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                      <strong className="font-mono-num text-[var(--text)]">
                        #{String(draft.numero).padStart(2, '0')}
                      </strong>
                      <span className="text-[var(--subtle)]">·</span>
                      {check.valid ? (
                        <span className="inline-flex items-center gap-1 font-bold text-[var(--good)]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Pronta
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-bold text-[var(--bad)]">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {check.errors.join(' · ')}
                        </span>
                      )}
                      {check.valid && check.warnings.length > 0 && (
                        <span className="text-[var(--warning)] font-semibold">
                          · {check.warnings.join(' · ')}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeDraft(draft.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--bad)] hover:underline whitespace-nowrap"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remover
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-6">
                      <label className={LABEL_CLS}>Disciplina</label>
                      <input
                        type="text"
                        list="flex-importer-disciplines"
                        value={draft.materia}
                        onChange={(e) => updateDraft(draft.id, { materia: e.target.value })}
                        className={INPUT_CLS}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className={LABEL_CLS}>Tipo</label>
                      <select
                        value={draft.tipo}
                        onChange={(e) =>
                          updateDraft(draft.id, { tipo: e.target.value as QuestionType })
                        }
                        className={INPUT_CLS}
                      >
                        <option value="CE">Certo / Errado</option>
                        <option value="ME">Múltipla Escolha</option>
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <label className={LABEL_CLS}>Gabarito</label>
                      <input
                        type="text"
                        value={draft.gabarito}
                        onChange={(e) => updateDraft(draft.id, { gabarito: e.target.value })}
                        placeholder={draft.tipo === 'CE' ? 'C ou E' : 'A..E'}
                        className={`${INPUT_CLS} font-mono-num uppercase font-bold`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={LABEL_CLS}>Enunciado</label>
                    <textarea
                      value={draft.enunciado}
                      onChange={(e) => updateDraft(draft.id, { enunciado: e.target.value })}
                      rows={2}
                      className={TEXTAREA_CLS}
                    />
                  </div>

                  {draft.tipo === 'ME' && (
                    <div>
                      <label className={LABEL_CLS}>Alternativas (uma por linha: A) texto)</label>
                      <textarea
                        value={draft.alternativasText}
                        onChange={(e) =>
                          updateDraft(draft.id, { alternativasText: e.target.value })
                        }
                        rows={3}
                        placeholder={'A) ...\nB) ...\nC) ...\nD) ...'}
                        className={`${TEXTAREA_CLS} font-mono text-[11.5px]`}
                      />
                    </div>
                  )}

                  <div>
                    <label className={LABEL_CLS}>Comentário / Fundamento (opcional)</label>
                    <input
                      type="text"
                      value={draft.comentario}
                      onChange={(e) => updateDraft(draft.id, { comentario: e.target.value })}
                      placeholder="Artigo de lei, súmula ou justificativa..."
                      className={INPUT_CLS}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <datalist id="flex-importer-disciplines">
            {availableDisciplines.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--line)]">
            <button
              type="button"
              onClick={() => setDrafts(null)}
              className="h-[34px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--muted)] hover:text-[var(--text)] whitespace-nowrap"
            >
              Fechar pré-visualização
            </button>
            <button
              type="button"
              disabled={isSaving || validCount === 0}
              onClick={() => void handleConfirmImport()}
              className="inline-flex items-center gap-1.5 h-[34px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-50 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {isSaving
                ? 'Salvando…'
                : asSimulation
                  ? `Confirmar Simulado (${validCount} questão(ões))`
                  : `Confirmar Importação (${validCount} questão(ões))`}
            </button>
          </div>
        </div>
      )}

      {/* Modelo de formato compacto */}
      {showTemplateSample && drafts === null && (
        <div className="pt-2.5 border-t border-[var(--line)]/60">
          <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
            <span className="text-[11px] font-bold text-[var(--text)] flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
              Modelo / Exemplo de Formato (.txt ou texto colado):
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleCopySample()}
                className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[var(--text)] hover:text-[var(--accent)] bg-[var(--panel-raised)] border border-[var(--line-strong)] px-2 py-0.5 rounded transition-colors whitespace-nowrap"
              >
                {copiedSample ? (
                  <Check className="w-3 h-3 text-[var(--good)]" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                {copiedSample ? 'Copiado!' : 'Copiar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([SAMPLE_QUESTIONS_TEMPLATE], {
                    type: 'text/plain;charset=utf-8',
                  });
                  triggerBlobDownload(blob, 'modelo_exemplo_questoes.txt');
                  toast('Modelo de arquivo .txt de questões baixado!');
                }}
                className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[var(--accent)] hover:underline bg-[var(--panel-raised)] border border-[var(--line-strong)] px-2 py-0.5 rounded transition-colors whitespace-nowrap"
              >
                <Download className="w-3 h-3" />
                Baixar .txt
              </button>
            </div>
          </div>
          <div className="h-[104px] overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2 font-mono text-[10.5px] leading-snug text-[var(--muted)] whitespace-pre-wrap select-all">
            {SAMPLE_QUESTIONS_TEMPLATE}
          </div>
        </div>
      )}
    </div>
  );
};
