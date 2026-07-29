// Couverture des chaînes d'aide traduites (`helpBodies.en.ts` + `strings.en.json`).
// Charge le contenu via le loader SSR de Vite (comme build-docs-content.mjs)
// pour comparer les chaînes RÉSOLUES — pas le texte source, dont les backticks
// sont échappés.
//
//   node scripts/help-coverage.mjs             → total par type de bloc
//   node scripts/help-coverage.mjs --list      → manquants par section
//   node scripts/help-coverage.mjs --dump=ID   → chaînes FR brutes des manquants
//
// ⚠️ Un bloc d'aide n'est PAS que du markdown : `menu-link`/`shortcut`/
// `accordion`/`mockup` portent aussi du texte affiché (label, title, hint…).
// Ne compter que `type:'text'` donnerait un faux 100 %.
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { helpSections: HELP_SECTIONS } = await server.ssrLoadModule('/src/features/help/content/index.ts')
const { HELP_BODIES_EN } = await server.ssrLoadModule('/src/features/help/helpBodies.en.ts')
const docs = JSON.parse(readFileSync('scripts/docs-i18n/strings.en.json', 'utf8'))
await server.close()

const map = { ...docs, ...HELP_BODIES_EN }

// Chaque bloc → les chaînes AFFICHÉES qu'il porte, avec le type d'origine.
function strings(b) {
  const out = []
  const push = (kind, s) => {
    if (typeof s === 'string' && s.trim()) out.push({ kind, s })
  }
  push(b.type, b.md)
  push(b.type, b.label)
  push(b.type, b.title)
  push(b.type, b.caption)
  push(b.type, b.hint)
  for (const it of b.items ?? []) {
    push(b.type, it.label)
    push(b.type, it.title)
    push(b.type, it.body)
    push(b.type, it.md)
    push(b.type, it.text)
    push(b.type, it.desc)
    for (const n of it.items ?? []) {
      push(b.type, n.label)
      push(b.type, n.text)
    }
  }
  return out
}

const dumpId = process.argv.find((a) => a.startsWith('--dump='))?.slice(7)
const byKind = {}
const missing = []
for (const sec of HELP_SECTIONS) {
  for (const b of sec.blocks ?? []) {
    for (const { kind, s } of strings(b)) {
      const k = (byKind[kind] ??= { total: 0, covered: 0 })
      k.total++
      if (map[s] != null) k.covered++
      else missing.push({ section: sec.id ?? sec.title, kind, s })
    }
  }
}

if (dumpId) {
  const sel = dumpId === 'all' ? missing : missing.filter((x) => x.section === dumpId)
  for (const m of sel) console.log(`${m.s}\n@@@@@`)
} else {
  let total = 0
  let covered = 0
  for (const [kind, k] of Object.entries(byKind).sort()) {
    total += k.total
    covered += k.covered
    console.log(`  ${kind.padEnd(12)} ${k.covered}/${k.total}`)
  }
  console.log(`aide : ${covered}/${total} traduits (${Math.round((covered / total) * 100)} %)`)
  if (process.argv.includes('--list')) {
    const bySection = {}
    for (const m of missing) (bySection[m.section] ??= []).push(m.s)
    for (const [sec, ss] of Object.entries(bySection).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${sec} (${ss.length})`)
    }
  }
}
