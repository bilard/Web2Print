// Génère la doc multilingue /docs/{en,es,de,it}/ à partir du FR.
// - content.{lang}.js : CATEGORIES/MODULES traduits (via strings.{lang}.json) + export STRINGS.
// - index.html : shell traduit (UI + meta + chemins absolus + switcher).
// Le FR (public/docs/) reste la source ; relancer après régénération de content.js
// ou après mise à jour d'une strings.{lang}.json. Usage : node scripts/docs-i18n/build.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const DOCS = join(ROOT, 'public', 'docs')

const { CATEGORIES, MODULES } = await import(pathToFileURL(join(DOCS, 'content.js')).href)
const frIndex = readFileSync(join(DOCS, 'index.html'), 'utf8')

// UI du shell + méta, par langue (les chaînes de contenu viennent de strings.{lang}.json).
const L = {
  en: {
    htmlLang: 'en', locale: 'en_GB', up: 'EN',
    title: 'Documentation · IBS-Studio',
    desc: "IBS-Studio technical documentation: full reference of the modules and features (editor, import/export, PIM, scraping, workflows, AI).",
    intro: "Technical reference for the application's modules and features: editor, print import/export, product database (PIM), media (DAM), scraping, workflows and AI. Use the sidebar or search (<kbd>⌘K</kbd>) to navigate.",
    ui: [
      ['Aller au contenu', 'Skip to content'],
      ['Fermer le menu', 'Close menu'],
      ['aria-label="Rechercher (Ctrl+K)"', 'aria-label="Search (Ctrl+K)"'],
      ['<span>Rechercher…</span>', '<span>Search…</span>'],
      ['aria-label="Sommaire"', 'aria-label="Contents"'],
      ['title="Retour au site IBS-Studio"', 'title="Back to the IBS-Studio site"'],
      ['Retour au site', 'Back to site'],
      ['Documentation technique', 'Technical documentation'],
      ['aria-label="Thème clair/sombre" title="Thème clair/sombre"', 'aria-label="Light/dark theme" title="Light/dark theme"'],
      ["Ouvrir l'app", 'Open the app'],
      ['Documentation IBS-Studio', 'IBS-Studio Documentation'],
      ['Chargement…', 'Loading…'],
      ["Documentation générée à partir de l'aide intégrée à l'application.", "Documentation generated from the app's built-in help."],
      ['>Accueil<', '>Home<'],
      ['aria-label="Recherche"', 'aria-label="Search"'],
      ['placeholder="Rechercher un module ou une fonction…"', 'placeholder="Search a module or feature…"'],
      ['<kbd>Échap</kbd>', '<kbd>Esc</kbd>'],
      ['aria-label="Haut de page"', 'aria-label="Back to top"'],
    ],
    extra: { 'Lien vers': 'Link to', 'Aucun résultat pour': 'No results for' },
  },
  es: {
    htmlLang: 'es', locale: 'es_ES', up: 'ES',
    title: 'Documentación · IBS-Studio',
    desc: 'Documentación técnica de IBS-Studio: referencia completa de los módulos y funciones (editor, importación/exportación, PIM, scraping, flujos de trabajo, IA).',
    intro: 'Referencia técnica de los módulos y funciones de la aplicación: editor, importación/exportación para impresión, base de productos (PIM), medios (DAM), scraping, flujos de trabajo e IA. Usa la barra lateral o la búsqueda (<kbd>⌘K</kbd>) para navegar.',
    ui: [
      ['Aller au contenu', 'Ir al contenido'],
      ['Fermer le menu', 'Cerrar el menú'],
      ['aria-label="Rechercher (Ctrl+K)"', 'aria-label="Buscar (Ctrl+K)"'],
      ['<span>Rechercher…</span>', '<span>Buscar…</span>'],
      ['aria-label="Sommaire"', 'aria-label="Índice"'],
      ['title="Retour au site IBS-Studio"', 'title="Volver al sitio de IBS-Studio"'],
      ['Retour au site', 'Volver al sitio'],
      ['Documentation technique', 'Documentación técnica'],
      ['aria-label="Thème clair/sombre" title="Thème clair/sombre"', 'aria-label="Tema claro/oscuro" title="Tema claro/oscuro"'],
      ["Ouvrir l'app", 'Abrir la app'],
      ['Documentation IBS-Studio', 'Documentación IBS-Studio'],
      ['Chargement…', 'Cargando…'],
      ["Documentation générée à partir de l'aide intégrée à l'application.", 'Documentación generada a partir de la ayuda integrada en la aplicación.'],
      ['>Accueil<', '>Inicio<'],
      ['aria-label="Recherche"', 'aria-label="Búsqueda"'],
      ['placeholder="Rechercher un module ou une fonction…"', 'placeholder="Buscar un módulo o una función…"'],
      ['<kbd>Échap</kbd>', '<kbd>Esc</kbd>'],
      ['aria-label="Haut de page"', 'aria-label="Ir arriba"'],
    ],
    extra: { 'Lien vers': 'Enlace a', 'Aucun résultat pour': 'Sin resultados para' },
  },
  de: {
    htmlLang: 'de', locale: 'de_DE', up: 'DE',
    title: 'Dokumentation · IBS-Studio',
    desc: 'Technische Dokumentation von IBS-Studio: vollständige Referenz der Module und Funktionen (Editor, Import/Export, PIM, Scraping, Workflows, KI).',
    intro: 'Technische Referenz der Module und Funktionen der Anwendung: Editor, Druck-Import/-Export, Produktdatenbank (PIM), Medien (DAM), Scraping, Workflows und KI. Nutzen Sie die Seitenleiste oder die Suche (<kbd>⌘K</kbd>) zur Navigation.',
    ui: [
      ['Aller au contenu', 'Zum Inhalt springen'],
      ['Fermer le menu', 'Menü schließen'],
      ['aria-label="Rechercher (Ctrl+K)"', 'aria-label="Suchen (Strg+K)"'],
      ['<span>Rechercher…</span>', '<span>Suchen…</span>'],
      ['aria-label="Sommaire"', 'aria-label="Inhalt"'],
      ['title="Retour au site IBS-Studio"', 'title="Zurück zur IBS-Studio-Website"'],
      ['Retour au site', 'Zur Website'],
      ['Documentation technique', 'Technische Dokumentation'],
      ['aria-label="Thème clair/sombre" title="Thème clair/sombre"', 'aria-label="Heller/dunkler Modus" title="Heller/dunkler Modus"'],
      ["Ouvrir l'app", 'App öffnen'],
      ['Documentation IBS-Studio', 'IBS-Studio-Dokumentation'],
      ['Chargement…', 'Wird geladen…'],
      ["Documentation générée à partir de l'aide intégrée à l'application.", 'Dokumentation aus der in die App integrierten Hilfe generiert.'],
      ['>Accueil<', '>Startseite<'],
      ['aria-label="Recherche"', 'aria-label="Suche"'],
      ['placeholder="Rechercher un module ou une fonction…"', 'placeholder="Modul oder Funktion suchen…"'],
      ['<kbd>Échap</kbd>', '<kbd>Esc</kbd>'],
      ['aria-label="Haut de page"', 'aria-label="Nach oben"'],
    ],
    extra: { 'Lien vers': 'Link zu', 'Aucun résultat pour': 'Keine Ergebnisse für' },
  },
  it: {
    htmlLang: 'it', locale: 'it_IT', up: 'IT',
    title: 'Documentazione · IBS-Studio',
    desc: 'Documentazione tecnica di IBS-Studio: riferimento completo dei moduli e delle funzioni (editor, importazione/esportazione, PIM, scraping, workflow, IA).',
    intro: "Riferimento tecnico dei moduli e delle funzioni dell'applicazione: editor, importazione/esportazione per la stampa, database prodotti (PIM), media (DAM), scraping, workflow e IA. Usa la barra laterale o la ricerca (<kbd>⌘K</kbd>) per navigare.",
    ui: [
      ['Aller au contenu', 'Vai al contenuto'],
      ['Fermer le menu', 'Chiudi il menu'],
      ['aria-label="Rechercher (Ctrl+K)"', 'aria-label="Cerca (Ctrl+K)"'],
      ['<span>Rechercher…</span>', '<span>Cerca…</span>'],
      ['aria-label="Sommaire"', 'aria-label="Sommario"'],
      ['title="Retour au site IBS-Studio"', 'title="Torna al sito IBS-Studio"'],
      ['Retour au site', 'Torna al sito'],
      ['Documentation technique', 'Documentazione tecnica'],
      ['aria-label="Thème clair/sombre" title="Thème clair/sombre"', 'aria-label="Tema chiaro/scuro" title="Tema chiaro/scuro"'],
      ["Ouvrir l'app", "Apri l'app"],
      ['Documentation IBS-Studio', 'Documentazione IBS-Studio'],
      ['Chargement…', 'Caricamento…'],
      ["Documentation générée à partir de l'aide intégrée à l'application.", "Documentazione generata dalla guida integrata nell'applicazione."],
      ['>Accueil<', '>Home<'],
      ['aria-label="Recherche"', 'aria-label="Ricerca"'],
      ['placeholder="Rechercher un module ou une fonction…"', 'placeholder="Cerca un modulo o una funzione…"'],
      ['<kbd>Échap</kbd>', '<kbd>Esc</kbd>'],
      ['aria-label="Haut de page"', 'aria-label="Torna su"'],
    ],
    extra: { 'Lien vers': 'Link a', 'Aucun résultat pour': 'Nessun risultato per' },
  },
}

// --- content.{lang}.js ---
function translateContent(map) {
  const tr = (s) => (typeof s === 'string' && map[s] != null ? map[s] : s)
  const cats = CATEGORIES.map((c) => ({ ...c, label: tr(c.label), desc: tr(c.desc) }))
  const mods = MODULES.map((m) => ({
    ...m,
    title: tr(m.title), intro: tr(m.intro), cat: tr(m.cat),
    features: (m.features || []).map((f) => ({ ...f, title: tr(f.title), desc: tr(f.desc) })),
    shortcuts: (m.shortcuts || []).map((s) => ({ ...s, label: tr(s.label) })),
  }))
  return { cats, mods }
}

// --- index.html {lang} ---
function buildIndex(lang, cfg) {
  let h = frIndex
  // méta
  h = h.replace('<html lang="fr">', `<html lang="${cfg.htmlLang}">`)
  h = h.replaceAll('Documentation technique d\'IBS-Studio : référence complète des modules et fonctions (éditeur, import/export, PIM, scraping, workflows, IA).', cfg.desc)
  h = h.replaceAll('content="Documentation · IBS-Studio"', `content="${cfg.title}"`)
  h = h.replace('<title>Documentation · IBS-Studio</title>', `<title>${cfg.title}</title>`)
  h = h.replace('content="fr_FR"', `content="${cfg.locale}"`)
  h = h.replace('<link rel="canonical" href="https://ibs-studio.com/docs/" />', `<link rel="canonical" href="https://ibs-studio.com/docs/${lang}/" />`)
  h = h.replace('<meta property="og:url" content="https://ibs-studio.com/docs/" />', `<meta property="og:url" content="https://ibs-studio.com/docs/${lang}/" />`)
  // chemins → absolus (servis depuis /docs/{lang}/)
  h = h.replace('href="./styles.css"', 'href="/docs/styles.css"')
  h = h.replace('src="./app.js"', 'src="/docs/app.js"')
  // paragraphe d'intro (regex, contient <kbd>)
  h = h.replace(/<p>Référence technique[\s\S]*?<\/p>/, `<p>${cfg.intro}</p>`)
  // switcher : déplacer aria-current FR → langue
  h = h.replace('<a href="/docs/" hreflang="fr" aria-current="page">FR</a>', '<a href="/docs/" hreflang="fr">FR</a>')
  h = h.replace(`<a href="/docs/${lang}/" hreflang="${lang}">${cfg.up}</a>`, `<a href="/docs/${lang}/" hreflang="${lang}" aria-current="page">${cfg.up}</a>`)
  // UI (longues d'abord pour éviter les sous-chaînes)
  for (const [fr, to] of [...cfg.ui].sort((a, b) => b[0].length - a[0].length)) h = h.replaceAll(fr, to)
  return h
}

for (const [lang, cfg] of Object.entries(L)) {
  const src = join(HERE, `strings.${lang}.json`)
  if (!existsSync(src)) { console.warn(`${lang}: strings.${lang}.json absent — langue sautée`); continue }
  const map = JSON.parse(readFileSync(src, 'utf8'))
  const { cats, mods } = translateContent(map)
  const STRINGS = { ...map, ...cfg.extra }
  const js = `// ⚠️ AUTO-GÉNÉRÉ par scripts/docs-i18n/build.mjs — NE PAS éditer.\n`
    + `export const CATEGORIES = ${JSON.stringify(cats, null, 2)}\n\n`
    + `export const MODULES = ${JSON.stringify(mods, null, 2)}\n\n`
    + `export const STRINGS = ${JSON.stringify(STRINGS, null, 2)}\n`
  const dir = join(DOCS, lang)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'content.js'), js)
  writeFileSync(join(dir, 'index.html'), buildIndex(lang, cfg))
  // Couverture mesurée sur les chaînes FR SOURCE (pas sur la sortie traduite).
  const missing = [...new Set(
    [...CATEGORIES.flatMap((c) => [c.label, c.desc]),
     ...MODULES.flatMap((m) => [m.title, m.intro, m.cat, ...(m.features || []).flatMap((f) => [f.title, f.desc]), ...(m.shortcuts || []).map((s) => s.label)])]
  )].filter((s) => s && !(s in map)).length
  console.log(`${lang}: content.js (${cats.length} cat, ${mods.length} mod) + index.html — ${missing} chaînes non traduites (repli FR)`)
}
