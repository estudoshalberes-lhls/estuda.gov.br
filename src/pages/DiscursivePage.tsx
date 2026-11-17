import React, { useState } from 'react';
import { Download, Eye, FileUp, MessageSquarePlus, Sparkles } from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { reviewEssayWithAi } from '../lib/aiApi';
import { getFileBlob, triggerBlobDownload } from '../lib/fileStorage';
import { readStudyBlobText } from '../lib/pdfExtract';
import { visibleName } from '../lib/parsers';
import { EssayRecord } from '../types/study';
import { FilePreview } from '../components/ui/FilePreview';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';

interface PreviewTarget {
  blobKey: string;
  filename: string;
  mimeType?: string;
  title: string;
}

export const DiscursivePage: React.FC = () => {
  const { db, moduleVisibility, submitEssay, updateEssayCorrection, toast } = useStudy();
  const hideUpload = moduleVisibility('Discursiva').hide_upload;

  const [titulo, setTitulo] = useState('');
  const [essayFile, setEssayFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [correctedFile, setCorrectedFile] = useState<File | null>(null);
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [aiReviewingId, setAiReviewingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!essayFile) {
      toast('Anexe o arquivo da redação (.txt, .pdf ou .docx).', true);
      return;
    }
    setSubmitting(true);
    try {
      await submitEssay(titulo, essayFile);
      setTitulo('');
      setEssayFile(null);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setSubmitting(false);
    }
  };

  const openCorrectionEditor = (essay: EssayRecord) => {
    if (editingId === essay.id) {
      setEditingId(null);
      return;
    }
    setEditingId(essay.id);
    setFeedbackDraft(essay.feedback || '');
    setCorrectedFile(null);
  };

  const handleSaveCorrection = async (essayId: string) => {
    setSavingCorrection(true);
    try {
      await updateEssayCorrection(essayId, feedbackDraft, correctedFile);
      setEditingId(null);
      setCorrectedFile(null);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setSavingCorrection(false);
    }
  };

  const handleDownload = async (blobKey: string, filename: string) => {
    const blob = await getFileBlob(blobKey);
    if (!blob) {
      toast('Arquivo não encontrado no armazenamento local.', true);
      return;
    }
    triggerBlobDownload(blob, filename);
  };

  const handleAiReviewEssay = async (essay: EssayRecord) => {
    setAiReviewingId(essay.id);
    try {
      const blob = await getFileBlob(essay.original_blobKey);
      if (!blob) {
        toast('Arquivo original da redação não encontrado localmente.', true);
        return;
      }
      const lower = essay.original_arquivo.toLowerCase();
      if (lower.endsWith('.docx')) {
        toast('Para correção automática com IA, envie a redação em .txt ou .pdf selecionável.', true);
        return;
      }
      const essayText = await readStudyBlobText(blob, essay.original_arquivo, essay.original_mime);
      const res = await reviewEssayWithAi({
        title: visibleName(essay.titulo),
        essayText,
      });
      const sections: string[] = [];
      if (res.scoreEstimate) sections.push(`Nota estimada: ${res.scoreEstimate}`);
      if (res.feedback) sections.push(res.feedback);
      if (res.strengths?.length) {
        sections.push(`Pontos fortes:\n• ${res.strengths.join('\n• ')}`);
      }
      if (res.improvements?.length) {
        sections.push(`Pontos a melhorar:\n• ${res.improvements.join('\n• ')}`);
      }
      setFeedbackDraft(sections.join('\n\n'));
      toast('Parecer preliminar gerado por IA. Revise antes de salvar.');
    } catch (err) {
      toast((err as Error).message || 'Falha ao corrigir redação com IA.', true);
    } finally {
      setAiReviewingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="PROTOCOLO DE REDAÇÃO · DISCURSIVA"
        title="Redações e pareceres de correção"
        description="Protocole suas propostas respondidas (.txt, .pdf ou .docx), anexe o parecer corrigido e registre apontamentos."
      />

      {!hideUpload && (
        <Panel title="Nova redação" className="mb-4">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label
                htmlFor="essay-title"
                className="block text-[11px] font-bold text-[var(--muted)] mb-1.5"
              >
                Título / Tema
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

            <div>
              <label
                htmlFor="essay-file"
                className="block text-[11px] font-bold text-[var(--muted)] mb-1.5"
              >
                Arquivo (.txt, .pdf, .docx)
              </label>
              <input
                id="essay-file"
                type="file"
                accept=".txt,.pdf,.docx"
                onChange={(e) => setEssayFile(e.target.files?.[0] || null)}
                className="ce-input file:mr-3 file:rounded-md file:border-0 file:bg-[var(--panel-raised)] file:px-2.5 file:py-1 file:text-[11px] file:font-bold file:text-[var(--text)]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-1.5 h-[38px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap"
            >
              <FileUp className="w-3.5 h-3.5" />
              {submitting ? 'Enviando…' : 'Enviar redação'}
            </button>
          </form>
        </Panel>
      )}

      {preview && (
        <FilePreview
          blobKey={preview.blobKey}
          filename={preview.filename}
          mimeType={preview.mimeType}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      )}

      <div className="mt-4 flex flex-col gap-3">
        {db.essays.length ? (
          db.essays.map((essay) => {
            const isCorrected = Boolean(essay.feedback.trim() || essay.corrigido_arquivo);
            const isEditing = editingId === essay.id;

            return (
              <Panel key={essay.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="m-0 font-display text-[15px] font-bold text-[var(--text)]">
                        {visibleName(essay.titulo)}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[10.5px] font-bold uppercase tracking-wider ${
                          isCorrected
                            ? 'border-[var(--good)]/50 bg-[var(--good)]/10 text-[var(--good)]'
                            : 'border-[var(--line-strong)] bg-[var(--panel-soft)] text-[var(--muted)]'
                        }`}
                      >
                        {isCorrected ? 'Corrigida' : 'Enviada'}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--muted)]">
                      Enviada em {essay.data} · Arquivo: {visibleName(essay.original_arquivo)}
                      {essay.corrigida_em ? ` · Atualizada em ${essay.corrigida_em.slice(0, 10)}` : ''}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setPreview({
                          blobKey: essay.original_blobKey,
                          filename: essay.original_arquivo,
                          mimeType: essay.original_mime,
                          title: `Original — ${visibleName(essay.titulo)}`,
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Visualizar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownload(essay.original_blobKey, essay.original_arquivo)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Original
                    </button>
                    {essay.corrigido_blobKey && essay.corrigido_arquivo && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setPreview({
                              blobKey: essay.corrigido_blobKey!,
                              filename: essay.corrigido_arquivo,
                              mimeType: essay.corrigido_mime,
                              title: `Corrigida — ${visibleName(essay.titulo)}`,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--good)] hover:border-[var(--good)] whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ver correção
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDownload(essay.corrigido_blobKey!, essay.corrigido_arquivo)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--good)] hover:border-[var(--good)] whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Corrigida
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => openCorrectionEditor(essay)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[11.5px] font-bold text-[var(--text)] hover:bg-[var(--accent)] hover:text-white whitespace-nowrap"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      {isEditing ? 'Fechar editor' : 'Correção / feedback'}
                    </button>
                  </div>
                </div>

                {essay.feedback.trim() && (
                  <div className="ce-notice mt-3 text-[var(--text)]">
                    <strong className="block text-[11.5px] uppercase tracking-wider text-[var(--muted)] mb-1">
                      Feedback da correção
                    </strong>
                    <span className="whitespace-pre-wrap">{essay.feedback}</span>
                  </div>
                )}

                {isEditing && (
                  <div className="mt-3 pt-3 border-t border-[var(--line)] grid grid-cols-1 gap-3">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <label className="block text-[11px] font-bold text-[var(--muted)]">
                          Comentários e avaliação
                        </label>
                        <button
                          type="button"
                          disabled={aiReviewingId === essay.id}
                          onClick={() => void handleAiReviewEssay(essay)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-55 whitespace-nowrap"
                        >
                          <Sparkles className={`w-3 h-3 ${aiReviewingId === essay.id ? 'animate-pulse' : ''}`} />
                          {aiReviewingId === essay.id ? 'Analisando redação…' : 'Corrigir com IA'}
                        </button>
                      </div>
                      <textarea
                        value={feedbackDraft}
                        onChange={(e) => setFeedbackDraft(e.target.value)}
                        rows={4}
                        placeholder="Estrutura, fundamentação jurídica, desvios gramaticais e nota..."
                        className="ce-textarea"
                      />
                    </div>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="flex-1 min-w-[220px]">
                        <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                          Anexar arquivo corrigido (opcional · .txt, .pdf, .docx)
                        </label>
                        <input
                          type="file"
                          accept=".txt,.pdf,.docx"
                          onChange={(e) => setCorrectedFile(e.target.files?.[0] || null)}
                          className="ce-input"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={savingCorrection}
                        onClick={() => void handleSaveCorrection(essay.id)}
                        className="h-[38px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap"
                      >
                        {savingCorrection ? 'Salvando…' : 'Salvar correção'}
                      </button>
                    </div>
                  </div>
                )}
              </Panel>
            );
          })
        ) : (
          <EmptyState message="Nenhuma redação enviada ainda." />
        )}
      </div>
    </div>
  );
};
