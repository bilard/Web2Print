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
  { key: 'import.view', module: 'Import', label: 'Importer des fichiers' },
  { key: 'dam.view', module: 'DAM', label: 'Voir le DAM' },
  { key: 'dam.upload', module: 'DAM', label: 'Uploader des assets' },
  { key: 'dam.delete', module: 'DAM', label: 'Supprimer des assets' },
  { key: 'pim.view', module: 'PIM', label: 'Voir le PIM' },
  { key: 'pim.edit', module: 'PIM', label: 'Éditer les produits' },
  { key: 'pim.delete', module: 'PIM', label: 'Supprimer des produits' },
  { key: 'pim.export', module: 'PIM', label: 'Exporter les produits' },
  { key: 'taxonomies.view', module: 'Taxonomies', label: 'Voir les taxonomies' },
  { key: 'scrapingTemplates.view', module: 'Scraping', label: 'Voir les templates de scraping' },
  { key: 'scrapingHub.view', module: 'Scraping', label: 'Voir le Scraping Hub' },
  { key: 'workflows.view', module: 'Workflows', label: 'Voir les workflows' },
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
