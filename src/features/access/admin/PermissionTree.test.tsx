import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PermissionTree } from './PermissionTree'
import { permissionsByModule, permissionLabel } from '@/features/access/permissions'

/**
 * Vérifie le RENDU, pas seulement le découpage : « Scraping » porte deux racines
 * (`scrapingTemplates.view` + `scrapingHub.view`) et l'arbre n'en rendait qu'une.
 * La seconde et ses actions disparaissaient de l'écran des rôles sans aucune
 * erreur — un test sur la fonction pure seule n'aurait pas attrapé le symptôme.
 */
function renderTree(module: string, selected: string[] = []): string {
  const defs = permissionsByModule()[module]
  return renderToStaticMarkup(
    <PermissionTree
      entries={[[module, defs]]}
      isSelected={(k) => selected.includes(k)}
      onToggle={() => {}}
      openSet={new Set([module])}
      onToggleModule={() => {}}
    />,
  )
}

/** Les libellés traversent l'échappement HTML de React (apostrophes notamment). */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
}

describe('PermissionTree', () => {
  it('rend TOUTES les permissions de chaque module', () => {
    for (const [module, defs] of Object.entries(permissionsByModule())) {
      const html = renderTree(module)
      for (const d of defs) {
        expect(html, `« ${permissionLabel(d.key)} » (${d.key}) absent de l'arbre`)
          .toContain(esc(permissionLabel(d.key)))
      }
      // Le compteur affiché doit couvrir le total réel du module.
      expect(html, `compteur faux pour « ${module} »`).toContain(`0/${defs.length}`)
    }
  })

  it('rend les DEUX racines du module Scraping', () => {
    const html = renderTree('Scraping')
    // Une racine se reconnaît à son `title` = la clé brute et à l'absence de verrou.
    expect(html).toContain('title="scrapingTemplates.view"')
    expect(html).toContain('title="scrapingHub.view"')
  })

  it('verrouille chaque action sur SA racine, pas sur celle du voisin', () => {
    const html = renderTree('Scraping', ['scrapingTemplates.view'])
    // Racine cochée → son action est déverrouillée (title = la clé brute).
    expect(html).toContain('title="scrapingTemplates.edit"')
    // Racine voisine décochée → SON action reste verrouillée (title = l'indice).
    expect(html).toContain(esc(`Active aussi : ${permissionLabel('scrapingHub.view')}`))
  })
})
