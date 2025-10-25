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
    date: '2020-03-24',
    title: 'Pronunciamento sobre "gripezinha"',
    description:
      'Em cadeia nacional, o presidente Jair Bolsonaro minimiza a gravidade da COVID-19 e critica medidas de isolamento, chamando a doença de "resfriadinho".',
    source: 'https://www.gov.br/planalto/pt-br/acompanhe-o-planalto/noticias/2020/03/pronunciamento-em-cadeia-de-radio-e-tv-sobre-o-coronavirus',
    attachments: [
      {
        type: 'text',
        content: '“No meu caso particular, pelo meu histórico de atleta, caso fosse contaminado, não precisaria me preocupar, nada sentiria ou seria quando muito acometido de uma gripezinha.”',
      },
    ],
  },
  {
    date: '2020-04-16',
    title: 'Demissão de Luiz Henrique Mandetta',
    description:
      'O ministro da Saúde Luiz Henrique Mandetta é exonerado após divergências com o Palácio do Planalto sobre medidas de distanciamento social.',
    attachments: [
      {
        type: 'link',
        url: 'https://agenciabrasil.ebc.com.br/politica/noticia/2020-04/mandetta-anuncia-que-foi-demisssionado-do-ministerio-da-saude',
        label: 'Matéria da Agência Brasil',
      },
    ],
  },
  {
    date: '2020-06-19',
    title: 'Brasil ultrapassa 1 milhão de casos',
    description:
      'O país atinge a marca de 1 milhão de casos confirmados de COVID-19, com mais de 48 mil mortes registradas.',
    attachments: [
      {
        type: 'link',
        url: 'https://covid.saude.gov.br/',
        label: 'Painel COVID-19 (Ministério da Saúde)',
      },
    ],
  },
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
    date: '2020-12-17',
    title: 'CoronaVac apresenta eficácia elevada',
    description:
      'O Instituto Butantan anuncia que a CoronaVac apresentou segurança e eficácia na fase 3 de testes no Brasil.',
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
    date: '2021-04-13',
    title: 'Instalação da CPI da COVID',
    description:
      'O Senado instala a Comissão Parlamentar de Inquérito para apurar ações e omissões do governo federal na pandemia.',
    attachments: [
      {
        type: 'link',
        url: 'https://www12.senado.leg.br/noticias/materias/2021/04/13/instalada-cpi-da-pandemia',
        label: 'Notícia do Senado Federal',
      },
    ],
  },
  {
    date: '2021-08-21',
    title: '50% com primeira dose',
    description:
      'Mais da metade da população brasileira recebe ao menos uma dose da vacina contra a COVID-19.',
  },
  {
    date: '2021-12-16',
    title: 'Vacinação infantil autorizada',
    description:
      'A Anvisa aprova o uso da vacina Pfizer para crianças de 5 a 11 anos, marcando nova fase da campanha.',
    attachments: [
      {
        type: 'link',
        url: 'https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2021/anvisa-aprova-vacina-da-pfizer-para-criancas-de-5-a-11-anos',
        label: 'Nota da Anvisa',
      },
    ],
  },
  {
    date: '2022-03-21',
    title: 'Flexibilização das máscaras',
    description:
      'Após queda sustentada nos casos, diversos estados suspendem a obrigatoriedade do uso de máscaras em ambientes abertos.',
  },
  {
    date: '2022-07-18',
    title: 'Reforço bivalente anunciado',
    description:
      'O Ministério da Saúde apresenta a estratégia de vacinação com doses bivalentes para grupos prioritários a partir de 2023.',
    attachments: [
      {
        type: 'link',
        url: 'https://www.gov.br/saude/pt-br/assuntos/noticias/2022/julho/ministerio-da-saude-planeja-reforco-bivalente-contra-a-covid-19',
        label: 'Plano de reforço bivalente',
      },
    ],
  },
  {
    date: '2022-12-22',
    title: 'Campanha 2023 anunciada',
    description:
      'O Ministério da Saúde apresenta o plano nacional de vacinação contra a COVID-19 para 2023, com reforço anual.',
  },
  {
    date: '2023-03-27',
    title: 'Vacinação bivalente é ampliada',
    description:
      'Vacinas bivalentes passam a ser ofertadas para novos grupos prioritários em todo o país.',
    attachments: [
      {
        type: 'link',
        url: 'https://www.gov.br/saude/pt-br/assuntos/noticias/2023/marco/ministerio-da-saude-amplia-publico-alvo-para-vacinacao-bivalente-contra-a-covid-19',
        label: 'Ampliação da campanha bivalente',
      },
    ],
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
