// Extrait les chaînes traduisibles de public/docs/content.js (structuré) + les
// captions DEMOS de app.js. Dédupliqué par VALEUR (une chaîne FR → une trad partout).
import { writeFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const { CATEGORIES, MODULES } = await import(pathToFileURL(`${ROOT}/public/docs/content.js`).href)

const strings = new Set()
const add = (s) => { if (typeof s === 'string' && s.trim()) strings.add(s) }

for (const c of CATEGORIES) { add(c.label); add(c.desc) }
for (const m of MODULES) {
  add(m.title); add(m.intro); add(m.cat)
  for (const f of m.features || []) { add(f.title); add(f.desc) }
  for (const s of m.shortcuts || []) { add(s.label) }
}

// Captions DEMOS : lues depuis app.js (regex sur caption: "…").
const appjs = readFileSync(`${ROOT}/public/docs/app.js`, 'utf8')
for (const mm of appjs.matchAll(/caption:\s*"((?:[^"\\]|\\.)*)"/g)) {
  add(mm[1].replace(/\\"/g, '"'))
}

// UI (index.html + app.js) — ajoutées à la main (peu nombreuses).
const UI = [
  'Documentation · IBS-Studio',
  'Rechercher un module ou une fonction…',
  'Rechercher (Ctrl+K)',
  'Fonctions',
  'Raccourcis clavier',
]
UI.forEach(add)

const D = HERE
const list = [...strings]
writeFileSync(`${D}/strings.fr.json`, JSON.stringify(list, null, 1))
console.log('chaînes uniques:', list.length)
console.log('total caractères:', list.reduce((a, s) => a + s.length, 0))
console.log('échantillon:', list.slice(0, 6))
