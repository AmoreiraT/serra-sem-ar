export type CovidEventAttachmentType = 'text' | 'link' | 'image' | 'video';

export interface CovidEventAttachment {
  type: CovidEventAttachmentType;
  label?: string;
  url?: string;
  content?: string;
  thumbnail?: string;
}

export interface CovidEvent {
  date: string; // ISO yyyy-mm-dd
  title: string;
  description: string;
  source?: string;
  attachments?: CovidEventAttachment[];
}

interface DatePointLike {
  date: Date;
}

interface CovidEventTimelineEntry {
  event: CovidEvent;
  index: number;
}

export interface CovidEventTimelinePoint {
  id: string;
  date: string;
  title: string;
  index: number;
  progress: number;
}

export const covidEvents: CovidEvent[] = [
  {
    date: '2020-02-25',
    title: 'Bem-vindo à Serra Sem Ar',
    description:
      'Uma jornada imersiva pelos dados oficiais da COVID-19 no Brasil. Explore os registros diários, relembre decisões críticas e perceba a montanha formada pela soma de casos e mortes.',
    attachments: [
      {
        type: 'text',
        content:
          'Use W/D para avançar no tempo, S/A para retornar. Shift salta 10 dias. Observe as placas ao longo da serra e mergulhe na memória coletiva.',
      },
    ],
  },
  {
    date: '2020-02-26',
    title: 'Primeiro caso confirmado no Brasil',
    description:
      'O Ministério da Saúde confirma o primeiro caso de COVID-19 no país, um paciente de São Paulo recém-chegado da Itália.',
    source: 'https://www.gov.br/saude/pt-br/assuntos/noticias/ministerio-da-saude-confirma-primeiro-caso-de-coronavirus-no-brasil',
    attachments: [
      {
        type: 'image',
        url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Minist%C3%A9rio_da_Sa%C3%BAde_%2849702074706%29.jpg/960px-Minist%C3%A9rio_da_Sa%C3%BAde_%2849702074706%29.jpg',
        label: 'Fachada do Ministério da Saúde durante a pandemia',
      },
      {
        type: 'link',
        url: 'https://www.youtube.com/watch?v=BtJx11yTPOs',
        label: 'Coletiva de imprensa do MS',
      },
    ],
  },
  {
    date: '2020-03-11',
    title: 'OMS declara pandemia',
    description:
      'A Organização Mundial da Saúde declara oficialmente a COVID-19 como pandemia, destacando a rápida expansão global do vírus.',
    attachments: [
      {
        type: 'text',
        content:
          '“A COVID-19 pode ser caracterizada como uma pandemia.” — Dr. Tedros Adhanom Ghebreyesus, diretor-geral da OMS.',
      },
      {
        type: 'link',
        url: 'https://www.who.int/news-room/speeches/item/who-director-general-s-opening-remarks-at-the-media-briefing-on-covid-19---11-march-2020',
        label: 'Discurso da OMS',
      },
    ],
  },
  {
    date: '2020-03-20',
    title: 'Calamidade pública',
    description:
      'O Senado Federal reconhece estado de calamidade pública em todo o território nacional, viabilizando medidas extraordinárias de resposta.',
    attachments: [
      {
        type: 'link',
        url: 'https://www12.senado.leg.br/noticias/materias/2020/03/20/em-sessao-historica-senado-aprova-calamidade-publica-contra-covid-19',
        label: 'Notícia do Senado',
      },
    ],
  },
  {
    date: '2020-03-24',
    title: 'Pronunciamento sobre “gripezinha”',
    description:
      'Em cadeia nacional, o presidente Jair Bolsonaro minimiza a gravidade da COVID-19 e critica medidas de isolamento, chamando a doença de “resfriadinho”.',
    source: 'https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/2020/03/pronunciamento-em-cadeia-de-radio-e-tv-sobre-o-coronavirus',
    attachments: [
      {
        type: 'text',
        content:
          '“Pelo meu histórico de atleta, caso fosse contaminado, não precisaria me preocupar, nada sentiria ou seria, quando muito, acometido de uma gripezinha.”',
      },
    ],
  },
  {
    date: '2020-04-16',
    title: 'Mandetta deixa o Ministério da Saúde',
    description:
      'Após divergências sobre isolamento social, Luiz Henrique Mandetta é exonerado do Ministério da Saúde.',
    attachments: [
      {
        type: 'link',
        url: 'https://www.cnnbrasil.com.br/politica/jair-bolsonaro-demite-luiz-henrique-mandetta-do-ministerio-da-saude/',
        label: 'Matéria da CNN Brasil',
      },
    ],
  },
  {
    date: '2020-04-24',
    title: 'Uso de máscaras se espalha',
    description:
      'Capitais brasileiras começam a tornar obrigatório o uso de máscaras em espaços públicos e transportes coletivos.',
  },
  {
    date: '2020-05-15',
    title: 'Nelson Teich pede demissão',
    description:
      'Com pouco mais de um mês no cargo, Nelson Teich deixa o Ministério da Saúde citando discordâncias sobre o uso da cloroquina.',
    attachments: [
      {
        type: 'link',
        url: 'https://agenciabrasil.ebc.com.br/politica/noticia/2020-05/nelson-teich-pede-demissao-do-ministerio-da-saude',
        label: 'Agência Brasil',
      },
    ],
  },
  {
    date: '2020-05-22',
    title: 'General Pazuello assume interinamente',
    description:
      'Eduardo Pazuello, então secretário executivo, assume o Ministério da Saúde de forma interina após a saída de Nelson Teich.',
  },
  {
    date: '2020-06-19',
    title: 'Brasil ultrapassa 1 milhão de casos',
    description:
      'O país atinge a marca de um milhão de casos confirmados de COVID-19 e ultrapassa 48 mil mortes registradas.',
    attachments: [
      {
        type: 'link',
        url: 'https://covid.saude.gov.br/',
        label: 'Painel COVID-19 (Ministério da Saúde)',
      },
    ],
  },
  {
    date: '2020-07-07',
    title: 'Presidente testa positivo',
    description:
      'Jair Bolsonaro anuncia ter testado positivo para COVID-19, reforçando debates sobre protocolos no Palácio do Planalto.',
    attachments: [
      {
        type: 'link',
        url: 'https://agenciabrasil.ebc.com.br/politica/noticia/2020-07/presidente-jair-bolsonaro-testa-positivo-para-covid-19',
        label: 'Agência Brasil',
      },
    ],
  },
  {
    date: '2020-09-09',
    title: 'STF garante transparência dos dados',
    description:
      'O Supremo Tribunal Federal determina que o Ministério da Saúde mantenha a divulgação diária e integral dos dados de COVID-19.',
    attachments: [
      {
        type: 'link',
        url: 'https://www.oab.org.br/noticia/58567/com-acao-da-oab-stf-determina-que-ministerio-da-saude-volte-a-divulgar-dados-da-pandemia',
        label: 'Registro da decisão do STF',
      },
    ],
  },
  {
    date: '2020-12-17',
    title: 'CoronaVac apresenta eficácia',
    description:
      'O Instituto Butantan anuncia que a CoronaVac apresentou segurança e eficácia na fase 3 de testes realizada no Brasil.',
    attachments: [
      {
        type: 'link',
        url: 'https://butantan.gov.br/noticias/instituto-butantan-finaliza-analise-de-dados-e-confidencialidade-com-a-sinovac-e-encaminha-para-anvisa',
        label: 'Comunicado do Instituto Butantan',
      },
    ],
  },
  {
    date: '2021-01-17',
    title: 'Início da vacinação',
    description:
      'A Anvisa libera o uso emergencial das vacinas CoronaVac e Oxford/AstraZeneca; a campanha nacional começa no mesmo dia.',
    attachments: [
      {
        type: 'image',
        url: 'https://upload.wikimedia.org/wikipedia/commons/c/ce/COVID-19_vaccination_campaign_in_Brazil_%282021%29_F.jpg',
        label: 'Campanha de vacinação contra COVID-19 em São Paulo',
      },
      {
        type: 'link',
        url: 'https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2021/confira-materiais-da-reuniao-extraordinaria-da-dicol',
        label: 'Materiais oficiais da decisão da Anvisa',
      },
    ],
  },
  {
    date: '2021-03-13',
    title: 'Colapso hospitalar',
    description:
      'Hospitais em várias capitais registram ocupação máxima de UTIs na segunda onda, levando governos locais a adotarem medidas emergenciais.',
  },
  {
    date: '2021-04-13',
    title: 'Instalação da CPI da COVID',
    description:
      'O Senado instala a CPI para apurar ações e omissões da União e o uso de recursos federais durante a pandemia.',
    attachments: [
      {
        type: 'link',
        url: 'https://www12.senado.leg.br/noticias/materias/2021/04/13/senado-cria-cpi-da-covid',
        label: 'Notícia do Senado Federal',
      },
    ],
  },
  {
    date: '2021-06-10',
    title: 'Produção nacional da AstraZeneca',
    description:
      'A Fiocruz anuncia a entrega das primeiras doses da AstraZeneca fabricadas integralmente no Brasil, reforçando a autonomia do PNI.',
    attachments: [
      {
        type: 'link',
        url: 'https://www.fiocruzbrasilia.fiocruz.br/fiocruz-libera-primeira-vacina-covid-19-nacional/',
        label: 'Portal Fiocruz',
      },
    ],
  },
  {
    date: '2021-07-08',
    title: 'CPI expõe caso Covaxin',
    description:
      'Depoimentos à CPI revelam suspeitas de irregularidades na negociação da vacina Covaxin, aumentando a pressão política por transparência.',
  },
  {
    date: '2021-08-21',
    title: '50% dos brasileiros com primeira dose',
    description:
      'Metade da população recebe ao menos uma dose contra a COVID-19, marco relevante para a imunidade coletiva.',
  },
  {
    date: '2021-12-16',
    title: 'Vacinação infantil autorizada',
    description:
      'A Anvisa aprova o uso da vacina Pfizer para crianças de 5 a 11 anos, marcando nova etapa da campanha.',
    attachments: [
      {
        type: 'link',
        url: 'https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2021/anvisa-aprova-vacina-da-pfizer-contra-covid-para-criancas-de-5-a-11-anos',
        label: 'Nota da Anvisa',
      },
    ],
  },
  {
    date: '2022-01-10',
    title: 'Explosão de casos com a Ômicron',
    description:
      'Primeiras semanas de 2022 registram recordes de notificações com a variante Ômicron, pressionando municípios e laboratórios.',
  },
  {
    date: '2022-03-21',
    title: 'Estados flexibilizam máscaras',
    description:
      'Após queda sustentada nos indicadores, diversos estados suspendem o uso obrigatório de máscaras em ambientes abertos.',
  },
  {
    date: '2022-07-18',
    title: 'Reforço bivalente anunciado',
    description:
      'O Ministério da Saúde apresenta a estratégia de vacinação com doses bivalentes para grupos prioritários a partir de 2023.',
    attachments: [
      {
        type: 'link',
        url: 'https://www.gov.br/saude/pt-br/assuntos/noticias/2023/janeiro/covid-19-ministerio-da-saude-preve-comeco-de-reforco-bivalente-em-27-de-fevereiro',
        label: 'Plano de reforço bivalente',
      },
    ],
  },
  {
    date: '2022-12-22',
    title: 'Campanha 2023 anunciada',
    description:
      'O Ministério da Saúde divulga o plano nacional de vacinação contra a COVID-19 para 2023, com reforço anual para grupos vulneráveis.',
  },
  {
    date: '2023-02-27',
    title: 'Início da vacinação bivalente',
    description:
      'Campanha nacional aplica doses bivalentes em idosos e imunocomprometidos, atualizando a proteção contra variantes.',
    attachments: [
      {
        type: 'link',
        url: 'https://www.gov.br/saude/pt-br/assuntos/noticias/2023/janeiro/ministerio-da-saude-divulga-cronograma-do-programa-nacional-de-vacinacao-de-2023',
        label: 'Notícia do Ministério da Saúde',
      },
    ],
  },
  {
    date: '2023-03-27',
    title: 'Vacinação bivalente é ampliada',
    description:
      'Novos grupos prioritários passam a receber as doses bivalentes em todo o país.',
    attachments: [
      {
        type: 'link',
        url: 'https://www.gov.br/saude/pt-br/assuntos/noticias/2023/marco/estados-e-municipios-ja-podem-vacinar-todo-o-publico-prioritario-com-as-vacinas-bivalentes-saiba-se-chegou-a-sua-vez',
        label: 'Ampliação oficial',
      },
    ],
  },
  {
    date: '2023-05-05',
    title: 'Fim da Emergência Internacional',
    description:
      'A OMS declara o fim da ESPIN para COVID-19, mantendo monitoramento e recomendações permanentes.',
    attachments: [
      {
        type: 'link',
        url: 'https://www.who.int/news/item/05-05-2023-statement-on-the-fifteenth-meeting-of-the-international-health-regulations-%282005%29-emergency-committee-regarding-the-coronavirus-disease-%28covid-19%29-pandemic',
        label: 'Comunicado da OMS',
      },
    ],
  },
  {
    date: '2023-07-11',
    title: 'Plano para recuperar cobertura vacinal',
    description:
      'O Ministério da Saúde lança o Movimento Nacional pela Vacinação para recuperar a cobertura do PNI, impactada durante a pandemia.',
    attachments: [
      {
        type: 'link',
        url: 'https://www.gov.br/saude/pt-br/assuntos/noticias/2023/julho/novo-painel-digital-permite-acompanhamento-diario-da-vacinacao-contra-a-covid-19',
        label: 'Movimento Nacional pela Vacinação',
      },
    ],
  },
  {
    date: '2024-02-27',
    title: 'Campanha 2024 prioriza grupos de risco',
    description:
      'O Ministério da Saúde inicia a vacinação de reforço 2024 para idosos e imunossuprimidos com doses atualizadas.',
    attachments: [
      {
        type: 'link',
        url: 'https://www.gov.br/saude/pt-br/assuntos/noticias/2024/fevereiro/alerta-mantenha-a-vacinacao-contra-covid-19-em-dia',
        label: 'Plano 2024',
      },
    ],
  },
  {
    date: '2024-07-03',
    title: 'Fiocruz anuncia vacina em dose única',
    description:
      'Pesquisadores da Fiocruz iniciam estudos clínicos com uma vacina nacional em dose única adaptada a variantes.',
  },
  {
    date: '2025-05-05',
    title: 'Dois anos do fim da ESPIN',
    description:
      'O Brasil mantém vigilância e reforços anuais, celebrando avanços da ciência e lembrando as mais de 700 mil vidas perdidas.',
  },
];

export const covidEventsByDate = new Map<string, CovidEvent>(
  covidEvents.map((event) => [event.date, event])
);

export const formatCovidEventDatePtBr = (eventDate: string): string =>
  new Date(`${eventDate}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

export const getCovidEventForTimelineIndex = (
  data: readonly DatePointLike[],
  currentDateIndex: number
): CovidEvent | null => {
  if (!data.length) return null;

  const eventsByIndex = mapCovidEventsToTimeline(data);

  if (!eventsByIndex.length) return null;

  const clampedIndex = Math.max(0, Math.min(currentDateIndex, data.length - 1));
  const upcoming = eventsByIndex.find((item) => item.index >= clampedIndex);
  return (upcoming ?? eventsByIndex[eventsByIndex.length - 1]).event;
};

export const getCovidEventTimelinePoints = (
  data: readonly DatePointLike[]
): readonly CovidEventTimelinePoint[] => {
  if (data.length <= 1) {
    return [];
  }

  return mapCovidEventsToTimeline(data).map(({ event, index }) => ({
    id: event.date,
    date: event.date,
    title: event.title,
    index,
    progress: index / (data.length - 1),
  }));
};

const mapCovidEventsToTimeline = (data: readonly DatePointLike[]): readonly CovidEventTimelineEntry[] =>
  covidEvents
    .map((event) => {
      const index = data.findIndex((item) => item.date.toISOString().slice(0, 10) === event.date);
      if (index === -1) return null;
      return { event, index };
    })
    .filter((entry): entry is CovidEventTimelineEntry => entry !== null)
    .sort((a, b) => a.index - b.index);
