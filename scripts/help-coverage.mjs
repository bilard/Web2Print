// Couverture des CORPS d'aide traduits (`helpBodies.en.ts` + `strings.en.json`).
// Charge le contenu via le loader SSR de Vite (comme build-docs-content.mjs)
// pour comparer les chaînes RÉSOLUES — pas le texte source, dont les backticks
// sont échappés.
//
//   node scripts/help-coverage.mjs            → total
//   node scripts/help-coverage.mjs --list     → manquants par section
//   node scripts/help-coverage.mjs --dump=ID  → markdown FR brut des manquants
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { helpSections: HELP_SECTIONS } = await server.ssrLoadModule('/src/features/help/content/index.ts')
const { HELP_BODIES_EN } = await server.ssrLoadModule('/src/features/help/helpBodies.en.ts')
const docs = JSON.parse(readFileSync('scripts/docs-i18n/strings.en.json', 'utf8'))
await server.close()

const map = { ...docs, ...HELP_BODIES_EN }
const dumpId = process.argv.find((a) => a.startsWith('--dump='))?.slice(7)
let total = 0
let covered = 0
const missing = []
for (const s of HELP_SECTIONS) {
  for (const b of s.blocks ?? []) {
    if (b.type !== 'text' || typeof b.md !== 'string') continue
    total++
    if (map[b.md] != null) covered++
    else missing.push({ section: s.id ?? s.title, md: b.md })
  }
}

if (dumpId) {
  for (const m of missing.filter((x) => x.section === dumpId)) console.log(`${m.md}\n\n@@@@@\n`)
} else {
  console.log(`corps markdown : ${covered}/${total} traduits (${Math.round((covered / total) * 100)} %)`)
  if (process.argv.includes('--list')) {
    const bySection = {}
    for (const m of missing) (bySection[m.section] ??= []).push(m.md)
    for (const [sec, mds] of Object.entries(bySection).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${sec} (${mds.length})`)
    }
  }
}
