import type { ClientFormField } from '@/features/taxonomy/types'

/**
 * Construit la liste des champs builtins du formulaire client.
 * Appelé à la création d'une nouvelle taxonomie pour initialiser son `formTemplate`.
 *
 * Chaque appel renvoie une nouvelle copie (pas de mutation partagée).
 */
export function createDefaultFormTemplate(): ClientFormField[] {
  const fields: Array<Omit<ClientFormField, 'order' | 'builtin'>> = [
    // ─── Société ────────────────────────────────────────────────────────────
    {
      id: 'builtin-companyName',
      key: 'companyName',
      label: 'Raison sociale',
      type: 'text',
      required: true,
      group: 'Société',
    },
    {
      id: 'builtin-siret',
      key: 'siret',
      label: 'SIRET',
      type: 'text',
      required: false,
      group: 'Société',
    },
    {
      id: 'builtin-sector',
      key: 'sector',
      label: 'Secteur d\u2019activité',
      type: 'text',
      required: false,
      group: 'Société',
    },
    {
      id: 'builtin-contactName',
      key: 'contactName',
      label: 'Nom du contact',
      type: 'text',
      required: false,
      group: 'Société',
    },
    {
      id: 'builtin-contactEmail',
      key: 'contactEmail',
      label: 'Email du contact',
      type: 'email',
      required: false,
      group: 'Société',
    },

    // ─── Identité visuelle ──────────────────────────────────────────────────
    {
      id: 'builtin-logoUrl',
      key: 'logoUrl',
      label: 'Logo',
      type: 'logo_upload',
      required: false,
      group: 'Identité visuelle',
    },
    {
      id: 'builtin-primaryColor',
      key: 'primaryColor',
      label: 'Couleur primaire',
      type: 'color',
      required: false,
      group: 'Identité visuelle',
    },
    {
      id: 'builtin-secondaryColor',
      key: 'secondaryColor',
      label: 'Couleur secondaire',
      type: 'color',
      required: false,
      group: 'Identité visuelle',
    },
    {
      id: 'builtin-brandKit',
      key: 'brandKit',
      label: 'Charte graphique / kit de communication',
      type: 'brand_kit_upload',
      required: false,
      group: 'Identité visuelle',
      helpText: 'Importez un PDF ou ZIP. Sera utilisé pour les exports PPTX/PDF.',
    },

    // ─── Livraison ──────────────────────────────────────────────────────────
    {
      id: 'builtin-shippingAddress',
      key: 'shippingAddress',
      label: 'Adresse de livraison',
      type: 'address',
      required: false,
      group: 'Livraison',
    },

    // ─── Contexte ───────────────────────────────────────────────────────────
    {
      id: 'builtin-contextSummary',
      key: 'contextSummary',
      label: 'Brief / contexte',
      type: 'textarea',
      required: true,
      group: 'Contexte',
    },
    {
      id: 'builtin-budget',
      key: 'budget',
      label: 'Budget',
      type: 'budget_range',
      required: false,
      group: 'Contexte',
    },
  ]

  return fields.map((f, i) => ({
    ...f,
    order: i * 10, // pas de 10 pour permettre l'insertion ultérieure
    builtin: true,
  }))
}
