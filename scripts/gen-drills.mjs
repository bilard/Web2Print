// Génère 5 vues du MÊME outil que public/promo/assets/drill.jpg via Nano Banana Pro.
// La photo de référence (perceuse jaune/noire) est passée en image source → cohérence du modèle.
import { readFileSync, writeFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf8')
const KEY = (env.match(/^VITE_GEMINI_API_KEY=(.+)$/m) || [])[1]?.trim()
if (!KEY) { console.error('clé Gemini absente'); process.exit(1) }

const MODELS = ['gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image']
const srcB64 = readFileSync('public/promo/assets/drill.jpg').toString('base64')

const REF = 'the exact same cordless drill as in the reference image (same yellow and black body, same battery, same proportions and branding)'
const SHOTS = [
  { f: 'drill2.jpg', p: `${REF}, three-quarter front studio product packshot on a pure white seamless background, soft realistic shadow, sharp focus, e-commerce photography` },
  { f: 'drill3.jpg', p: `${REF}, clean left side profile view, studio product packshot on a pure white seamless background, soft shadow, e-commerce photography` },
  { f: 'drill4.jpg', p: `${REF}, tight close-up detail of the chuck and drill bit, studio macro product photo on a white background, crisp focus` },
  { f: 'drill5.jpg', p: `${REF}, lifestyle shot of it held in a hand drilling a screw into pale wood, warm natural light, shallow depth of field` },
  { f: 'drill6.jpg', p: `${REF}, lying flat next to its matching battery pack, top-down studio product photo on a pure white background, soft shadow` },
]

async function gen(prompt) {
  const body = {
    contents: [{ parts: [
      { inlineData: { mimeType: 'image/jpeg', data: srcB64 } },
      { text: `Edit this image: ${prompt}` },
    ] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1', imageSize: '1K' } },
  }
  for (const m of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!r.ok) { console.warn(`  ${m} → ${r.status} ${(await r.text()).slice(0, 120)}`); continue }
    const data = await r.json()
    const parts = data.candidates?.[0]?.content?.parts ?? []
    const img = parts.find(p => (p.inlineData?.mimeType || p.inline_data?.mime_type || '').startsWith('image/'))
    const inline = img?.inlineData ?? img?.inline_data
    if (!inline) { console.warn(`  ${m} → pas d'image (finish=${data.candidates?.[0]?.finishReason})`); continue }
    return { model: m, b64: inline.data }
  }
  return null
}

for (const s of SHOTS) {
  process.stdout.write(`${s.f} … `)
  const out = await gen(s.p)
  if (!out) { console.log('ÉCHEC'); continue }
  writeFileSync(`public/promo/assets/${s.f}`, Buffer.from(out.b64, 'base64'))
  console.log(`ok (${out.model})`)
}
