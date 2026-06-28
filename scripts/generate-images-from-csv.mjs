#!/usr/bin/env node
// Génère des images produit à partir d'un CSV (colonnes: filename, prompt).
// Usage:
//   node scripts/generate-images-from-csv.mjs <csv> <outDir> [--limit N] [--force]
// Clé: lue depuis .env.local (VITE_GEMINI_API_KEY) ou env GEMINI_API_KEY.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dir, '..')

// ---- args ----
const args = process.argv.slice(2)
const csvPath = args[0] || '/Users/ibsstudio/Downloads/prompts.csv'
const outDir = resolve(args[1] || join(ROOT, 'generated_images'))
const limitFlag = args.indexOf('--limit')
const LIMIT = limitFlag >= 0 ? parseInt(args[limitFlag + 1], 10) : Infinity
const FORCE = args.includes('--force')

// ---- clé API ----
function readEnvKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  try {
    const env = readFileSync(join(ROOT, '.env.local'), 'utf8')
    const m = env.match(/^\s*VITE_GEMINI_API_KEY\s*=\s*(.+?)\s*$/m)
    if (m) return m[1].replace(/^["']|["']$/g, '')
  } catch {}
  return null
}
const API_KEY = readEnvKey()
if (!API_KEY) {
  console.error('❌ Clé Gemini introuvable (.env.local VITE_GEMINI_API_KEY)')
  process.exit(1)
}

// ---- modèles (mêmes que l'app, du plus récent dispo au plus stable) ----
const MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
]

// ---- parseur CSV (gère les guillemets et virgules internes) ----
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false
      } else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* ignore */ }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

async function generateOne(prompt) {
  const body = {
    contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: '3:4', imageSize: '2K' },
    },
  }
  let lastErr = ''
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (e) { lastErr = String(e); continue }
    if (!res.ok) { lastErr = `${model}: ${(await res.text()).slice(0, 180)}`; continue }
    const data = await res.json()
    const parts = data.candidates?.[0]?.content?.parts ?? []
    const img = parts.find(p => (p.inlineData?.mimeType || p.inline_data?.mime_type || '').startsWith('image/'))
    const inline = img?.inlineData ?? img?.inline_data
    if (!inline) { lastErr = `${model}: pas d'image dans la réponse (${data.candidates?.[0]?.finishReason || '?'})`; continue }
    return { b64: inline.data, mime: inline.mimeType ?? inline.mime_type, model }
  }
  throw new Error(lastErr || 'tous les modèles ont échoué')
}

// ---- main ----
const raw = readFileSync(csvPath, 'utf8')
const rows = parseCsv(raw)
const header = rows[0].map(h => h.trim().toLowerCase())
const iFile = header.indexOf('filename')
const iPrompt = header.indexOf('prompt')
if (iFile < 0 || iPrompt < 0) {
  console.error('❌ Le CSV doit contenir les colonnes "filename" et "prompt". Trouvé:', header)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const existing = new Set(existsSync(outDir) ? readdirSync(outDir) : [])

const items = rows.slice(1).filter(r => r[iFile]?.trim() && r[iPrompt]?.trim()).slice(0, LIMIT)
console.log(`📋 ${items.length} image(s) à générer → ${outDir}\n`)

let ok = 0, skip = 0, fail = 0
for (let n = 0; n < items.length; n++) {
  const r = items[n]
  const fname = r[iFile].trim()
  const prompt = r[iPrompt].trim()
  if (!FORCE && existing.has(fname)) { skip++; console.log(`⏭️  [${n + 1}/${items.length}] déjà présent: ${fname}`); continue }
  process.stdout.write(`🎨 [${n + 1}/${items.length}] ${fname} … `)
  try {
    const { b64, mime, model } = await generateOne(prompt)
    const ext = mime === 'image/png' ? '.png' : '.jpg'
    const outName = fname.replace(/\.(jpg|jpeg|png)$/i, '') + ext
    writeFileSync(join(outDir, outName), Buffer.from(b64, 'base64'))
    ok++
    console.log(`✅ (${model})`)
  } catch (e) {
    fail++
    console.log(`❌ ${e.message}`)
  }
}
console.log(`\n— Terminé : ${ok} ok, ${skip} ignorées, ${fail} échecs —`)
