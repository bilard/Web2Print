import { z } from 'zod'

/**
 * Schéma d'un template de scraping par fournisseur.
 *
 * Un template permet à l'utilisateur (ou l'extension Chrome) de désigner
 * VISUELLEMENT les selectors CSS/XPath à utiliser pour extraire chaque
 * champ d'un produit. Appliqué à tous les produits d'un même fournisseur,
 * il remplace le scraping aveugle + LLM par une extraction déterministe.
 */

export const selectorStrategySchema = z.object({
  /** Type de sélecteur : CSS (le plus courant), XPath, ou lookup par attribut. */
  kind: z.enum(['css', 'xpath', 'attr', 'text']),
  /** Expression du sélecteur. */
  expression: z.string(),
  /** Optionnel : attribut à lire (src, href, data-*). Par défaut : textContent. */
  attr: z.string().optional(),
  /** Optionnel : regex appliquée à la valeur extraite pour isoler une sous-partie. */
  regex: z.string().optional(),
})
export type SelectorStrategy = z.infer<typeof selectorStrategySchema>

export const fieldSelectorSchema = z.object({
  /** Nom du champ cible (title, description, price, image, …). */
  field: z.string(),
  /** Liste de sélecteurs testés dans l'ordre : on garde la 1re valeur non-vide.
   *  Permet la robustesse quand le fournisseur change son CSS. */
  strategies: z.array(selectorStrategySchema).min(1),
  /** Si vrai, on collecte toutes les occurrences (pour images, specs, variants). */
  multiple: z.boolean().default(false),
  /** Transformation post-extraction : trim, uppercase, parse-number, clean-url… */
  transform: z.enum([
    'trim', 'lowercase', 'uppercase', 'normalize-whitespace',
    'parse-number', 'parse-price', 'absolutize-url', 'decode-html',
  ]).optional(),
  /** Prompt LLM optionnel pour reformater/traduire la valeur après extraction. */
  prompt: z.string().optional(),
})
export type FieldSelector = z.infer<typeof fieldSelectorSchema>

/** Pour les groupes de paires (specs organisées par section). */
export const groupSelectorSchema = z.object({
  /** Nom du groupe (ex: "Moteur", "Dimensions"). */
  field: z.literal('specs-group'),
  /** Sélecteur du conteneur du groupe. */
  container: selectorStrategySchema,
  /** Sélecteur du titre du groupe (nom affiché). */
  titleSelector: selectorStrategySchema,
  /** Sélecteur d'une ligne de paire key/value au sein du groupe. */
  rowSelector: selectorStrategySchema,
  /** Sélecteur pour la clé dans chaque ligne (relatif à rowSelector). */
  keySelector: selectorStrategySchema,
  /** Sélecteur pour la valeur dans chaque ligne (relatif à rowSelector). */
  valueSelector: selectorStrategySchema,
})
export type GroupSelector = z.infer<typeof groupSelectorSchema>

export const preActionSchema = z.object({
  /** Type d'action à exécuter avant la capture. */
  kind: z.enum([
    'click',         // cliquer un selector (accordéon, onglet)
    'scroll',        // scroll la page (n px ou "bottom")
    'wait',          // attendre n ms
    'waitForSelector', // attendre qu'un selector apparaisse
    'acceptCookies', // cliquer le bouton cookies (auto-détection)
  ]),
  selector: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
})
export type PreAction = z.infer<typeof preActionSchema>

export const scrapingTemplateSchema = z.object({
  /** ID Firestore. */
  id: z.string(),
  /** Nom lisible (ex: "Milwaukee fiche produit"). */
  name: z.string().min(3),
  /** Domaine du fournisseur (ex: "fr.milwaukeetool.eu"). */
  vendorDomain: z.string(),
  /** Pattern regex de l'URL qui déclenche ce template
   *  (ex: "/fr-fr/.*\\/.*-.+\\/$" pour une fiche produit Milwaukee). */
  urlPattern: z.string().default('.*'),
  /** Actions à exécuter avant de capturer le DOM (accordéons, cookies). */
  preActions: z.array(preActionSchema).default([]),
  /** Sélecteurs pour les champs simples (title, description, price, images, docs…). */
  fields: z.array(fieldSelectorSchema).default([]),
  /** Sélecteurs pour les groupes de specs. */
  specGroups: z.array(groupSelectorSchema).default([]),
  /** Prompt global pour reformater/traduire la sortie via LLM (optionnel). */
  globalPrompt: z.string().optional(),
  /** Prompt commun à tous les templates du même vendorDomain.
   *  Propagé automatiquement lors de la sauvegarde (cf. saveTemplateWithVendorSync). */
  vendorPrompt: z.string().optional(),
  /** Dernière URL utilisée pour tester/mapper le template — rechargée à l'ouverture. */
  lastTestUrl: z.string().optional(),
  /** Metadata */
  createdAt: z.number(),
  updatedAt: z.number(),
  createdBy: z.string().optional(),
  /** Version (incrémentée à chaque édition, permet rollback). */
  version: z.number().default(1),
  /** Statistiques d'usage. */
  stats: z.object({
    appliedCount: z.number().default(0),
    successCount: z.number().default(0),
    lastAppliedAt: z.number().optional(),
  }).default({ appliedCount: 0, successCount: 0 }),
})
export type ScrapingTemplate = z.infer<typeof scrapingTemplateSchema>

/** Résultat de l'application d'un template sur une URL/HTML donné. */
export interface TemplateApplyResult {
  templateId: string
  vendorDomain: string
  fields: Record<string, unknown>
  specGroups: Array<{ group: string; pairs: Array<{ name: string; value: string }> }>
  warnings: string[]
  extractedAt: number
}

/** Champs cibles standards suggérés lors de la création d'un template. */
export const STANDARD_FIELDS = [
  { field: 'title', label: 'Titre du produit', multiple: false },
  { field: 'description', label: 'Description', multiple: false },
  { field: 'brand', label: 'Marque', multiple: false },
  { field: 'reference', label: 'Référence / SKU', multiple: false },
  { field: 'price', label: 'Prix', multiple: false },
  { field: 'ean', label: 'Code EAN / GTIN', multiple: false },
  { field: 'images', label: 'Images produit', multiple: true },
  { field: 'documents', label: 'Documents PDF / manuels', multiple: true },
  { field: 'advantages', label: 'Points forts / avantages (liste)', multiple: true },
  { field: 'variants', label: 'Variantes / déclinaisons (liste)', multiple: true },
] as const
