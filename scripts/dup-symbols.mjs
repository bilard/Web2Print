#!/usr/bin/env node
// Détecte les fonctions/constantes DUPLIQUÉES à l'identique entre modules.
// Complète jscpd, qui rate tout ce qui fait moins de 30 lignes — or c'est là
// que vivent les helpers recopiés, les plus dangereux à diverger.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { createHash } from 'node:crypto'

const files = []
const walk = (d) => {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (['.ts', '.tsx'].includes(extname(p))) files.push(p)
  }
}
walk('src')

const bySig = new Map()

for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:export )?(?:async )?function ([A-Za-z_][\w]*)\s*\(/)
    if (!m) continue
    // Corps = jusqu'au premier `}` en colonne 0
    let end = i
    while (end < lines.length && lines[end] !== '}') end++
    if (end - i < 3) continue
    const body = lines.slice(i, end + 1)
      .map((l) => l.replace(/\/\/.*$/, '').trimEnd())   // ignore les commentaires de fin
      .filter((l) => l.trim() && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n')
      // ⚠ Normaliser `export ` : le cas le PLUS fréquent est une version
      // canonique exportée et une copie locale privée. Sans ça le détecteur
      // rate précisément les doublons qu'on cherche.
      .replace(/^export /, '')
    const key = createHash('sha1').update(body).digest('hex')
    if (!bySig.has(key)) bySig.set(key, { name: m[1], lines: end - i + 1, where: [] })
    bySig.get(key).where.push(`${f}:${i + 1}`)
    i = end
  }
}

const dups = [...bySig.values()].filter((v) => v.where.length > 1).sort((a, b) => b.lines - a.lines)
if (!dups.length) {
  console.log('✅ aucune fonction dupliquée à l’identique')
} else {
  console.log(`⚠ ${dups.length} fonction(s) dupliquée(s) à l’identique :\n`)
  for (const d of dups) console.log(`  ${d.name} (${d.lines} l.)\n    ${d.where.join('\n    ')}`)
}
