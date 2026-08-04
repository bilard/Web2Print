import { describe, it, expect } from 'vitest'
import { computeEffectivePermissions, isPending } from './computePermissions'
import {
  ADMIN_PERMISSION, ALL_PERMISSION_KEYS, MODULE_LABEL, PERMISSIONS,
  groupModulePermissions, permissionsByModule,
} from './permissions'
import {
  ADMIN_ONLY_SECTIONS, ALL_SECTIONS, MODULE_ITEMS, SECTION_PERMISSION, canSeeModule,
} from '@/features/navigation/modules'
import { moduleMeta } from './moduleMeta'
import { fr } from '@/lib/i18n/fr'

describe('computeEffectivePermissions', () => {
  it('owner → toutes les permissions + admin', () => {
    const set = computeEffectivePermissions({ isOwner: true, rolePermissions: null, grants: [], revokes: [] })
    expect(set.has(ADMIN_PERMISSION)).toBe(true)
    for (const k of ALL_PERMISSION_KEYS) expect(set.has(k)).toBe(true)
  })

  it('rôle ∪ grants − revokes', () => {
    const set = computeEffectivePermissions({
      isOwner: false,
      rolePermissions: ['pim.view', 'pim.edit'],
      grants: ['dam.view'],
      revokes: ['pim.edit'],
    })
    expect([...set].sort()).toEqual(['dam.view', 'pim.view'])
  })

  it('rôle null + non-owner → vide', () => {
    const set = computeEffectivePermissions({ isOwner: false, rolePermissions: null, grants: [], revokes: [] })
    expect(set.size).toBe(0)
  })
})

describe('isPending', () => {
  it('non-owner sans rôle → pending', () => {
    expect(isPending({ isOwner: false, accessRoleId: null })).toBe(true)
  })
  it('non-owner avec rôle → non pending', () => {
    expect(isPending({ isOwner: false, accessRoleId: 'r1' })).toBe(false)
  })
  it('owner → jamais pending', () => {
    expect(isPending({ isOwner: true, accessRoleId: null })).toBe(false)
  })
})

/**
 * CLIQUET — un module de navigation sans permission `.view` est INVISIBLEMENT
 * ouvert à tous : `canSeeModule` applique « pas de clé ⇒ visible ». C'est ce qui
 * a laissé « Nouveau document » et « Démo express » apparaître pour un rôle qui
 * ne portait que `priceWatch.view`. Ces tests ferment la porte.
 */
describe('gouvernance des modules', () => {
  it('chaque section est gatée par une permission OU réservée à l\'admin', () => {
    // ⚠️ Sur ALL_SECTIONS, pas sur MODULE_ITEMS : `settings` s'ouvre par l'engrenage
    // du pied de sidebar et échappait donc au contrôle — il était visible par tous.
    const ungoverned = ALL_SECTIONS
      .filter((id) => !ADMIN_ONLY_SECTIONS.includes(id) && !SECTION_PERMISSION[id])
    expect(ungoverned, 'ajouter une entrée dans SECTION_PERMISSION (ou ADMIN_ONLY_SECTIONS)').toEqual([])
  })

  it('ALL_SECTIONS couvre bien tous les modules de la sidebar', () => {
    // Le Record<Section, true> garantit l'exhaustivité au type-check ; ce test
    // protège contre une liste qui aurait divergé de MODULE_ITEMS.
    const missing = MODULE_ITEMS.map((m) => m.id).filter((id) => !ALL_SECTIONS.includes(id))
    expect(missing).toEqual([])
  })

  it('les clés de SECTION_PERMISSION existent dans le catalogue', () => {
    const unknown = Object.values(SECTION_PERMISSION).filter((k) => !ALL_PERMISSION_KEYS.includes(k!))
    expect(unknown, 'clé absente de PERMISSIONS').toEqual([])
  })

  it('un rôle mono-permission ne voit QUE son module', () => {
    const perms = new Set(['priceWatch.view'])
    const visible = MODULE_ITEMS.filter((m) => canSeeModule(m.id, false, perms)).map((m) => m.id)
    expect(visible).toEqual(['price-watch'])
  })

  it('l\'admin voit tout, y compris les modules d\'administration', () => {
    const visible = MODULE_ITEMS.filter((m) => canSeeModule(m.id, true, new Set())).map((m) => m.id)
    expect(visible).toEqual(MODULE_ITEMS.map((m) => m.id))
  })

  it('chaque groupe de permissions a un libellé traduit et une identité visuelle', () => {
    const modules = [...new Set(PERMISSIONS.map((p) => p.module))]
    for (const m of modules) {
      expect(MODULE_LABEL[m], `libellé manquant pour « ${m} »`).toBeTruthy()
      expect(fr[MODULE_LABEL[m]], `traduction FR manquante pour « ${m} »`).toBeTruthy()
      // moduleMeta retombe sur un FALLBACK gris + icône bouclier : le détecter ici
      // évite qu'un module arrive sans identité visuelle dans la matrice.
      expect(moduleMeta(m).icon, `identité visuelle manquante pour « ${m} »`).not.toBe(moduleMeta('__inconnu__').icon)
    }
  })

  it('l\'arbre des rôles rend TOUTES les permissions du module', () => {
    // « Scraping » porte 2 racines (modèles + hub) : l'arbre n'en rendait qu'une,
    // `scrapingHub.view` était donc introuvable à l'écran. Aucune permission ne
    // doit sortir du découpage, et aucune n'y apparaître deux fois.
    for (const [module, defs] of Object.entries(permissionsByModule())) {
      const rendered = groupModulePermissions(defs)
        .flatMap(({ root, children }) => [...(root ? [root.key] : []), ...children.map((c) => c.key)])
      expect(rendered.sort(), `permissions perdues ou dupliquées dans « ${module} »`)
        .toEqual(defs.map((d) => d.key).sort())
    }
  })

  it('« Scraping » expose bien ses DEUX racines', () => {
    const groups = groupModulePermissions(permissionsByModule()['Scraping'])
    expect(groups.map((g) => g.root?.key)).toEqual(['scrapingTemplates.view', 'scrapingHub.view'])
  })
})
