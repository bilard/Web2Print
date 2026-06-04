// Génère des illustrations d'écrans pour la landing /promo/ via l'IA image de
// l'app (Nano Banana / Gemini Image), dans la charte graphique Web2Print.
// Usage : node scripts/gen-promo-images.mjs [key1 key2 ...]  (vide = toutes)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const API_KEY = (env.match(/^VITE_GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim()
if (!API_KEY) { console.error('Clé VITE_GEMINI_API_KEY introuvable'); process.exit(1) }

const MODELS = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview', 'nano-banana-pro-preview']

const STYLE = 'UI screen illustration of a modern SaaS web application, strict dark mode: near-black background (#0a0a0c) with dark charcoal panels (#141419), single vibrant indigo accent color (#6366f1) used sparingly for highlights and buttons, subtle thin grid lines, soft indigo glow, clean minimal flat design, crisp vector-like interface, generous spacing, professional product UI, no brand logos, abstract blurred placeholder text only, no real readable words. Cinematic, high quality, sharp.'

const OUT = new URL('../public/promo/img/', import.meta.url)
mkdirSync(OUT, { recursive: true })

const SHOTS = {
  editor: 'a graphic design editor: a central white poster artwork on a dark canvas with a faint grid, a slim vertical toolbar of tool icons on the left, and a right side properties panel with input fields, color swatches and segmented controls.',
  import: 'an import screen showing a grid of rounded file-type cards each with a colored icon (document, presentation, image, vector shapes), on a dark dashboard.',
  dam: 'a digital asset manager: a left navigation rail and a large grid of colorful image thumbnails, with small filter chips at the top.',
  pim: 'a product information data table with many rows and columns of data, a left sidebar listing databases, a top toolbar with buttons.',
  workflows: 'a node-based automation workflow editor: rounded rectangular nodes connected by curved lines forming a flow graph, on a dark canvas with a dotted grid.',
  export: 'an export dialog over a dark UI showing print options: DPI selector, bleed slider, crop marks preview around a document, format toggles.',
  blank: 'a new-document creation screen: a grid of format preset cards (paper sizes and social media sizes) with small monitor and document icons, and a background color picker row of swatches.',
  library: 'a project library screen: a grid of project thumbnail cards each with a small preview image and a title line, a top bar with a grid/list view toggle.',
  taxonomies: 'a taxonomy tree screen: an expandable hierarchical folder tree on the left with nested category nodes and connecting lines, a detail panel on the right.',
  templates: 'a visual scraping template builder: a rendered web page preview on the left with rectangular highlight boxes over elements, and a field-mapping panel on the right.',
  scraping: 'a scraping operations dashboard: a list of extraction jobs with progress bars, colored status badges, and a results count panel.',
  telegram: 'a messaging bot conversation interface: chat message bubbles, a file attachment card, and a text input bar at the bottom, dark theme.',
  animation: 'a video and motion editor: a preview canvas at the top, a horizontal timeline with keyframes and layer tracks at the bottom, playback controls.',
  chat: 'an AI assistant chat interface: alternating conversation bubbles, an input box with a send button, and a left sidebar list of saved prompts.',
  access: 'a users and roles admin screen: a table listing user avatars with role badges (chips) and permission toggle switches per row.',
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
