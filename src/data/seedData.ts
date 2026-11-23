import { buildSamplePdfBlob } from '../lib/pdfExport';
import { getFileBlob, saveFileBlob } from '../lib/fileStorage';
import { getCurrentWeekDates, localDateIso, localDateBrazilian, weekStartIso } from '../lib/parsers';
import {
  AppPreferences,
  CompletedGoal,
  HistoryRecord,
  ModuleName,
  StudyDatabase,
  StudyTimeRecord,
  ThemeId,
} from '../types/study';

export const MODULES: ReadonlyArray<{ name: ModuleName; icon: string }> = [
  { name: 'Início', icon: 'home' },
  { name: 'Carreira & Mérito', icon: 'award' },
  { name: 'Treino Diário', icon: 'target' },
  { name: 'Simulado Fechado', icon: 'clipboard' },
  { name: 'Simulados Realizados', icon: 'chart' },
  { name: 'Monitor de Desempenho', icon: 'activity' },
  { name: 'Discursiva', icon: 'pen' },
  { name: 'Provas', icon: 'file' },
  { name: 'Caderno de Erros', icon: 'search' },
  { name: 'Súmulas e Jurisprudência', icon: 'bookmark' },
  { name: 'Datas & Locais', icon: 'pin' },
  { name: 'Editais', icon: 'checklist' },
  { name: 'Cronograma', icon: 'calendar' },
  { name: 'Metas Concluídas', icon: 'check' },
  { name: 'Metas Não Concluídas', icon: 'clock' },
  { name: 'Lei Seca', icon: 'book' },
  { name: 'Matriz de Incidência', icon: 'scale' },
  { name: 'PDFs Pessoais', icon: 'folder' },
  { name: 'Resumos & Mapas', icon: 'library' },
  { name: 'Pontos Críticos', icon: 'sparkles' },
  { name: 'Utilidades', icon: 'tools' },
  { name: 'Backup e Restauração', icon: 'database' },
  { name: 'Configurações', icon: 'settings' },
];

export const GOV_MODULE_LABELS: Record<ModuleName, string> = {
  'Início': 'Meu Cadastro (Início)',
  'Carreira & Mérito': 'Carreira & Medalhas',
  'Monitor de Desempenho': 'Portal da Transparência',
  'Treino Diário': 'Banco Oficial de Questões',
  'Simulado Fechado': 'Prova Lacrada (Simulado)',
  'Simulados Realizados': 'Boletim de Ocorrências',
  'Discursiva': 'Ofício & Discursiva',
  'Provas': 'Arquivo Nacional de Provas',
  'Caderno de Erros': 'Ouvidoria (Erros)',
  'Súmulas e Jurisprudência': 'Corte Superior (Súmulas)',
  'Datas & Locais': 'Protocolo & GRUs',
  'Editais': 'Diário de Editais',
  'Cronograma': 'Expediente (Cronograma)',
  'Metas Concluídas': 'Atestado de Cumprimento',
  'Metas Não Concluídas': 'Dívida Ativa (Pendências)',
  'Lei Seca': 'Diário Oficial (Lei Seca)',
  'Matriz de Incidência': 'Censo de Incidência',
  'PDFs Pessoais': 'Acervo de Apostilas',
  'Resumos & Mapas': 'Dossiê de Resumos',
  'Pontos Críticos': 'Alertas Ministeriais',
  'Utilidades': 'Balcão de Protocolo',
  'Backup e Restauração': 'Guarda Permanente',
  'Configurações': 'Preferências do Portal',
};

export function getGovModuleLabel(name: ModuleName): string {
  return GOV_MODULE_LABELS[name] || name;
}

export const THEMES: ReadonlyArray<{
  id: ThemeId;
  name: string;
  description: string;
  colors: [string, string, string];
}> = [
  {
    id: 'gov-padrao',
    name: 'Portal Federal (Padrão)',
    description: 'Visual institucional claro inspirado no portal oficial do estudante federal.',
    colors: ['#f8f9fa', '#071d41', '#1351b4'],
  },
  {
    id: 'gov-escuro',
    name: 'Alto Contraste Federal',
    description: 'Modo escuro institucional de alto contraste para leitura noturna.',
    colors: ['#070d19', '#111c33', '#60a5fa'],
  },
  {
    id: 'black-red',
    name: 'Preto e vermelho',
    description: 'Preto profundo com detalhes vermelhos.',
    colors: ['#070707', '#101010', '#e11d2e'],
  },
  {
    id: 'black-blue',
    name: 'Preto e azul',
    description: 'Preto profundo com detalhes azuis.',
    colors: ['#070707', '#101010', '#3185ee'],
  },
  {
    id: 'black-pink',
    name: 'Preto e rosa',
    description: 'Preto profundo com detalhes em rosa vibrante.',
    colors: ['#070707', '#101010', '#ec4899'],
  },
  {
    id: 'baby-pink',
    name: 'Rosa bebê',
    description: 'Tons claros, suaves e acolhedores.',
    colors: ['#fff7fb', '#ffffff', '#d65b91'],
  },
  {
    id: 'reading-comfort',
    name: 'Leitura Confortável',
    description: 'Papel sépia antirreflexo e contraste suave para longas sessões de estudo sem cansar a vista.',
    colors: ['#efe9dc', '#f6f1e6', '#2d6a5a'],
  },
];

export const DEFAULT_PREFERENCES: AppPreferences = {
  tema: 'gov-padrao',
  modules_top: false,
  sidebar_hidden: false,
  fullscreen: false,
  whiteboard_enabled: true,
  modules: {},
  quick_access_modules: ['Cronograma', 'Lei Seca', 'Matriz de Incidência'],
};

function offsetDateIso(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return localDateIso(d);
}

function offsetDateBr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return localDateBrazilian(d);
}

function futureDateIso(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return localDateIso(d);
}

export function createInitialDatabase(): StudyDatabase {
  const todayBr = localDateBrazilian();
  const mondayIso = weekStartIso();

  const history: HistoryRecord[] = [
    { id: 'h-1', date: offsetDateIso(6), subject: 'Direito Constitucional', correct: true },
    { id: 'h-2', date: offsetDateIso(6), subject: 'Direito Constitucional', correct: true },
    { id: 'h-3', date: offsetDateIso(6), subject: 'Direito Administrativo', correct: false },
    { id: 'h-4', date: offsetDateIso(5), subject: 'Língua Portuguesa', correct: true },
    { id: 'h-5', date: offsetDateIso(5), subject: 'Língua Portuguesa', correct: true },
    { id: 'h-6', date: offsetDateIso(5), subject: 'Raciocínio Lógico', correct: false },
    { id: 'h-7', date: offsetDateIso(4), subject: 'Direito Constitucional', correct: true },
    { id: 'h-8', date: offsetDateIso(4), subject: 'Direito Penal', correct: true },
    { id: 'h-9', date: offsetDateIso(3), subject: 'Direito Administrativo', correct: true },
    { id: 'h-10', date: offsetDateIso(3), subject: 'Direito Administrativo', correct: true },
    { id: 'h-11', date: offsetDateIso(2), subject: 'Língua Portuguesa', correct: false },
    { id: 'h-12', date: offsetDateIso(2), subject: 'Raciocínio Lógico', correct: true },
    { id: 'h-13', date: offsetDateIso(1), subject: 'Direito Penal', correct: true },
    { id: 'h-14', date: offsetDateIso(1), subject: 'Direito Constitucional', correct: true },
    { id: 'h-15', date: offsetDateIso(0), subject: 'Direito Administrativo', correct: true },
    { id: 'h-16', date: offsetDateIso(0), subject: 'Direito Constitucional', correct: false },
  ];

  const studyTimeRecords: StudyTimeRecord[] = [
    {
      quizId: 'seed-quiz-1',
      day: 'Segunda-feira',
      date: offsetDateIso(5),
      allocations: [
        { subject: 'Direito Constitucional', seconds: 1620 },
        { subject: 'Língua Portuguesa', seconds: 1140 },
      ],
    },
    {
      quizId: 'seed-quiz-2',
      day: 'Quarta-feira',
      date: offsetDateIso(3),
      allocations: [
        { subject: 'Direito Administrativo', seconds: 1980 },
        { subject: 'Raciocínio Lógico', seconds: 920 },
      ],
    },
    {
      quizId: 'seed-quiz-3',
      day: 'Sexta-feira',
      date: offsetDateIso(1),
      allocations: [
        { subject: 'Direito Penal', seconds: 1450 },
        { subject: 'Direito Constitucional', seconds: 1120 },
      ],
    },
  ];

  const completedGoals: CompletedGoal[] = [
    {
      id: 'cg-1',
      data: offsetDateBr(2),
      dia_semana: 'Quarta-feira',
      materia: 'Direito Constitucional',
      tempo: '1h 30min',
      observacoes: 'Leitura completa do Art. 5º e resolução de 20 questões de direitos fundamentais.',
    },
    {
      id: 'cg-2',
      data: offsetDateBr(1),
      dia_semana: 'Quinta-feira',
      materia: 'Direito Administrativo',
      tempo: '1h 15min',
      observacoes: 'Revisão dos poderes administrativos e atos vinculados x discricionários.',
    },
  ];

  return {
    questions: [
      {
        id: 'q-const-1',
        materia: 'Direito Constitucional',
        enunciado:
          'Nos termos da Constituição Federal, a casa é asilo inviolável do indivíduo, ninguém nela podendo penetrar sem consentimento do morador, salvo em caso de flagrante delito ou desastre, ou para prestar socorro, ou, durante o dia, por determinação judicial.',
        alternativas: [],
        gabarito: 'C',
        comentario: 'Art. 5º, XI, da CF/88. A determinação judicial só autoriza o ingresso durante o dia.',
        tipo: 'CE',
      },
      {
        id: 'q-const-2',
        materia: 'Direito Constitucional',
        enunciado:
          'O mandado de segurança coletivo pode ser impetrado por entidade de classe legalmente constituída e em funcionamento há pelo menos dois anos, em defesa dos interesses de seus membros.',
        alternativas: [],
        gabarito: 'E',
        comentario:
          'Art. 5º, LXX, "b", da CF/88: exige-se constituição e funcionamento há pelo menos UM ano (e não dois anos).',
        tipo: 'CE',
      },
      {
        id: 'q-const-3',
        materia: 'Direito Constitucional',
        enunciado: 'Qual das seguintes opções NÃO configura remédio constitucional previsto expressamente no artigo 5º da Constituição Federal?',
        alternativas: [
          { letra: 'A', texto: 'Habeas corpus' },
          { letra: 'B', texto: 'Mandado de injunção' },
          { letra: 'C', texto: 'Ação direta de inconstitucionalidade' },
          { letra: 'D', texto: 'Habeas data' },
          { letra: 'E', texto: 'Ação popular' },
        ],
        gabarito: 'C',
        comentario: 'A ADI pertence ao controle concentrado de constitucionalidade (Art. 102 e 103 CF), não integrando os remédios individuais do Art. 5º.',
        tipo: 'ME',
      },
      {
        id: 'q-const-4',
        materia: 'Direito Constitucional',
        enunciado: 'Sobre a Administração Pública na CF/88 (art. 37), são princípios constitucionais expressos no caput:',
        alternativas: [
          { letra: 'A', texto: 'Legalidade, impessoalidade, moralidade, publicidade e eficiência.' },
          { letra: 'B', texto: 'Legalidade, razoabilidade, proporcionalidade, motivação e segurança jurídica.' },
          { letra: 'C', texto: 'Autotutela, supremacia do interesse público, publicidade e economicidade.' },
          { letra: 'D', texto: 'Impessoalidade, continuidade do serviço público, eficiência e moralidade.' },
          { letra: 'E', texto: 'Legalidade estrita, sigilo, moralidade administrativa e probidade.' },
        ],
        gabarito: 'A',
        comentario: 'Mnemônico LIMPE (Art. 37, caput, da CF/88): Legalidade, Impessoalidade, Moralidade, Publicidade e Eficiência.',
        tipo: 'ME',
      },
      {
        id: 'q-adm-1',
        materia: 'Direito Administrativo',
        enunciado:
          'A Administração pode anular seus próprios atos, quando eivados de vícios que os tornam ilegais, porque deles não se originam direitos; ou revogá-los, por motivo de conveniência ou oportunidade, respeitados os direitos adquiridos.',
        alternativas: [],
        gabarito: 'C',
        comentario: 'Texto literal da Súmula 473 do STF, expressão máxima do princípio da autotutela administrativa.',
        tipo: 'CE',
      },
      {
        id: 'q-adm-2',
        materia: 'Direito Administrativo',
        enunciado:
          'A revogação de um ato administrativo produz efeitos retroativos (ex tunc), alcançando a data da edição do ato originário.',
        alternativas: [],
        gabarito: 'E',
        comentario: 'A revogação opera efeitos ex nunc (prospectivos, não retroativos). Quem produz efeitos ex tunc é a anulação.',
        tipo: 'CE',
      },
      {
        id: 'q-adm-3',
        materia: 'Direito Administrativo',
        enunciado: 'Entre os atributos do ato administrativo, aquele pelo qual a Administração pode executar diretamente seus atos sem prévia autorização judicial denomina-se:',
        alternativas: [
          { letra: 'A', texto: 'Presunção de legitimidade' },
          { letra: 'B', texto: 'Imperatividade' },
          { letra: 'C', texto: 'Autoexecutoriedade' },
          { letra: 'D', texto: 'Tipicidade' },
          { letra: 'E', texto: 'Vinculação' },
        ],
        gabarito: 'C',
        comentario: 'Autoexecutoriedade é a prerrogativa de pôr em execução imediata os atos administrativos independentemente de intervenção do Judiciário.',
        tipo: 'ME',
      },
      {
        id: 'q-adm-4',
        materia: 'Direito Administrativo',
        enunciado: 'Nos termos da Lei nº 8.112/1990, NÃO constitui forma de provimento de cargo público:',
        alternativas: [
          { letra: 'A', texto: 'Nomeação' },
          { letra: 'B', texto: 'Readaptação' },
          { letra: 'C', texto: 'Reversão' },
          { letra: 'D', texto: 'Ascensão' },
          { letra: 'E', texto: 'Recondução' },
        ],
        gabarito: 'D',
        comentario: 'A ascensão e a transferência foram revogadas pela Lei 9.527/97 e declaradas inconstitucionais pelo STF por violarem a exigência de concurso público.',
        tipo: 'ME',
      },
      {
        id: 'q-port-1',
        materia: 'Língua Portuguesa',
        enunciado:
          'No período "Entregaram o documento à diretora logo após a reunião", o emprego do acento grave indicativo de crase é facultativo.',
        alternativas: [],
        gabarito: 'E',
        comentario:
          'O verbo entregar exige objeto indireto com preposição "a", e "diretora" é substantivo feminino determinado por artigo "a". A crase é obrigatória.',
        tipo: 'CE',
      },
      {
        id: 'q-port-2',
        materia: 'Língua Portuguesa',
        enunciado: 'Assinale a alternativa em que a concordância verbal está inteiramente de acordo com a norma-padrão:',
        alternativas: [
          { letra: 'A', texto: 'Fazem dois anos que iniciei a preparação para o concurso.' },
          { letra: 'B', texto: 'Aluga-se salas comerciais no centro da cidade.' },
          { letra: 'C', texto: 'Mais de um candidato entregou a prova antes do horário.' },
          { letra: 'D', texto: 'Houveram vários recursos contra o gabarito preliminar.' },
          { letra: 'E', texto: 'Vende-se imóveis residenciais com financiamento.' },
        ],
        gabarito: 'C',
        comentario: 'A expressão "mais de um" leva o verbo para o singular. "Fazer" (tempo) e "Haver" (existir) são impessoais; na voz passiva sintética, "alugam-se" e "vendem-se" concordam com o sujeito plural.',
        tipo: 'ME',
      },
      {
        id: 'q-port-3',
        materia: 'Língua Portuguesa',
        enunciado: 'Na oração "Os servidores mantiveram a calma durante a audiência", o sujeito da oração é simples e o predicado é verbal.',
        alternativas: [],
        gabarito: 'C',
        comentario: '"Os servidores" possui apenas um núcleo ("servidores" -> sujeito simples) e "mantiveram" é verbo significativo transitivo direto -> predicado verbal.',
        tipo: 'CE',
      },
      {
        id: 'q-rlm-1',
        materia: 'Raciocínio Lógico',
        enunciado:
          'A negação lógica da proposição composta "O edital foi publicado e as inscrições estão abertas" é equivalente a "O edital não foi publicado ou as inscrições não estão abertas".',
        alternativas: [],
        gabarito: 'C',
        comentario: 'Primeira Lei de De Morgan: ¬(P ∧ Q) ⇔ (¬P ∨ ¬Q). Nega-se ambas as proposições e troca-se o conectivo E pelo OU.',
        tipo: 'CE',
      },
      {
        id: 'q-rlm-2',
        materia: 'Raciocínio Lógico',
        enunciado: 'A proposição condicional "Se estuda com método, então evolui nos simulados" é logicamente equivalente a:',
        alternativas: [
          { letra: 'A', texto: 'Se não estuda com método, então não evolui nos simulados.' },
          { letra: 'B', texto: 'Estuda com método e não evolui nos simulados.' },
          { letra: 'C', texto: 'Se não evolui nos simulados, então não estuda com método.' },
          { letra: 'D', texto: 'Evolui nos simulados se, e somente se, estuda com método.' },
          { letra: 'E', texto: 'Não estuda com método e evolui nos simulados.' },
        ],
        gabarito: 'C',
        comentario: 'Equivalência da contrapositiva: (P → Q) ⇔ (¬Q → ¬P).',
        tipo: 'ME',
      },
      {
        id: 'q-pen-1',
        materia: 'Direito Penal',
        enunciado:
          'A lei penal mais grave aplica-se ao crime continuado ou ao crime permanente, se a sua vigência é anterior à cessação da continuidade ou da permanência.',
        alternativas: [],
        gabarito: 'C',
        comentario: 'Enunciado literal da Súmula 711 do STF.',
        tipo: 'CE',
      },
      {
        id: 'q-pen-2',
        materia: 'Direito Penal',
        enunciado: 'Em relação ao tempo e ao lugar do crime, o Código Penal brasileiro adotou, respectivamente, as teorias:',
        alternativas: [
          { letra: 'A', texto: 'Do resultado e da atividade.' },
          { letra: 'B', texto: 'Da ubiquidade e da atividade.' },
          { letra: 'C', texto: 'Da atividade e da ubiquidade.' },
          { letra: 'D', texto: 'Da atividade e do resultado.' },
          { letra: 'E', texto: 'Mista e do resultado.' },
        ],
        gabarito: 'C',
        comentario: 'Mnemônico LUTA: Lugar do crime = Ubiquidade (art. 6º CP); Tempo do crime = Atividade (art. 4º CP).',
        tipo: 'ME',
      },
    ],
    submittedSimulations: [
      {
        id: 'f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6',
        titulo: 'Simulado Básico · Constitucional e Administrativo',
        materia: 'Direito Público',
        arquivo: 'simulado_direito_publico_cebraspe.txt',
        data: offsetDateBr(3) + ' 19:30',
        criado_em: offsetDateIso(3) + 'T19:30:00',
        questoes: [
          {
            id: 'sim-q-1',
            numero: 1,
            materia: 'Direito Público',
            enunciado: 'A eficiência foi inserida expressamente entre os princípios da Administração Pública pela Emenda Constitucional nº 19/1998.',
            alternativas: [],
            gabarito: 'C',
            comentario: 'Correto. A EC 19/98 (Reforma Administrativa) incluiu a eficiência no art. 37, caput, da CF/88.',
            tipo: 'CE',
          },
          {
            id: 'sim-q-2',
            numero: 2,
            materia: 'Direito Público',
            enunciado: 'O prazo decadencial para impetração de mandado de segurança individual é de 180 dias contados da ciência do ato impugnado.',
            alternativas: [],
            gabarito: 'E',
            comentario: 'Errado. Nos termos do art. 23 da Lei 12.016/2009, o prazo decadencial é de 120 dias.',
            tipo: 'CE',
          },
          {
            id: 'sim-q-3',
            numero: 3,
            materia: 'Direito Público',
            enunciado: 'Qual órgão é competente para o julgamento de mandado de segurança contra ato do Presidente da República?',
            alternativas: [
              { letra: 'A', texto: 'Superior Tribunal de Justiça' },
              { letra: 'B', texto: 'Supremo Tribunal Federal' },
              { letra: 'C', texto: 'Tribunal Regional Federal da 1ª Região' },
              { letra: 'D', texto: 'Juízo Federal de Primeiro Grau' },
              { letra: 'E', texto: 'Tribunal de Contas da União' },
            ],
            gabarito: 'B',
            comentario: 'Art. 102, I, "d", da CF/88: compete originariamente ao STF julgar mandado de segurança contra atos do Presidente da República.',
            tipo: 'ME',
          },
        ],
      },
    ],
    completedSimulations: [
      {
        id: '11111111-2222-3333-4444-555555555555',
        prova_id: 'montado',
        titulo: `Montado por disciplinas - ${offsetDateBr(4)}`,
        materia: 'Geral',
        arquivo: '',
        data: `${offsetDateBr(4)} 20:15`,
        criado_em: `${offsetDateIso(4)}T20:15:00`,
        tempo_segundos: 742,
        total: 4,
        acertos: 3,
        erros: 1,
        aproveitamento: 75,
        questoes: [
          {
            numero: 1,
            id: 'q-const-1',
            materia: 'Direito Constitucional',
            enunciado: 'A casa é asilo inviolável do indivíduo, podendo haver ingresso por ordem judicial a qualquer hora do dia ou da noite.',
            alternativas: [],
            tipo: 'CE',
            resposta: 'E',
            gabarito: 'E',
            correta: true,
            comentario: 'Por determinação judicial, somente durante o dia (art. 5º, XI, CF/88).',
          },
          {
            numero: 2,
            id: 'q-adm-1',
            materia: 'Direito Administrativo',
            enunciado: 'A Administração pode anular seus próprios atos, quando eivados de vícios que os tornam ilegais, ou revogá-los por conveniência e oportunidade.',
            alternativas: [],
            tipo: 'CE',
            resposta: 'C',
            gabarito: 'C',
            correta: true,
            comentario: 'Súmula 473 do STF.',
          },
          {
            numero: 3,
            id: 'q-port-1',
            materia: 'Língua Portuguesa',
            enunciado: 'Em "Entregaram o documento à diretora", o acento grave é facultativo.',
            alternativas: [],
            tipo: 'CE',
            resposta: 'C',
            gabarito: 'E',
            correta: false,
            comentario: 'A crase é obrigatória: preposição "a" + artigo "a".',
          },
          {
            numero: 4,
            id: 'q-rlm-1',
            materia: 'Raciocínio Lógico',
            enunciado: 'Negação da conjunção P ∧ Q equivale a ¬P ∨ ¬Q.',
            alternativas: [],
            tipo: 'CE',
            resposta: 'C',
            gabarito: 'C',
            correta: true,
            comentario: '1ª Lei de De Morgan.',
          },
        ],
      },
    ],
    history,
    studyTimeRecords,
    annotations: [
      {
        id: 'err-1',
        data: offsetDateBr(2),
        materia: 'Língua Portuguesa',
        tipo: 'Erro em Questão (Auto)',
        texto: 'Revisar emprego obrigatório de crase antes de substantivos femininos determinados.',
        questao: {
          enunciado: 'No período "Entregaram o documento à diretora logo após a reunião", o emprego do acento grave indicativo de crase é facultativo.',
          alternativas: [],
          resposta: 'C',
          gabarito: 'E',
          comentario: 'O verbo entregar exige preposição "a" e "diretora" admite artigo "a". A crase é obrigatória.',
        },
      },
      {
        id: 'err-2',
        data: offsetDateBr(1),
        materia: 'Direito Constitucional',
        tipo: 'Prazos',
        texto: 'Mandado de Segurança Coletivo: entidade de classe precisa de pelo menos 1 ANO de constituição e funcionamento (não 2 anos). Prazo decadencial do MS: 120 dias.',
      },
      {
        id: 'err-3',
        data: offsetDateBr(0),
        materia: 'Direito Administrativo',
        tipo: 'Regra x Exceção',
        texto: 'Anulação = ilegalidade + efeitos ex tunc (retroativos). Revogação = conveniência/oportunidade + efeitos ex nunc (não retroativos).',
      },
    ],
    caseLaw: [
      {
        id: 'caselaw-1',
        categoria: 'Súmula',
        titulo: 'Vedação ao nepotismo na Administração Pública',
        tribunal: 'STF',
        identificador: 'Súmula Vinculante 13',
        fonte: '',
        texto:
          'A nomeação de cônjuge, companheiro ou parente em linha reta, colateral ou por afinidade, até o terceiro grau, inclusive, da autoridade nomeante ou de servidor da mesma pessoa jurídica investido em cargo de direção, chefia ou assessoramento, para o exercício de cargo em comissão ou de confiança ou, ainda, de função gratificada na administração pública direta e indireta em qualquer dos Poderes da União, dos Estados, do Distrito Federal e dos Municípios, compreendido o ajuste mediante designações recíprocas, viola a Constituição Federal.',
        criado_em: offsetDateIso(5) + 'T10:00:00',
      },
      {
        id: 'caselaw-2',
        categoria: 'Súmula',
        titulo: 'Poder de autotutela da Administração',
        tribunal: 'STF',
        identificador: 'Súmula 473',
        fonte: '',
        texto:
          'A administração pode anular seus próprios atos, quando eivados de vícios que os tornam ilegais, porque deles não se originam direitos; ou revogá-los, por motivo de conveniência ou oportunidade, respeitados os direitos adquiridos, e ressalvada, em todos os casos, a apreciação judicial.',
        criado_em: offsetDateIso(3) + 'T14:20:00',
      },
    ],
    contests: [
      {
        id: 'contest-1',
        concurso: 'Analista Judiciário · TRF 1ª Região',
        data_abertura: '05/11/2026 a 28/11/2026',
        data_pagamento: futureDateIso(4),
        status_pagamento: 'Não Pago',
        local_prova: 'Brasília / DF (a definir)',
        observacoes: 'Cargo: Área Judiciária · Banca prevista: Cebraspe.',
        edital_pontos: [
          {
            id: 'edp-1',
            materia: 'Direito Constitucional',
            titulo: '1. Princípios fundamentais e Direitos e garantias fundamentais (Art. 1º a 17)',
            estudado: true,
            estudado_em: offsetDateBr(2),
          },
          {
            id: 'edp-2',
            materia: 'Direito Constitucional',
            titulo: '2. Organização do Estado e Poder Judiciário',
            estudado: false,
          },
          {
            id: 'edp-3',
            materia: 'Direito Administrativo',
            titulo: '1. Regime jurídico-administrativo e Princípios da Administração Pública',
            estudado: true,
            estudado_em: offsetDateBr(1),
          },
          {
            id: 'edp-4',
            materia: 'Direito Administrativo',
            titulo: '2. Atos administrativos: conceito, requisitos, atributos e extinção',
            estudado: false,
          },
          {
            id: 'edp-5',
            materia: 'Língua Portuguesa',
            titulo: '1. Compreensão e interpretação de textos de gêneros variados',
            estudado: false,
          },
        ],
      },
      {
        id: 'contest-2',
        concurso: 'Técnico Administrativo · MPU',
        data_abertura: '10/10/2026 a 30/10/2026',
        data_pagamento: offsetDateIso(12),
        status_pagamento: 'Pago',
        local_prova: 'Universidade de Brasília — Pavilhão A',
        observacoes: 'Comprovante de inscrição confirmado e impresso.',
        edital_pontos: [
          {
            id: 'edp-6',
            materia: 'Língua Portuguesa',
            titulo: '1. Ortografia oficial, acentuação gráfica e emprego da crase',
            estudado: true,
            estudado_em: offsetDateBr(4),
          },
          {
            id: 'edp-7',
            materia: 'Direito Administrativo',
            titulo: '1. Lei nº 8.112/1990 — Regime Jurídico dos Servidores Públicos Civis',
            estudado: false,
          },
        ],
      },
    ],
    scheduleDayDates: getCurrentWeekDates(),
    schedule: (() => {
      const weekDates = getCurrentWeekDates();
      return {
        'Segunda-feira': [
          {
            id: 'sch-1',
            data: weekDates['Segunda-feira'] || todayBr,
            materia: 'Direito Constitucional',
            tempo: '1h 30min',
            observacoes: 'Art. 5º e controle de constitucionalidade + 20 questões',
          },
          {
            id: 'sch-2',
            data: weekDates['Segunda-feira'] || todayBr,
            materia: 'Língua Portuguesa',
            tempo: '1h',
            observacoes: 'Crase, regência verbal e reescrita de frases',
          },
        ],
        'Terça-feira': [
          {
            id: 'sch-3',
            data: weekDates['Terça-feira'] || todayBr,
            materia: 'Direito Administrativo',
            tempo: '1h 30min',
            observacoes: 'Lei 8.112/90 e atos administrativos',
          },
        ],
        'Quarta-feira': [
          {
            id: 'sch-4',
            data: weekDates['Quarta-feira'] || todayBr,
            materia: 'Raciocínio Lógico',
            tempo: '1h',
            observacoes: 'Equivalências lógicas e tabela-verdade',
          },
        ],
        'Quinta-feira': [
          {
            id: 'sch-5',
            data: weekDates['Quinta-feira'] || todayBr,
            materia: 'Direito Penal',
            tempo: '1h 15min',
            observacoes: 'Aplicação da lei penal e crimes contra a Administração',
          },
        ],
        'Sexta-feira': [
          {
            id: 'sch-6',
            data: weekDates['Sexta-feira'] || todayBr,
            materia: 'Discursiva',
            tempo: '1h',
            observacoes: 'Redação semanal sobre atualidades e direito público',
          },
        ],
        Sábado: [
          {
            id: 'sch-7',
            data: weekDates['Sábado'] || todayBr,
            materia: 'Simulado Fechado',
            tempo: '2h',
            observacoes: 'Bateria mista + revisão no Caderno de Erros',
          },
        ],
        Domingo: [
          {
            id: 'sch-8',
            data: weekDates['Domingo'] || todayBr,
            materia: 'Lei Seca',
            tempo: '1h',
            observacoes: 'Leitura ativa da CF/88 com marcações em cores',
          },
        ],
      };
    })(),
    completedGoals,
    incompleteGoals: [
      {
        id: 'ig-1',
        data: offsetDateBr(5),
        dia_semana: 'Sexta-feira',
        materia: 'Direito Administrativo',
        tempo: '45min',
        observacoes: 'Revisar licitações (Lei 14.133/2021) — critérios de julgamento.',
        arquivado_em: `${offsetDateBr(4)} 22:00`,
      },
    ],
    weeklyGoalNotes: {
      [mondayIso]: 'Manter foco nos dispositivos mais cobrados da Constituição Federal e revisar os erros de crase antes do próximo simulado.',
    },
    laws: {
      Constituicao_Federal: {
        name: 'Constituicao_Federal',
        pdfs: [
          {
            id: 'lawpdf-cf-1',
            name: 'CF88_Art5_e_Art37_Resumo.pdf',
            size: 4820,
            blobKey: 'seed-law-cf88',
            createdAt: offsetDateIso(5),
          },
        ],
        items: [
          {
            id: 'cf88::0',
            arquivo: 'constituicao_federal.txt',
            dispositivo: 'Art. 5º, caput',
            grau: 'Muito Alto',
            texto:
              'Todos são iguais perante a lei, sem distinção de qualquer natureza, garantindo-se aos brasileiros e aos estrangeiros residentes no País a inviolabilidade do direito à vida, à liberdade, à igualdade, à segurança e à propriedade.',
            dica: 'Cuidado com a jurisprudência do STF: estrangeiros em trânsito também possuem direitos fundamentais compatíveis.',
            observacao: 'Cai em praticamente toda prova de Direito Constitucional.',
            artigo_base: 'Art. 5º',
            tipo_dispositivo: 'Artigo (caput)',
          },
          {
            id: 'cf88::1',
            arquivo: 'constituicao_federal.txt',
            dispositivo: 'Art. 5º, inciso XI',
            grau: 'Muito Alto',
            texto:
              'a casa é asilo inviolável do indivíduo, ninguém nela podendo penetrar sem consentimento do morador, salvo em caso de flagrante delito ou desastre, ou para prestar socorro, ou, durante o dia, por determinação judicial;',
            dica: 'Ordem judicial = somente durante o DIA. Flagrante, desastre e socorro = a qualquer hora.',
            observacao: 'Revisado com questão do Cebraspe.',
            artigo_base: 'Art. 5º',
            tipo_dispositivo: 'Inciso',
          },
          {
            id: 'cf88::2',
            arquivo: 'constituicao_federal.txt',
            dispositivo: 'Art. 5º, inciso LXX',
            grau: 'Alto',
            texto:
              'o mandado de segurança coletivo pode ser impetrado por: a) partido político com representação no Congresso Nacional; b) organização sindical, entidade de classe ou associação legalmente constituída e em funcionamento há pelo menos um ano, em defesa dos interesses de seus membros ou associados;',
            dica: 'O requisito de 1 ano aplica-se apenas às associações segundo jurisprudência consolidada, mas a literalidade inclui organização sindical e entidade de classe em provas literais.',
            observacao: '',
            artigo_base: 'Art. 5º',
            tipo_dispositivo: 'Inciso',
          },
          {
            id: 'cf88::3',
            arquivo: 'constituicao_federal.txt',
            dispositivo: 'Art. 37, caput',
            grau: 'Muito Alto',
            texto:
              'A administração pública direta e indireta de qualquer dos Poderes da União, dos Estados, do Distrito Federal e dos Municípios obedecerá aos princípios de legalidade, impessoalidade, moralidade, publicidade e eficiência.',
            dica: 'Memorizar os 5 princípios expressos (LIMPE).',
            observacao: '',
            artigo_base: 'Art. 37',
            tipo_dispositivo: 'Artigo (caput)',
          },
          {
            id: 'cf88::4',
            arquivo: 'constituicao_federal.txt',
            dispositivo: 'Art. 37, § 6º',
            grau: 'Médio',
            texto:
              'As pessoas jurídicas de direito público e as de direito privado prestadoras de serviços públicos responderão pelos danos que seus agentes, nessa qualidade, causarem a terceiros, assegurado o direito de regresso contra o responsável nos casos de dolo ou culpa.',
            dica: 'Responsabilidade objetiva do Estado (teoria do risco administrativo) x responsabilidade subjetiva do agente (dolo ou culpa).',
            observacao: '',
            artigo_base: 'Art. 37',
            tipo_dispositivo: 'Parágrafo',
          },
        ],
      },
      Lei_8112_90: {
        name: 'Lei_8112_90',
        pdfs: [],
        items: [
          {
            id: 'l8112::0',
            arquivo: 'lei_8112.txt',
            dispositivo: 'Art. 8º',
            grau: 'Alto',
            texto:
              'São formas de provimento de cargo público: nomeação, promoção, readaptação, reversão, aproveitamento, reintegração e recondução.',
            dica: 'Ascensão e transferência foram revogadas.',
            observacao: '',
            artigo_base: 'Art. 8º',
            tipo_dispositivo: 'Artigo (caput)',
          },
          {
            id: 'l8112::1',
            arquivo: 'lei_8112.txt',
            dispositivo: 'Art. 13, § 1º',
            grau: 'Baixo',
            texto: 'A posse ocorrerá no prazo de trinta dias contados da publicação do ato de provimento.',
            dica: 'Posse = 30 dias. Exercício = 15 dias contados da data da posse.',
            observacao: '',
            artigo_base: 'Art. 13',
            tipo_dispositivo: 'Parágrafo',
          },
        ],
      },
    },
    lawHighlights: {
      Constituicao_Federal: [
        { text: 'durante o dia, por determinação judicial', color: 'yellow' },
        { text: 'legalidade, impessoalidade, moralidade, publicidade e eficiência', color: 'green' },
        { text: 'em funcionamento há pelo menos um ano', color: 'pink' },
      ],
    },
    pdfFolders: {
      Apostilas_Base: [
        {
          id: 'pdf-1',
          name: 'Guia_Rapido_Direito_Constitucional.pdf',
          size: 5120,
          blobKey: 'seed-pdf-constitucional',
          createdAt: offsetDateIso(6),
        },
      ],
      Provas_Anteriores: [],
    },
    summaryFolders: {
      Direito_Administrativo: [
        {
          id: 'sum-1',
          name: 'Mapa_Atos_Administrativos.pdf',
          size: 4680,
          mimeType: 'application/pdf',
          blobKey: 'seed-summary-atos',
          createdAt: offsetDateIso(4),
        },
      ],
      Lingua_Portuguesa: [],
    },
    proofBanks: ['Cebraspe', 'FGV'],
    proofFiles: [
      {
        id: 'proof-1',
        name: 'Prova_TRF1_Analista_Exemplo.pdf',
        size: 5400,
        bank: 'Cebraspe',
        kind: 'provas-com-gabarito',
        blobKey: 'seed-proof-trf1',
        gabarito_arquivo: 'Prova_TRF1_Analista_Exemplo.pdf.gabarito.txt',
        gabarito_conteudo: 'GABARITO ASSOCIADO À PROVA\n1-C\n2-E\n3-C\n4-E\n5-C\n',
        gabarito_questoes: 5,
        observacoes: 'Prova modelo para revisão de tempo de execução (blocos CE).',
        correcoes: [
          {
            id: 'corr-seed-1',
            questao: 'Item 14 (Cebraspe): Confundi prazo de posse (30 dias) com prazo para entrar em exercício (15 dias) na Lei 8.112/90.',
            observacoes: 'Memorizar: Posse (30) -> Exercício (15).',
            criado_em: offsetDateIso(2) + 'T16:10:00',
          },
        ],
        createdAt: offsetDateIso(5),
      },
    ],
    essays: [
      {
        id: 'essay-1',
        titulo: 'Eficiência Administrativa e Governo Digital',
        data: offsetDateBr(3) + ' 18:10',
        created_at: offsetDateIso(3) + 'T18:10:00',
        original_arquivo: 'redacao_governo_digital.pdf',
        original_blobKey: 'seed-essay-original',
        original_mime: 'application/pdf',
        corrigido_arquivo: '',
        feedback: 'Boa estrutura argumentativa em 4 parágrafos. Vale citar expressamente o Art. 37 da CF/88 na introdução e reforçar a conclusão.',
        corrigida_em: offsetDateIso(2) + 'T11:00:00',
      },
    ],
    criticalPoints: [
      {
        id: 'cp-1',
        data: '2026',
        materia: 'Direito Constitucional',
        titulo: 'Inviolabilidade domiciliar e ingresso policial sem mandado',
        texto:
          'O STF exige fundadas razões, devidamente justificadas a posteriori, que indiquem situação de flagrante delito para afastar a exigência de mandado judicial durante o período noturno.',
      },
      {
        id: 'cp-2',
        data: '2026',
        materia: 'Direito Administrativo',
        titulo: 'Nova Lei de Licitações (Lei nº 14.133/2021) — Vigência plena',
        texto:
          'A Lei 8.666/93 e a Lei do Pregão (10.520/02) foram revogadas. Atenção às modalidades da Lei 14.133: pregão, concorrência, concurso, leilão e diálogo competitivo.',
      },
    ],
    phrases: [
      'Portaria nº 404/MACFM: É expressamente proibido desistir antes da posse.',
      'Decreto do Café Forte: Cada questão corrigida hoje evita um recurso indeferido amanhã.',
      'A constância diária vence a intensidade passageira.',
      'Lei seca lida e revisada vale pontos seguros no gabarito oficial.',
      'Instrução Normativa nº 01: Seu futuro eu agradecerá pelo foco de hoje.',
      'Erros no treino são diagnósticos preciosos para a aprovação.',
      'Pequenos avanços diários constroem grandes resultados no Diário Oficial.',
      'Quem revisa o próprio erro não repete a mesma armadilha da banca.',
    ],
    preferences: { ...DEFAULT_PREFERENCES },
  };
}

export async function ensureSeededBlobs(): Promise<void> {
  const specs: Array<{ key: string; title: string; subtitle: string; body: string[] }> = [
    {
      key: 'seed-law-cf88',
      title: 'Constituição Federal de 1988 - Seleção',
      subtitle: 'Central de Estudos · Material de referência rápida',
      body: [
        'Art. 5º Todos são iguais perante a lei, sem distinção de qualquer natureza, garantindo-se aos brasileiros e aos estrangeiros residentes no País a inviolabilidade do direito à vida, à liberdade, à igualdade, à segurança e à propriedade.',
        'XI - a casa é asilo inviolável do indivíduo, ninguém nela podendo penetrar sem consentimento do morador, salvo em caso de flagrante delito ou desastre, ou para prestar socorro, ou, durante o dia, por determinação judicial.',
        'LXX - o mandado de segurança coletivo pode ser impetrado por: a) partido político com representação no Congresso Nacional; b) organização sindical, entidade de classe ou associação legalmente constituída e em funcionamento há pelo menos um ano.',
        'Art. 37. A administração pública direta e indireta obedecerá aos princípios de legalidade, impessoalidade, moralidade, publicidade e eficiência.',
      ],
    },
    {
      key: 'seed-pdf-constitucional',
      title: 'Guia Rápido de Direito Constitucional',
      subtitle: 'PDF Pessoal · Direitos e Garantias Fundamentais',
      body: [
        '1. Eficácia das normas constitucionais: Plena (aplicabilidade direta e imediata), Contida (direta e imediata, porém restringível por lei) e Limitada (depende de normatização ulterior).',
        '2. Remédios Constitucionais: Habeas Corpus (locomoção), Habeas Data (informação pessoal), Mandado de Segurança (direito líquido e certo), Mandado de Injunção (omissão normativa), Ação Popular (patrimônio público).',
      ],
    },
    {
      key: 'seed-summary-atos',
      title: 'Mapa Mental · Atos Administrativos',
      subtitle: 'Resumos & Mapas · Direito Administrativo',
      body: [
        'Requisitos (CO-FI-FO-MO-OB): Competência (vinculado), Finalidade (vinculado), Forma (vinculado), Motivo (vinculado ou discricionário) e Objeto (vinculado ou discricionário).',
        'Atributos (PA-T-I): Presunção de legitimidade, Autoexecutoriedade, Tipicidade e Imperatividade.',
        'Extinção: Anulação (ilegalidade, ex tunc) vs. Revogação (conveniência e oportunidade, ex nunc).',
      ],
    },
    {
      key: 'seed-proof-trf1',
      title: 'Prova Modelo · Analista Judiciário',
      subtitle: 'Banca Cebraspe · Caderno de Exercícios Exemplo',
      body: [
        'Questão 1. A Administração Pública federal obedece expressamente aos princípios da legalidade, impessoalidade, moralidade, publicidade e eficiência.',
        'Questão 2. O prazo decadencial do mandado de segurança individual é de 180 dias contados da ciência do ato impugnado.',
        'Questão 3. Compete ao STF julgar originariamente mandado de segurança contra ato do Presidente da República.',
      ],
    },
    {
      key: 'seed-essay-original',
      title: 'Redação Discursiva · Eficiência Administrativa e Governo Digital',
      subtitle: 'Texto enviado para revisão',
      body: [
        'A modernização do Estado brasileiro encontra na transformação digital um instrumento central para concretizar o princípio constitucional da eficiência, insculpido no artigo 37 da Constituição Federal.',
        'Ao digitalizar serviços públicos e integrar bases de dados, a Administração reduz custos operacionais, amplia a transparência e assegura atendimento mais célere ao cidadão.',
        'Conclui-se, portanto, que investimentos contínuos em governança eletrônica e capacitação de servidores são indispensáveis à efetividade dos direitos fundamentais sociais.',
      ],
    },
  ];

  for (const spec of specs) {
    const existing = await getFileBlob(spec.key);
    if (!existing) {
      const blob = buildSamplePdfBlob(spec.title, spec.subtitle, spec.body);
      await saveFileBlob(spec.key, blob);
    }
  }
}
