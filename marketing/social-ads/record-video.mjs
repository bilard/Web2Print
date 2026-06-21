/**
 * Enregistre merge-anime.html (mode ?clean) en vidéo MP4 1080×1350.
 * Usage : node record-video.mjs
 * Sortie : marketing/social-ads/video/promo-merge.mp4 (+ .webm source)
 * Prérequis : playwright + ffmpeg (présents).
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir, readFile, stat, rename, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const W = 1080, H = 1350;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

const server = http.createServer(async (req, res) => {
  try {
    const path = join(here, decodeURIComponent(req.url.split('?')[0]));
    await stat(path);
    const ext = path.slice(path.lastIndexOf('.'));
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const outDir = join(here, 'video');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: outDir, size: { width: W, height: H } },
});
const page = await ctx.newPage();
console.log('Enregistrement en cours (~50 s)…');
await page.goto(`http://localhost:${port}/merge-anime.html?clean`, { waitUntil: 'networkidle' });
// attend la fin de la passe (drapeau posé par next() en mode clean)
await page.waitForFunction(() => document.body.dataset.done === '1', null, { timeout: 90000 });
await page.waitForTimeout(800); // laisse la dernière slide respirer

const video = page.video();
await ctx.close();           // finalise le .webm
await browser.close();
server.close();

const webmTmp = await video.path();
const webm = join(outDir, 'promo-merge.webm');
await rename(webmTmp, webm);

console.log('Conversion MP4 (H.264)…');
const mp4 = join(outDir, 'promo-merge.mp4');
await run('ffmpeg', ['-y', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
  '-vf', 'scale=1080:1350:flags=lanczos', '-r', '30', '-movflags', '+faststart', mp4]);

await rm(webm, { force: true });   // source webm redondante une fois le MP4 produit
console.log('\nTerminé :\n  ' + mp4);
