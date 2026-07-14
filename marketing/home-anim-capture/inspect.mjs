/**
 * Inspecte la home /promo : liste les fenêtres de démo (.mk-body) et
 * détaille le bloc "workflow 8 nœuds" (bbox, durées d'anim CSS, SMIL).
 * Lancé depuis le repo pour que 'playwright' soit résolu.
 */
import { chromium } from 'playwright';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import http from 'node:http';

const PUBLIC = '/Applications/_IA/Claude_workspace/Web2Print/public';
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 3200 }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${port}/promo/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

// index des blocs
const slugs = await page.evaluate(() => {
  const clsOf = (el) => !el ? '' : String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '');
  const bodies = [...document.querySelectorAll('.mk-body')];
  const seen = new Set(); const res = [];
  bodies.forEach((b, i) => {
    const win = b.closest('.mk') || b.parentElement;
    if (seen.has(win)) return; seen.add(win);
    b.setAttribute('data-cap-idx', String(i));
    res.push({ idx: i, slug: clsOf(b).replace(/\s*mk-body\s*/, '').trim() || ('bloc'+i) });
  });
  return res;
});

const data = [];
for (const { idx, slug } of slugs) {
  const body = page.locator(`[data-cap-idx="${idx}"]`);
  await body.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(700); // laisser l'IntersectionObserver activer les anims
  const info = await page.evaluate((i) => {
    const b = document.querySelector(`[data-cap-idx="${i}"]`);
    const win = b.closest('.mk') || b.parentElement;
    const r = win.getBoundingClientRect();
    const tool = win.querySelector('[class*="-tool"],[class*="-cap"],[class*="-title"],[class*="-bar"] span');
    const anims = win.getAnimations({ subtree: true });
    const durs = anims.map(a => { try { const t = a.effect.getComputedTiming(); return t.duration * (isFinite(t.iterations) ? t.iterations : 1); } catch { return 0; } }).filter(d => isFinite(d) && d > 0);
    const smil = win.querySelectorAll('animate,animateTransform,animateMotion,set').length;
    return {
      title: tool ? tool.textContent.trim().replace(/\s+/g,' ').slice(0,50) : '',
      w: Math.round(r.width), h: Math.round(r.height),
      cssAnims: anims.length, maxDurMs: durs.length ? Math.round(Math.max(...durs)) : 0, smil,
    };
  }, idx);
  data.push({ slug, ...info });
}

console.log('=== FENÊTRES DE DÉMO SUR LA HOME (' + data.length + ') ===');
console.log('  #  slug'.padEnd(26) + 'taille'.padEnd(14) + 'anims  maxDur  SMIL   titre');
data.forEach((d, i) => {
  console.log(
    ('  ' + String(i+1).padStart(2) + ' ' + d.slug).padEnd(26) +
    (d.w + '×' + d.h).padEnd(14) +
    String(d.cssAnims).padEnd(7) + (d.maxDurMs + 'ms').padEnd(8) + String(d.smil).padEnd(7) +
    '"' + d.title + '"'
  );
});

await browser.close();
server.close();
