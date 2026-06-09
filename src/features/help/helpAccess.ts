import { ADMIN_PERMISSION } from '@/features/access/permissions'

/**
 * Permission(s) requise(s) pour voir une section d'aide, par `HelpSection.id`.
 *
 * - Section ABSENTE de la map → toujours visible (contenu transverse : démarrage,
 *   édition, export — non lié à un module précis).
 * - Valeur = une clé, ou un tableau de clés (visible si AU MOINS une est détenue).
 * - L'owner voit toujours tout (court-circuit dans `isHelpSectionVisible`).
 *
 * Les clés proviennent de `permissions.ts` (source de vérité RBAC) : on aligne l'aide
 * sur l'enforcement déjà appliqué à la sidebar/onglets.
 */
const HELP_SECTION_ACCESS: Record<string, string | string[]> = {
  // Import (le module entier est gaté par import.view ; easycatalog = round-trip IDML)
  'import-idml': 'import.view',
  'import-pptx': 'import.view',
  'import-excel': 'import.view',
  'import-image': 'import.view',
  'import-svg': 'import.view',
  'import-image-to-svg': 'import.view',
  'import-pdf-to-svg': 'import.view',
  easycatalog: 'import.view',
  // Modules de données / automatisation / IA
  dam: 'dam.view',
  pim: 'pim.view',
  taxonomies: 'taxonomies.view',
  briefs: ['taxonomies.briefs', 'taxonomies.view'],
  scraping: ['scrapingHub.view', 'scrapingTemplates.view'],
  workflow: 'workflows.view',
  hyperframes: 'hyperframes.view',
  telegram: 'telegram.view',
  chat: 'chat.view',
  settings: 'settings.view',
  // Administration
  access: ADMIN_PERMISSION,
}

/** Contexte d'accès du user courant (extrait d'`access.store`). */
export interface HelpAccessContext {
  isOwner: boolean
  permissions: ReadonlySet<string>
}

/** Vrai ⟺ la section d'aide `id` est visible pour ce user. */
export function isHelpSectionVisible(id: string, ctx: HelpAccessContext): boolean {
  if (ctx.isOwner) return true
  const req = HELP_SECTION_ACCESS[id]
  if (!req) return true // section transverse → toujours visible
  const keys = Array.isArray(req) ? req : [req]
  return keys.some((k) => ctx.permissions.has(k))
}
