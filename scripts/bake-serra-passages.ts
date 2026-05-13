import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

type PassageId = 'inicio' | 'primeira-escalada' | 'colapso' | 'ecos';
type PassageLayer = 'back' | 'front';
type BakeProfile = 'standard' | 'mobile-low';

interface BakeTarget {
  readonly passageId: PassageId;
  readonly layer: PassageLayer;
  readonly output: string;
}

interface BakeArgs {
  readonly baseUrl: string;
  readonly transparent: boolean;
  readonly useBundledChromium: boolean;
  readonly profile: BakeProfile;
}

interface BakeProfileConfig {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly webpFrontQuality: number;
  readonly webpBackQuality: number;
  readonly avifFrontQuality: number;
  readonly avifBackQuality: number;
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bakeTargets: readonly BakeTarget[] = [
  { passageId: 'inicio', layer: 'back', output: 'inicio-back.webp' },
  { passageId: 'inicio', layer: 'front', output: 'inicio-front.webp' },
  { passageId: 'primeira-escalada', layer: 'back', output: 'primeira-escalada-back.webp' },
  { passageId: 'primeira-escalada', layer: 'front', output: 'primeira-escalada-front.webp' },
  { passageId: 'colapso', layer: 'back', output: 'colapso-back.webp' },
  { passageId: 'colapso', layer: 'front', output: 'colapso-front.webp' },
  { passageId: 'ecos', layer: 'back', output: 'ecos-back.webp' },
  { passageId: 'ecos', layer: 'front', output: 'ecos-front.webp' },
];

const bakeProfileConfig: Record<BakeProfile, BakeProfileConfig> = {
  standard: {
    viewportWidth: 1280,
    viewportHeight: 720,
    outputWidth: 1280,
    outputHeight: 720,
    webpFrontQuality: 64,
    webpBackQuality: 58,
    avifFrontQuality: 46,
    avifBackQuality: 42,
  },
  'mobile-low': {
    viewportWidth: 960,
    viewportHeight: 540,
    outputWidth: 960,
    outputHeight: 540,
    webpFrontQuality: 56,
    webpBackQuality: 50,
    avifFrontQuality: 36,
    avifBackQuality: 32,
  },
};

const parseArgs = (): BakeArgs => {
  const baseUrlIndex = process.argv.indexOf('--base-url');
  const baseUrl =
    baseUrlIndex >= 0 && process.argv[baseUrlIndex + 1]
      ? process.argv[baseUrlIndex + 1]
      : 'http://localhost:5173';
  const profileIndex = process.argv.indexOf('--profile');
  const profileArg = profileIndex >= 0 ? process.argv[profileIndex + 1] : undefined;
  const profile = profileArg === 'standard' || profileArg === 'mobile-low' ? profileArg : 'mobile-low';

  return {
    baseUrl,
    transparent: process.argv.includes('--transparent'),
    useBundledChromium: process.argv.includes('--bundled-chromium'),
    profile,
  };
};

const makeBakeUrl = (baseUrl: string, target: BakeTarget, transparent: boolean): string => {
  const url = new URL('/bake', baseUrl);
  url.searchParams.set('passage', target.passageId);
  url.searchParams.set('layer', target.layer);
  if (transparent) {
    url.searchParams.set('transparent', '1');
  }
  return url.toString();
};

const readCanvasPng = async (): Promise<Buffer> => {
  const dataUrl = await page.locator('canvas').first().evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    return target.toDataURL('image/png');
  });
  const base64Payload = dataUrl.replace(/^data:image\/png;base64,/u, '');
  return Buffer.from(base64Payload, 'base64');
};

const args = parseArgs();
const profile = bakeProfileConfig[args.profile];
const outputDir = path.join(rootDir, 'public/assets/25d/passages', args.profile);
await mkdir(outputDir, { recursive: true });

console.log(`Bake profile: ${args.profile} (${profile.outputWidth}x${profile.outputHeight})`);

const browser = await chromium.launch(
  args.useBundledChromium
    ? undefined
    : {
      channel: 'chrome',
    }
);
const page = await browser.newPage({
  viewport: { width: profile.viewportWidth, height: profile.viewportHeight },
  deviceScaleFactor: 1,
});

try {
  for (const target of bakeTargets) {
    const url = makeBakeUrl(args.baseUrl, target, args.transparent);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2600);

    const pngBuffer = await readCanvasPng();
    const outputPath = path.join(outputDir, target.output);
    const avifOutputPath = outputPath.replace(/\.webp$/u, '.avif');

    await sharp(pngBuffer)
      .resize(profile.outputWidth, profile.outputHeight, { fit: 'cover' })
      .webp({
        quality: target.layer === 'front' ? profile.webpFrontQuality : profile.webpBackQuality,
        alphaQuality: 72,
        effort: 6,
        smartSubsample: true,
      })
      .toFile(outputPath);

    await sharp(pngBuffer)
      .resize(profile.outputWidth, profile.outputHeight, { fit: 'cover' })
      .avif({
        quality: target.layer === 'front' ? profile.avifFrontQuality : profile.avifBackQuality,
        effort: 6,
        chromaSubsampling: '4:2:0',
      })
      .toFile(avifOutputPath);

    console.log(
      `${target.passageId}/${target.layer} -> ${path.relative(rootDir, outputPath)}, ${path.relative(
        rootDir,
        avifOutputPath
      )}`
    );
  }
} finally {
  await browser.close();
}
