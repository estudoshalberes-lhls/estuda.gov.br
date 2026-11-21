import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  Download,
  Eye,
  FileUp,
  FolderPlus,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { getFileBlob, triggerBlobDownload } from '../lib/fileStorage';
import { formatUploadSize, visibleName } from '../lib/parsers';
import { clearFieldDraft, readFieldDraft, writeFieldDraft } from '../lib/draftStorage';
import { ProofFileRecord } from '../types/study';
import { FilePreview } from '../components/ui/FilePreview';
import { EmptyState, PageHeader, Panel } from '../components/ui/PageHeader';

export const ProofsPage: React.FC = () => {
  const {
    db,
    moduleVisibility,
    requestConfirm,
    createProofBank,
    uploadProofOnly,
    uploadProofWithAnswer,
    replaceProofPdf,
    deleteProofFile,
    updateProofObservations,
    addOrUpdateProofCorrection,
    deleteProofCorrection,
    toast,
  } = useStudy();

  const hideUpload = moduleVisibility('Provas').hide_upload;

  const [newBank, setNewBank] = useState('');
  const [selectedBank, setSelectedBank] = useState<string>(db.proofBanks[0] || 'Geral');
  const [filterBank, setFilterBank] = useState<string>('Todas');
  const [filterKind, setFilterKind] = useState<'all' | 'provas' | 'provas-com-gabarito'>('all');

  // Upload form
  const [uploadKind, setUploadKind] = useState<'provas' | 'provas-com-gabarito'>('provas-com-gabarito');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [uploadObs, setUploadObs] = useState('');
  const [uploading, setUploading] = useState(false);

  const proofInputRef = useRef<HTMLInputElement | null>(null);
  const answerInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  // Per-proof observations draft & correction forms
  const [obsDrafts, setObsDrafts] = useState<Record<string, string>>({});
  const obsDraftsRef = useRef(obsDrafts);
  obsDraftsRef.current = obsDrafts;
  const proofFilesRef = useRef(db.proofFiles);
  proofFilesRef.current = db.proofFiles;
  const [corrForms, setCorrForms] = useState<
    Record<string, { questao: string; observacoes: string; editId?: string }>
  >({});
  const [previewProof, setPreviewProof] = useState<ProofFileRecord | null>(null);

  const flushObsDrafts = useCallback(() => {
    const drafts = obsDraftsRef.current;
    const files = proofFilesRef.current;
    const cleared: string[] = [];
    Object.entries(drafts).forEach(([proofId, value]) => {
      const target = files.find((p) => p.id === proofId);
      if (target && (target.observacoes || '').trim() !== value.trim()) {
        updateProofObservations(proofId, value, true);
      }
      clearFieldDraft(`proof_obs_${proofId}`);
      cleared.push(proofId);
    });
    if (cleared.length > 0) {
      setObsDrafts((prev) => {
        const next = { ...prev };
        cleared.forEach((id) => {
          delete next[id];
        });
        return next;
      });
    }
  }, [updateProofObservations]);

  useEffect(() => {
    if (Object.keys(obsDrafts).length === 0) return;
    const timer = window.setTimeout(() => flushObsDrafts(), 1000);
    return () => window.clearTimeout(timer);
  }, [flushObsDrafts, obsDrafts]);

  useEffect(() => {
    const handleFlush = () => flushObsDrafts();
    window.addEventListener('central-estudos:flush-drafts', handleFlush);
    window.addEventListener('beforeunload', handleFlush);
    window.addEventListener('pagehide', handleFlush);
    return () => {
      window.removeEventListener('central-estudos:flush-drafts', handleFlush);
      window.removeEventListener('beforeunload', handleFlush);
      window.removeEventListener('pagehide', handleFlush);
      handleFlush();
    };
  }, [flushObsDrafts]);

  const handleCreateBank = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBank.trim()) return;
    const created = createProofBank(newBank);
    setSelectedBank(created);
    setNewBank('');
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofFile) {
      toast('Selecione o arquivo da prova (PDF ou TXT).', true);
      return;
    }
    setUploading(true);
    try {
      const hasAnswer = Boolean(answerFile || answerText.trim());
      if (uploadKind === 'provas' && !hasAnswer && !uploadObs.trim()) {
        await uploadProofOnly(selectedBank, proofFile);
      } else {
        const count = await uploadProofWithAnswer(
          selectedBank,
          uploadKind,
          proofFile,
          answerFile,
          answerText,
          uploadObs,
        );
        toast(
          count
            ? `Prova salva com ${count} resposta(s) no gabarito.`
            : 'Prova salva na biblioteca.',
        );
      }
      setProofFile(null);
      setAnswerFile(null);
      setAnswerText('');
      setUploadObs('');
      if (proofInputRef.current) proofInputRef.current.value = '';
      if (answerInputRef.current) answerInputRef.current.value = '';
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadProof = async (pf: ProofFileRecord) => {
    const blob = await getFileBlob(pf.blobKey);
    if (!blob) {
      toast('Arquivo não encontrado no armazenamento local.', true);
      return;
    }
    triggerBlobDownload(blob, pf.name);
  };

  const handleDownloadAnswer = (pf: ProofFileRecord) => {
    if (!pf.gabarito_conteudo) return;
    triggerBlobDownload(
      new Blob([pf.gabarito_conteudo], { type: 'text/plain;charset=utf-8' }),
      pf.gabarito_arquivo || `${pf.name}.gabarito.txt`,
    );
  };

  const handleTriggerReplace = (proofId: string) => {
    setReplaceTargetId(proofId);
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = replaceTargetId;
    e.target.value = '';
    setReplaceTargetId(null);
    if (!file || !id) return;
    try {
      await replaceProofPdf(id, file);
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const handleDeleteProof = async (pf: ProofFileRecord) => {
    const ok = await requestConfirm({
      title: 'Excluir prova',
      description: `Deseja remover "${visibleName(pf.name)}" e suas correções vinculadas?`,
      confirmLabel: 'Excluir prova',
      danger: true,
    });
    if (!ok) return;
    await deleteProofFile(pf.id);
    if (previewProof?.id === pf.id) setPreviewProof(null);
  };

  const filteredProofs = useMemo(() => {
    return db.proofFiles.filter((pf) => {
      if (filterBank !== 'Todas' && pf.bank !== filterBank) return false;
      if (filterKind !== 'all' && pf.kind !== filterKind) return false;
      return true;
    });
  }, [db.proofFiles, filterBank, filterKind]);

  return (
    <div>
      <PageHeader
        eyebrow="ARQUIVO NACIONAL · PROVAS"
        title="Bancas, PDFs originais e correções de prova"
        description="Organize provas anteriores por banca examinadora, anexe gabaritos oficiais, visualize PDFs e encaminhe questões erradas para a Ouvidoria."
      />

      <input
        ref={replaceInputRef}
        type="file"
        accept=".pdf,.txt,.md"
        onChange={(e) => void handleReplaceFile(e)}
        className="hidden"
      />

      {!hideUpload && (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3.5 mb-4 items-start">
          <Panel title="Nova banca / organizadora">
            <form onSubmit={handleCreateBank} className="flex flex-col gap-2.5">
              <input
                type="text"
                value={newBank}
                onChange={(e) => setNewBank(e.target.value)}
                placeholder="Ex.: FGV, CESPE, FCC..."
                className="ce-input"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 h-[38px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
              >
                <FolderPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                Criar banca
              </button>
            </form>
          </Panel>

          <Panel title="Enviar prova (PDF ou TXT)">
            <form onSubmit={handleUploadSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Banca
                </label>
                <select
                  value={selectedBank}
                  onChange={(e) => setSelectedBank(e.target.value)}
                  className="ce-select"
                >
                  {db.proofBanks.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Categoria
                </label>
                <select
                  value={uploadKind}
                  onChange={(e) =>
                    setUploadKind(e.target.value as 'provas' | 'provas-com-gabarito')
                  }
                  className="ce-select"
                >
                  <option value="provas-com-gabarito">Prova com gabarito</option>
                  <option value="provas">Prova sem gabarito</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Arquivo da prova (.pdf ou .txt)
                </label>
                <input
                  ref={proofInputRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  className="ce-input"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Arquivo de gabarito (opcional · .txt/.pdf)
                </label>
                <input
                  ref={answerInputRef}
                  type="file"
                  accept=".txt,.md,.pdf"
                  onChange={(e) => setAnswerFile(e.target.files?.[0] || null)}
                  className="ce-input"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                  Ou cole o gabarito em texto (opcional · ex.: 1-A, 2-C, 3-E)
                </label>
                <input
                  type="text"
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="1-A, 2-D, 3-CERTO..."
                  className="ce-input"
                />
              </div>

              <div className="sm:col-span-2 flex flex-wrap items-end gap-2.5">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                    Observações gerais (opcional)
                  </label>
                  <input
                    type="text"
                    value={uploadObs}
                    onChange={(e) => setUploadObs(e.target.value)}
                    placeholder="Edital, ano, perfil da banca..."
                    className="ce-input"
                  />
                </div>
                <button
                  type="submit"
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 h-[38px] px-4 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  {uploading ? 'Enviando…' : 'Salvar prova'}
                </button>
              </div>
            </form>
          </Panel>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <select
          aria-label="Filtrar por banca"
          value={filterBank}
          onChange={(e) => setFilterBank(e.target.value)}
          className="ce-select w-auto min-w-[170px]"
        >
          <option value="Todas">Todas as bancas</option>
          {db.proofBanks.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <select
          aria-label="Filtrar por tipo de prova"
          value={filterKind}
          onChange={(e) =>
            setFilterKind(e.target.value as 'all' | 'provas' | 'provas-com-gabarito')
          }
          className="ce-select w-auto min-w-[200px]"
        >
          <option value="all">Todas as categorias</option>
          <option value="provas-com-gabarito">Provas com gabarito</option>
          <option value="provas">Provas sem gabarito</option>
        </select>
      </div>

      {previewProof && (
        <FilePreview
          blobKey={previewProof.blobKey}
          filename={previewProof.name}
          mimeType={/\.(txt|md)$/i.test(previewProof.name) ? 'text/plain' : 'application/pdf'}
          title={`${previewProof.bank} — ${visibleName(previewProof.name)}`}
          onClose={() => setPreviewProof(null)}
        />
      )}

      <div className="mt-4 flex flex-col gap-3.5">
        {filteredProofs.length ? (
          filteredProofs.map((pf) => {
            const obsVal =
              obsDrafts[pf.id] ?? readFieldDraft<string>(`proof_obs_${pf.id}`) ?? pf.observacoes;
            const form = corrForms[pf.id] || { questao: '', observacoes: '' };

            return (
              <Panel key={pf.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[min(100%,260px)] flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="m-0 font-display text-[15px] font-bold leading-snug text-[var(--text)] text-left break-words">
                        {visibleName(pf.name)}
                      </h3>
                      <span className="px-2 py-0.5 rounded-md border border-[var(--line-strong)] bg-[var(--panel-soft)] text-[10.5px] font-bold text-[var(--accent)]">
                        {pf.bank}
                      </span>
                      <span className="px-2 py-0.5 rounded-md border border-[var(--line)] bg-[var(--panel-soft)] text-[10.5px] font-semibold text-[var(--muted)]">
                        {pf.kind === 'provas-com-gabarito' ? 'Com gabarito' : 'Prova'}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--muted)] tabular-nums">
                      {formatUploadSize(pf.size)} · Adicionada em {pf.createdAt}
                      {pf.gabarito_questoes > 0 ? ` · ${pf.gabarito_questoes} respostas no gabarito` : ''}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 min-w-0 max-w-full">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewProof(previewProof?.id === pf.id ? null : pf)
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {previewProof?.id === pf.id ? 'Fechar' : 'Visualizar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownloadProof(pf)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {/\.(txt|md)$/i.test(pf.name) ? 'Baixar TXT' : 'Baixar PDF'}
                    </button>
                    {pf.gabarito_conteudo && (
                      <button
                        type="button"
                        onClick={() => handleDownloadAnswer(pf)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--good)] hover:border-[var(--good)] whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Gabarito
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleTriggerReplace(pf.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Substituir
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteProof(pf)}
                      aria-label={`Excluir ${pf.name}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-[var(--line)] grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--muted)] mb-1">
                      Observações sobre a prova
                    </label>
                    <input
                      type="text"
                      value={obsVal}
                      onChange={(e) => {
                        const val = e.target.value;
                        writeFieldDraft(`proof_obs_${pf.id}`, val);
                        setObsDrafts((prev) => ({ ...prev, [pf.id]: val }));
                      }}
                      onBlur={() => {
                        updateProofObservations(pf.id, obsVal, true);
                        clearFieldDraft(`proof_obs_${pf.id}`);
                      }}
                      placeholder="Tempo de resolução, nível da prova, disciplinas críticas..."
                      className="ce-input"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updateProofObservations(pf.id, obsVal);
                      clearFieldDraft(`proof_obs_${pf.id}`);
                      setObsDrafts((prev) => {
                        const next = { ...prev };
                        delete next[pf.id];
                        return next;
                      });
                    }}
                    className="inline-flex items-center gap-1.5 h-[38px] px-3.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[12px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Salvar observações
                  </button>
                </div>

                <div className="mt-3 pt-3 border-t border-[var(--line)]">
                  <div className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--text)] mb-2">
                    <CheckSquare className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Questões corrigidas / erradas ({pf.correcoes.length})
                  </div>

                  {pf.correcoes.length > 0 && (
                    <div className="flex flex-col gap-2 mb-3">
                      {pf.correcoes.map((c) => (
                        <div
                          key={c.id}
                          className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2.5 text-[12.5px]"
                        >
                          <div className="min-w-0 flex-1">
                            <strong className="text-[var(--text)]">{c.questao}</strong>
                            {c.observacoes && (
                              <p className="mt-0.5 mb-0 text-[12px] text-[var(--muted)]">
                                {c.observacoes}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setCorrForms((prev) => ({
                                  ...prev,
                                  [pf.id]: {
                                    questao: c.questao,
                                    observacoes: c.observacoes,
                                    editId: c.id,
                                  },
                                }))
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-semibold text-[var(--text)] hover:border-[var(--accent)]"
                            >
                              <Pencil className="w-3 h-3" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteProofCorrection(pf.id, c.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-semibold text-[var(--bad)] hover:border-[var(--bad)]"
                            >
                              <Trash2 className="w-3 h-3" />
                              Excluir
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-2 items-center">
                    <input
                      type="text"
                      value={form.questao}
                      onChange={(e) =>
                        setCorrForms((prev) => ({
                          ...prev,
                          [pf.id]: { ...form, questao: e.target.value },
                        }))
                      }
                      placeholder="Ex.: Q.14 (Dir. Adm.)"
                      className="ce-input"
                    />
                    <input
                      type="text"
                      value={form.observacoes}
                      onChange={(e) =>
                        setCorrForms((prev) => ({
                          ...prev,
                          [pf.id]: { ...form, observacoes: e.target.value },
                        }))
                      }
                      placeholder="Motivo do erro ou súmula/regra aplicável"
                      className="ce-input"
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          addOrUpdateProofCorrection(
                            pf.id,
                            form.questao,
                            form.observacoes,
                            form.editId,
                          );
                          setCorrForms((prev) => ({
                            ...prev,
                            [pf.id]: { questao: '', observacoes: '' },
                          }));
                        }}
                        className="h-[38px] px-3.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[12px] font-bold hover:bg-[var(--accent-hover)] whitespace-nowrap"
                      >
                        {form.editId ? 'Atualizar questão' : 'Registrar erro'}
                      </button>
                      {form.editId && (
                        <button
                          type="button"
                          onClick={() =>
                            setCorrForms((prev) => ({
                              ...prev,
                              [pf.id]: { questao: '', observacoes: '' },
                            }))
                          }
                          className="h-[38px] px-2.5 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--muted)] hover:text-[var(--text)] whitespace-nowrap"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Panel>
            );
          })
        ) : (
          <EmptyState message="Nenhuma prova encontrada para os filtros selecionados." />
        )}
      </div>
    </div>
  );
};
