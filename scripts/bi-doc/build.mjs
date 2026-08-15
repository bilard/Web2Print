// Génère la documentation PDF du module Dashboard BI.
//
// ⚠⚠ Les illustrations sont des CAPTURES des vrais composants, prises sur une planche qui les
// monte depuis `src` (`gallery.tsx`) : une documentation aux schémas redessinés à la main
// décrit une application qui n'existe pas, et vieillit sans prévenir. Ici, un visuel qui
// change change l'illustration — ou la capture échoue, ce qui se voit.
//
// Prérequis : le serveur de développement doit tourner (`npm run dev`), la planche étant
// servie par Vite pour que les composants soient compilés comme en application.
//
// Usage : node scripts/bi-doc/build.mjs [url] [sortie.pdf]
import { writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { meta, wells, visuals, gestures, rules } from './content.mjs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const OUT = process.argv[3] ?? 'docs/dashboard-bi.pdf'

/** Photographie chaque visuel de la planche, en base64. */
async function shoot(browser) {
  const page = await browser.newPage({
    viewport: { width: 700, height: 900 }, deviceScaleFactor: 2,
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/scripts/bi-doc/index.html`, { waitUntil: 'networkidle' })
  // Les graphes s'animent à l'entrée et le nuage 3D compile ses shaders : on les laisse finir,
  // sinon la capture fige une barre à mi-hauteur.
  await page.waitForTimeout(2500)
  const shots = {}
  for (const el of await page.locator('[data-shot]').all()) {
    const id = await el.getAttribute('data-shot')
    shots[id] = (await el.screenshot()).toString('base64')
  }
  await page.close()
  if (errors.length) throw new Error(`La planche a levé : ${errors.join(' · ')}`)
  const missing = visuals.filter((v) => !shots[v.shot]).map((v) => v.shot)
  // ⚠ Une illustration manquante ARRÊTE la génération : un PDF au trou se diffuse quand même,
  // et personne ne remarque que le visuel documenté n'a pas pu se monter.
  if (missing.length) throw new Error(`Visuels non capturés : ${missing.join(', ')}`)
  return shots
}

const esc = (s) => String(s).replace(/&(?![a-z]+;|#)/g, '&amp;')

const section = (title) => `<h2>${esc(title)}</h2>`

const table = (rows) => `<table>${rows.map(([k, v]) => `
  <tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>`

const visualBlock = (v, shots) => `
  <section class="visual">
    <h3>${esc(v.name)}</h3>
    <img src="data:image/png;base64,${shots[v.shot]}" alt="${esc(v.name)}" />
    <div class="notes">
      <p>${v.what}</p>
      <p class="needs"><span>Il lui faut</span> ${v.needs}</p>
      <p class="trap"><span>À savoir</span> ${v.trap}</p>
    </div>
  </section>`

const html = (shots) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" /><title>${esc(meta.title)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10.5pt/1.5 -apple-system, system-ui, sans-serif; color: #1c1c22; }
  h1 { font-size: 26pt; margin: 0 0 4pt; letter-spacing: -0.5pt; }
  .sub { color: #6b6b76; font-size: 12pt; margin: 0 0 18pt; }
  h2 { font-size: 15pt; margin: 22pt 0 8pt; padding-bottom: 4pt;
       border-bottom: 1.5pt solid #6366f1; break-after: avoid; }
  h3 { font-size: 12pt; margin: 0 0 6pt; break-after: avoid; }
  p { margin: 0 0 6pt; }
  ul { margin: 0 0 6pt; padding-left: 14pt; }
  li { margin-bottom: 3pt; }
  /* ⚠ Un visuel et son commentaire ne se séparent JAMAIS d'une page à l'autre : une capture
     orpheline en bas de page ne documente plus rien. */
  .visual { break-inside: avoid; display: grid; grid-template-columns: 88mm 1fr;
            gap: 6mm; align-items: start; margin-bottom: 9mm; }
  .visual h3 { grid-column: 1 / -1; }
  .visual img { width: 88mm; border-radius: 3pt; }
  .notes { font-size: 9.5pt; }
  .needs, .trap { margin: 0; padding: 4pt 0 0; }
  .needs span, .trap span { display: block; font-size: 7.5pt; text-transform: uppercase;
    letter-spacing: 0.5pt; color: #8b8b96; }
  .trap { border-left: 2pt solid #f0a020; padding-left: 6pt; margin-top: 5pt; }
  table { width: 100%; border-collapse: collapse; break-inside: avoid; }
  th { text-align: left; vertical-align: top; width: 34mm; padding: 5pt 8pt 5pt 0;
       font-weight: 600; border-top: 0.5pt solid #e3e3e8; }
  td { vertical-align: top; padding: 5pt 0; border-top: 0.5pt solid #e3e3e8; }
  .intro { font-size: 11pt; color: #3c3c46; }
  footer { margin-top: 18pt; padding-top: 6pt; border-top: 0.5pt solid #e3e3e8;
           font-size: 8pt; color: #8b8b96; }
</style></head>
<body>
  <h1>${esc(meta.title)}</h1>
  <p class="sub">${esc(meta.subtitle)}</p>
  <p class="intro">${meta.intro}</p>

  ${section(wells.title)}
  <p>${wells.intro}</p>
  ${table(wells.rows)}
  <p style="margin-top:8pt"><b>Trois refus qu'on rencontre vite</b></p>
  <ul>${wells.traps.map((x) => `<li>${x}</li>`).join('')}</ul>

  ${section('Les visuels')}
  ${visuals.map((v) => visualBlock(v, shots)).join('')}

  ${section(gestures.title)}
  ${table(gestures.rows)}

  ${section(rules.title)}
  <p>${rules.intro}</p>
  ${table(rules.rows)}

  <footer>Illustrations capturées sur les composants réels du module.</footer>
</body></html>`

const browser = await chromium.launch()
try {
  const shots = await shoot(browser)
  const page = await browser.newPage()
  await page.setContent(html(shots), { waitUntil: 'load' })
  const pdf = await page.pdf({
    format: 'A4', printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font:8pt system-ui;color:#8b8b96;
      padding:0 14mm;display:flex;justify-content:space-between">
      <span>${meta.title}</span><span class="pageNumber"></span></div>`,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
  })
  await writeFile(OUT, pdf)
  console.log(`${OUT} — ${visuals.length} visuels, ${Math.round(pdf.length / 1024)} ko`)
} finally {
  await browser.close()
}
