/**
 * Capture TEMPS RÉEL des animations de la home /promo en .mp4.
 * Contrairement à capture.mjs (seek CSS déterministe), on LAISSE le JS + CSS + SVG tourner
 * naturellement et on enregistre les pixels via CDP screencast → fidèle au live (les maquettes
 * sont pilotées par setInterval/setTimeout/classList, invisibles au seek CSS).
 *
 * Boucle propre : on détecte la période via la SIGNATURE DE CLASSES du bloc (le JS anime par
 * classList.add/remove/toggle) — on enregistre exactement un tour (sig revient à l'état initial),
 * puis léger crossfade de sécurité.
 *
 * Usage : node capture-rt.mjs <slug|all|list>   → out/<slug>.mp4
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
const PUBLIC = '/Applications/_IA/Claude_workspace/Web2Print/public';
const OUT = join(here, '..', '..', 'public', 'animations', 'out'); // dossier unique servi (/animations/out/)
const SCALE = 2;
const FPS = 30;            // fps de sortie
const XFADE = 0.4;         // crossfade de sécurité (s)
const MIN_LOOP = 2.0;      // durée mini d'un tour (s)
const MAX_LOOP = 16.0;     // garde-fou (s)
const REC_SEC = Number(process.env.REC_SEC) || 14.0;   // fenêtre d'enregistrement (env REC_SEC)
// ⚠ Période FORCÉE (env LOOP_SEC) : la détection par autocorrélation se trompe sur les maquettes
// 100 % CSS dont le cycle finit sur un long palier immobile (elle y voit une boucle de 2 s).
// Quand la période est connue (var CSS `--vtD`), la passer en dur : REC_SEC=<p+1.2> LOOP_SEC=<p>.
const LOOP_FORCED = Number(process.env.LOOP_SEC) || 0;
const VP = { width: 1440, height: 1650 }; // viewport (assez haut pour la plus grande fenêtre)
const arg = (process.argv[2] || 'aic').trim();

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
const page = await browser.newPage({ viewport: VP, deviceScaleFactor: SCALE });
await page.route('**/consent.js', (r) => r.abort());
await page.addInitScript(() => { try { localStorage.setItem('cs_consent', 'denied'); } catch {} });
await page.goto(`http://localhost:${port}/promo/index.html`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: `
  .modnav, .m-menu, .cineBeam, [role="dialog"] { display:none !important; }
  html { scroll-behavior:auto !important; }
` });
// masque TOUT overlay fixed/sticky hors des fenêtres .mk (barre de nav du haut, bandeaux…)
// sinon il surplombe le cadre capturé.
await page.evaluate(() => {
  for (const el of document.querySelectorAll('body *')) {
    const p = getComputedStyle(el).position;
    if ((p === 'fixed' || p === 'sticky') && !el.closest('.mk')) el.style.setProperty('display', 'none', 'important');
  }
});
await page.waitForTimeout(500);

// Modules SANS .mk-body (mockups en .scene-visual) → captés en mode « extra » par n° de section.
// Noms de sortie PAR SUJET (fichiers /animations/out/<sujet>.mp4).
const EXTRA = { editeur:'03', enrichissement:'10', 'veille-tarifaire':'11', 'creation-studio':'14', 'catalogue-studio':'15', 'publication-multicanale':'19' };
// Renommage sujet des blocs .mk-body (slug dérivé de la classe CSS → nom lisible).
const RENAME = { imp:'import', nd:'nouvelle-toile', lib:'projets', pim:'fiches-produits', dam:'bibliotheque-media', txo:'taxonomies', erd:'cartographie-donnees', db:'publipostage', ig:'images-ia', anm:'videos-ia', aic:'assistant-ia', tpl:'scraping', wfl:'workflows', tlg:'telegram', usr:'roles-acces', set:'parametres' };
const blocks = await page.evaluate(({ mode, extra }) => {
  const clsOf = (el) => !el ? '' : String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '');
  const res = [];
  if (mode === 'extra') {
    const vis = [...document.querySelectorAll('.scene-visual')];
    let i = 1000;
    for (const [slug, num] of Object.entries(extra)) {
      const v = vis.find((v) => {
        const scene = v.closest('.scene') || v.parentElement;
        const nt = (scene?.querySelector('.scene-num')?.textContent || '').trim();
        const m = nt.match(/^\s*(\d+)/);
        return m && parseInt(m[1], 10) === parseInt(num, 10);
      });
      if (v) { v.setAttribute('data-cap-win', String(i)); res.push({ idx: i, slug }); i++; }
    }
    return res;
  }
  const bodies = [...document.querySelectorAll('.mk-body')];
  const seen = new Set();
  bodies.forEach((b, i) => {
    const win = b.closest('.mk') || b.parentElement;
    if (seen.has(win)) return; seen.add(win);
    win.setAttribute('data-cap-win', String(i));
    res.push({ idx: i, slug: (clsOf(b).replace(/\s*mk-body\s*/, '').replace(/-body$|-layout$/, '').trim() || ('bloc'+i)) });
  });
  return res;
}, { mode: (arg === 'extra' || EXTRA[arg]) ? 'extra' : 'mk', extra: EXTRA })
  .then((bs) => bs.map((b) => ({ ...b, slug: RENAME[b.slug] || b.slug }))); // slugs par sujet

if (arg === 'list') { console.log(blocks.map(b => b.slug).join('\n')); await browser.close(); server.close(); process.exit(0); }
const targets = (arg === 'all' || arg === 'extra') ? blocks : blocks.filter(b => b.slug === arg);
if (!targets.length) { console.error('slug introuvable:', arg); await browser.close(); server.close(); process.exit(1); }

const client = await page.context().newCDPSession(page);

for (const { idx, slug } of targets) {
  const winSel = `[data-cap-win="${idx}"]`;
  const win = page.locator(winSel);
  await win.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(700); // activer IntersectionObserver + laisser démarrer le JS

  // fige les dimensions (certaines fenêtres reflowent → cadre stable) et amène la fenêtre en
  // haut du viewport pour le crop.
  const box = await page.evaluate(({ sel }) => {
    const w = document.querySelector(sel);
    const r0 = w.getBoundingClientRect();
    w.style.width = Math.ceil(r0.width) + 'px'; w.style.height = Math.ceil(r0.height) + 'px';
    w.style.boxSizing = 'border-box'; w.style.overflow = 'hidden';
    const r = w.getBoundingClientRect();
    window.scrollBy(0, r.top - 24);
    const r2 = w.getBoundingClientRect();
    return { x: Math.max(0, Math.floor(r2.left)), y: Math.max(0, Math.floor(r2.top)), w: Math.ceil(r2.width), h: Math.ceil(r2.height) };
  }, { sel: winSel });

  const framesDir = join(OUT, `.rt-${slug}`);
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  // ── ENREGISTREMENT TEMPS RÉEL (fenêtre fixe) via CDP screencast (~30 fps) ──
  const frames = []; // {file, t}
  let n = 0, tFirst = null;
  const onFrame = async (params) => {
    const { data, metadata, sessionId } = params;
    try { await client.send('Page.screencastFrameAck', { sessionId }); } catch {}
    if (tFirst == null) tFirst = metadata.timestamp;
    const file = join(framesDir, `f${String(n).padStart(5, '0')}.jpg`);
    await writeFile(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp - tFirst });
    n++;
  };
  client.on('Page.screencastFrame', onFrame);
  process.stdout.write(`\n${slug} : enregistrement ${REC_SEC}s`);
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 2 });
  await page.waitForTimeout(REC_SEC * 1000);
  await client.send('Page.stopScreencast');
  client.off('Page.screencastFrame', onFrame);
  await page.waitForTimeout(200);
  if (frames.length < 8) { process.stdout.write(` ⚠ trop peu de frames`); await rm(framesDir, { recursive: true, force: true }); continue; }

  // concat demuxer de TOUTES les frames avec durées RÉELLES (temps réel exact préservé)
  let concat = '';
  for (let i = 0; i < frames.length; i++) {
    const dur = (i < frames.length - 1) ? (frames[i + 1].t - frames[i].t) : (1 / FPS);
    concat += `file '${frames[i].file.replace(/'/g, "'\\''")}'\n` + `duration ${Math.max(0.001, dur).toFixed(4)}\n`;
  }
  concat += `file '${frames[frames.length - 1].file.replace(/'/g, "'\\''")}'\n`;
  const listFile = join(framesDir, 'list.txt');
  await writeFile(listFile, concat);

  const mp4 = join(OUT, `${slug}.mp4`);
  // échelle réelle de la frame screencast (souvent 1× même en dsf 2) → crop en px frame
  const probe = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0', frames[0].file]);
  const frameW = parseInt(probe.stdout.trim(), 10) || VP.width;
  const rs = frameW / VP.width;
  const cx = Math.round(box.x * rs), cy = Math.round(box.y * rs), cw = Math.round(box.w * rs), ch = Math.round(box.h * rs);
  const crop = `crop=${cw}:${ch}:${cx}:${cy}`;
  const even = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  const ENC = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', '-movflags', '+faststart'];

  // ── DÉTECTION DE PÉRIODE par AUTOCORRÉLATION de pixels ──
  // Rééchantillonne la fenêtre cropée en 32×32 gris à R fps. Pour chaque période candidate p,
  // on mesure l'écart MOYEN entre frame[i] et frame[i+p] sur TOUTE la séquence (robuste à la
  // phase). Boucle nette (faible écart) → on prend la FONDAMENTALE (plus courte période d'écart
  // comparable, pas un multiple). Ambiant sans boucle propre → on garde le min global (le
  // rebouclage le moins visible), le crossfade lisse le reste.
  const R = 15, DW = 32, DH = 32, FSZ = DW * DH;
  const rawRes = await run('ffmpeg', ['-nostdin', '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `${crop},scale=${DW}:${DH},format=gray,fps=${R}`, '-f', 'rawvideo', '-'],
    { encoding: 'buffer', maxBuffer: 1 << 30, timeout: 90000 });
  const buf = rawRes.stdout;
  const nF = Math.floor(buf.length / FSZ);
  let loopT = frames[frames.length - 1].t;
  const pMin = Math.ceil(MIN_LOOP * R);
  const pMax = Math.min(Math.floor(MAX_LOOP * R), nF - pMin);
  if (pMax > pMin) {
    const errAt = new Float64Array(pMax + 1);
    let gMin = Infinity, gP = pMin;
    for (let p = pMin; p <= pMax; p++) {
      let e = 0, cnt = 0;
      for (let i = 0; i + p < nF; i++) {
        const o1 = i * FSZ, o2 = (i + p) * FSZ; let ee = 0;
        for (let q = 0; q < FSZ; q++) { const dd = buf[o1 + q] - buf[o2 + q]; ee += dd * dd; }
        e += ee; cnt++;
      }
      const avg = e / cnt; errAt[p] = avg;
      if (avg < gMin) { gMin = avg; gP = p; }
    }
    if (gMin / FSZ < 40) {
      // boucle NETTE → fondamentale (plus courte période d'écart comparable, pas un multiple)
      let bp = gP;
      for (let p = pMin; p <= gP; p++) { if (errAt[p] <= gMin * 1.35) { bp = p; break; } }
      loopT = bp / R;
      process.stdout.write(` → boucle nette ${loopT.toFixed(1)}s (err ${Math.round(gMin / FSZ)})`);
    } else {
      // pas de boucle propre (ambiant CSS non aligné, longue histoire) → on garde l'HISTOIRE
      // COMPLÈTE en temps réel ; le crossfade lisse le rebouclage. (Le min global à petit p est
      // biaisé par la continuité temporelle → on ne s'y fie pas.)
      loopT = Math.min(frames[frames.length - 1].t, REC_SEC - 0.4);
      process.stdout.write(` → histoire complète ${loopT.toFixed(1)}s (err ${Math.round(gMin / FSZ)})`);
    }
  }
  if (LOOP_FORCED > 0) { loopT = Math.min(LOOP_FORCED, frames[frames.length - 1].t); process.stdout.write(` → période forcée ${loopT.toFixed(1)}s`); }
  const T = loopT;
  const d = Math.min(XFADE, T / 3);
  if (T > MIN_LOOP && d > 0.1) {
    const fc = [
      `[0:v]${crop},fps=${FPS},${even},format=yuv420p,split=3[a][b][c]`,
      `[a]trim=0:${d.toFixed(3)},setpts=PTS-STARTPTS[head]`,
      `[b]trim=${(T - d).toFixed(3)}:${T.toFixed(3)},setpts=PTS-STARTPTS[tail]`,
      `[tail][head]xfade=transition=fade:duration=${d.toFixed(3)}:offset=0[seam]`,
      `[c]trim=${d.toFixed(3)}:${(T - d).toFixed(3)},setpts=PTS-STARTPTS[mid]`,
      `[mid][seam]concat=n=2:v=1[out]`,
    ].join(';');
    await run('ffmpeg', ['-nostdin', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-filter_complex', fc, '-map', '[out]', ...ENC, mp4], { timeout: 120000 });
  } else {
    await run('ffmpeg', ['-nostdin', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `${crop},fps=${FPS},${even}`, ...ENC, mp4], { timeout: 120000 });
  }
  await rm(framesDir, { recursive: true, force: true });
  process.stdout.write(` ✓ ${slug}.mp4`);
}
console.log('\nTerminé.');
await browser.close();
server.close();
