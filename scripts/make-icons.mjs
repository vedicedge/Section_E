/**
 * Renders the PWA / home-screen icons: a vermilion square with an ink Cormorant Garamond "E",
 * plus a monochrome badge for Android's status bar. Run: node scripts/make-icons.mjs
 * Needs Playwright's Chromium (PW_CHROMIUM overrides the executable path).
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const fontFile = path.join(root, 'node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2');
const font = `data:font/woff2;base64,${(await readFile(fontFile)).toString('base64')}`;

const VERMILION = '#f0360f';
const INK = '#160a06';

/** `glyph` is the share of the canvas height the E's cap height should fill. */
const ICONS = [
  { file: 'public/icons/icon-192.png', size: 192, bg: VERMILION, fg: INK, glyph: 0.6 },
  { file: 'public/icons/icon-512.png', size: 512, bg: VERMILION, fg: INK, glyph: 0.6 },
  // Maskable: the E's whole box stays inside the central 60% so any mask shape keeps it intact.
  { file: 'public/icons/maskable-512.png', size: 512, bg: VERMILION, fg: INK, glyph: 0.42, fit: 0.6 },
  { file: 'src/app/apple-icon.png', size: 180, bg: VERMILION, fg: INK, glyph: 0.56 },
  // Badge: Android uses only the alpha channel, so white on transparent, emboldened to survive 24dp.
  { file: 'public/icons/badge-72.png', size: 72, bg: null, fg: '#ffffff', glyph: 0.74, bold: 0.04 },
];

const html = `<!doctype html><html><head><style>
@font-face { font-family: 'Cormorant Garamond'; font-weight: 500; src: url('${font}') format('woff2'); }
</style></head><body></body></html>`;

function draw({ size, bg, fg, glyph, fit, bold }) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  const fontAt = (px) => `500 ${px}px "Cormorant Garamond"`;
  ctx.font = fontAt(100);
  const probe = ctx.measureText('E');
  let px = (glyph * size * 100) / probe.actualBoundingBoxAscent;
  ctx.font = fontAt(px);
  let m = ctx.measureText('E');
  if (fit) {
    const box = Math.max(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
    if (box > fit * size) {
      px *= (fit * size) / box;
      ctx.font = fontAt(px);
      m = ctx.measureText('E');
    }
  }
  const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const x = (size - inkW) / 2 + m.actualBoundingBoxLeft;
  const y = (size - inkH) / 2 + m.actualBoundingBoxAscent;
  ctx.fillStyle = fg;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('E', x, y);
  if (bold) {
    ctx.strokeStyle = fg;
    ctx.lineWidth = bold * size;
    ctx.lineJoin = 'round';
    ctx.strokeText('E', x, y);
  }
  return canvas.toDataURL('image/png');
}

const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.PW_CHROMIUM || (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);
const browser = await chromium.launch({ executablePath });
try {
  const page = await browser.newPage();
  await page.setContent(html);
  await page.evaluate(async () => {
    await document.fonts.load('500 100px "Cormorant Garamond"');
    if (!document.fonts.check('500 100px "Cormorant Garamond"')) throw new Error('Cormorant Garamond failed to load');
  });
  for (const icon of ICONS) {
    const dataUrl = await page.evaluate(draw, icon);
    const out = path.join(root, icon.file);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`wrote ${icon.file} (${icon.size}×${icon.size})`);
  }
} finally {
  await browser.close();
}
