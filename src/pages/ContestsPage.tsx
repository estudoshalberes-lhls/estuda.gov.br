import React, { useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  FileUp,
  FolderOpen,
  ListChecks,
  MapPin,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import {
  buildContestTxtFileName,
  buildEditalTxtFileName,
  parseEditalTopicsText,
  paymentDateValue,
  uid,
} from '../lib/parsers';
import { readStudyTextFile } from '../lib/pdfExtract';
import { ContestEditalPoint } from '../types/study';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';

export const ContestsPage: React.FC = () => {
  const {
    db,
    setActivePage,
    addContest,
    toggleContestPayment,
    deleteContest,
    openContestEdital,
    syncContestsAndEditaisTxtToFolder,
    importContestsOrEditalTxtFile,
    toast,
  } = useStudy();

  const [concurso, setConcurso] = useState('');
  const [dataAbertura, setDataAbertura] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [statusPagamento, setStatusPagamento] = useState<'Pago' | 'Não Pago'>('Não Pago');
  const [localProva, setLocalProva] = useState('');
  const [observacoes, setObservacoes] = useState('');

  // Optional Edital attachment during contest registration
  const [showEditalForm, setShowEditalForm] = useState(false);
  const [editalDefaultSubject, setEditalDefaultSubject] = useState('');
  const [editalText, setEditalText] = useState('');
  const [editalFileName, setEditalFileName] = useState('');
  const [loadingEditalFile, setLoadingEditalFile] = useState(false);
  const [openEditalAfterCreate, setOpenEditalAfterCreate] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importContestTxtRef = useRef<HTMLInputElement | null>(null);
  const [showTxtFolderPanel, setShowTxtFolderPanel] = useState(true);

  const [filterPayment, setFilterPayment] = useState<'all' | 'Pago' | 'Não Pago' | 'Vencido'>('all');
  const [searchContest, setSearchContest] = useState('');

  const parsedPreviewTopics = useMemo(
    () => parseEditalTopicsText(editalText, editalDefaultSubject.trim() || 'Geral'),
    [editalText, editalDefaultSubject],
  );

  const previewSubjectCount = useMemo(
    () => new Set(parsedPreviewTopics.map((t) => t.materia)).size,
    [parsedPreviewTopics],
  );

  const handleEditalFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingEditalFile(true);
    try {
      const extracted = await readStudyTextFile(file);
      setEditalText(extracted);
      setEditalFileName(file.name);
      setShowEditalForm(true);
      const count = parseEditalTopicsText(extracted, editalDefaultSubject.trim() || 'Geral').length;
      toast(`Arquivo "${file.name}" carregado (${count} ponto(s) identificado(s)).`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível ler o arquivo de edital.', true);
    } finally {
      setLoadingEditalFile(false);
      e.target.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!concurso.trim()) {
      toast('Informe o nome do concurso.', true);
      return;
    }

    const editalPoints: ContestEditalPoint[] = parsedPreviewTopics.map((item) => ({
      id: uid(10),
      materia: item.materia,
      titulo: item.titulo,
      estudado: false,
    }));

    const created = addContest({
      concurso: concurso.trim(),
      data_abertura: dataAbertura.trim(),
      data_pagamento: dataPagamento.trim(),
      status_pagamento: statusPagamento,
      local_prova: localProva.trim(),
      observacoes: observacoes.trim(),
      edital_arquivo: editalFileName || undefined,
      edital_pontos: editalPoints,
    });

    setConcurso('');
    setDataAbertura('');
    setDataPagamento('');
    setStatusPagamento('Não Pago');
    setLocalProva('');
    setObservacoes('');
    setEditalDefaultSubject('');
    setEditalText('');
    setEditalFileName('');
    setShowEditalForm(false);

    if (editalPoints.length > 0 && openEditalAfterCreate) {
      openContestEdital(created.id);
    }
  };

  const totalCount = db.contests.length;
  const paidCount = db.contests.filter((c) => c.status_pagamento === 'Pago').length;
  const pendingCount = totalCount - paidCount;
  const withEditalCount = db.contests.filter((c) => (c.edital_pontos?.length || 0) > 0).length;
  const todayMidnight = new Date(new Date().setHours(0, 0, 0, 0)).getTime();

  const nextExamCountdown = useMemo(() => {
    const upcoming = db.contests
      .map((c) => ({ contest: c, examTs: paymentDateValue(c.data_abertura) }))
      .filter((item): item is { contest: (typeof db.contests)[number]; examTs: number } =>
        item.examTs !== null && item.examTs >= todayMidnight,
      )
      .sort((a, b) => a.examTs - b.examTs);

    const first = upcoming[0];
    if (!first) return null;

    const daysLeft = Math.max(0, Math.round((first.examTs - todayMidnight) / 86400000));
    const pts = first.contest.edital_pontos || [];
    const totalTopics = pts.length;
    const remainingTopics = pts.filter((p) => !p.estudado).length;
    const topicsPerDay =
      remainingTopics > 0 ? Math.ceil(remainingTopics / Math.max(1, daysLeft)) : 0;

    return {
      contest: first.contest,
      daysLeft,
      totalTopics,
      remainingTopics,
      topicsPerDay,
    };
  }, [db.contests, todayMidnight]);

  const filteredContests = useMemo(() => {
    return db.contests.filter((c) => {
      const isPaid = c.status_pagamento === 'Pago';
      const payTs = paymentDateValue(c.data_pagamento);
      const isOverdue = !isPaid && payTs !== null && payTs < todayMidnight;

      if (filterPayment === 'Pago' && !isPaid) return false;
      if (filterPayment === 'Não Pago' && isPaid) return false;
      if (filterPayment === 'Vencido' && !isOverdue) return false;

      if (searchContest.trim()) {
        const term = searchContest.toLowerCase();
        const hay = `${c.concurso} ${c.local_prova} ${c.observacoes} ${c.data_abertura} ${c.data_pagamento}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [db.contests, filterPayment, searchContest, todayMidnight]);

  return (
    <div>
      <PageHeader
        eyebrow="PROTOCOLO DE INSCRIÇÕES & GRUS"
        title="Controle de inscrições, boletos e locais de prova"
        description="Seus concursos, guias de recolhimento (GRUs), datas, locais de prova e editais são salvos automaticamente em arquivos .txt organizados nas pastas Datas e Locais e Editais."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importContestTxtRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  await importContestsOrEditalTxtFile(file);
                } catch (err: any) {
                  toast(err?.message || 'Não foi possível importar o arquivo .txt.', true);
                }
              }}
            />
            <button
              type="button"
              onClick={() => void syncContestsAndEditaisTxtToFolder({ silent: false })}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar na pasta (.txt)
            </button>
            <button
              type="button"
              onClick={() =>
                void syncContestsAndEditaisTxtToFolder({ downloadMaster: true, silent: false })
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
              Baixar Controle Geral (.txt)
            </button>
            <button
              type="button"
              onClick={() => importContestTxtRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
            >
              <FileUp className="w-3.5 h-3.5 text-[var(--accent)]" />
              Importar .txt
            </button>
            <button
              type="button"
              onClick={() => setActivePage('Editais')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
            >
              <ListChecks className="w-4 h-4 text-[var(--accent)]" />
              Abrir guia Editais
            </button>
          </div>
        }
      />

      <Panel className="mb-4 p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[var(--panel-soft)] border-b border-[var(--line)]">
          <button
            type="button"
            onClick={() => setShowTxtFolderPanel((v) => !v)}
            className="flex items-center gap-2 text-left min-w-0"
          >
            <FolderOpen className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <span className="text-[12.5px] font-extrabold text-[var(--text)]">
              Pasta Datas e Locais & Editais (.txt de Inscrições, Boletos, Locais e Editais)
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-mono-num font-bold text-[var(--accent)]">
              {db.contests.length} concurso(s)
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[var(--muted)] transition-transform ${
                showTxtFolderPanel ? 'rotate-180' : ''
              }`}
            />
          </button>
          <span className="text-[11px] font-mono-num text-[var(--muted)]">
            Pastas: Datas e Locais / Editais
          </span>
        </div>

        {showTxtFolderPanel && (
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {db.contests.map((c) => {
              const regFile = buildContestTxtFileName(c);
              const editalFile = buildEditalTxtFileName(c);
              const ptsCount = c.edital_pontos?.length || 0;
              return (
                <div
                  key={`txt-folder-${c.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                      <strong className="text-[12px] font-bold text-[var(--text)] truncate">
                        {c.concurso}
                      </strong>
                    </div>
                    <div className="text-[10.5px] text-[var(--muted)] font-mono-num truncate mt-0.5">
                      {regFile} {ptsCount > 0 ? `· ${editalFile}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        void syncContestsAndEditaisTxtToFolder({
                          contestId: c.id,
                          downloadContestId: c.id,
                          silent: false,
                        })
                      }
                      title="Baixar arquivo .txt de inscrição, boleto e local de prova"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)]"
                    >
                      <Download className="w-3 h-3 text-[var(--accent)]" />
                      Datas/Local .txt
                    </button>
                    {ptsCount > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          void syncContestsAndEditaisTxtToFolder({
                            contestId: c.id,
                            downloadEditalContestId: c.id,
                            silent: false,
                          })
                        }
                        title="Baixar arquivo .txt do edital deste concurso"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)]"
                      >
                        <Download className="w-3 h-3 text-[var(--accent)]" />
                        Edital .txt
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {nextExamCountdown && (
        <Panel className="mb-4 border-l-4 border-l-[var(--accent)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="px-3.5 py-2 rounded-lg border border-[var(--accent)]/35 bg-[var(--accent-soft)] text-center shrink-0">
                <div className="font-mono-num text-[20px] font-extrabold leading-none text-[var(--accent)]">
                  {nextExamCountdown.daysLeft === 0 ? 'HOJE' : `D-${nextExamCountdown.daysLeft}`}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mt-1">
                  {nextExamCountdown.daysLeft === 0
                    ? 'Dia da prova'
                    : nextExamCountdown.daysLeft === 1
                      ? 'Falta 1 dia'
                      : `Faltam ${nextExamCountdown.daysLeft} dias`}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[var(--accent)]">
                  Contagem Regressiva Oficial · Prova em {nextExamCountdown.contest.data_abertura}
                </div>
                <strong className="block text-[14.5px] font-extrabold text-[var(--text)] truncate">
                  {nextExamCountdown.contest.concurso}
                </strong>
                <div className="text-[12px] text-[var(--muted)] mt-0.5">
                  {nextExamCountdown.totalTopics > 0
                    ? nextExamCountdown.remainingTopics > 0
                      ? `Restam ${nextExamCountdown.remainingTopics} de ${nextExamCountdown.totalTopics} ponto(s) no edital — ritmo sugerido: ${nextExamCountdown.topicsPerDay} ponto(s) por dia.`
                      : `Edital 100% cumprido (${nextExamCountdown.totalTopics}/${nextExamCountdown.totalTopics} pontos)!`
                    : 'Anexe ou cadastre os pontos no Diário de Editais para acompanhar o ritmo diário.'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => openContestEdital(nextExamCountdown.contest.id)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ListChecks className="w-3.5 h-3.5" />
              Ir para Diário de Editais
            </button>
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 mb-4">
        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Inscrições cadastradas</div>
          <div className="font-mono-num text-[26px] font-extrabold text-[var(--text)] mt-1">
            {totalCount}
          </div>
        </article>
        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Pagas</div>
          <div className="font-mono-num text-[26px] font-extrabold text-[var(--good)] mt-1">
            {paidCount}
          </div>
        </article>
        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Pendentes</div>
          <div className="font-mono-num text-[26px] font-extrabold text-[var(--warning)] mt-1">
            {pendingCount}
          </div>
        </article>
        <article className="ce-panel p-4">
          <div className="text-[11px] font-semibold text-[var(--muted)]">Com edital associado</div>
          <div className="font-mono-num text-[26px] font-extrabold text-[var(--accent)] mt-1">
            {withEditalCount}
          </div>
        </article>
      </div>

      <Panel title="Novo concurso / inscrição" className="mb-4">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
              Concurso / Órgão e Cargo
            </label>
            <input
              type="text"
              value={concurso}
              onChange={(e) => setConcurso(e.target.value)}
              placeholder="Ex.: TRF 1ª Região - Analista Judiciário"
              className="ce-input"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
              Status do pagamento
            </label>
            <select
              value={statusPagamento}
              onChange={(e) => setStatusPagamento(e.target.value as 'Pago' | 'Não Pago')}
              className="ce-select"
            >
              <option value="Não Pago">Não Pago</option>
              <option value="Pago">Pago</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
              Data da prova / abertura
            </label>
            <input
              type="text"
              value={dataAbertura}
              onChange={(e) => setDataAbertura(e.target.value)}
              placeholder="Ex.: 15/12/2026"
              className="ce-input"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
              Vencimento do boleto
            </label>
            <input
              type="text"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
              placeholder="Ex.: 28/11/2026"
              className="ce-input"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
              Local de prova
            </label>
            <input
              type="text"
              value={localProva}
              onChange={(e) => setLocalProva(e.target.value)}
              placeholder="Cidade, escola ou bairro..."
              className="ce-input"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
              Observações (opcional)
            </label>
            <input
              type="text"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Número de inscrição, turno, sala..."
              className="ce-input"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowEditalForm((prev) => !prev)}
                className="inline-flex items-center gap-2 text-[12.5px] font-bold text-[var(--text)] hover:text-[var(--accent)]"
              >
                <ListChecks className="w-4 h-4 text-[var(--accent)]" />
                <span>Adicionar edital do concurso (opcional)</span>
                {showEditalForm ? (
                  <ChevronUp className="w-4 h-4 text-[var(--muted)]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[var(--muted)]" />
                )}
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {parsedPreviewTopics.length > 0 && (
                  <span className="px-2 py-0.5 rounded-md border border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[11px] font-bold text-[var(--accent)]">
                    {parsedPreviewTopics.length} ponto(s) · {previewSubjectCount} matéria(s)
                  </span>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.pdf"
                  onChange={handleEditalFilePick}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loadingEditalFile}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-60"
                >
                  <FileUp className="w-3.5 h-3.5 text-[var(--accent)]" />
                  {loadingEditalFile ? 'Lendo arquivo...' : 'Importar .txt / .pdf'}
                </button>
              </div>
            </div>

            {showEditalForm && (
              <div className="mt-3 pt-3 border-t border-[var(--line)]/70 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                      Matéria padrão (quando não especificada no texto)
                    </label>
                    <input
                      type="text"
                      value={editalDefaultSubject}
                      onChange={(e) => setEditalDefaultSubject(e.target.value)}
                      placeholder="Ex.: Geral ou Direito Constitucional"
                      className="ce-input"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="inline-flex items-center gap-2 text-[12px] font-semibold text-[var(--text)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={openEditalAfterCreate}
                        onChange={(e) => setOpenEditalAfterCreate(e.target.checked)}
                        className="rounded border-[var(--line-strong)] accent-[var(--accent)]"
                      />
                      Abrir a guia Editais após cadastrar
                    </label>
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <label className="block text-[11px] font-bold text-[var(--muted)]">
                      Pontos / tópicos do edital {editalFileName ? `(${editalFileName})` : ''}
                    </label>
                    {editalText && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditalText('');
                          setEditalFileName('');
                        }}
                        className="text-[11px] font-semibold text-[var(--bad)] hover:underline"
                      >
                        Limpar texto do edital
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={5}
                    value={editalText}
                    onChange={(e) => setEditalText(e.target.value)}
                    placeholder={`Cole os pontos do edital (1 ponto por linha). Exemplos:\nDireito Constitucional:\n1. Princípios fundamentais\n2. Direitos e garantias individuais\nLíngua Portuguesa | Interpretação de textos e crase`}
                    className="ce-input min-h-[115px] py-2 font-mono text-[12px]"
                  />
                  <p className="mt-1 mb-0 text-[11px] text-[var(--muted)]">
                    Dica: use cabeçalhos como <code className="text-[var(--text)]">DIREITO PENAL:</code> ou{' '}
                    <code className="text-[var(--text)]">Matéria | Tópico</code> para agrupar automaticamente na guia{' '}
                    <strong className="text-[var(--text)]">Editais</strong>.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 h-[38px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Cadastrar concurso
            </button>
          </div>
        </form>
      </Panel>

      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <select
          value={filterPayment}
          onChange={(e) => setFilterPayment(e.target.value as 'all' | 'Pago' | 'Não Pago' | 'Vencido')}
          className="ce-select w-auto min-w-[170px]"
          aria-label="Filtrar por status de pagamento"
        >
          <option value="all">Todos os status ({totalCount})</option>
          <option value="Não Pago">Boletos pendentes ({pendingCount})</option>
          <option value="Pago">Boletos pagos ({paidCount})</option>
          <option value="Vencido">Boletos vencidos</option>
        </select>

        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchContest}
            onChange={(e) => setSearchContest(e.target.value)}
            placeholder="Buscar por concurso, cargo, cidade ou local de prova..."
            className="ce-input"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {filteredContests.length ? (
          filteredContests.map((c) => {
            const isPaid = c.status_pagamento === 'Pago';
            const payTs = paymentDateValue(c.data_pagamento);
            const isOverdue = !isPaid && payTs !== null && payTs < todayMidnight;
            const editalPoints = c.edital_pontos || [];
            const editalTotal = editalPoints.length;
            const editalDone = editalPoints.filter((p) => p.estudado).length;
            const editalPct = editalTotal > 0 ? Math.round((editalDone / editalTotal) * 100) : 0;

            return (
              <Panel key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="m-0 font-display text-[15px] font-bold text-[var(--text)]">
                        {c.concurso}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[10.5px] font-bold ${
                          isPaid
                            ? 'border-[var(--good)]/50 bg-[var(--good)]/10 text-[var(--good)]'
                            : isOverdue
                              ? 'border-[var(--bad)]/50 bg-[var(--bad)]/10 text-[var(--bad)]'
                              : 'border-[var(--warning)]/50 bg-[var(--warning)]/10 text-[var(--warning)]'
                        }`}
                      >
                        {isPaid ? 'Pago' : isOverdue ? 'Boleto vencido' : 'Não Pago'}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--muted)]">
                      {c.data_abertura && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[var(--accent)]" />
                          Abertura / Prova: <strong className="text-[var(--text)]">{c.data_abertura}</strong>
                        </span>
                      )}
                      {c.data_pagamento && (
                        <span>
                          Vencimento: <strong className="text-[var(--text)]">{c.data_pagamento}</strong>
                        </span>
                      )}
                      {c.local_prova && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[var(--accent)]" />
                          {c.local_prova}
                        </span>
                      )}
                    </div>

                    {c.observacoes && (
                      <p className="mt-1.5 mb-0 text-[12.5px] text-[var(--muted)]">
                        {c.observacoes}
                      </p>
                    )}

                    <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                      {editalTotal > 0 ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text)]">
                            <ListChecks className="w-3.5 h-3.5 text-[var(--accent)]" />
                            Edital: <strong className="font-mono-num">{editalDone}/{editalTotal}</strong> estudado(s) ({editalPct}%)
                          </span>
                          <div className="w-28 h-1.5 rounded-full bg-[var(--panel-soft)] border border-[var(--line)] overflow-hidden">
                            <div
                              className="h-full bg-[var(--accent)] transition-all"
                              style={{ width: `${editalPct}%` }}
                            />
                          </div>
                        </>
                      ) : (
                        <span className="text-[11.5px] text-[var(--muted)]">
                          Nenhum edital associado ainda.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openContestEdital(c.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)]/60 bg-[var(--accent)]/12 text-[12px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors whitespace-nowrap"
                    >
                      <ListChecks className="w-3.5 h-3.5" />
                      {editalTotal > 0 ? 'Abrir Edital' : 'Adicionar Edital'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void syncContestsAndEditaisTxtToFolder({
                          contestId: c.id,
                          downloadContestId: c.id,
                          silent: false,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                      Salvar .txt
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleContestPayment(c.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--good)]" />
                      {isPaid ? 'Marcar Não Pago' : 'Marcar Pago'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteContest(c.id)}
                      aria-label={`Excluir ${c.concurso}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir
                    </button>
                  </div>
                </div>
              </Panel>
            );
          })
        ) : (
          <EmptyState message="Nenhum concurso cadastrado ainda." />
        )}
      </div>
    </div>
  );
};
