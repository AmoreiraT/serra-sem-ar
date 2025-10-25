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
    date: '2020-02-26',
    title: 'Primeiro caso confirmado no Brasil',
    description:
      'O Ministério da Saúde confirma o primeiro caso de COVID-19 no país, um paciente de São Paulo recém-chegado da Itália.',
    source: 'https://www.gov.br/saude/pt-br/assuntos/noticias/ministerio-da-saude-confirma-primeiro-caso-de-coronavirus-no-brasil',
    attachments: [
      {
        type: 'image',
        url: 'https://agenciabrasil.ebc.com.br/sites/default/files/thumbnails/image/coronavirus_1_0.jpg',
        label: 'Imagem de divulgação do Ministério da Saúde',
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
        url: 'https://www.who.int/director-general/speeches/detail/who-director-general-s-opening-remarks-at-the-media-briefing-on-covid-19---11-march-2020',
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
        url: 'https://www12.senado.leg.br/noticias/materias/2020/03/20/senado-aprova-decreto-de-calamidade-publica',
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
        url: 'https://agenciabrasil.ebc.com.br/politica/noticia/2020-04/mandetta-anuncia-que-foi-demisssionado-do-ministerio-da-saude',
        label: 'Matéria da Agência Brasil',
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
        url: 'https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=447107',
        label: 'Comunicado do STF',
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
        url: 'https://agenciabrasil.ebc.com.br/sites/default/files/thumbnails/image/17-01-2021_vacinacaosp_foto_gilberto_marques_govsp_1.jpg',
        label: 'Primeira dose aplicada em São Paulo',
      },
      {
        type: 'video',
        url: 'https://www.youtube.com/embed/lp2Sleqrs_g',
        label: 'Transmissão oficial',
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
        url: 'https://www12.senado.leg.br/noticias/materias/2021/04/13/instalada-cpi-da-pandemia',
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
        url: 'https://portal.fiocruz.br/noticia/fiocruz-entrega-primeiras-dose-de-ifa-nacional-da-vacina-covid-19',
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
        url: 'https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2021/anvisa-aprova-vacina-da-pfizer-para-criancas-de-5-a-11-anos',
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
        url: 'https://www.gov.br/saude/pt-br/assuntos/noticias/2022/julho/ministerio-da-saude-planeja-reforco-bivalente-contra-a-covid-19',
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
          url: 'https://www.gov.br/saude/pt-br/assuntos/noticias/2023/fevereiro/brasil-inicia-vacinacao-bivalente-contra-a-covid-19',
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
        url: 'https://www.gov.br/saude/pt-br/assuntos/noticias/2023/marco/ministerio-da-saude-amplia-publico-alvo-para-vacinacao-bivalente-contra-a-covid-19',
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
        url: 'https://www.who.int/news/item/05-05-2023-statement-on-the-15th-meeting-of-the-ihr-(2005)-emergency-committee-on-the-covid-19-pandemic',
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
        url: 'https://www.gov.br/saude/pt-br/assuntos/noticias/2023/julho/ministerio-da-saude-lanca-movimento-nacional-pela-vacinacao',
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
        url: 'https://www.gov.br/saude/pt-br/assuntos/noticias/2024/fevereiro/ministerio-da-saude-inicia-vacinacao-de-reforco-contra-a-covid-19',
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
