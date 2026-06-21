/**
 * Enregistre digital.html (?clean) en vidéo MP4 1080×1920.
 * Usage : node record-video.mjs
 * Sortie : marketing/promo-digital/video/promo-digital.mp4
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
const W = 1080, H = 1920;
const MIME = { '.html':'text/html','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2' };

const server = http.createServer(async (req, res) => {
  try {
    const p = join(here, decodeURIComponent(req.url.split('?')[0]));
    await stat(p);
    res.writeHead(200, { 'Content-Type': MIME[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream' });
    res.end(await readFile(p));
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const outDir = join(here, 'video');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: outDir, size: { width: W, height: H } } });
const page = await ctx.newPage();
console.log('Enregistrement (~60 s)…');
await page.goto(`http://localhost:${port}/digital.html?clean`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.body.dataset.done === '1', null, { timeout: 120000 });
await page.waitForTimeout(700);

const video = page.video();
await ctx.close();
await browser.close();
server.close();

const webm = join(outDir, 'promo-digital.webm');
await rename(await video.path(), webm);
console.log('Conversion MP4…');
const mp4 = join(outDir, 'promo-digital.mp4');
await run('ffmpeg', ['-y','-i',webm,'-c:v','libx264','-pix_fmt','yuv420p','-vf','scale=1080:1920:flags=lanczos','-r','30','-movflags','+faststart',mp4]);
await rm(webm, { force: true });
console.log('Terminé :', mp4);
