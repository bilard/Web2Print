/**
 * Carte SOCIALE (LinkedIn) d'une scène de la home /promo : la fenêtre du module, agrandie et
 * posée sur un fond de charte, avec surtitre / titre / pied — filmée en temps réel puis encodée
 * en .mp4 vertical 4:5.
 *
 * Pourquoi un script à part de capture-rt.mjs : celui-ci capture la fenêtre à sa taille CSS
 * (~590 px de large → illisible dans un fil mobile). Ici on applique un `transform: scale()`
 * AVANT le rendu, donc le texte est rasterisé à la taille finale (net), et on compose autour.
 *
 * Usage : node capture-social.mjs <#id-de-scene> [--title=…] [--kicker=…] [--note=…]
 *                                 [--w=1080] [--h=1350] [--loop=14] [--out=nom]
 * Sortie : marketing/social-cards/<nom>.mp4  (+ <nom>.jpg, vignette de contrôle)
 *
 * ⚠ Pièges repris de capture-rt.mjs : screencast en 1× (pas ×deviceScaleFactor), `-nostdin` +
 * timeout sur chaque ffmpeg, consent.js bloqué, overlays fixed masqués, dimensions figées.
 * La période n'est PAS détectée : on la passe en --loop (elle est connue, cf. `--vtD` en CSS).
 */
import { chromium } from 'playwright';
import { readFile, stat, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, '..', '..', 'public');
const OUT = join(here, '..', 'social-cards');

const args = process.argv.slice(2);
const sceneId = (args.find((a) => !a.startsWith('--')) || 'veille').replace(/^#/, '');
const opt = (k, d) => {
  const hit = args.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const W = Number(opt('w', 1080));
const H = Number(opt('h', 1350));
const LOOP = Number(opt('loop', 14));
const TITLE = opt('title', 'Veille tarifaire');
const KICKER = opt('kicker', 'IBS-STUDIO · MODULE 11');
const NOTE = opt('note', 'ibs-studio.com');
const NAME = opt('out', sceneId);
const FPS = 30;
const XFADE = 0.4;
const PAD_TOP = 132;   // bandeau titre
const PAD_BOT = 96;    // pied
const PAD_X = 34;

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  try {
    let p = join(PUBLIC, decodeURIComponent(req.url.split('?')[0]));
    const s = await stat(p).catch(() => null);
    if (s && s.isDirectory()) p = join(p, 'index.html');
    const buf = await readFile(p);
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { if (!res.headersSent) res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
// viewport = la carte finale. deviceScaleFactor 1 : le screencast sort de toute façon en 1×.
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.route('**/consent.js', (r) => r.abort());
await page.addInitScript(() => { try { localStorage.setItem('cs_consent', 'denied'); } catch {} });
await page.goto(`http://localhost:${port}/promo/index.html`, { waitUntil: 'networkidle' });

// La fenêtre du module est dimensionnée par la mise en page ; on la mesure dans un viewport
// « desktop » avant de rétrécir à la taille de la carte, sinon on capture la variante mobile.
await page.setViewportSize({ width: 1600, height: 1000 });
await page.evaluate((id) => {
  document.querySelectorAll('.scene-visual').forEach((e) => e.classList.add('is-in'));
  document.getElementById(id)?.scrollIntoView({ block: 'center' });
}, sceneId);
await page.waitForTimeout(700);

const box = await page.evaluate((id) => {
  const el = document.querySelector(`#${id} .screen`);
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
}, sceneId);

const k = Math.min((W - 2 * PAD_X) / box.w, (H - PAD_TOP - PAD_BOT) / box.h);
const left = Math.round((W - box.w * k) / 2);
const top = Math.round(PAD_TOP + (H - PAD_TOP - PAD_BOT - box.h * k) / 2);
console.log(`fenêtre ${box.w}×${box.h} · échelle ${k.toFixed(2)} · carte ${W}×${H}`);

// Composition : tout est masqué par un fond opaque, seule la fenêtre du module est remontée.
// On NE DÉPLACE PAS le nœud (les animations sont scopées `#id .scene-visual.is-in .x`).
await page.addStyleTag({ content: `
  html,body{overflow:hidden!important;background:#07070c!important}
  #sc-bg{position:fixed;inset:0;z-index:9990;background:
    radial-gradient(900px 620px at 50% -8%,rgba(99,102,241,.22),transparent 62%),
    radial-gradient(700px 520px at 88% 104%,rgba(34,211,238,.14),transparent 60%),#07070c}
  /* ⚠ .scene-visual porte un transform + opacity (animation de reveal au scroll) : le transform
     ancre le position:fixed de l'enfant sur LUI (fenêtre hors écran) et l'opacity crée un
     contexte d'empilement qui enferme le z-index. Les !important auteur battent l'animation. */
  #${sceneId} .scene-visual{transform:none!important;translate:none!important;opacity:1!important;z-index:auto!important;overflow:visible!important}
  #${sceneId} .screen{
    position:fixed!important;z-index:9995!important;
    left:${left}px!important;top:${top}px!important;
    width:${box.w}px!important;height:${box.h}px!important;
    transform:scale(${k})!important;transform-origin:top left!important;
    box-shadow:0 40px 90px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.07)!important;
    margin:0!important}
  #sc-head,#sc-foot{position:fixed;z-index:9996;left:0;right:0;text-align:center;
    font-family:'Jura',system-ui,sans-serif;color:#fff}
  #sc-head{top:30px}
  #sc-head .k{display:block;font-family:'JetBrains Mono',monospace;font-size:15px;letter-spacing:.22em;
    text-transform:uppercase;color:#a5b4fc;margin-bottom:12px}
  #sc-head .t{display:block;font-size:52px;font-weight:700;letter-spacing:-.01em;line-height:1}
  #sc-foot{bottom:26px}
  #sc-foot .n{display:block;font-family:'JetBrains Mono',monospace;font-size:17px;letter-spacing:.13em;
    text-transform:uppercase;color:#e5e7eb}
  #sc-foot .s{display:block;font-size:13px;color:#8b8b9a;margin-top:7px;letter-spacing:.02em}
` });
await page.evaluate(({ kicker, title, note }) => {
  const bg = document.createElement('div'); bg.id = 'sc-bg'; document.body.appendChild(bg);
  const h = document.createElement('div'); h.id = 'sc-head';
  h.innerHTML = `<span class="k"></span><span class="t"></span>`;
  h.querySelector('.k').textContent = kicker; h.querySelector('.t').textContent = title;
  document.body.appendChild(h);
  const f = document.createElement('div'); f.id = 'sc-foot';
  f.innerHTML = `<span class="n"></span><span class="s"></span>`;
  f.querySelector('.n').textContent = note;
  f.querySelector('.s').textContent = 'Démonstration — enseignes et données fictives';
  document.body.appendChild(f);
}, { kicker: KICKER, title: TITLE, note: NOTE });

await page.setViewportSize({ width: W, height: H });
await page.waitForTimeout(400);

// Relance le cycle d'animation à zéro pour capturer une période pleine depuis son début.
await page.evaluate((id) => {
  document.querySelectorAll(`#${id} .screen *`).forEach((el) =>
    el.getAnimations({ subtree: false }).forEach((a) => { a.cancel(); a.play() }));
}, sceneId);

const jpg = join(OUT, `${NAME}.jpg`);
await page.screenshot({ path: jpg, type: 'jpeg', quality: 92 });

if (args.includes('--still')) {
  console.log(`vignette seule → ${jpg}`);
  await browser.close(); server.close(); process.exit(0);
}

const framesDir = join(OUT, `.frames-${NAME}`);
await rm(framesDir, { recursive: true, force: true });
await mkdir(framesDir, { recursive: true });
const client = await page.context().newCDPSession(page);
const frames = [];
let n = 0, tFirst = null;
const onFrame = async ({ data, sessionId, metadata }) => {
  client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  if (tFirst == null) tFirst = metadata.timestamp;
  const file = join(framesDir, `f${String(n).padStart(5, '0')}.jpg`);
  await writeFile(file, Buffer.from(data, 'base64'));
  frames.push({ file, t: metadata.timestamp - tFirst });
  n++;
};
client.on('Page.screencastFrame', onFrame);
const REC = LOOP + 1.4;
process.stdout.write(`enregistrement ${REC}s`);
await client.send('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 2 });
await page.waitForTimeout(REC * 1000);
await client.send('Page.stopScreencast');
client.off('Page.screencastFrame', onFrame);
await page.waitForTimeout(200);
await browser.close(); server.close();
process.stdout.write(` · ${frames.length} frames`);

let concat = '';
for (let i = 0; i < frames.length; i++) {
  const dur = (i < frames.length - 1) ? (frames[i + 1].t - frames[i].t) : (1 / FPS);
  concat += `file '${frames[i].file.replace(/'/g, "'\\''")}'\nduration ${Math.max(0.001, dur).toFixed(4)}\n`;
}
concat += `file '${frames[frames.length - 1].file.replace(/'/g, "'\\''")}'\n`;
const listFile = join(framesDir, 'list.txt');
await writeFile(listFile, concat);

// échelle réelle de la frame screencast (souvent 1×) → mise à l'échelle vers W×H exact
const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
  'stream=width', '-of', 'csv=p=0', frames[0].file]);
const frameW = parseInt(probe.stdout.trim(), 10) || W;
const scale = `scale=${W}:${H}:flags=lanczos`;
if (frameW !== W) process.stdout.write(` · frames ${frameW}px → ${W}px`);

const mp4 = join(OUT, `${NAME}.mp4`);
const T = Math.min(LOOP, frames[frames.length - 1].t - 0.05);
const d = Math.min(XFADE, T / 3);
const ENC = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart'];
const fc = [
  `[0:v]${scale},fps=${FPS},format=yuv420p,split=3[a][b][c]`,
  `[a]trim=0:${d.toFixed(3)},setpts=PTS-STARTPTS[head]`,
  `[b]trim=${(T - d).toFixed(3)}:${T.toFixed(3)},setpts=PTS-STARTPTS[tail]`,
  `[tail][head]xfade=transition=fade:duration=${d.toFixed(3)}:offset=0[seam]`,
  `[c]trim=${d.toFixed(3)}:${(T - d).toFixed(3)},setpts=PTS-STARTPTS[mid]`,
  `[mid][seam]concat=n=2:v=1[out]`,
].join(';');
await run('ffmpeg', ['-nostdin', '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
  '-filter_complex', fc, '-map', '[out]', ...ENC, mp4], { timeout: 180000 });
await rm(framesDir, { recursive: true, force: true });
console.log(`\n✓ ${mp4}`);
