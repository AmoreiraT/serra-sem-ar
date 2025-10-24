import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import yauzl from 'yauzl';

const PARSE_APP_ID = 'unAFkcaNDeXajurGB7LChj8SgQYS2ptm';
const CDN_URL = 'https://qd28tcd6b5.execute-api.sa-east-1.amazonaws.com/prod';
const START_DATE = '2020-02-25';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_PATH = path.resolve(__dirname, '../public/data/brasil-covid-daily.json');

const ensureDirectory = async (targetPath) => {
  const dir = path.dirname(targetPath);
  await mkdir(dir, { recursive: true });
};

const parseNumber = (value) => {
  if (!value) return 0;
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const result = Number(normalized);
  return Number.isNaN(result) ? 0 : result;
};

const processLine = (line, accumulator) => {
  if (!line) return;
  const cleaned = line.replace(/\ufeff/g, '');
  if (!cleaned || cleaned.startsWith('regiao;')) return;
  const parts = cleaned.split(';');
  if (parts.length < 14) return;

  const regiao = parts[0];
  if (regiao !== 'Brasil') return;

  const date = parts[7];
  if (!date) return;

  const record = {
    casesAcc: parseNumber(parts[10]),
    cases: Math.max(parseNumber(parts[11]), 0),
    deathsAcc: parseNumber(parts[12]),
    deaths: Math.max(parseNumber(parts[13]), 0),
  };

  accumulator.set(date, record);
};

const extractRecordsFromZip = (buffer) =>
  new Promise((resolve, reject) => {
    const accumulator = new Map();

    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        if (!/HIST_PAINEL_COVIDBR_.*\.csv$/i.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) {
            zipfile.close();
            reject(streamErr);
            return;
          }

          let leftover = '';
          stream.on('data', (chunk) => {
            const text = leftover + chunk.toString('utf8');
            const lines = text.split(/\r?\n/);
            leftover = lines.pop() || '';
            lines.forEach((line) => processLine(line, accumulator));
          });

          stream.on('end', () => {
            if (leftover) processLine(leftover, accumulator);
            zipfile.readEntry();
          });

          stream.on('error', (streamError) => {
            zipfile.close();
            reject(streamError);
          });
        });
      });

      zipfile.on('end', () => resolve(accumulator));
      zipfile.on('error', reject);
    });
  });

const fetchLatestArchiveInfo = async () => {
  const response = await axios.get(`${CDN_URL}/PortalGeral`, {
    headers: { 'X-Parse-Application-Id': PARSE_APP_ID },
    responseType: 'json',
  });

  const [latest] = response.data?.results ?? [];
  if (!latest?.arquivo?.url) {
    throw new Error('Não foi possível localizar o arquivo histórico no PortalGeral.');
  }

  return {
    archiveUrl: latest.arquivo.url,
    archiveName: latest.arquivo.name,
    updatedAt: latest.dt_atualizacao ?? null,
  };
};

const buildTimeline = (recordsMap) => {
  const entries = Array.from(recordsMap.entries()).filter(([date]) => date >= START_DATE);
  entries.sort(([dateA], [dateB]) => (dateA < dateB ? -1 : dateA > dateB ? 1 : 0));

  return entries.map(([date, data], index) => ({
    date,
    cases: data.cases,
    deaths: data.deaths,
    casesAcc: data.casesAcc,
    deathsAcc: data.deathsAcc,
    dayIndex: index,
  }));
};

const main = async () => {
  console.log('🔄 Buscando metadados atualizados...');
  const { archiveUrl, archiveName, updatedAt } = await fetchLatestArchiveInfo();
  console.log(`⬇️  Baixando arquivo oficial: ${archiveName}`);

  const archiveResponse = await axios.get(archiveUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(archiveResponse.data);

  console.log('📦 Extraindo séries diárias para o Brasil...');
  const recordsMap = await extractRecordsFromZip(buffer);
  const timeline = buildTimeline(recordsMap);

  const payload = {
    source: archiveUrl,
    archiveName,
    updatedAt,
    generatedAt: new Date().toISOString(),
    records: timeline,
  };

  await ensureDirectory(OUTPUT_PATH);
  await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`✅ Série histórica salva em ${path.relative(process.cwd(), OUTPUT_PATH)} (${timeline.length} dias).`);
};

main().catch((error) => {
  console.error('❌ Erro ao atualizar a base oficial do Brasil:', error);
  process.exitCode = 1;
});
