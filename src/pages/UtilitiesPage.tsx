import React, { useRef, useState } from 'react';
import {
  BookOpen,
  BookPlus,
  Bookmark,
  CalendarPlus,
  Check,
  Copy,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  HardDrive,
  Layers,
  Pencil,
  PlusCircle,
  RefreshCw,
  Scale,
  Trash2,
  X,
} from 'lucide-react';
import { useStudy } from '../context/StudyContext';
import { triggerBlobDownload } from '../lib/fileStorage';
import { cleanSafeName, visibleName } from '../lib/parsers';
import { PageHeader } from '../components/ui/PageHeader';

type UtilCategory = 'Todos' | 'Questões' | 'Lei Seca' | 'Cronograma';

const COMPACT_INPUT =
  'w-full h-[34px] px-2.5 py-1 border border-[var(--line-strong)] rounded-lg bg-[var(--panel-soft)] text-[var(--text)] text-[12px] outline-none transition-colors focus:border-[var(--accent)] file:mr-2 file:py-0.5 file:px-2 file:rounded file:border file:border-[var(--line-strong)] file:text-[11px] file:font-semibold file:bg-[var(--panel-raised)] file:text-[var(--text)]';

const COMPACT_TEXTAREA =
  'w-full px-2.5 py-1.5 border border-[var(--line-strong)] rounded-lg bg-[var(--panel-soft)] text-[var(--text)] text-[12px] leading-snug outline-none transition-colors focus:border-[var(--accent)] resize-y';

const COMPACT_LABEL = 'block text-[10.5px] font-bold uppercase tracking-wide text-[var(--muted)] mb-1';

const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-1.5 h-[32px] px-3 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11.5px] font-bold hover:bg-[var(--accent-hover)] disabled:opacity-60 whitespace-nowrap transition-colors';

const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-1.5 h-[32px] px-3 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11.5px] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-60 whitespace-nowrap transition-colors';

interface CompactCardProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  badge?: string;
  children: React.ReactNode;
  className?: string;
}

const CompactUtilCard: React.FC<CompactCardProps> = ({
  title,
  subtitle,
  icon,
  badge,
  children,
  className = '',
}) => (
  <section className={`ce-panel rounded-xl p-3.5 flex flex-col h-full ${className}`}>
    <div className="flex items-start justify-between gap-2 pb-2 mb-2.5 border-b border-[var(--line)]/60">
      <div className="flex items-start gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-[var(--panel-raised)] border border-[var(--line-strong)] flex items-center justify-center shrink-0 text-[var(--accent)]">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="m-0 font-display text-[13.5px] font-bold tracking-tight text-[var(--text)] leading-tight truncate">
            {title}
          </h3>
          <p className="mt-0.5 mb-0 text-[11px] text-[var(--muted)] leading-snug line-clamp-2">{subtitle}</p>
        </div>
      </div>
      {badge && (
        <span className="shrink-0 px-1.5 py-0.5 rounded bg-[var(--panel-soft)] border border-[var(--line)] text-[10px] font-bold text-[var(--muted)]">
          {badge}
        </span>
      )}
    </div>
    <div className="flex-1 flex flex-col">{children}</div>
  </section>
);

export const UtilitiesPage: React.FC = () => {
  const {
    db,
    disciplines,
    fixedSubjects,
    addFixedSubject,
    renameFixedSubject,
    removeFixedSubject,
    moduleVisibility,
    requestConfirm,
    setActivePage,
    importScheduleTxt,
    importQuestionsTxt,
    addManualQuestion,
    convertLawPdf,
    uploadLawFile,
    reprocessLawFolder,
    deleteLawFolder,
    convertExamPdf,
    convertExamToStructuredTxt,
    driveConnected,
    driveTokenReady,
    activeDriveFolderName,
    localFolderConnected,
    localFolderWritable,
    localFolderName,
    toast,
  } = useStudy();
  const [reprocessingFolder, setReprocessingFolder] = useState<string | null>(null);

  const hideUpload = moduleVisibility('Utilidades').hide_upload;
  const [category, setCategory] = useState<UtilCategory>('Todos');

  // 1. Schedule TXT import
  const [schedFile, setSchedFile] = useState<File | null>(null);
  const [schedLoading, setSchedLoading] = useState(false);
  const schedRef = useRef<HTMLInputElement | null>(null);

  // 2. Questions TXT import
  const [qFile, setQFile] = useState<File | null>(null);
  const [qSubject, setQSubject] = useState('');
  const [qAsSim, setQAsSim] = useState(false);
  const [qLoading, setQLoading] = useState(false);
  const qRef = useRef<HTMLInputElement | null>(null);

  // 3. Manual Question
  const [mSubject, setMSubject] = useState(disciplines[0] || 'Direito Constitucional');
  const [mStatement, setMStatement] = useState('');
  const [mAlternatives, setMAlternatives] = useState('');
  const [mAnswer, setMAnswer] = useState('C');
  const [mComment, setMComment] = useState('');

  // 4. TXT Law Importer (supports single or multiple laws at once)
  const [txtLawFiles, setTxtLawFiles] = useState<File[]>([]);
  const [txtLawFolder, setTxtLawFolder] = useState('');
  const [txtLawLoading, setTxtLawLoading] = useState(false);
  const [txtLawProgress, setTxtLawProgress] = useState('');
  const txtLawRef = useRef<HTMLInputElement | null>(null);

  // 5. Convert Law PDF
  const [lawPdf, setLawPdf] = useState<File | null>(null);
  const [lawFolder, setLawFolder] = useState('');
  const [lawLoading, setLawLoading] = useState(false);
  const lawRef = useRef<HTMLInputElement | null>(null);

  // 6. Convert Exam PDF to Simulation / Bank
  const [examPdf, setExamPdf] = useState<File | null>(null);
  const [examSubject, setExamSubject] = useState('');
  const [examAnswerFile, setExamAnswerFile] = useState<File | null>(null);
  const [examAnswerText, setExamAnswerText] = useState('');
  const [examAsSim, setExamAsSim] = useState(true);
  const [examLoading, setExamLoading] = useState(false);
  const examPdfRef = useRef<HTMLInputElement | null>(null);
  const examKeyRef = useRef<HTMLInputElement | null>(null);

  // 7. Convert Exam PDF to Structured TXT
  const [txtPdf, setTxtPdf] = useState<File | null>(null);
  const [txtKeyFile, setTxtKeyFile] = useState<File | null>(null);
  const [txtKeyText, setTxtKeyText] = useState('');
  const [txtLoading, setTxtLoading] = useState(false);
  const txtPdfRef = useRef<HTMLInputElement | null>(null);
  const txtKeyRef = useRef<HTMLInputElement | null>(null);

  // 8. Fixed Subjects (Monitor de Desempenho) management
  const [newFixedSubject, setNewFixedSubject] = useState('');
  const [fixedFilter, setFixedFilter] = useState('');
  const [editingFixedSubject, setEditingFixedSubject] = useState<string | null>(null);
  const [editingFixedValue, setEditingFixedValue] = useState('');

  const handleAddFixedSubjectUtil = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = visibleName(newFixedSubject);
    if (!clean) {
      toast('Informe o nome da matéria fixada.', true);
      return;
    }
    addFixedSubject(clean);
    setNewFixedSubject('');
  };

  const handleStartEditFixedSubject = (subj: string) => {
    setEditingFixedSubject(subj);
    setEditingFixedValue(subj);
  };

  const handleSaveFixedRename = (oldName: string) => {
    const cleanNew = visibleName(editingFixedValue);
    if (!cleanNew) {
      toast('O nome da matéria não pode ficar vazio.', true);
      return;
    }
    renameFixedSubject(oldName, cleanNew);
    setEditingFixedSubject(null);
    setEditingFixedValue('');
  };

  const handleImportSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedFile) {
      toast('Selecione um arquivo .txt de cronograma.', true);
      return;
    }
    setSchedLoading(true);
    try {
      const count = await importScheduleTxt(schedFile);
      toast(`${count} tópico(s) importado(s) para o Cronograma.`);
      setSchedFile(null);
      if (schedRef.current) schedRef.current.value = '';
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setSchedLoading(false);
    }
  };

  const handleImportQuestions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qFile) {
      toast('Selecione o arquivo .txt com questões.', true);
      return;
    }
    setQLoading(true);
    try {
      const res = await importQuestionsTxt(qFile, qSubject, qAsSim);
      toast(
        res.simulado
          ? `Simulado enviado criado com ${res.count} questão(ões) em ${res.materia}.`
          : `${res.count} questão(ões) adicionada(s) ao banco de ${res.materia}.`,
      );
      setQFile(null);
      setQSubject('');
      if (qRef.current) qRef.current.value = '';
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setQLoading(false);
    }
  };

  const handleAddManualQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = addManualQuestion({
        materia: mSubject,
        enunciado: mStatement,
        alternativasText: mAlternatives,
        gabarito: mAnswer,
        comentario: mComment,
      });
      toast(`Questão adicionada em ${res.materia}.`);
      setMStatement('');
      setMAlternatives('');
      setMComment('');
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const [copiedModel, setCopiedModel] = useState(false);
  const [copiedQuestionModel, setCopiedQuestionModel] = useState(false);
  const [copiedScheduleModel, setCopiedScheduleModel] = useState(false);

  const sampleTxtLawTemplate = `# FORMATO 1: Texto corrido com grau ao final (MUITO ALTA, ALTA, MÉDIA ou BAIXA)
Art. 1º Serão punidos, na forma desta Lei, os crimes resultantes de discriminação ou preconceito de raça, cor, etnia, religião ou procedência nacional. MUITO ALTA
Art. 2º São diretrizes de atuação institucional: ALTA
I - impedir o acesso às entradas sociais de edifícios públicos ou residenciais; BAIXA
II - recusar ou impedir o atendimento em estabelecimentos comerciais. MÉDIA
Parágrafo único. O disposto neste artigo aplica-se também aos serviços públicos. ALTA
Art. 3º É assegurada a prioridade de tramitação nos casos previstos em lei. MÉDIA
§ 1º O prazo será contado em dobro quando houver interesse público. BAIXA

# FORMATO 2: Com divisores (|||) -> Dispositivo ||| Grau ||| Texto ||| Dica (opcional)
Art. 4º ||| Muito Alto ||| Impossibilitar o acesso ou uso de transportes públicos urbanos. ||| Ponto frequente em provas de concursos`;

  const sampleQuestionsTemplate = `# FORMATO 1 (Padrão): Blocos Numerados (Certo/Errado ou Múltipla Escolha)
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

# ----------------------------------------------------------------------
# FORMATOS ALTERNATIVOS (use em um arquivo separado, sem o "#" inicial)
#
# FORMATO 2: Linha Única com Divisor Pipe (|)
# Formato: Enunciado | Gabarito (C/E ou A..E) | Comentário (opcional)
# A soberania popular será exercida pelo voto direto e secreto. | C | CF/88, Art. 14.
# O prazo do concurso será de: [A] 1 ano [B] 2 anos [C] 3 anos [D] 4 anos | B | CF/88, Art. 37, III.
#
# FORMATO 3: Prova com Gabarito ao Final
# 1. Determinado servidor público praticou ato de improbidade administrativa.
# 2. A respeito da responsabilidade civil do Estado brasileiro.
# GABARITO:
# 1-C
# 2-E`;

  const sampleScheduleTemplate = `# Formato padrão: Dia | Matéria | Tempo [| Observações]
# Formato alternativo com data: Dia | DD/MM/AAAA | Matéria | Tempo | Observações
Segunda-feira | Direito Constitucional | 2h | Leitura dos arts. 1º a 5º e revisão
Terça-feira | Direito Administrativo | 1h 30min | Resolução de 30 questões de poderes
Quarta-feira | Direito Penal | 2h | Teoria do crime e tipicidade
Quinta-feira | Direito Processual Penal | 1h 30min | Inquérito policial
Sexta-feira | Legislação Especial | 2h | Lei 7.716/1989 e Lei 8.069/1990
Sábado | Simulado Geral | 3h | Simulado semanal de 60 questões
Domingo | Revisão Semanal | 1h | Revisão dos cadernos de erros`;

  const handleDownloadLawSample = () => {
    const blob = new Blob([sampleTxtLawTemplate], { type: 'text/plain;charset=utf-8' });
    triggerBlobDownload(blob, 'modelo_exemplo_lei_seca.txt');
    toast('Modelo de arquivo .txt de legislação baixado com sucesso!');
  };

  const handleCopyLawSample = async () => {
    try {
      await navigator.clipboard.writeText(sampleTxtLawTemplate);
      setCopiedModel(true);
      toast('Modelo de texto copiado para a área de transferência!');
      setTimeout(() => setCopiedModel(false), 2500);
    } catch {
      toast('Não foi possível copiar o texto.', true);
    }
  };

  const handleDownloadQuestionSample = () => {
    const blob = new Blob([sampleQuestionsTemplate], { type: 'text/plain;charset=utf-8' });
    triggerBlobDownload(blob, 'modelo_exemplo_questoes.txt');
    toast('Modelo de arquivo .txt de questões baixado com sucesso!');
  };

  const handleCopyQuestionSample = async () => {
    try {
      await navigator.clipboard.writeText(sampleQuestionsTemplate);
      setCopiedQuestionModel(true);
      toast('Modelo de questões copiado para a área de transferência!');
      setTimeout(() => setCopiedQuestionModel(false), 2500);
    } catch {
      toast('Não foi possível copiar o texto.', true);
    }
  };

  const handleDownloadScheduleSample = () => {
    const blob = new Blob([sampleScheduleTemplate], { type: 'text/plain;charset=utf-8' });
    triggerBlobDownload(blob, 'modelo_exemplo_cronograma.txt');
    toast('Modelo de arquivo .txt de cronograma baixado com sucesso!');
  };

  const handleCopyScheduleSample = async () => {
    try {
      await navigator.clipboard.writeText(sampleScheduleTemplate);
      setCopiedScheduleModel(true);
      toast('Modelo de cronograma copiado para a área de transferência!');
      setTimeout(() => setCopiedScheduleModel(false), 2500);
    } catch {
      toast('Não foi possível copiar o texto.', true);
    }
  };

  const handleDeleteLawFolder = async (folder: string) => {
    const ok = await requestConfirm({
      title: 'Excluir legislação cadastrada',
      description: `Deseja excluir permanentemente a legislação "${visibleName(folder)}" e todos os seus dispositivos legalmente estruturados?`,
      confirmLabel: 'Excluir legislação',
      danger: true,
    });
    if (!ok) return;
    const count = await deleteLawFolder(folder);
    toast(`Legislação "${visibleName(folder)}" (${count} dispositivo/s) excluída com sucesso.`);
  };

  const handleTxtLawFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    setTxtLawFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}::${f.size}::${f.lastModified}`));
      const next = [...prev];
      for (const file of picked) {
        const sig = `${file.name}::${file.size}::${file.lastModified}`;
        if (!seen.has(sig)) {
          seen.add(sig);
          next.push(file);
        }
      }
      return next;
    });
    e.currentTarget.value = '';
  };

  const handleRemoveTxtLawFile = (index: number) => {
    setTxtLawFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleClearTxtLawFiles = () => {
    setTxtLawFiles([]);
    if (txtLawRef.current) txtLawRef.current.value = '';
  };

  const handleImportTxtLaw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (txtLawFiles.length === 0) {
      toast('Selecione pelo menos um arquivo .txt ou .md de lei.', true);
      return;
    }

    setTxtLawLoading(true);
    setTxtLawProgress('');
    const customFolder = txtLawFolder.trim();
    const createdFolders = new Set<string>();
    let succeededCount = 0;
    let totalDevices = 0;
    const failedFiles: File[] = [];
    const errorReasons: string[] = [];

    try {
      for (let i = 0; i < txtLawFiles.length; i++) {
        const file = txtLawFiles[i];
        if (txtLawFiles.length > 1) {
          setTxtLawProgress(`${i + 1}/${txtLawFiles.length}`);
        }
        try {
          const targetFolder = customFolder || file.name.replace(/\.[^.]+$/, '');
          const normalizedFolder = cleanSafeName(targetFolder, 'Legislacao').replace(/\s+/g, '_');
          const importedCount = await uploadLawFile(normalizedFolder, file, { silent: true });
          createdFolders.add(normalizedFolder);
          succeededCount++;
          totalDevices += importedCount;
        } catch (err) {
          failedFiles.push(file);
          errorReasons.push(`${file.name}: ${(err as Error).message}`);
        }
      }

      if (failedFiles.length === 0) {
        if (succeededCount === 1) {
          const onlyFolder = Array.from(createdFolders)[0] || '';
          toast(
            `Lei importada na pasta "${visibleName(onlyFolder)}" (${totalDevices} dispositivo(s) integrado(s)).`,
          );
        } else {
          toast(
            `${succeededCount} leis importadas em ${createdFolders.size} pasta(s) (${totalDevices} dispositivos integrados).`,
          );
        }
        setTxtLawFiles([]);
        setTxtLawFolder('');
        if (txtLawRef.current) txtLawRef.current.value = '';
      } else if (succeededCount > 0) {
        toast(
          `${succeededCount} lei(s) importada(s) (${totalDevices} dispositivo(s)), mas ${failedFiles.length} falhou: ${errorReasons[0]}`,
          true,
        );
        setTxtLawFiles(failedFiles);
      } else {
        toast(errorReasons[0] || 'Não foi possível importar os arquivos selecionados.', true);
      }
    } finally {
      setTxtLawLoading(false);
      setTxtLawProgress('');
    }
  };

  const handleConvertLaw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lawPdf) {
      toast('Selecione o PDF da legislação.', true);
      return;
    }
    setLawLoading(true);
    try {
      const res = await convertLawPdf(lawPdf, lawFolder);
      toast(`Pasta "${visibleName(res.pasta)}" criada com ${res.dispositivos} dispositivo(s).`);
      setLawPdf(null);
      setLawFolder('');
      if (lawRef.current) lawRef.current.value = '';
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setLawLoading(false);
    }
  };

  const handleConvertExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examPdf) {
      toast('Selecione o PDF da prova.', true);
      return;
    }
    setExamLoading(true);
    try {
      const res = await convertExamPdf(
        examPdf,
        examSubject,
        examAnswerFile,
        examAnswerText,
        examAsSim,
      );
      toast(
        res.simulado
          ? `Simulado criado com ${res.count} questão(ões) (${res.materia}).`
          : `${res.count} questão(ões) extraída(s) para ${res.materia}.`,
      );
      setExamPdf(null);
      setExamAnswerFile(null);
      setExamAnswerText('');
      setExamSubject('');
      if (examPdfRef.current) examPdfRef.current.value = '';
      if (examKeyRef.current) examKeyRef.current.value = '';
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setExamLoading(false);
    }
  };

  const handleConvertExamToTxt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txtPdf) {
      toast('Selecione o PDF da prova.', true);
      return;
    }
    setTxtLoading(true);
    try {
      const outName = await convertExamToStructuredTxt(txtPdf, txtKeyFile, txtKeyText);
      toast(
        localFolderConnected && localFolderWritable
          ? `Arquivo estruturado "${outName}" salvo em Provas e Gabaritos da pasta local e baixado.`
          : `Arquivo estruturado "${outName}" gerado e baixado.`,
      );
      setTxtPdf(null);
      setTxtKeyFile(null);
      setTxtKeyText('');
      if (txtPdfRef.current) txtPdfRef.current.value = '';
      if (txtKeyRef.current) txtKeyRef.current.value = '';
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setTxtLoading(false);
    }
  };

  const showQuestions = category === 'Todos' || category === 'Questões';
  const showLaws = category === 'Todos' || category === 'Lei Seca';
  const showSchedule = category === 'Todos' || category === 'Cronograma';
  const lawCount = Object.keys(db.laws).length;

  return (
    <div>
      <PageHeader
        eyebrow="BALCÃO DE PROTOCOLO · UTILIDADES"
        title="Importação, conversão de PDFs e cadastro rápido"
        description="Guichês compactos para abastecer o banco de questões, extrair provas em PDF, importar cronogramas e gerenciar Lei Seca."
      />

      {!hideUpload && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 p-1.5 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)]">
          <div className="flex flex-wrap items-center gap-1">
            {(['Todos', 'Questões', 'Lei Seca', 'Cronograma'] as UtilCategory[]).map((tab) => {
              const active = category === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setCategory(tab)}
                  className={`inline-flex items-center gap-1.5 h-[30px] px-3 rounded-lg text-[11.5px] font-bold transition-colors ${
                    active
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-raised)]'
                  }`}
                >
                  {tab === 'Todos' && <Layers className="w-3.5 h-3.5" />}
                  {tab === 'Questões' && <FileSpreadsheet className="w-3.5 h-3.5" />}
                  {tab === 'Lei Seca' && <Scale className="w-3.5 h-3.5" />}
                  {tab === 'Cronograma' && <CalendarPlus className="w-3.5 h-3.5" />}
                  {tab === 'Questões' ? 'Questões & Provas' : tab}
                </button>
              );
            })}
          </div>
          <span className="text-[11px] font-semibold text-[var(--muted)] px-2">
            {category === 'Todos'
              ? '9 utilitários organizados em grade uniforme'
              : `Filtro ativo: ${category}`}
          </span>
        </div>
      )}

      {localFolderConnected && (
        <div className="mb-3.5 rounded-xl border border-[var(--good)]/30 bg-[var(--good)]/10 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
          <div className="flex items-center gap-2 min-w-0 text-[var(--text)]">
            <HardDrive className="w-4 h-4 text-[var(--good)] shrink-0" />
            <span className="truncate">
              <strong>Pasta Local ativa ({localFolderName || 'Computador'}):</strong>{' '}
              {localFolderWritable
                ? 'todas as importações, conversões e edições são gravadas automaticamente nas subpastas locais.'
                : 'modo leitura — exporte ou reabra com permissão de escrita em Backup para gravar direto no disco.'}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        {/* === QUESTÕES & PROVAS === */}
        {!hideUpload && showQuestions && (
          <>
            <CompactUtilCard
              title="Converter prova PDF para Simulado / Banco"
              subtitle="Extrai questões de PDF associando ao gabarito informado."
              icon={<FileCode2 className="w-4 h-4" />}
              badge="PDF → Simulado"
            >
              <form onSubmit={handleConvertExam} className="flex-1 flex flex-col gap-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className={COMPACT_LABEL}>PDF da prova</label>
                    <input
                      ref={examPdfRef}
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setExamPdf(e.target.files?.[0] || null)}
                      className={COMPACT_INPUT}
                    />
                  </div>
                  <div>
                    <label className={COMPACT_LABEL}>Gabarito (.txt/.pdf opcional)</label>
                    <input
                      ref={examKeyRef}
                      type="file"
                      accept=".txt,.md,.pdf"
                      onChange={(e) => setExamAnswerFile(e.target.files?.[0] || null)}
                      className={COMPACT_INPUT}
                    />
                  </div>
                  <div>
                    <label className={COMPACT_LABEL}>Disciplina / Nome da prova</label>
                    <input
                      type="text"
                      value={examSubject}
                      onChange={(e) => setExamSubject(e.target.value)}
                      placeholder="Ex.: Simulado CESPE 2026"
                      className={COMPACT_INPUT}
                    />
                  </div>
                  <div>
                    <label className={COMPACT_LABEL}>Ou cole o gabarito</label>
                    <input
                      type="text"
                      value={examAnswerText}
                      onChange={(e) => setExamAnswerText(e.target.value)}
                      placeholder="1-A, 2-CERTO, 3-E..."
                      className={COMPACT_INPUT}
                    />
                  </div>
                </div>
                <div className="mt-auto pt-2.5 border-t border-[var(--line)]/50 flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--text)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={examAsSim}
                      onChange={(e) => setExamAsSim(e.target.checked)}
                      className="accent-[var(--accent)] w-3.5 h-3.5"
                    />
                    Enviar para Prova Lacrada (Simulado)
                  </label>
                  <button type="submit" disabled={examLoading} className={BTN_PRIMARY}>
                    <FileCode2 className="w-3.5 h-3.5" />
                    {examLoading ? 'Convertendo…' : 'Extrair e salvar'}
                  </button>
                </div>
              </form>
            </CompactUtilCard>

            <CompactUtilCard
              title="Transformar prova PDF em TXT estruturado"
              subtitle="Gera arquivo _estruturada.txt associando enunciados ao gabarito."
              icon={<Download className="w-4 h-4" />}
              badge="PDF → TXT"
            >
              <form onSubmit={handleConvertExamToTxt} className="flex-1 flex flex-col gap-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className={COMPACT_LABEL}>PDF da prova</label>
                    <input
                      ref={txtPdfRef}
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setTxtPdf(e.target.files?.[0] || null)}
                      className={COMPACT_INPUT}
                    />
                  </div>
                  <div>
                    <label className={COMPACT_LABEL}>Arquivo de gabarito (opcional)</label>
                    <input
                      ref={txtKeyRef}
                      type="file"
                      accept=".txt,.md,.pdf"
                      onChange={(e) => setTxtKeyFile(e.target.files?.[0] || null)}
                      className={COMPACT_INPUT}
                    />
                  </div>
                </div>
                <div>
                  <label className={COMPACT_LABEL}>Ou cole o gabarito em texto</label>
                  <input
                    type="text"
                    value={txtKeyText}
                    onChange={(e) => setTxtKeyText(e.target.value)}
                    placeholder="1-A, 2-C, 3-E..."
                    className={COMPACT_INPUT}
                  />
                </div>
                <div className="mt-auto pt-2.5 border-t border-[var(--line)]/50 flex justify-end">
                  <button type="submit" disabled={txtLoading} className={BTN_SECONDARY}>
                    <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                    {txtLoading ? 'Extraindo…' : 'Gerar TXT estruturado'}
                  </button>
                </div>
              </form>
            </CompactUtilCard>

            <CompactUtilCard
              title="Importar questões (.txt)"
              subtitle="Suporta blocos numerados, divisor pipe (|) ou gabarito ao final."
              icon={<FileSpreadsheet className="w-4 h-4" />}
              badge=".TXT"
            >
              <form onSubmit={handleImportQuestions} className="flex flex-col gap-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className={COMPACT_LABEL}>Arquivo .txt / .md</label>
                    <input
                      ref={qRef}
                      type="file"
                      accept=".txt,.md"
                      onChange={(e) => setQFile(e.target.files?.[0] || null)}
                      className={COMPACT_INPUT}
                    />
                  </div>
                  <div>
                    <label className={COMPACT_LABEL}>Disciplina (opcional)</label>
                    <input
                      type="text"
                      value={qSubject}
                      onChange={(e) => setQSubject(e.target.value)}
                      placeholder="Padrão: nome do arquivo"
                      className={COMPACT_INPUT}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--text)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={qAsSim}
                      onChange={(e) => setQAsSim(e.target.checked)}
                      className="accent-[var(--accent)] w-3.5 h-3.5"
                    />
                    Salvar como Simulado Enviado
                  </label>
                  <button type="submit" disabled={qLoading} className={BTN_PRIMARY}>
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    {qLoading ? 'Importando…' : 'Importar questões'}
                  </button>
                </div>
              </form>

              <div className="mt-auto pt-2.5 border-t border-[var(--line)]/60">
                <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                  <span className="text-[11px] font-bold text-[var(--text)] flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
                    Modelo / Exemplo de Formato (.txt):
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleCopyQuestionSample()}
                      className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[var(--text)] hover:text-[var(--accent)] bg-[var(--panel-raised)] border border-[var(--line-strong)] px-2 py-0.5 rounded transition-colors"
                    >
                      {copiedQuestionModel ? <Check className="w-3 h-3 text-[var(--good)]" /> : <Copy className="w-3 h-3" />}
                      {copiedQuestionModel ? 'Copiado!' : 'Copiar'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadQuestionSample}
                      className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[var(--accent)] hover:underline bg-[var(--panel-raised)] border border-[var(--line-strong)] px-2 py-0.5 rounded transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Baixar .txt
                    </button>
                  </div>
                </div>
                <div className="h-[116px] overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2 font-mono text-[10.5px] leading-snug text-[var(--muted)] whitespace-pre-wrap select-all">
                  {sampleQuestionsTemplate}
                </div>
              </div>
            </CompactUtilCard>
          </>
        )}

        {/* === ADICIONAR QUESTÃO MANUALMENTE (sempre disponível na aba Todos ou Questões) === */}
        {showQuestions && (
          <CompactUtilCard
            title="Adicionar questão manualmente"
            subtitle="Cadastro rápido compatível com Certo/Errado (CE) ou Múltipla Escolha (A–E)."
            icon={<PlusCircle className="w-4 h-4" />}
            badge="Manual"
          >
            <form onSubmit={handleAddManualQuestion} className="flex-1 flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className={COMPACT_LABEL}>Disciplina</label>
                  <input
                    type="text"
                    list="util-disciplines"
                    value={mSubject}
                    onChange={(e) => setMSubject(e.target.value)}
                    className={COMPACT_INPUT}
                  />
                  <datalist id="util-disciplines">
                    {disciplines.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className={COMPACT_LABEL}>Gabarito</label>
                  <input
                    type="text"
                    value={mAnswer}
                    onChange={(e) => setMAnswer(e.target.value)}
                    placeholder="C / E / A..E"
                    className={`${COMPACT_INPUT} font-mono-num uppercase`}
                  />
                </div>
              </div>

              <div>
                <label className={COMPACT_LABEL}>Enunciado</label>
                <textarea
                  value={mStatement}
                  onChange={(e) => setMStatement(e.target.value)}
                  rows={2}
                  placeholder="Digite o texto completo da questão..."
                  className={`${COMPACT_TEXTAREA} min-h-[54px]`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className={COMPACT_LABEL}>Alternativas (vazio = CE)</label>
                  <textarea
                    value={mAlternatives}
                    onChange={(e) => setMAlternatives(e.target.value)}
                    rows={2}
                    placeholder={'A) ...\nB) ...\nC) ...'}
                    className={`${COMPACT_TEXTAREA} min-h-[54px]`}
                  />
                </div>
                <div>
                  <label className={COMPACT_LABEL}>Comentário (opcional)</label>
                  <textarea
                    value={mComment}
                    onChange={(e) => setMComment(e.target.value)}
                    rows={2}
                    placeholder="Fundamento legal..."
                    className={`${COMPACT_TEXTAREA} min-h-[54px]`}
                  />
                </div>
              </div>

              <div className="mt-auto pt-2.5 border-t border-[var(--line)]/50 flex justify-end">
                <button type="submit" className={BTN_PRIMARY}>
                  <PlusCircle className="w-3.5 h-3.5" />
                  Salvar questão no banco
                </button>
              </div>
            </form>
          </CompactUtilCard>
        )}

        {/* === LEI SECA TXT & CRONOGRAMA TXT (pares com preview .txt) === */}
        {!hideUpload && showLaws && (
          <CompactUtilCard
            title="Importar Lei Seca (.txt com Grau de Incidência)"
            subtitle="Envie um ou vários arquivos .txt de uma vez; integra artigos, parágrafos e grau de incidência."
            icon={<BookPlus className="w-4 h-4" />}
            badge=".TXT → Leis"
          >
            <form onSubmit={handleImportTxtLaw} className="flex flex-col gap-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className={COMPACT_LABEL}>Arquivos da lei (.txt/.md — múltiplos)</label>
                  <input
                    ref={txtLawRef}
                    type="file"
                    accept=".txt,.md"
                    multiple
                    onChange={handleTxtLawFilesChange}
                    className={COMPACT_INPUT}
                  />
                </div>
                <div>
                  <label className={COMPACT_LABEL}>Pasta destino (opcional)</label>
                  <input
                    type="text"
                    list="existing-law-folders"
                    value={txtLawFolder}
                    onChange={(e) => setTxtLawFolder(e.target.value)}
                    placeholder="Vazio = 1 pasta por arquivo"
                    className={COMPACT_INPUT}
                  />
                  <datalist id="existing-law-folders">
                    {Object.keys(db.laws).map((folder) => (
                      <option key={folder} value={folder} />
                    ))}
                  </datalist>
                </div>
              </div>

              {txtLawFiles.length > 0 && (
                <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10.5px] font-bold text-[var(--text)]">
                      {txtLawFiles.length}{' '}
                      {txtLawFiles.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}
                      {txtLawFolder.trim()
                        ? ` → pasta "${visibleName(txtLawFolder.trim())}"`
                        : ' → 1 pasta por arquivo'}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearTxtLawFiles}
                      disabled={txtLawLoading}
                      className="text-[10.5px] font-semibold text-[var(--muted)] hover:text-[var(--bad)] disabled:opacity-50"
                    >
                      Limpar lista
                    </button>
                  </div>
                  <div className="max-h-[82px] overflow-y-auto flex flex-wrap gap-1">
                    {txtLawFiles.map((file, idx) => (
                      <span
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className="inline-flex items-center gap-1 max-w-full rounded border border-[var(--line-strong)] bg-[var(--panel-raised)] px-2 py-0.5 text-[10.5px] text-[var(--text)]"
                      >
                        <span className="truncate max-w-[190px]" title={file.name}>
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTxtLawFile(idx)}
                          disabled={txtLawLoading}
                          aria-label={`Remover ${file.name}`}
                          className="text-[var(--muted)] hover:text-[var(--bad)] disabled:opacity-50 shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(driveConnected || localFolderConnected) && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--muted)] px-0.5">
                  <span className="truncate">
                    {localFolderConnected && localFolderWritable ? (
                      <>
                        Pasta local: arquivos salvos em{' '}
                        <strong className="text-[var(--text)]">
                          {localFolderName || 'Pasta Local'} / Lei Seca
                        </strong>
                      </>
                    ) : driveTokenReady ? (
                      <>
                        Drive: arquivos originais salvos na íntegra em{' '}
                        <strong className="text-[var(--text)]">
                          {activeDriveFolderName} / Lei Seca
                        </strong>
                      </>
                    ) : (
                      <span className="text-[var(--warning)] font-semibold">
                        Sessão do Drive expirada — reconecte em Backup para enviar os arquivos à nuvem
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActivePage('Backup e Restauração')}
                    className="text-[11px] font-semibold text-[var(--accent)] hover:underline shrink-0"
                  >
                    Configurar pasta
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActivePage('Lei Seca')}
                  className="text-[11.5px] font-semibold text-[var(--accent)] hover:underline"
                >
                  Abrir Lei Seca ↗
                </button>
                <button type="submit" disabled={txtLawLoading} className={BTN_PRIMARY}>
                  <BookPlus className="w-3.5 h-3.5" />
                  {txtLawLoading
                    ? txtLawProgress
                      ? `Importando ${txtLawProgress}…`
                      : 'Importando…'
                    : txtLawFiles.length > 1
                      ? `Importar ${txtLawFiles.length} Leis TXT`
                      : 'Importar Lei TXT'}
                </button>
              </div>
            </form>

            <div className="mt-auto pt-2.5 border-t border-[var(--line)]/60">
              <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                <span className="text-[11px] font-bold text-[var(--text)] flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Modelo / Exemplo de Formato (.txt):
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleCopyLawSample()}
                    className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[var(--text)] hover:text-[var(--accent)] bg-[var(--panel-raised)] border border-[var(--line-strong)] px-2 py-0.5 rounded transition-colors"
                  >
                    {copiedModel ? <Check className="w-3 h-3 text-[var(--good)]" /> : <Copy className="w-3 h-3" />}
                    {copiedModel ? 'Copiado!' : 'Copiar'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadLawSample}
                    className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[var(--accent)] hover:underline bg-[var(--panel-raised)] border border-[var(--line-strong)] px-2 py-0.5 rounded transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Baixar .txt
                  </button>
                </div>
              </div>
              <div className="h-[116px] overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2 font-mono text-[10.5px] leading-snug text-[var(--muted)] whitespace-pre-wrap select-all">
                {sampleTxtLawTemplate}
              </div>
            </div>
          </CompactUtilCard>
        )}

        {!hideUpload && showSchedule && (
          <CompactUtilCard
            title="Importar cronograma (.txt)"
            subtitle="Importe seu planejamento semanal usando Dia | Matéria | Tempo [| Observações]."
            icon={<CalendarPlus className="w-4 h-4" />}
            badge=".TXT → Agenda"
          >
            <form onSubmit={handleImportSchedule} className="flex flex-col gap-2">
              <div>
                <label className={COMPACT_LABEL}>Arquivo .txt do cronograma</label>
                <input
                  ref={schedRef}
                  type="file"
                  accept=".txt"
                  onChange={(e) => setSchedFile(e.target.files?.[0] || null)}
                  className={COMPACT_INPUT}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActivePage('Cronograma')}
                  className="text-[11.5px] font-semibold text-[var(--accent)] hover:underline"
                >
                  Abrir Cronograma ↗
                </button>
                <button type="submit" disabled={schedLoading} className={BTN_SECONDARY}>
                  <CalendarPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                  {schedLoading ? 'Importando…' : 'Importar cronograma'}
                </button>
              </div>
            </form>

            <div className="mt-auto pt-2.5 border-t border-[var(--line)]/60">
              <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                <span className="text-[11px] font-bold text-[var(--text)] flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
                  Modelo / Exemplo de Formato (.txt):
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleCopyScheduleSample()}
                    className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[var(--text)] hover:text-[var(--accent)] bg-[var(--panel-raised)] border border-[var(--line-strong)] px-2 py-0.5 rounded transition-colors"
                  >
                    {copiedScheduleModel ? <Check className="w-3 h-3 text-[var(--good)]" /> : <Copy className="w-3 h-3" />}
                    {copiedScheduleModel ? 'Copiado!' : 'Copiar'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadScheduleSample}
                    className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[var(--accent)] hover:underline bg-[var(--panel-raised)] border border-[var(--line-strong)] px-2 py-0.5 rounded transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Baixar .txt
                  </button>
                </div>
              </div>
              <div className="h-[116px] overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2 font-mono text-[10.5px] leading-snug text-[var(--muted)] whitespace-pre-wrap select-all">
                {sampleScheduleTemplate}
              </div>
            </div>
          </CompactUtilCard>
        )}

        {showSchedule && (
          <CompactUtilCard
            title="Matéria Fixada (Monitor de Desempenho)"
            subtitle="Adicione novas matérias fixadas ou altere o nome de cada uma delas no Cronograma e Monitor."
            icon={<Bookmark className="w-4 h-4" />}
            badge={`${fixedSubjects.length} matéria(s)`}
          >
            <form onSubmit={handleAddFixedSubjectUtil} className="flex flex-wrap items-center gap-2 mb-2">
              <input
                type="text"
                value={newFixedSubject}
                onChange={(e) => setNewFixedSubject(e.target.value)}
                placeholder="Adicionar nova matéria fixada (ex.: Direito Eleitoral)..."
                aria-label="Nova matéria fixada"
                className={`${COMPACT_INPUT} flex-1 min-w-[190px]`}
              />
              <button type="submit" className={BTN_PRIMARY}>
                <PlusCircle className="w-3.5 h-3.5" />
                Adicionar
              </button>
            </form>

            {fixedSubjects.length > 6 && (
              <div className="mb-2">
                <input
                  type="text"
                  value={fixedFilter}
                  onChange={(e) => setFixedFilter(e.target.value)}
                  placeholder="Filtrar matérias fixadas..."
                  aria-label="Filtrar matérias fixadas"
                  className={COMPACT_INPUT}
                />
              </div>
            )}

            <div className="max-h-[210px] overflow-y-auto pr-1 flex flex-col gap-1.5">
              {fixedSubjects
                .filter(
                  (subj) =>
                    !fixedFilter.trim() ||
                    subj.toLowerCase().includes(fixedFilter.trim().toLowerCase()),
                )
                .map((subj) => {
                  const isEditing = editingFixedSubject === subj;
                  return (
                    <div
                      key={subj}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-1.5"
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <input
                            type="text"
                            value={editingFixedValue}
                            onChange={(e) => setEditingFixedValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveFixedRename(subj);
                              } else if (e.key === 'Escape') {
                                setEditingFixedSubject(null);
                                setEditingFixedValue('');
                              }
                            }}
                            autoFocus
                            aria-label={`Novo nome para ${subj}`}
                            className={`${COMPACT_INPUT} h-[28px] flex-1 min-w-0 font-semibold`}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveFixedRename(subj)}
                            title="Salvar novo nome"
                            className="inline-flex items-center gap-1 h-[28px] px-2.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] text-white text-[11px] font-bold hover:bg-[var(--accent-hover)] shrink-0"
                          >
                            <Check className="w-3 h-3" />
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFixedSubject(null);
                              setEditingFixedValue('');
                            }}
                            title="Cancelar edição"
                            aria-label="Cancelar edição"
                            className="grid place-items-center w-[28px] h-[28px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--muted)] hover:text-[var(--text)] shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Bookmark className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                            <span className="text-[12px] font-bold text-[var(--text)] truncate">
                              {subj}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleStartEditFixedSubject(subj)}
                              title={`Alterar nome de ${subj}`}
                              className="inline-flex items-center gap-1 h-[26px] px-2 rounded border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] whitespace-nowrap transition-colors"
                            >
                              <Pencil className="w-3 h-3 text-[var(--accent)]" />
                              Alterar
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFixedSubject(subj)}
                              title={`Remover ${subj} da lista`}
                              aria-label={`Remover ${subj}`}
                              className="inline-flex items-center gap-1 h-[26px] px-2 rounded border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              {fixedSubjects.filter(
                (subj) =>
                  !fixedFilter.trim() ||
                  subj.toLowerCase().includes(fixedFilter.trim().toLowerCase()),
              ).length === 0 && (
                <p className="m-0 text-[11.5px] text-[var(--muted)] py-3 text-center">
                  Nenhuma matéria fixada encontrada.
                </p>
              )}
            </div>

            <div className="mt-auto pt-2.5 border-t border-[var(--line)]/60 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setActivePage('Cronograma')}
                className="text-[11.5px] font-semibold text-[var(--accent)] hover:underline"
              >
                Abrir Cronograma ↗
              </button>
              <button
                type="button"
                onClick={() => setActivePage('Monitor de Desempenho')}
                className="text-[11.5px] font-semibold text-[var(--accent)] hover:underline"
              >
                Abrir Portal da Transparência ↗
              </button>
            </div>
          </CompactUtilCard>
        )}

        {/* === LEI SECA PDF & GERENCIAMENTO === */}
        {!hideUpload && showLaws && (
          <>
            <CompactUtilCard
              title="Converter legislação em PDF"
              subtitle="Extrai artigos, parágrafos e incisos do PDF para Lei Seca e Matriz de Incidência."
              icon={<Scale className="w-4 h-4" />}
              badge="PDF → Lei"
            >
              <form onSubmit={handleConvertLaw} className="flex-1 flex flex-col gap-2">
                <div>
                  <label className={COMPACT_LABEL}>PDF da legislação</label>
                  <input
                    ref={lawRef}
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setLawPdf(e.target.files?.[0] || null)}
                    className={COMPACT_INPUT}
                  />
                </div>
                <div>
                  <label className={COMPACT_LABEL}>Nome da pasta (ex.: Código_Civil)</label>
                  <input
                    type="text"
                    value={lawFolder}
                    onChange={(e) => setLawFolder(e.target.value)}
                    placeholder="Padrão: nome do arquivo PDF"
                    className={COMPACT_INPUT}
                  />
                </div>
                <div className="mt-auto pt-2.5 border-t border-[var(--line)]/50 flex justify-end">
                  <button type="submit" disabled={lawLoading} className={BTN_SECONDARY}>
                    <BookPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
                    {lawLoading ? 'Processando PDF…' : 'Converter PDF de lei'}
                  </button>
                </div>
              </form>
            </CompactUtilCard>

            <CompactUtilCard
              title="Gerenciar e Excluir Leis Cadastradas"
              subtitle="Visualize rapidamente ou remova legislações que não serão mais usadas."
              icon={<BookOpen className="w-4 h-4" />}
              badge={`${lawCount} lei(s)`}
            >
              {lawCount > 0 ? (
                <div className="max-h-[168px] overflow-y-auto pr-1 flex flex-col gap-1.5">
                  {Object.keys(db.laws)
                    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
                    .map((folder) => {
                      const lawData = db.laws[folder];
                      const itemCount = lawData.items?.length || 0;
                      const pdfCount = lawData.pdfs?.length || 0;

                      return (
                        <div
                          key={folder}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 py-2"
                        >
                          <div className="min-w-0">
                            <strong className="block text-[12px] font-bold text-[var(--text)] truncate">
                              {visibleName(folder)}
                            </strong>
                            <span className="block text-[10.5px] text-[var(--muted)]">
                              {itemCount} dispositivo(s)
                              {pdfCount > 0 ? ` · ${pdfCount} PDF(s)` : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {itemCount === 0 && pdfCount > 0 && (
                              <button
                                type="button"
                                disabled={reprocessingFolder === folder}
                                onClick={async () => {
                                  setReprocessingFolder(folder);
                                  try {
                                    await reprocessLawFolder(folder);
                                  } catch (err) {
                                    toast((err as Error).message, true);
                                  } finally {
                                    setReprocessingFolder(null);
                                  }
                                }}
                                className="inline-flex items-center gap-1 h-[26px] px-2 rounded border border-[var(--accent)]/60 bg-[var(--accent-soft)] text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-50 whitespace-nowrap"
                                title="Reprocessar arquivo anexado para extrair os artigos"
                              >
                                <RefreshCw className={`w-3 h-3 ${reprocessingFolder === folder ? 'animate-spin' : ''}`} />
                                {reprocessingFolder === folder ? 'Extraindo…' : 'Extrair'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setActivePage('Lei Seca')}
                              className="inline-flex items-center gap-1 h-[26px] px-2 rounded border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--text)] hover:border-[var(--accent)] whitespace-nowrap"
                            >
                              <BookOpen className="w-3 h-3 text-[var(--accent)]" />
                              Abrir
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteLawFolder(folder)}
                              className="inline-flex items-center gap-1 h-[26px] px-2 rounded border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--bad)] hover:border-[var(--bad)] whitespace-nowrap"
                            >
                              <Trash2 className="w-3 h-3" />
                              Excluir
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="m-0 text-[12px] text-[var(--muted)] py-4 text-center">
                  Nenhuma legislação cadastrada no momento.
                </p>
              )}
            </CompactUtilCard>
          </>
        )}
      </div>
    </div>
  );
};
