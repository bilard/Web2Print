import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Toute PAGE routée doit s'abonner au vocabulaire du compte.
 *
 * ⚠️ Ce test remplace un garde-fou que le typage ne peut pas tenir. ~380 fichiers
 * appellent le `t()` de module : ils ne sont abonnés à rien et ne recalculent
 * leur texte que si un ancêtre se re-rend. Les éléments de route étant
 * construits une fois pour toutes dans `router.tsx`, un abonnement placé plus
 * haut (App, ProtectedRoute) ne les atteint pas — les deux ont été essayés et
 * mesurés. La page est donc le point d'accroche, et l'oubli est silencieux :
 * l'écran s'affiche normalement, seul le mot réécrit n'apparaît jamais.
 *
 * `e2e/i18n-live-rerender.spec.ts` le vérifie à l'écran sur une page ; celui-ci
 * couvre les autres sans démarrer de navigateur.
 */

const ROOT = join(__dirname, '../..')

/** Résout un ré-export (`export { X as default } from '@/…'`) vers son fichier réel. */
function resolvePage(file: string): string {
  const path = join(ROOT, 'pages', file)
  const src = readFileSync(path, 'utf8')
  const reexport = src.match(/from '@\/([^']+)'/)
  if (src.length < 200 && reexport) {
    const real = join(ROOT, `${reexport[1]}.tsx`)
    if (existsSync(real)) return real
  }
  return path
}

describe('pages routées et vocabulaire de compte', () => {
  const PAGES = [
    'CatalogBuilderPage.tsx', 'DashboardPage.tsx', 'DataPage.tsx', 'EditorPage.tsx',
    'LoginPage.tsx', 'PulsePage.tsx', 'RadarPage.tsx', 'ScrapingTemplatesPage.tsx',
    'TaxonomiesPage.tsx', 'WorkflowEditorPage.tsx', 'WorkflowResultsPage.tsx',
    'WorkflowsPage.tsx',
  ]

  it("s'abonnent toutes, via useTranslation ou useI18nVersion", () => {
    const orphans: string[] = []
    for (const page of PAGES) {
      const src = readFileSync(resolvePage(page), 'utf8')
      if (!/useTranslation\(\)|useI18nVersion\(\)/.test(src)) orphans.push(page)
    }
    expect(
      orphans,
      `pages sans abonnement au vocabulaire (ajouter useI18nVersion()) :\n${orphans.join('\n')}`,
    ).toEqual([])
  })

  it('couvre bien toutes les pages du dossier', () => {
    // Sans ça, une page AJOUTÉE échapperait au contrôle ci-dessus : la liste est
    // écrite en dur pour rester lisible, ce test la tient à jour.
    const onDisk = readdirSync(join(ROOT, 'pages')).filter((f) => f.endsWith('.tsx')).sort()
    expect(onDisk).toEqual([...PAGES].sort())
  })
})
