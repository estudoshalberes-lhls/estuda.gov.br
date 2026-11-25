export type ThemeId =
  | 'gov-padrao'
  | 'gov-escuro'
  | 'black-red'
  | 'black-blue'
  | 'black-pink'
  | 'baby-pink'
  | 'reading-comfort';

export type ModuleName =
  | 'Início'
  | 'Carreira & Mérito'
  | 'Treino Diário'
  | 'Simulado Fechado'
  | 'Simulados Realizados'
  | 'Monitor de Desempenho'
  | 'Discursiva'
  | 'Provas'
  | 'Caderno de Erros'
  | 'Súmulas e Jurisprudência'
  | 'Datas & Locais'
  | 'Editais'
  | 'Cronograma'
  | 'Metas Concluídas'
  | 'Metas Não Concluídas'
  | 'Lei Seca'
  | 'Matriz de Incidência'
  | 'PDFs Pessoais'
  | 'Resumos & Mapas'
  | 'Pontos Críticos'
  | 'Utilidades'
  | 'Backup e Restauração'
  | 'Configurações';

export type WeekdayName =
  | 'Segunda-feira'
  | 'Terça-feira'
  | 'Quarta-feira'
  | 'Quinta-feira'
  | 'Sexta-feira'
  | 'Sábado'
  | 'Domingo';

export type QuestionType = 'CE' | 'ME';

export interface QuestionAlternative {
  letra: string;
  texto: string;
}

export interface Question {
  id: string;
  numero?: number;
  materia: string;
  enunciado: string;
  alternativas: QuestionAlternative[];
  gabarito: string;
  comentario: string;
  tipo: QuestionType;
}

export interface SubmittedSimulation {
  id: string;
  titulo: string;
  materia: string;
  arquivo: string;
  data: string;
  criado_em: string;
  questoes: Question[];
}

export interface SimulationQuestionResult extends Question {
  numero: number;
  resposta: string;
  correta: boolean;
  tempo_segundos?: number;
}

export interface CompletedSimulation {
  id: string;
  prova_id: string;
  titulo: string;
  materia: string;
  arquivo: string;
  data: string;
  criado_em: string;
  tempo_segundos: number;
  total: number;
  acertos: number;
  erros: number;
  em_branco?: number;
  pontos_liquidos?: number;
  aproveitamento: number;
  banca?: string;
  questoes: SimulationQuestionResult[];
}

export interface HistoryRecord {
  id: string;
  date: string; // YYYY-MM-DD
  subject: string;
  correct: boolean;
}

export interface StudyTimeAllocation {
  subject: string;
  seconds: number;
  topicId?: string;
  topicLabel?: string;
  concursoAlvo?: string;
}

export interface StudyTimeRecord {
  quizId: string;
  day: WeekdayName;
  date: string; // YYYY-MM-DD
  source?: 'quiz' | 'schedule' | 'manual';
  recordedAt?: string;
  allocations: StudyTimeAllocation[];
}

export interface ActiveTimerLink {
  day: WeekdayName;
  topicId: string;
  materia: string;
  disciplinaFixa?: string;
  concursoAlvo?: string;
  tempoPrevisto?: string;
  observacoes?: string;
}

export interface ErrorNotebookQuestionDetail {
  enunciado: string;
  alternativas: QuestionAlternative[];
  resposta: string;
  gabarito: string;
  comentario: string;
}

export interface ErrorNotebookEntry {
  id: string;
  data: string; // DD/MM/YYYY
  materia: string;
  tipo: string;
  texto: string;
  corrigido?: boolean;
  corrigido_em?: string; // DD/MM/YYYY
  origem?: string;
  questao?: ErrorNotebookQuestionDetail;
  correcao_prova?: boolean;
  correcao_id?: string;
  tipo_arquivo?: 'provas' | 'provas-com-gabarito';
  banca?: string;
  arquivo_prova?: string;
  simulado_id?: string;
  simulado_titulo?: string;
  simulado_questao_numero?: number;
  proxima_revisao?: string; // YYYY-MM-DD
  nivel_revisao?: number;
  revisado_em?: string; // YYYY-MM-DD
}

export type ContentStudyStatus = 'a_ler' | 'em_leitura' | 'revisar' | 'dominado';

export type CaseLawVigencia = 'Vigente' | 'Superada' | 'Cancelada';

export interface ReadingQueueItem {
  id: string;
  kind: 'law' | 'summary' | 'caselaw' | 'pdf';
  title: string;
  subtitle?: string;
  folder?: string;
  itemId?: string;
  done?: boolean;
  addedAt: string;
}

export interface CaseLawItem {
  id: string;
  categoria: string;
  titulo: string;
  tribunal: string;
  identificador: string;
  fonte?: string;
  materia?: string;
  vigencia?: CaseLawVigencia;
  pinned?: boolean;
  studyStatus?: ContentStudyStatus;
  lastOpenedAt?: string;
  texto: string;
  criado_em: string;
  atualizado_em?: string;
}

export interface EditalLawLink {
  id: string;
  pastaLei: string;
  filtroArtigos: string;
  label?: string;
}

export interface ContestEditalPoint {
  id: string;
  materia: string;
  titulo: string;
  estudado: boolean;
  estudado_em?: string; // DD/MM/YYYY
  observacao?: string;
  artigos_vinculados?: EditalLawLink[];
}

export interface ContestItem {
  id: string;
  concurso: string;
  data_abertura: string;
  data_pagamento: string;
  status_pagamento: 'Pago' | 'Não Pago';
  local_prova: string;
  observacoes: string;
  edital_arquivo?: string;
  edital_pontos?: ContestEditalPoint[];
}

export interface ScheduleTopic {
  id: string;
  data: string; // DD/MM/YYYY
  data_personalizada?: boolean;
  disciplina_fixa?: string;
  concurso_alvo?: string;
  materia: string;
  tempo: string;
  observacoes: string;
  estudado_segundos?: number;
  editalContestId?: string;
  editalPointId?: string;
}

export type ScheduleMap = Record<WeekdayName, ScheduleTopic[]>;

export interface CompletedGoal {
  id: string;
  data: string;
  dia_semana: string;
  materia: string;
  tempo: string;
  observacoes: string;
  disciplina_fixa?: string;
  concurso_alvo?: string;
  topicId?: string;
  studyRecordId?: string;
  estudado_segundos?: number;
  editalContestId?: string;
  editalPointId?: string;
}

export interface IncompleteGoal {
  id: string;
  data: string;
  dia_semana: string;
  materia: string;
  tempo: string;
  observacoes: string;
  arquivado_em: string;
  disciplina_fixa?: string;
  concurso_alvo?: string;
  topicId?: string;
  estudado_segundos?: number;
  editalContestId?: string;
  editalPointId?: string;
}

export interface TopicSpacedReview {
  id: string;
  subject: string;
  topic: string;
  source: 'schedule' | 'edital';
  sourceId?: string;
  contestId?: string;
  contestName?: string;
  completedAt: string; // DD/MM/YYYY
  nextReviewIso: string; // YYYY-MM-DD
  stageIndex: number; // 0 = 24h (1d), 1 = 7d, 2 = 15d, 3 = 30d
  lastReviewedIso?: string;
  done?: boolean;
}

export type IncidenceGrade =
  | 'Não Classificado'
  | 'Muito Alto'
  | 'Alto'
  | 'Médio'
  | 'Baixo';

export interface LawItem {
  id: string;
  arquivo: string;
  dispositivo: string;
  grau: IncidenceGrade;
  texto: string;
  dica: string;
  observacao: string;
  artigo_base: string;
  tipo_dispositivo: string;
  leituras?: LawReadingEntry[];
}

export interface LawPdfEntry {
  id: string;
  name: string;
  size: number;
  blobKey: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LawFolderData {
  name: string;
  items: LawItem[];
  pdfs: LawPdfEntry[];
}

export type HighlightColorKey = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';

export interface LawHighlight {
  id?: string;
  text: string;
  color: HighlightColorKey;
  itemId?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface LawReadingEntry {
  id: string;
  data: string; // YYYY-MM-DD
  observacao?: string;
}

export type PdfAnnotationColor = 'yellow' | 'green' | 'blue' | 'pink' | 'red';

export interface PdfInkStroke {
  id: string;
  page: number;
  tool: 'pen' | 'highlighter';
  color: PdfAnnotationColor;
  width: number;
  points: number[]; // interleaved [x0, y0, x1, y1, ...] normalized 0..1
  createdAt: string;
}

export interface PdfTextNote {
  id: string;
  page: number;
  x: number;
  y: number;
  text: string;
  color: PdfAnnotationColor;
  createdAt: string;
}

export interface PdfFileAnnotations {
  strokes: PdfInkStroke[];
  notes: PdfTextNote[];
  updatedAt: string;
  lastBakedAt?: string;
}

export interface PersonalPdfFile {
  id: string;
  name: string;
  size: number;
  blobKey: string;
  createdAt: string;
  updatedAt?: string;
  hasAnnotations?: boolean;
  pinned?: boolean;
  studyStatus?: ContentStudyStatus;
  subtopic?: string;
  lastOpenedAt?: string;
}

export type SummaryItemKind = 'note' | 'pdf' | 'mindmap' | 'image';

export type BuiltInMindMapNodeTag = 'lei' | 'sumula' | 'excecao' | 'prazo' | 'pegadinha' | 'dica';
export type MindMapNodeTag = BuiltInMindMapNodeTag | (string & {});

export interface MindMapCustomTag {
  id: string;
  label: string;
  short: string;
  color: string;
  bg: string;
}

export type MindMapLayoutMode = 'bilateral' | 'horizontal' | 'vertical';
export type MindMapDirection = 'right' | 'left' | 'up' | 'down';
export type MindMapEdgeStyle = 'curved' | 'orthogonal';
export type MindMapThemeId =
  | 'padrao'
  | 'institucional'
  | 'papel-creme'
  | 'noturno-slate'
  | 'lousa-verde'
  | 'blueprint'
  | 'alto-contraste';

export interface MindMapNode {
  id: string;
  label: string;
  note?: string;
  color?: string;
  bgColor?: string;
  tag?: MindMapNodeTag | '';
  customTags?: MindMapCustomTag[];
  collapsed?: boolean;
  layout?: MindMapLayoutMode;
  edgeStyle?: MindMapEdgeStyle;
  themeId?: MindMapThemeId;
  canvasBg?: string;
  direction?: MindMapDirection;
  offsetX?: number;
  offsetY?: number;
  children: MindMapNode[];
}

export interface SummaryFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  blobKey: string;
  createdAt: string;
  updatedAt?: string;
  kind?: SummaryItemKind;
  title?: string;
  content?: string;
  contentHtml?: string;
  tags?: string[];
  subtopic?: string;
  pinned?: boolean;
  studyStatus?: ContentStudyStatus;
  lastOpenedAt?: string;
  mindMap?: MindMapNode;
}

export interface ProofCorrection {
  id: string;
  questao: string;
  observacoes: string;
  materia?: string;
  tipo?: string;
  texto?: string;
  corrigido?: boolean;
  corrigido_em?: string;
  proxima_revisao?: string;
  nivel_revisao?: number;
  revisado_em?: string;
  criado_em: string;
  atualizado_em?: string;
}

export interface ProofFileRecord {
  id: string;
  name: string;
  size: number;
  bank: string;
  kind: 'provas' | 'provas-com-gabarito';
  blobKey: string;
  gabarito_arquivo?: string;
  gabarito_conteudo?: string;
  gabarito_questoes: number;
  observacoes: string;
  correcoes: ProofCorrection[];
  createdAt: string;
  updatedAt?: string;
}

export type EssayType =
  | 'Dissertação'
  | 'Estudo de Caso'
  | 'Questão Discursiva'
  | 'Peça / Parecer';

export type EssayRubricMode = 'cebraspe' | 'criteria' | 'simple';

export interface EssayRubricScores {
  mode: EssayRubricMode;
  notaMaxima: number;
  notaConteudo?: number;
  notaEstrutura?: number;
  notaGramatica?: number;
  numErrosGramaticais?: number;
  totalLinhas?: number;
  notaFinal: number;
}

export interface EssayRewriteVersion {
  texto?: string;
  arquivo?: string;
  blobKey?: string;
  mime?: string;
  notaFinal?: number;
  linhas?: number;
  linhas_escritas?: number;
  observacoes?: string;
  atualizada_em: string;
}

export interface EssayRecord {
  id: string;
  titulo: string;
  data: string;
  created_at: string;
  updatedAt?: string;
  banca?: string;
  tipo?: EssayType;
  disciplina?: string;
  proposta?: string;
  espelho?: string;
  texto_original?: string;
  limite_linhas?: number;
  linhas_escritas?: number;
  tempo_segundos?: number;
  original_arquivo: string;
  original_blobKey: string;
  original_mime: string;
  corrigido_arquivo: string;
  corrigido_blobKey?: string;
  corrigido_mime?: string;
  feedback: string;
  rubrica?: EssayRubricScores;
  erros_tags?: string[];
  reescrita?: EssayRewriteVersion;
  corrigida_em?: string;
}

export interface CriticalPoint {
  id: string;
  data: string;
  materia: string;
  titulo: string;
  texto: string;
}

export interface ModuleVisibility {
  hide_upload: boolean;
  hide_search: boolean;
}

export interface DefaultDriveFolderPreference {
  id: string | null;
  name: string;
  url?: string;
  updatedAt?: string;
}

export interface CareerMeta {
  pinned_medals?: string[];
  unlocked_at?: Record<string, string>;
  completed_weekly_missions?: Record<string, string>;
  last_notified_level?: number;
  last_notified_medals?: string[];
}

export interface StudyCycleItem {
  id: string;
  subject: string;
  targetMinutes: number;
  contest?: string;
  notes?: string;
  completedMinutes: number;
  completions: number;
  lastStudiedAt?: string;
}

export interface StudyCycleConfig {
  activeIndex: number;
  completedCycles: number;
  items: StudyCycleItem[];
}

export interface FlashcardSrsState {
  level: number;
  nextReviewIso: string;
  lastReviewedIso: string;
  reviews: number;
}

export interface DailyPushNotificationPrefs {
  enabled: boolean;
  reminderTimes: string[]; // HH:mm in 24h format, e.g. ['09:00', '14:00', '20:00']
  alertDailyHoursGoal: boolean;
  alertDailyQuestionsGoal: boolean;
  alertDueReviews: boolean;
  alertGoalAchieved: boolean;
  alertExamCountdown: boolean;
  quietHoursStart?: string; // HH:mm, e.g. '22:30'
  quietHoursEnd?: string; // HH:mm, e.g. '07:00'
  pushEndpoint?: string;
}

export interface AppPreferences {
  tema: ThemeId;
  modules_top: boolean;
  sidebar_hidden: boolean;
  fullscreen: boolean;
  whiteboard_enabled: boolean;
  modules: Record<string, ModuleVisibility>;
  quick_access_modules?: ModuleName[];
  default_drive_folder?: DefaultDriveFolderPreference;
  career_meta?: CareerMeta;
  daily_hours_goal?: number;
  weekly_hours_goal?: number;
  daily_questions_goal?: number;
  weekly_subject_hours?: Record<string, number>;
  final_review_margin_days?: number;
  target_exam_contest_id?: string;
  pomodoro_focus_minutes?: number;
  pomodoro_break_minutes?: number;
  pomodoro_auto_commit?: boolean;
  flashcard_srs?: Record<string, FlashcardSrsState>;
  push_notifications?: DailyPushNotificationPrefs;
  reading_queue?: ReadingQueueItem[];
}

export interface QuizAnswer {
  resposta: string;
  correta?: boolean;
  gabarito?: string;
  tipo: QuestionType;
  pending?: boolean;
}

export interface QuizSession {
  id: string;
  kind: 'training' | 'simulation';
  submittedSimulationId?: string;
  titulo?: string;
  materia?: string;
  questions: Question[];
  index: number;
  answers: Array<QuizAnswer | undefined>;
  studySeconds: number;
  timerBaseline: number;
  startedAt?: number;
  elapsedSeconds?: number;
  timeLimitSeconds?: number;
  questionTimesSeconds?: number[];
  questionEnteredAt?: number;
  banca?: string;
  completed?: boolean;
  savedResult?: CompletedSimulation;
  studyTimeRecorded?: boolean;
  studyTimeError?: string;
  resultSaveError?: string;
}

export interface ToastMessage {
  id: string;
  message: string;
  isError: boolean;
}

export interface WeeklyScheduleFileRecord {
  weekKey: string; // e.g. '2026-W46'
  label: string; // e.g. 'Semana 46/2026 (09/11/2026 a 15/11/2026)'
  fileName: string; // e.g. 'CRONOGRAMA - Semana 46-2026 (09-11-2026 a 15-11-2026).txt'
  updatedAt: string;
  blobKey?: string;
  schedule: ScheduleMap;
  scheduleDayDates: Partial<Record<WeekdayName, string>>;
}

export interface SavedIncidenceFilter {
  id: string;
  nome: string;
  pastaLei: string;
  gradeFilter: 'Todas' | IncidenceGrade;
  readStatusFilter: 'all' | 'stale-7' | 'stale-15' | 'stale-30' | 'today';
  editalContestId?: string;
  multiArticleQuery: string;
  selectedArticleKeys: string[];
  search: string;
  criado_em: string;
}

export interface StudyDatabase {
  questions: Question[];
  submittedSimulations: SubmittedSimulation[];
  completedSimulations: CompletedSimulation[];
  history: HistoryRecord[];
  studyTimeRecords: StudyTimeRecord[];
  annotations: ErrorNotebookEntry[];
  caseLaw: CaseLawItem[];
  contests: ContestItem[];
  schedule: ScheduleMap;
  scheduleDayDates?: Partial<Record<WeekdayName, string>>;
  weeklySchedules?: Record<string, WeeklyScheduleFileRecord>;
  studyCycle?: StudyCycleConfig;
  completedGoals: CompletedGoal[];
  incompleteGoals: IncompleteGoal[];
  topicReviews?: TopicSpacedReview[];
  weeklyGoalNotes: Record<string, string>;
  laws: Record<string, LawFolderData>;
  lawHighlights: Record<string, LawHighlight[]>;
  readLawItems?: Record<string, string[]>;
  lawReadDates?: Record<string, LawReadingEntry[]>;
  savedIncidenceFilters?: SavedIncidenceFilter[];
  lawLastReadPosition?: Record<string, string>;
  lawNotes?: Record<string, string>;
  fixedSubjects?: string[];
  pdfFolders: Record<string, PersonalPdfFile[]>;
  pdfAnnotations?: Record<string, PdfFileAnnotations>;
  summaryFolders: Record<string, SummaryFile[]>;
  proofBanks: string[];
  proofFiles: ProofFileRecord[];
  essays: EssayRecord[];
  criticalPoints: CriticalPoint[];
  phrases: string[];
  preferences: AppPreferences;
  deletedTombstones?: Record<string, number>;
}

export type PomodoroMode = 'continuous' | '25-5' | '50-10' | '45-10' | 'custom';

export interface RestoreProgress {
  current: number;
  total: number;
  label: string;
}
