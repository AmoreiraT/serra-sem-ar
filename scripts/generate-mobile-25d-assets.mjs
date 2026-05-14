import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(rootDir, 'public/data/brasil-covid-daily.json');
const passageDir = path.join(rootDir, 'public/assets/25d/passages');
const overlayDir = path.join(rootDir, 'public/assets/25d/overlays');
const width = 1280;
const height = 720;

const passageConfigs = [
  {
    id: 'inicio',
    start: 0,
    end: 0.16,
    back: ['#0b4d39', '#00a86b'],
    front: ['#19372b', '#f2c94c'],
    intensity: 0.42,
  },
  {
    id: 'primeira-escalada',
    start: 0.16,
    end: 0.34,
    back: ['#3f3412', '#f2c94c'],
    front: ['#4c250f', '#d9890f'],
    intensity: 0.64,
  },
  {
    id: 'colapso',
    start: 0.34,
    end: 0.58,
    back: ['#4b0508', '#d9230f'],
    front: ['#170304', '#f24a2e'],
    intensity: 1,
  },
  {
    id: 'ecos',
    start: 0.58,
    end: 1,
    back: ['#151515', '#6f6b61'],
    front: ['#0d0b0a', '#c9bca3'],
    intensity: 0.78,
  },
];

const smoothSeries = (series, radius = 8) => {
  if (series.length === 0) return [];
  const weights = [];
  let weightSum = 0;

  for (let k = -radius; k <= radius; k += 1) {
    const weight = Math.exp(-(k * k) / (2 * radius * radius));
    weights.push(weight);
    weightSum += weight;
  }

  return series.map((_, idx) => {
    let acc = 0;
    weights.forEach((weight, offset) => {
      const relative = offset - radius;
      const sampleIndex = Math.min(Math.max(idx + relative, 0), series.length - 1);
      acc += series[sampleIndex] * weight;
    });
    return acc / weightSum;
  });
};

const seededFraction = (seed) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const loadSamples = async () => {
  const raw = JSON.parse(await readFile(dataPath, 'utf8'));
  const records = Array.isArray(raw.records) ? raw.records : [];
  const cases = smoothSeries(records.map((record) => Number(record.cases ?? 0)));
  const deaths = smoothSeries(records.map((record) => Number(record.deaths ?? 0)));
  const maxCases = Math.max(...cases, 1);
  const maxDeaths = Math.max(...deaths, 1);

  return records.map((record, index) => {
    const casesNorm = Math.pow(cases[index] / maxCases, 0.58);
    const deathsNorm = Math.pow(deaths[index] / maxDeaths, 0.66);

    return {
      date: String(record.date ?? ''),
      value: Math.min(1, casesNorm * 0.36 + deathsNorm * 0.84),
      casesNorm,
      deathsNorm,
    };
  });
};

const getPassageSamples = (samples, start, end) => {
  const startIndex = Math.floor(start * Math.max(0, samples.length - 1));
  const endIndex = Math.max(startIndex + 8, Math.ceil(end * Math.max(0, samples.length - 1)));
  return samples.slice(startIndex, Math.min(endIndex + 1, samples.length));
};

const makeRidgePath = (samples, options) => {
  const sampleCount = Math.max(samples.length, 2);
  const points = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const sourceIndex = Math.min(index, samples.length - 1);
    const sample = samples[sourceIndex] ?? { value: 0, deathsNorm: 0, casesNorm: 0 };
    const x = (index / (sampleCount - 1)) * width;
    const wave =
      Math.sin(index * options.waveA + options.seed) * options.noise +
      Math.cos(index * options.waveB + options.seed * 0.7) * options.noise * 0.56;
    const shoulders = Math.sin((index / (sampleCount - 1)) * Math.PI) * options.shoulder;
    const y = options.baseline - sample.value * options.amplitude - sample.deathsNorm * options.peakBoost - shoulders + wave;
    points.push(`${x.toFixed(1)},${Math.max(18, y).toFixed(1)}`);
  }

  return `M 0 ${options.baseline} L ${points.join(' L ')} L ${width} ${options.baseline} Z`;
};

const makeCrestPath = (samples, options) => {
  const sampleCount = Math.max(samples.length, 2);
  const points = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const sourceIndex = Math.min(index, samples.length - 1);
    const sample = samples[sourceIndex] ?? { value: 0, deathsNorm: 0, casesNorm: 0 };
    const x = (index / (sampleCount - 1)) * width;
    const wave = Math.sin(index * options.waveA + options.seed) * options.noise;
    const shoulders = Math.sin((index / (sampleCount - 1)) * Math.PI) * options.shoulder;
    const y = options.baseline - sample.value * options.amplitude - sample.deathsNorm * options.peakBoost - shoulders + wave;
    points.push(`${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${Math.max(18, y).toFixed(1)}`);
  }

  return points.join(' ');
};

const makeTopography = (tone, opacity) => {
  const lines = [];
  for (let i = 0; i < 18; i += 1) {
    const y = 170 + i * 24;
    const d = [
      `M 0 ${y}`,
      `C ${260 + i * 7} ${y - 38}, ${430 - i * 3} ${y + 42}, ${width * 0.55} ${y}`,
      `S ${width - 180} ${y - 48}, ${width} ${y - 4}`,
    ].join(' ');
    lines.push(`<path d="${d}" fill="none" stroke="${tone}" stroke-opacity="${opacity}" stroke-width="1" />`);
  }
  return lines.join('');
};

const makeDust = (tone, count, opacity) => {
  const dots = [];
  for (let i = 0; i < count; i += 1) {
    const x = seededFraction(i + 31) * width;
    const y = 80 + seededFraction(i + 73) * 520;
    const radius = 0.6 + seededFraction(i + 109) * 1.8;
    dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${tone}" opacity="${opacity}" />`);
  }
  return dots.join('');
};

const makePassageSvg = (samples, config, layer) => {
  const isFront = layer === 'front';
  const colors = isFront ? config.front : config.back;
  const ridgePath = makeRidgePath(samples, {
    baseline: isFront ? 676 : 576,
    amplitude: (isFront ? 360 : 250) * config.intensity,
    peakBoost: isFront ? 155 : 96,
    shoulder: isFront ? 72 : 44,
    noise: isFront ? 13 : 9,
    waveA: isFront ? 0.43 : 0.35,
    waveB: isFront ? 0.18 : 0.16,
    seed: config.id.length * (isFront ? 3.1 : 1.7),
  });
  const crestPath = makeCrestPath(samples, {
    baseline: isFront ? 676 : 576,
    amplitude: (isFront ? 360 : 250) * config.intensity,
    peakBoost: isFront ? 155 : 96,
    shoulder: isFront ? 72 : 44,
    noise: isFront ? 13 : 9,
    waveA: isFront ? 0.43 : 0.35,
    seed: config.id.length * (isFront ? 3.1 : 1.7),
  });
  const secondaryPath = makeRidgePath(samples.slice().reverse(), {
    baseline: isFront ? 704 : 624,
    amplitude: (isFront ? 205 : 170) * config.intensity,
    peakBoost: isFront ? 84 : 64,
    shoulder: isFront ? 36 : 28,
    noise: isFront ? 8 : 6,
    waveA: 0.29,
    waveB: 0.13,
    seed: config.id.length * 5.3,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="ridge" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${colors[0]}" stop-opacity="${isFront ? 0.96 : 0.74}" />
        <stop offset="0.56" stop-color="${colors[1]}" stop-opacity="${isFront ? 0.92 : 0.58}" />
        <stop offset="1" stop-color="#050505" stop-opacity="${isFront ? 0.98 : 0.72}" />
      </linearGradient>
      <linearGradient id="shadow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#050505" stop-opacity="0" />
        <stop offset="1" stop-color="#050505" stop-opacity="${isFront ? 0.82 : 0.48}" />
      </linearGradient>
    </defs>
    ${makeTopography(escapeXml(colors[1]), isFront ? 0.18 : 0.1)}
    ${makeDust(escapeXml(colors[1]), isFront ? 160 : 90, isFront ? 0.08 : 0.05)}
    <path d="${secondaryPath}" fill="${escapeXml(colors[0])}" opacity="${isFront ? 0.32 : 0.22}" />
    <path d="${ridgePath}" fill="url(#ridge)" />
    <path d="${ridgePath}" fill="url(#shadow)" />
    <path d="${crestPath}" fill="none" stroke="${escapeXml(colors[1])}" stroke-opacity="${isFront ? 0.7 : 0.34}" stroke-width="${isFront ? 3 : 2}" />
  </svg>`;
};

const makeCrossOverlaySvg = () => {
  const crosses = [];
  for (let i = 0; i < 150; i += 1) {
    const x = 36 + seededFraction(i + 5) * (width - 72);
    const y = 118 + seededFraction(i + 41) * 492;
    const size = 7 + seededFraction(i + 97) * 24;
    const opacity = 0.12 + seededFraction(i + 131) * 0.32;
    crosses.push(`<g opacity="${opacity.toFixed(3)}" stroke="#f2f2e8" stroke-width="${Math.max(1, size * 0.08).toFixed(1)}" stroke-linecap="round">
      <path d="M ${x.toFixed(1)} ${(y - size * 0.42).toFixed(1)} L ${x.toFixed(1)} ${(y + size * 0.58).toFixed(1)}" />
      <path d="M ${(x - size * 0.32).toFixed(1)} ${(y - size * 0.12).toFixed(1)} L ${(x + size * 0.32).toFixed(1)} ${(y - size * 0.12).toFixed(1)}" />
    </g>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${crosses.join('')}
  </svg>`;
};

const renderImage = async (svg, outputPath, format, quality) => {
  const pipeline = sharp(Buffer.from(svg)).resize(width, height, { fit: 'cover' });
  const encoded =
    format === 'avif'
      ? pipeline.avif({ quality, effort: 6, chromaSubsampling: '4:2:0' })
      : pipeline.webp({ quality, alphaQuality: 72, effort: 6, smartSubsample: true });

  await encoded.toFile(outputPath);

  const metadata = await sharp(outputPath).metadata();
  console.log(`${path.relative(rootDir, outputPath)} ${metadata.width}x${metadata.height}`);
};

const renderLayer = async (svg, outputBasePath, webpQuality, avifQuality) => {
  await renderImage(svg, `${outputBasePath}.webp`, 'webp', webpQuality);
  await renderImage(svg, `${outputBasePath}.avif`, 'avif', avifQuality);
};

const renderWebp = async (svg, outputPath, quality) => {
  await sharp(Buffer.from(svg))
    .resize(width, height, { fit: 'cover' })
    .webp({ quality, alphaQuality: 72, effort: 6, smartSubsample: true })
    .toFile(outputPath);

  const metadata = await sharp(outputPath).metadata();
  console.log(`${path.relative(rootDir, outputPath)} ${metadata.width}x${metadata.height}`);
};

const samples = await loadSamples();

await mkdir(passageDir, { recursive: true });
await mkdir(overlayDir, { recursive: true });

for (const config of passageConfigs) {
  const passageSamples = getPassageSamples(samples, config.start, config.end);
  await renderLayer(
    makePassageSvg(passageSamples, config, 'back'),
    path.join(passageDir, `${config.id}-back`),
    58,
    42
  );
  await renderLayer(
    makePassageSvg(passageSamples, config, 'front'),
    path.join(passageDir, `${config.id}-front`),
    64,
    46
  );
}

await renderWebp(makeCrossOverlaySvg(), path.join(overlayDir, 'cruzes-memoria.webp'), 52);
await renderImage(makeCrossOverlaySvg(), path.join(overlayDir, 'cruzes-memoria.avif'), 'avif', 38);
