#!/usr/bin/env node
// Audit de santé du code — un seul rapport, un seul code de sortie.
//
// Deux familles de contrôles :
//  · BARRIÈRES : doivent rester à zéro. Toute sortie non nulle fait échouer
//    l'audit (exit 1). C'est la baseline à ne jamais laisser régresser.
//  · INDICATEURS : mesurés et affichés, jamais bloquants. Ils servent à voir
//    la dette bouger dans le temps, pas à interdire un commit.
//
// Usage : node scripts/code-audit.mjs [--fast] [--json]
//   --fast  saute le build Vite et la détection de duplication (les 2 lents)
//   --json  sortie machine, pour comparer deux exécutions

import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const FAST = process.argv.includes('--fast')
const JSON_OUT = process.argv.includes('--json')

/** Seuil au-delà duquel un fichier mérite d'être découpé (convention : 150 pour
 *  un composant ; 400 = le point où plus personne ne relit le fichier entier). */
const BIG_FILE_LINES = 400

/** Retire les séquences ANSI : plusieurs outils colorisent même en pipe, ce qui
 *  casse silencieusement les expressions régulières de parsing. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
const stripAnsi = (s) => s.replace(ANSI, '')

const sh = (cmd) => {
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
    return { ok: true, out: stripAnsi(out) }
  } catch (e) {
    return { ok: false, out: stripAnsi(`${e.stdout ?? ''}${e.stderr ?? ''}`) }
  }
}

const log = (...a) => { if (!JSON_OUT) console.log(...a) }

function sourceFiles(dirs = ['src'], exts = ['.ts', '.tsx']) {
  const out = []
  const walk = (dir) => {
    let entries
    try { entries = readdirSync(dir) } catch { return }
    for (const e of entries) {
      if (e === 'node_modules' || e === 'dist' || e.startsWith('.')) continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (exts.includes(extname(p))) out.push(p)
    }
  }
  dirs.forEach(walk)
  return out
}

const gates = []
const metrics = []
const gate = (name, ok, detail) => gates.push({ name, ok, detail })
const metric = (name, value, detail) => metrics.push({ name, value, detail })

// ─────────────────────────── BARRIÈRES ───────────────────────────

log('▸ Types (tsc -b)…')
const tsc = sh('npx tsc -b')
gate('Types TypeScript', tsc.ok, tsc.ok ? 'aucune erreur' : tsc.out.trim().split('\n').slice(0, 5).join(' | '))

log('▸ Lint (eslint, 0 warning attendu)…')
const lint = sh('npx eslint . -f json')
let lintErrors = 0, lintWarnings = 0
if (lint.out.trim().startsWith('[')) {
  for (const f of JSON.parse(lint.out)) {
    for (const m of f.messages) (m.severity === 2 ? lintErrors++ : lintWarnings++)
  }
}
gate('Lint', lintErrors === 0 && lintWarnings === 0, `${lintErrors} erreur(s), ${lintWarnings} warning(s)`)

log('▸ Tests (vitest run)…')
const tests = sh('npx vitest run --reporter=dot')
const testLine = (tests.out.match(/Tests\s+.*$/m) || [''])[0].trim()
gate('Tests', tests.ok, testLine || (tests.ok ? 'ok' : 'échec'))

log('▸ Code mort (knip)…')
const knip = sh('npx knip --no-exit-code --reporter json')
let knipIssues = 0
try {
  const r = JSON.parse(knip.out.slice(knip.out.indexOf('{')))
  for (const k of ['files', 'dependencies', 'devDependencies', 'exports', 'types', 'unlisted']) {
    knipIssues += Array.isArray(r[k]) ? r[k].length : 0
  }
} catch {
  // Repli sur le rapport texte : knip n'affiche « Unused… » que s'il trouve.
  const txt = sh('npx knip').out
  knipIssues = (txt.match(/^Unused/gm) || []).length
}
gate('Code mort (knip)', knipIssues === 0, `${knipIssues} problème(s)`)

log('▸ Dépendances circulaires (madge)…')
const madge = sh('npx madge --circular --extensions ts,tsx src')
const cycles = Number((madge.out.match(/Found (\d+) circular/) || [0, 0])[1])
gate('Dépendances circulaires', cycles === 0, cycles === 0 ? 'aucune' : `${cycles} cycle(s)`)

// ─────────────────────────── INDICATEURS ───────────────────────────

const files = sourceFiles()
const withLines = files.map((f) => ({ f, n: readFileSync(f, 'utf8').split('\n').length }))

const big = withLines.filter((x) => x.n > BIG_FILE_LINES).sort((a, b) => b.n - a.n)
metric(`Fichiers > ${BIG_FILE_LINES} lignes`, big.length,
  big.slice(0, 8).map((x) => `${x.f} (${x.n})`).join('\n'))

const components = withLines.filter((x) => x.f.endsWith('.tsx') && x.n > 150)
metric('Composants > 150 lignes (convention)', components.length, '')

let anyCount = 0, tsIgnore = 0, consoleLeaks = 0
for (const { f } of withLines) {
  const s = readFileSync(f, 'utf8')
  anyCount += (s.match(/:\s*any\b|<any>|as any\b/g) || []).length
  tsIgnore += (s.match(/@ts-ignore|@ts-nocheck/g) || []).length
  if (!/\.test\.tsx?$/.test(f) && !f.includes('__tests__') && !f.endsWith('debugLog.ts')) {
    consoleLeaks += (s.match(/console\.log\(/g) || []).length
  }
}
metric('Occurrences de `any`', anyCount, 'chaque `any` est un contrôle de type perdu')
metric('@ts-ignore / @ts-nocheck', tsIgnore, '')
metric('console.log hors debugLog', consoleLeaks, 'doit rester à 0 — passer par debugLog')

const todos = sh(`grep -rnE "(TODO|FIXME|HACK|XXX)[: ]" src functions/src --include="*.ts" --include="*.tsx"`).out
metric('TODO / FIXME / HACK', todos.trim() ? todos.trim().split('\n').length : 0, '')

if (!FAST) {
  log('▸ Duplication (jscpd)…')
  const dup = sh('npx --yes jscpd src --min-lines 30 --min-tokens 120 --reporters console --silent --format "typescript,tsx"')
  const m = dup.out.match(/Found (\d+) exact clones with (\d+)\(([\d.]+)%\)/)
  metric('Code dupliqué', m ? `${m[3]}% (${m[1]} clones)` : 'n/c', '')
}

// ─────────────────────────── RAPPORT ───────────────────────────

if (JSON_OUT) {
  console.log(JSON.stringify({ gates, metrics }, null, 2))
} else {
  const pad = (s, n) => String(s).padEnd(n)
  console.log('\n══════════ BARRIÈRES (doivent rester à zéro) ══════════')
  for (const g of gates) console.log(`  ${g.ok ? '✅' : '❌'} ${pad(g.name, 28)} ${g.detail}`)
  console.log('\n══════════ INDICATEURS (dette, non bloquants) ══════════')
  for (const m of metrics) {
    console.log(`  ▪ ${pad(m.name, 34)} ${m.value}`)
    if (m.detail) console.log(`      ${m.detail.replace(/\n/g, '\n      ')}`)
  }
  console.log('')
}

const failed = gates.filter((g) => !g.ok)
if (failed.length) {
  log(`❌ ${failed.length} barrière(s) franchie(s) : ${failed.map((g) => g.name).join(', ')}`)
  process.exit(1)
}
log('✅ Toutes les barrières tiennent.')
