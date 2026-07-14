/**
 * Filme une (ou toutes les) animation(s) de la home /promo en .mp4.
 * Rendu DÉTERMINISTE : pause toutes les animations et seek image par image
 * (getAnimations().currentTime + SVG setCurrentTime) → aucune saccade, cadrage exact.
 *
 * Usage :
 *   node capture.mjs wfl                 # un bloc (slug sans -body)
 *   node capture.mjs all                 # tous les blocs
 *   node capture.mjs list                # liste les slugs
 * Sortie : marketing/home-anim-capture/out/<slug>.mp4
 */
import { chromium } from 'playwright';
import { readFile, stat, mkdir, rm } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = '/Applications/_IA/Claude_workspace/Web2Print/public';
const OUT = join(here, '..', '..', 'public', 'animations', 'out'); // dossier unique servi (/animations/out/)
const FPS = 30;
const SCALE = 2;              // deviceScaleFactor (netteté)
const SLOW = 1.5;            // facteur de ralenti (1 = vitesse native) → « moins rapide »
const XFADE = 0.45;         // durée du fondu de bouclage sans couture (s)
const arg = (process.argv[2] || 'wfl').trim();

const MIME = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml',
  '.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.mp4':'video/mp4','.json':'application/json','.ico':'image/x-icon' };

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
const page = await browser.newPage({ viewport: { width: 1440, height: 3400 }, deviceScaleFactor: SCALE });
// bloque le bandeau cookies / consent (injecté par consent.js) pour qu'il ne pollue pas les captures
await page.route('**/consent.js', (r) => r.abort());
// ceinture + bretelles : marque le consentement « refusé » AVANT tout script → aucune bannière
await page.addInitScript(() => { try { localStorage.setItem('cs_consent', 'denied'); } catch {} });
await page.goto(`http://localhost:${port}/promo/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
// masque tout overlay en position:fixed (bandeau consent résiduel, barres de nav modnav/m-menu,
// faisceau cineBeam) qui, superposé au cadre d'une fenêtre, polluerait la capture.
await page.addStyleTag({ content: `
  .modnav, .m-menu, .cineBeam, [role="dialog"] { display:none !important; }
  *[style*="position:fixed"][style*="z-index:99999"] { display:none !important; }
` });

// index des blocs → data-cap-idx + slug
const blocks = await page.evaluate(() => {
  const clsOf = (el) => !el ? '' : String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '');
  const bodies = [...document.querySelectorAll('.mk-body')];
  const seen = new Set(); const res = [];
  bodies.forEach((b, i) => {
    const win = b.closest('.mk') || b.parentElement;
    if (seen.has(win)) return; seen.add(win);
    b.setAttribute('data-cap-idx', String(i));
    win.setAttribute('data-cap-win', String(i));
    res.push({ idx: i, slug: (clsOf(b).replace(/\s*mk-body\s*/, '').replace(/-body$|-layout$/, '').trim() || ('bloc'+i)) });
  });
  return res;
});

if (arg === 'list') {
  console.log(blocks.map(b => b.slug).join('\n'));
  await browser.close(); server.close(); process.exit(0);
}

const targets = arg === 'all' ? blocks : blocks.filter(b => b.slug === arg);
if (!targets.length) { console.error('slug introuvable:', arg, '— dispo:', blocks.map(b=>b.slug).join(', ')); await browser.close(); server.close(); process.exit(1); }

for (const { idx, slug } of targets) {
  const winSel = `[data-cap-win="${idx}"]`;
  const win = page.locator(winSel);
  await win.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(800); // activer l'IntersectionObserver

  // période = plus longue animation-duration finie (fallback 6.5s), bornée à 10s
  const periodMs = await page.evaluate((sel) => {
    const w = document.querySelector(sel);
    const durs = w.getAnimations({ subtree: true }).map(a => {
      try { const t = a.effect.getComputedTiming(); return t.duration * (isFinite(t.iterations) ? t.iterations : 1); }
      catch { return 0; }
    }).filter(d => isFinite(d) && d > 0);
    return durs.length ? Math.min(10000, Math.round(Math.max(...durs))) : 6500;
  }, winSel);

  // Fige les dimensions de la fenêtre à son MAX sur toute la période : certaines fenêtres
  // reflowent (listes qui se remplissent…) → sans ça, les frames ont des tailles différentes
  // et la séquence ffmpeg casse / l'image « saute ». On échantillonne, on prend le max, on fixe.
  await page.evaluate(({ sel, period }) => {
    const w = document.querySelector(sel);
    let mw = 0, mh = 0;
    const N = 20;
    for (let i = 0; i <= N; i++) {
      const t = (period / N) * i;
      for (const a of w.getAnimations({ subtree: true })) { try { a.pause(); a.currentTime = t; } catch {} }
      const r = w.getBoundingClientRect();
      mw = Math.max(mw, r.width); mh = Math.max(mh, r.height);
    }
    w.style.width = Math.ceil(mw) + 'px';
    w.style.height = Math.ceil(mh) + 'px';
    w.style.boxSizing = 'border-box';
    w.style.overflow = 'hidden';
  }, { sel: winSel, period: periodMs });

  const box = await win.boundingBox();
  // durée de sortie = période animée × ralenti. Ré-échantillonnage fin : chaque frame de
  // sortie échantillonne un état d'animation distinct (vrai ralenti, pas de doublons).
  const outSec = (periodMs / 1000) * SLOW;
  const frames = Math.max(1, Math.round(outSec * FPS));
  const framesDir = join(OUT, `.frames-${slug}`);
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  process.stdout.write(`\n${slug} : ${box.width|0}×${box.height|0}, ${outSec.toFixed(1)}s (×${SLOW}), ${frames} frames `);

  for (let f = 0; f < frames; f++) {
    const t = (f / FPS) / SLOW * 1000; // temps d'animation ralenti
    await page.evaluate(({ sel, t }) => {
      const w = document.querySelector(sel);
      for (const a of w.getAnimations({ subtree: true })) { try { a.pause(); a.currentTime = t; } catch {} }
      w.querySelectorAll('svg').forEach(svg => { try { svg.pauseAnimations(); svg.setCurrentTime(t / 1000); } catch {} });
    }, { sel: winSel, t });
    await win.screenshot({ path: join(framesDir, `f${String(f).padStart(4, '0')}.png`) });
    if (f % 30 === 0) process.stdout.write('.');
  }

  // frames → mp4. Boucle SANS COUTURE : les durées d'animation ne s'alignent pas sur la
  // période (10-17 loops infinis de périodes distinctes), donc un rebouclage brut « saute ».
  // On croise en fondu les XFADE dernières secondes avec les XFADE premières → boucle propre.
  const mp4 = join(OUT, `${slug}.mp4`);
  const evenScale = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  const d = Math.min(XFADE, outSec / 3);
  const ENC = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', '-movflags', '+faststart'];
  if (frames >= 6 && d > 0.1) {
    const fc = [
      `[0:v]${evenScale},format=yuv420p,split=3[a][b][c]`,
      `[a]trim=0:${d.toFixed(3)},setpts=PTS-STARTPTS[head]`,
      `[b]trim=${(outSec - d).toFixed(3)}:${outSec.toFixed(3)},setpts=PTS-STARTPTS[tail]`,
      `[tail][head]xfade=transition=fade:duration=${d.toFixed(3)}:offset=0[seam]`,
      `[c]trim=${d.toFixed(3)}:${(outSec - d).toFixed(3)},setpts=PTS-STARTPTS[mid]`,
      `[mid][seam]concat=n=2:v=1[out]`,
    ].join(';');
    await run('ffmpeg', ['-y', '-framerate', String(FPS), '-i', join(framesDir, 'f%04d.png'),
      '-filter_complex', fc, '-map', '[out]', ...ENC, mp4]);
  } else {
    await run('ffmpeg', ['-y', '-framerate', String(FPS), '-i', join(framesDir, 'f%04d.png'),
      '-vf', evenScale, ...ENC, mp4]);
  }
  await rm(framesDir, { recursive: true, force: true });
  process.stdout.write(` ✓ ${mp4}`);
}
console.log('\nTerminé.');

await browser.close();
server.close();
