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

export const covidEvents: CovidEvent[] = [
  {
    date: '2020-02-26',
    title: 'Primeiro caso confirmado no Brasil',
    description:
      'O Ministério da Saúde confirma o primeiro caso de COVID-19 no Brasil, um paciente em São Paulo recém-chegado da Itália.',
    source: 'https://www.gov.br/saude/pt-br/assuntos/noticias/ministerio-da-saude-confirma-primeiro-caso-de-coronavirus-no-brasil',
    attachments: [
      {
        type: 'image',
        url: 'https://agenciabrasil.ebc.com.br/sites/default/files/thumbnails/image/coronavirus_1_0.jpg',
        label: 'Imagem de divulgação do MS',
      },
      {
        type: 'link',
        url: 'https://www.youtube.com/watch?v=BtJx11yTPOs',
        label: 'Coletiva de imprensa (YouTube)',
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
          '“A COVID-19 pode ser caracterizada como uma pandemia” — Dr. Tedros Adhanom Ghebreyesus, diretor-geral da OMS.',
      },
      {
        type: 'link',
        url: 'https://www.who.int/director-general/speeches/detail/who-director-general-s-opening-remarks-at-the-media-briefing-on-covid-19---11-march-2020',
        label: 'Discurso da OMS',
      },
    ],
  },
  {
    date: '2020-03-20',
    title: 'Calamidade pública',
    description:
      'O Senado aprova decreto de calamidade pública em todo o território nacional, permitindo medidas extraordinárias de combate à pandemia.',
    attachments: [
      {
        type: 'link',
        url: 'https://www12.senado.leg.br/noticias/materias/2020/03/20/senado-aprova-decreto-de-calamidade-publica',
        label: 'Notícia do Senado',
      },
    ],
  },
  {
    date: '2020-04-24',
    title: 'Uso de máscaras obrigatório',
    description:
      'Primeiras capitais brasileiras tornam obrigatório o uso de máscaras em espaços públicos e transportes coletivos.',
  },
  {
    date: '2021-01-17',
    title: 'Início da vacinação',
    description:
      'A Anvisa autoriza o uso emergencial das vacinas CoronaVac e Oxford/AstraZeneca; a vacinação nacional começa nesta data.',
    attachments: [
      {
        type: 'image',
        url: 'https://agenciabrasil.ebc.com.br/sites/default/files/thumbnails/image/17-01-2021_vacinacaosp_foto_gilberto_marques_govsp_1.jpg',
        label: 'Primeira dose aplicada em São Paulo',
      },
      {
        type: 'video',
        url: 'https://www.youtube.com/embed/lp2Sleqrs_g',
        label: 'Transmissão da primeira vacinação',
      },
    ],
  },
  {
    date: '2021-03-13',
    title: 'Colapso hospitalar',
    description:
      'Hospitais em diversas capitais registram ocupação máxima de UTI na segunda onda, motivando medidas mais rígidas de distanciamento.',
  },
  {
    date: '2021-08-21',
    title: '50% com primeira dose',
    description:
      'Mais da metade da população brasileira recebe ao menos uma dose da vacina contra a COVID-19.',
  },
  {
    date: '2022-03-21',
    title: 'Flexibilização das máscaras',
    description:
      'Após queda sustentada nos casos, diversos estados suspendem a obrigatoriedade do uso de máscaras em ambientes abertos.',
  },
  {
    date: '2022-12-22',
    title: 'Campanha 2023 anunciada',
    description:
      'O Ministério da Saúde apresenta o plano nacional de vacinação contra a COVID-19 para 2023, com reforço anual.',
  },
  {
    date: '2023-05-05',
    title: 'Fim da Emergência Internacional',
    description:
      'A OMS declara o fim da Emergência de Saúde Pública de Importância Internacional, mantendo monitoramento e recomendações.',
    attachments: [
      {
        type: 'link',
        url: 'https://www.who.int/news/item/05-05-2023-statement-on-the-15th-meeting-of-the-ihr-(2005)-emergency-committee-on-the-covid-19-pandemic',
        label: 'Comunicado oficial da OMS',
      },
    ],
  },
];

export const covidEventsByDate = new Map<string, CovidEvent>(
  covidEvents.map((event) => [event.date, event])
);
