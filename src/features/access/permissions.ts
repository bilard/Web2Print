import { t, type TranslationKey } from '@/lib/i18n'
/** Catalogue central de toutes les permissions de l'app. Source de vérité : l'écran admin
 *  génère sa matrice à partir d'ici et `useCan` valide contre ces clés.
 *  Convention : `<module>.view` gate la visibilité du module ; les clés plus fines gatent
 *  onglets/boutons/champs (ajoutées au fil de l'eau). */
export interface PermissionDef {
  key: string
  /** ⚠️ Identifiant de REGROUPEMENT, pas un libellé : `moduleMeta` indexe par cette
   *  chaîne (icône, couleur, ordre). La traduire casserait le style — l'affichage
   *  passe par `MODULE_LABEL` ci-dessous. */
  module: string
  labelKey: TranslationKey
  descriptionKey?: TranslationKey
}

/** Libellé AFFICHÉ d'un groupe de permissions (cf. `PermissionDef.module`). */
export const MODULE_LABEL: Record<string, TranslationKey> = {
  'Bibliothèque': 'perm.module.0',
  'Import': 'perm.module.1',
  'DAM': 'perm.module.2',
  'PIM': 'perm.module.3',
  'Taxonomies': 'perm.module.4',
  'Scraping': 'perm.module.5',
  'Workflows': 'perm.module.6',
  'Veille tarifaire': 'perm.module.7',
  'Insights fabricant': 'perm.module.15',
  'Démo express': 'perm.module.16',
  'Création studio': 'perm.module.8',
  'Catalogue studio': 'perm.module.9',
  'Animation': 'perm.module.10',
  'Chat IA': 'perm.module.11',
  'Telegram': 'perm.module.12',
  'Paramètres': 'perm.module.13',
  'Finances': 'perm.module.17',
  'Équipe': 'perm.module.18',
  'Démo': 'perm.module.14',
}

/**
 * Permission spéciale : accès total, TOUTES sociétés confondues.
 *
 * ⚠️ Ne jamais l'accorder par un rôle : `firestore.rules` refuse qu'un rôle la
 * porte (`noAdminEscalation`), sinon un administrateur d'entreprise se
 * fabriquerait un rôle « admin » et sortirait de sa société.
 */
export const ADMIN_PERMISSION = 'admin'

/** Administration de SA société : membres + rôles, jamais au-delà. */
export const TEAM_VIEW_PERMISSION = 'team.view'

/** Permission-marqueur d'un compte « démo » : plafonne les données importées. */
export const DEMO_PERMISSION = 'demo.view'

/** Compteurs d'usage cumulés par compte (champ `users/{uid}.usage`). */
export interface UsageCounters {
  pimRows: number
  damAssets: number
}

/** Plafonds appliqués aux comptes démo. ⚠ Dupliqués dans `firestore.rules`
 *  (`withinQuota`) et `functions/src/dam/damUpload.ts` — tenir les 3 en phase. */
export const DEMO_LIMITS: UsageCounters = { pimRows: 50, damAssets: 20 }

export const PERMISSIONS: PermissionDef[] = [
  { key: 'library.view', module: 'Bibliothèque', labelKey: 'perm.library.view' },
  { key: 'library.create', module: 'Bibliothèque', labelKey: 'perm.library.create' },
  { key: 'library.duplicate', module: 'Bibliothèque', labelKey: 'perm.library.duplicate' },
  { key: 'library.delete', module: 'Bibliothèque', labelKey: 'perm.library.delete' },
  { key: 'import.view', module: 'Import', labelKey: 'perm.import.view' },
  { key: 'import.idml', module: 'Import', labelKey: 'perm.import.idml' },
  { key: 'import.pptx', module: 'Import', labelKey: 'perm.import.pptx' },
  { key: 'import.image', module: 'Import', labelKey: 'perm.import.image' },
  { key: 'import.svg', module: 'Import', labelKey: 'perm.import.svg' },
  { key: 'import.excel', module: 'Import', labelKey: 'perm.import.excel' },
  { key: 'import.imageToSvg', module: 'Import', labelKey: 'perm.import.imageToSvg' },
  { key: 'import.pdfToSvg', module: 'Import', labelKey: 'perm.import.pdfToSvg' },
  { key: 'dam.view', module: 'DAM', labelKey: 'perm.dam.view' },
  { key: 'dam.upload', module: 'DAM', labelKey: 'perm.dam.upload' },
  { key: 'dam.edit', module: 'DAM', labelKey: 'perm.dam.edit' },
  { key: 'dam.collection', module: 'DAM', labelKey: 'perm.dam.collection' },
  { key: 'dam.delete', module: 'DAM', labelKey: 'perm.dam.delete' },
  { key: 'dam.generate', module: 'DAM', labelKey: 'perm.dam.generate' },
  { key: 'dam.animations', module: 'DAM', labelKey: 'perm.dam.animations' },
  { key: 'dam.gdrive', module: 'DAM', labelKey: 'perm.dam.gdrive' },
  { key: 'pim.view', module: 'PIM', labelKey: 'perm.pim.view' },
  { key: 'pim.create', module: 'PIM', labelKey: 'perm.pim.create' },
  { key: 'pim.import', module: 'PIM', labelKey: 'perm.pim.import' },
  { key: 'pim.scrape', module: 'PIM', labelKey: 'perm.pim.scrape' },
  { key: 'pim.edit', module: 'PIM', labelKey: 'perm.pim.edit' },
  { key: 'pim.delete', module: 'PIM', labelKey: 'perm.pim.delete' },
  { key: 'pim.export', module: 'PIM', labelKey: 'perm.pim.export' },
  { key: 'pim.databases', module: 'PIM', labelKey: 'perm.pim.databases' },
  { key: 'pim.competitors', module: 'PIM', labelKey: 'perm.pim.competitors' },
  { key: 'taxonomies.view', module: 'Taxonomies', labelKey: 'perm.taxonomies.view' },
  { key: 'taxonomies.edit', module: 'Taxonomies', labelKey: 'perm.taxonomies.edit' },
  { key: 'taxonomies.briefs', module: 'Taxonomies', labelKey: 'perm.taxonomies.briefs' },
  { key: 'scrapingTemplates.view', module: 'Scraping', labelKey: 'perm.scrapingTemplates.view' },
  { key: 'scrapingTemplates.edit', module: 'Scraping', labelKey: 'perm.scrapingTemplates.edit' },
  { key: 'scrapingHub.view', module: 'Scraping', labelKey: 'perm.scrapingHub.view' },
  { key: 'scrapingHub.edit', module: 'Scraping', labelKey: 'perm.scrapingHub.edit' },
  { key: 'workflows.view', module: 'Workflows', labelKey: 'perm.workflows.view' },
  { key: 'workflows.create', module: 'Workflows', labelKey: 'perm.workflows.create' },
  { key: 'workflows.edit', module: 'Workflows', labelKey: 'perm.workflows.edit' },
  { key: 'workflows.delete', module: 'Workflows', labelKey: 'perm.workflows.delete' },
  { key: 'workflows.run', module: 'Workflows', labelKey: 'perm.workflows.run' },
  { key: 'priceWatch.view', module: 'Veille tarifaire', labelKey: 'perm.priceWatch.view' },
  { key: 'priceWatch.rules', module: 'Veille tarifaire', labelKey: 'perm.priceWatch.rules',
    descriptionKey: 'perm.priceWatch.rules.desc' },
  { key: 'mfrInsights.view', module: 'Insights fabricant', labelKey: 'perm.mfrInsights.view' },
  { key: 'demoExpress.view', module: 'Démo express', labelKey: 'perm.demoExpress.view',
    descriptionKey: 'perm.demoExpress.view.desc' },
  { key: 'retailPromo.view', module: 'Création studio', labelKey: 'perm.retailPromo.view' },
  { key: 'retailPromo.edit', module: 'Création studio', labelKey: 'perm.retailPromo.edit' },
  { key: 'catalog.view', module: 'Catalogue studio', labelKey: 'perm.catalog.view' },
  { key: 'catalog.edit', module: 'Catalogue studio', labelKey: 'perm.catalog.edit' },
  { key: 'hyperframes.view', module: 'Animation', labelKey: 'perm.hyperframes.view' },
  { key: 'chat.view', module: 'Chat IA', labelKey: 'perm.chat.view' },
  { key: 'telegram.view', module: 'Telegram', labelKey: 'perm.telegram.view' },
  { key: 'telegram.send', module: 'Telegram', labelKey: 'perm.telegram.send' },
  { key: 'settings.view', module: 'Paramètres', labelKey: 'perm.settings.view' },
  { key: 'settings.firebase.view', module: 'Paramètres', labelKey: 'perm.settings.firebase.view' },
  { key: 'settings.connectors.edit', module: 'Paramètres', labelKey: 'perm.settings.connectors.edit' },
  { key: 'settings.cookies.edit', module: 'Paramètres', labelKey: 'perm.settings.cookies.edit' },
  // Réécriture du vocabulaire d'interface du COMPTE : engage tous ses membres,
  // pas seulement celui qui édite. D'où une permission dédiée.
  { key: 'settings.i18n.edit', module: 'Paramètres', labelKey: 'perm.settings.i18n.edit',
    descriptionKey: 'perm.settings.i18n.edit.desc' },
  // Administration DÉLÉGUÉE à une société : son porteur gère les collègues de sa
  // propre société (`users/{uid}.accountId` identique), jamais ceux d'une autre —
  // le cloisonnement est appliqué par `firestore.rules`, pas seulement par l'UI.
  { key: TEAM_VIEW_PERMISSION, module: 'Équipe', labelKey: 'perm.team.view',
    descriptionKey: 'perm.team.view.desc' },
  { key: 'team.assign', module: 'Équipe', labelKey: 'perm.team.assign',
    descriptionKey: 'perm.team.assign.desc' },
  { key: 'team.roles', module: 'Équipe', labelKey: 'perm.team.roles',
    descriptionKey: 'perm.team.roles.desc' },
  // Coûts d'usage du MEMBRE CONNECTÉ : `aiUsage`/`brightDataUsage`/`scrapeUsage` sont
  // clefés par `{uid}_{mois}` — accorder cette clé ne montre jamais les coûts d'autrui.
  { key: 'finances.view', module: 'Finances', labelKey: 'perm.finances.view',
    descriptionKey: 'perm.finances.view.desc' },
  // Marqueur de compte « démo » : ne débloque rien mais IMPOSE les quotas DEMO_LIMITS
  // (lignes PIM + assets DAM). Un rôle qui porte cette clé est plafonné, côté client
  // ET serveur (firestore.rules + Cloud Function damUpload). L'owner n'est jamais limité.
  { key: DEMO_PERMISSION, module: 'Démo', labelKey: 'perm.demo.view', descriptionKey: 'perm.demo.view.desc' },
]

export const ALL_PERMISSION_KEYS: string[] = PERMISSIONS.map((p) => p.key)

/** Permission parente requise. Convention : toute action dépend de l'accès au module
 *  `<1er segment>.view`. Seule cette clé racine elle-même n'a pas de parent (ex.
 *  `settings.firebase.view` dépend bien de `settings.view`). */
export function permissionParent(key: string): string | null {
  const root = key.split('.')[0]
  const viewKey = `${root}.view`
  return key === viewKey ? null : viewKey
}

/** Enfants directs d'une permission (celles dont elle est le parent). */
export function permissionChildren(key: string): string[] {
  return PERMISSIONS.filter((p) => permissionParent(p.key) === key).map((p) => p.key)
}

/** Une racine `.view` et les actions qui en dépendent (`root: null` = orphelins). */
export interface PermissionGroup {
  root: PermissionDef | null
  children: PermissionDef[]
}

/**
 * Découpe les permissions d'UN module en racines + enfants, pour l'arbre des rôles.
 *
 * ⚠️ Un module peut porter PLUSIEURS racines — « Scraping » réunit
 * `scrapingTemplates.view` et `scrapingHub.view`. N'en rendre qu'une faisait
 * disparaître la seconde (et ses actions) de l'écran des rôles, sans erreur.
 * Le test de gouvernance vérifie qu'aucune permission ne sort du découpage.
 */
export function groupModulePermissions(defs: PermissionDef[]): PermissionGroup[] {
  const roots = defs.filter((d) => permissionParent(d.key) === null)
  const rootKeys = new Set(roots.map((d) => d.key))
  const groups: PermissionGroup[] = roots.map((root) => ({
    root,
    children: defs.filter((d) => permissionParent(d.key) === root.key),
  }))
  // Filet : enfant dont la racine n'est pas déclarée dans ce module — rendu à plat
  // plutôt que perdu.
  const orphans = defs.filter((d) => {
    const parent = permissionParent(d.key)
    return parent !== null && !rootKeys.has(parent)
  })
  if (orphans.length > 0) groups.push({ root: null, children: orphans })
  return groups
}

/** Regroupe les permissions par module pour la matrice de l'écran admin. */
export function permissionsByModule(): Record<string, PermissionDef[]> {
  const out: Record<string, PermissionDef[]> = {}
  for (const p of PERMISSIONS) {
    ;(out[p.module] ??= []).push(p)
  }
  return out
}

/** Libellé lisible d'une clé (fallback = la clé brute si inconnue). */
export function permissionLabel(key: string): string {
  const k = PERMISSIONS.find((p) => p.key === key)?.labelKey
  return k ? t(k) : key
}
