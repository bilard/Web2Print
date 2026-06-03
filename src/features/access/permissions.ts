// src/features/access/permissions.ts
/** Catalogue central de toutes les permissions de l'app. Source de vérité : l'écran admin
 *  génère sa matrice à partir d'ici et `useCan` valide contre ces clés.
 *  Convention : `<module>.view` gate la visibilité du module ; les clés plus fines gatent
 *  onglets/boutons/champs (ajoutées au fil de l'eau). */
export interface PermissionDef {
  key: string
  module: string
  label: string
  description?: string
}

/** Permission spéciale : accès total + gestion des rôles/utilisateurs. */
export const ADMIN_PERMISSION = 'admin'

export const PERMISSIONS: PermissionDef[] = [
  { key: 'library.view', module: 'Bibliothèque', label: 'Voir la bibliothèque' },
  { key: 'library.create', module: 'Bibliothèque', label: 'Créer un document/projet' },
  { key: 'library.duplicate', module: 'Bibliothèque', label: 'Dupliquer un projet' },
  { key: 'library.delete', module: 'Bibliothèque', label: 'Supprimer un projet' },
  { key: 'import.view', module: 'Import', label: 'Ouvrir l\'écran Importer' },
  { key: 'import.idml', module: 'Import', label: 'Importer IDML' },
  { key: 'import.pptx', module: 'Import', label: 'Importer PPTX' },
  { key: 'import.image', module: 'Import', label: 'Importer une image' },
  { key: 'import.svg', module: 'Import', label: 'Importer SVG' },
  { key: 'import.excel', module: 'Import', label: 'Importer Excel' },
  { key: 'import.imageToSvg', module: 'Import', label: 'Image → SVG éditable' },
  { key: 'import.pdfToSvg', module: 'Import', label: 'PDF → SVG éditable' },
  { key: 'dam.view', module: 'DAM', label: 'Voir le DAM' },
  { key: 'dam.upload', module: 'DAM', label: 'Uploader des assets' },
  { key: 'dam.edit', module: 'DAM', label: 'Éditer / variantes d\'image' },
  { key: 'dam.collection', module: 'DAM', label: 'Gérer les collections' },
  { key: 'dam.delete', module: 'DAM', label: 'Supprimer des assets' },
  { key: 'dam.generate', module: 'DAM', label: 'Création d\'image (IA)' },
  { key: 'dam.animations', module: 'DAM', label: 'Animations HTML' },
  { key: 'dam.gdrive', module: 'DAM', label: 'Google Drive' },
  { key: 'pim.view', module: 'PIM', label: 'Voir le PIM' },
  { key: 'pim.create', module: 'PIM', label: 'Créer une base' },
  { key: 'pim.import', module: 'PIM', label: 'Importer un Excel' },
  { key: 'pim.scrape', module: 'PIM', label: 'Scraper le web' },
  { key: 'pim.edit', module: 'PIM', label: 'Éditer les produits' },
  { key: 'pim.delete', module: 'PIM', label: 'Supprimer des produits' },
  { key: 'pim.export', module: 'PIM', label: 'Exporter les produits' },
  { key: 'taxonomies.view', module: 'Taxonomies', label: 'Voir les taxonomies' },
  { key: 'taxonomies.edit', module: 'Taxonomies', label: 'Gérer les nœuds (créer/renommer/supprimer)' },
  { key: 'taxonomies.briefs', module: 'Taxonomies', label: 'Briefs clients' },
  { key: 'scrapingTemplates.view', module: 'Scraping', label: 'Voir les templates de scraping' },
  { key: 'scrapingTemplates.edit', module: 'Scraping', label: 'Gérer les templates de scraping' },
  { key: 'scrapingHub.view', module: 'Scraping', label: 'Voir le Scraping Hub' },
  { key: 'scrapingHub.edit', module: 'Scraping', label: 'Éditer les règles de scraping' },
  { key: 'workflows.view', module: 'Workflows', label: 'Voir les workflows' },
  { key: 'workflows.create', module: 'Workflows', label: 'Créer un workflow' },
  { key: 'workflows.edit', module: 'Workflows', label: 'Éditer / enregistrer un workflow' },
  { key: 'workflows.delete', module: 'Workflows', label: 'Supprimer un workflow' },
  { key: 'workflows.run', module: 'Workflows', label: 'Exécuter les workflows' },
  { key: 'hyperframes.view', module: 'Animation', label: 'Voir le module Animation' },
  { key: 'chat.view', module: 'Chat IA', label: 'Voir le Chat IA' },
  { key: 'telegram.view', module: 'Telegram', label: 'Voir Telegram' },
  { key: 'settings.view', module: 'Paramètres', label: 'Ouvrir les Paramètres' },
  { key: 'settings.firebase.view', module: 'Paramètres', label: 'Voir l\'onglet Firebase' },
  { key: 'settings.connectors.edit', module: 'Paramètres', label: 'Éditer les connecteurs' },
  { key: 'settings.cookies.edit', module: 'Paramètres', label: 'Éditer les cookies' },
]

export const ALL_PERMISSION_KEYS: string[] = PERMISSIONS.map((p) => p.key)

/** Permission parente requise. Convention : toute action `<module>.<...>` dépend de
 *  l'accès au module `<module>.view`. Les clés `*.view` n'ont pas de parent (racine). */
export function permissionParent(key: string): string | null {
  if (key.endsWith('.view')) return null
  const root = key.split('.')[0]
  return `${root}.view`
}

/** Enfants directs d'une permission (celles dont elle est le parent). */
export function permissionChildren(key: string): string[] {
  return PERMISSIONS.filter((p) => permissionParent(p.key) === key).map((p) => p.key)
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
  return PERMISSIONS.find((p) => p.key === key)?.label ?? key
}
