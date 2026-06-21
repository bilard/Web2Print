/**
 * Exporte chaque slide des carrousels en PNG 1080×1350 (4:5).
 * Usage : node export-png.mjs
 * Sortie : marketing/social-ads/png/<fichier>/slide-01.png ...
 * Prérequis : playwright (déjà présent dans le projet).
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));

const DECKS = [
  'angle-a-parcours-produit.html',
  'angle-b-avant-apres.html',
  'angle-c-une-journee.html',
];

const MIME = { '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

// Mini serveur statique (file:// est bloqué par Chromium)
const server = http.createServer(async (req, res) => {
  try {
    const path = join(here, decodeURIComponent(req.url.split('?')[0]));
    await stat(path);
    const ext = path.slice(path.lastIndexOf('.'));
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });

for (const deck of DECKS) {
  await page.goto(`http://localhost:${port}/${deck}`, { waitUntil: 'networkidle' });
  const slides = await page.locator('section.slide').count();
  const outDir = join(here, 'png', deck.replace('.html', ''));
  await mkdir(outDir, { recursive: true });
  for (let i = 0; i < slides; i++) {
    const n = String(i + 1).padStart(2, '0');
    await page.locator('section.slide').nth(i).screenshot({ path: join(outDir, `slide-${n}.png`) });
    process.stdout.write(`  ✓ ${deck} → slide-${n}.png\n`);
  }
}

await browser.close();
server.close();
console.log('\nTerminé. PNG dans marketing/social-ads/png/');
