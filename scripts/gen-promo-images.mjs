// Génère des illustrations d'écrans pour la landing /promo/ via l'IA image de
// l'app (Nano Banana / Gemini Image), dans la charte graphique Web2Print.
// Usage : node scripts/gen-promo-images.mjs [key1 key2 ...]  (vide = toutes)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const API_KEY = (env.match(/^VITE_GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim()
if (!API_KEY) { console.error('Clé VITE_GEMINI_API_KEY introuvable'); process.exit(1) }

const MODELS = ['nano-banana-pro-preview', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image']

const STYLE = 'A pixel-perfect, ultra-realistic SCREENSHOT of a real production web application — looks like an actual screen capture at high DPI, NOT a flat illustration, NOT a concept mockup, NOT 3D. Real software UI chrome: a top bar, a left sidebar, panels with 1px borders (rgba white 8%), realistic buttons, inputs, dropdowns, tables and cards with proper shadows and rounded corners (8-12px radius). Strict dark theme: background #0f0f0f, surfaces #1a1a1a, hairline borders, ONE indigo accent #6366f1 used sparingly for the active item and primary buttons. Crisp, sharp, small REAL readable French interface labels and menu items (short words, correctly spelled, no gibberish). Realistic plausible data. Generous spacing, modern SaaS product design (Linear / Figma / Notion quality). No logos, no humans, no watermark, no captions. Photographic sharpness.'

// Barre latérale réelle de l'app (reproduite pour le réalisme des écrans du tableau de bord).
const SIDEBAR = 'On the left, a dark vertical sidebar (#141414) listing navigation items with small icons and these exact French labels: "Nouveau document", "Importer", "Bibliothèque", "DAM", "PIM", "Taxonomies", "Templates scraping", "Scraping Hub", "Workflows", "Telegram", "Animation", "Chat IA", "Utilisateurs & rôles"; the active item is highlighted with a subtle indigo (#6366f1) background.'

const OUT = new URL('../public/promo/img/', import.meta.url)
mkdirSync(OUT, { recursive: true })

const SHOTS = {
  editor: 'a full-screen graphic design editor (like Canva/Figma in dark mode). A slim vertical toolbar of monochrome tool icons pinned far left (cursor, type "T", rectangle, ellipse, line, image). Center: a large dark canvas with a faint 22px dotted grid and, on it, a bright white A4 promotional retail poster artwork (a product photo, a big yellow price tag reading "19€90", a red discount badge "-30%", a blue title) shown selected with indigo (#6366f1) bounding-box handles. Right: a properties panel with section headers "Propriétés", "Calques", "Impression", numeric input fields, color swatches and segmented toggle buttons. Top bar shows a filename and a green "Sauvegardé" pill plus an indigo "Exporter" button.',
  import: `an "Importer" screen. ${SIDEBAR} Main area: a centered grid of rounded import cards, each with a colored icon and a French label: "IDML (InDesign)", "PowerPoint", "Image", "SVG", "Excel / CSV", "PDF → SVG"; a short subtitle under each. A dashed drop-zone at the bottom reading "Glissez un fichier".`,
  dam: `a "DAM" digital asset manager. ${SIDEBAR} Main area: a top row of filter chips ("Banque d\'images", "Mes images", "Favoris", "Collections"), a search field, and a large responsive grid of realistic colorful product/photo thumbnails with hover overlays.`,
  pim: `a "PIM" product information table. ${SIDEBAR} Main area: a dense data table with column headers ("Référence", "Nom", "Prix", "Marque", "Catégorie") and many rows of plausible product data; a left mini-panel listing several databases; a top toolbar with "Importer Excel" and "Scraper le web" buttons.`,
  workflows: `a node-based automation "Workflows" editor (like Zapier/n8n in dark mode). ${SIDEBAR} Main area: rounded rectangular nodes with small titles ("Scraper URL", "Enrichir", "Décomposer", "Exporter", "Envoyer Telegram") connected by smooth curved indigo lines on a dotted-grid dark canvas; a small node-palette panel on the right.`,
  export: 'an export modal dialog floating over a dimmed dark editor. The dialog titled "Exporter" shows print options in French: a "Format" segmented control (PDF / Image / PPTX / Vidéo), a "DPI" selector reading "300", a "Fond perdu" slider "3 mm", checkboxes "Traits de coupe" and "Repères de montage", and a small live preview of a document with crop marks at its corners. A primary indigo "Exporter le PDF" button.',
  blank: `a "Nouveau document" creation screen. ${SIDEBAR} Main area: a grid of format preset cards with small icons and labels ("A4", "A3", "Letter", "Full HD 1920×1080", "Instagram 1080×1080", "Story 1080×1920", "Personnalisé"), and below a row of background color swatches plus "Uni / Dégradé / Image" toggle.`,
  library: `a project "Bibliothèque" screen. ${SIDEBAR} Main area: a top bar with a grid/list view toggle and a taxonomy filter dropdown, then a grid of project thumbnail cards each showing a small poster preview image and a title line ("Promo Janvier", "Catalogue Outillage", "PLV Rentrée").`,
  taxonomies: `a "Taxonomies" tree screen. ${SIDEBAR} Main area: an expandable hierarchical category tree with nested rows and connecting guide lines ("Outillage > Électroportatif > Perceuses"), expand chevrons, item counts, and a detail panel on the right.`,
  templates: `a visual "Templates scraping" builder. ${SIDEBAR} Main area split in two: left, a rendered e-commerce product web page with several rectangular indigo highlight boxes over the title, price and image; right, a field-mapping panel listing extracted fields ("Titre", "Prix", "Description", "Image") each bound to a CSS selector.`,
  scraping: `a "Scraping Hub" operations dashboard. ${SIDEBAR} Main area: a list of extraction jobs (URLs) each with a progress bar and a colored status badge ("Terminé", "En cours", "Bloqué"), a results counter, and a small panel mentioning anti-bot engines "Bright Data", "Jina", "Firecrawl".`,
  telegram: `a "Telegram" bot conversation panel inside the app. ${SIDEBAR} Main area: a phone-like chat column with message bubbles (a user command "/flow génère une PLV", a bot reply, a file attachment card showing an exported PDF), and a text input bar at the bottom.`,
  animation: `an "Animation" video/motion editor. ${SIDEBAR} Main area: a preview canvas at the top showing an animated title, and below a horizontal timeline with labeled layer tracks and keyframe dots, plus playback controls and a duration readout.`,
  chat: `a "Chat IA" assistant interface. ${SIDEBAR} Main area: alternating conversation bubbles in French, a generated image thumbnail inside one reply, an input box with attachment and microphone icons and an indigo send button; a secondary list of saved prompts.`,
  access: `a "Utilisateurs & rôles" admin screen. ${SIDEBAR} Main area: a list of user rows each with a round avatar, a name, an email, a role chip ("Admin", "Lecteur", "Éditeur"), a role dropdown and "Bloquer"/"Supprimer" buttons; small permission tag chips under an expanded row.`,
}

const ratioFor = () => '3:2'

async function gen(key, scene) {
  const body = {
    contents: [{ parts: [{ text: `Generate an image: ${STYLE} The screen shows: ${scene}` }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: ratioFor(), imageSize: '2K' } },
  }
  for (const model of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!r.ok) { console.warn(`  ${model} → ${r.status} ${(await r.text()).slice(0,120)}`); continue }
    const data = await r.json()
    const parts = data.candidates?.[0]?.content?.parts ?? []
    const img = parts.find(p => (p.inline_data?.mime_type || p.inlineData?.mimeType || '').startsWith('image/'))
    const inl = img?.inline_data ?? img?.inlineData
    if (!inl) { console.warn(`  ${model} → pas d'image`); continue }
    const buf = Buffer.from(inl.data, 'base64')
    const path = new URL(`${key}.png`, OUT)
    writeFileSync(path, buf)
    console.log(`✓ ${key}.png (${(buf.length/1024).toFixed(0)} KB) via ${model}`)
    return true
  }
  console.error(`✗ ${key} — tous les modèles ont échoué`)
  return false
}

const wanted = process.argv.slice(2)
const keys = wanted.length ? wanted : Object.keys(SHOTS)
for (const k of keys) { if (SHOTS[k]) await gen(k, SHOTS[k]); await new Promise(r => setTimeout(r, 800)) }
