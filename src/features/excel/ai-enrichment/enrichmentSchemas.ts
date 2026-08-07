// Contrat de sortie du LLM d'enrichissement : le schéma zod qui VALIDE la réponse, et le
// JSON Schema qui la DEMANDE. Les deux décrivent la même forme et doivent le rester — un
// champ ajouté d'un seul côté passe la validation sans jamais avoir été demandé, ou
// l'inverse.
//
// ⚠ Les `description` du JSON Schema ne sont pas de la documentation : elles sont lues par
// le modèle et pilotent ce qu'il produit. « recopié VERBATIM », « ne pas limiter le
// nombre » sont des CONSIGNES — les reformuler change les fiches obtenues.
import { z } from 'zod'

const enrichedSpecSchema = z.object({
  name: z.string(),
  value: z.string(),
  group: z.string().optional(),
})

const enrichedVariantSchema = z.object({
  reference: z.string(),
  label: z.string(),
  properties: z.record(z.string(), z.string()),
})

export const enrichedProductSchema = z.object({
  description: z.string(),
  advantages: z.array(z.string()),
  specifications: z.array(enrichedSpecSchema),
  variants: z.array(enrichedVariantSchema).optional().default([]),
  images: z.array(z.string()),
  documents: z.array(z.string()),
})

export const enrichedProductJsonSchema = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description: 'Le paragraphe descriptif de la SOURCE recopié VERBATIM (mot pour mot) — ne rédige jamais ton propre texte, ne résume pas, ne reformule pas. Conserve les retours à la ligne de la source (paragraphes, listes).',
    },
    advantages: {
      type: 'array',
      items: { type: 'string' },
      description: 'TOUS les points forts / bénéfices utilisateur, phrase courte chacun. Ne pas limiter le nombre.',
    },
    specifications: {
      type: 'array',
      description: 'TOUTES les spécifications techniques disponibles au format {name, value, group}. Ne pas limiter : inclure chaque caractéristique trouvée. Organiser par groupes (Informations, Poids, Puissance, Décibels, Vibrations, Dimensions, Batterie, Perçage, Vissage, etc.).',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom de la spécification (ex: "Couple max", "Poids", "Tension")' },
          value: { type: 'string', description: 'Valeur de la spécification (ex: "135 Nm", "2.3 kg", "18 V")' },
          group: { type: 'string', description: 'Groupe/section de la spécification (ex: "PUISSANCE", "POIDS", "INFORMATIONS", "DÉCIBELS", "VIBRATIONS"). Obligatoire.' },
        },
        required: ['name', 'value', 'group'],
      },
    },
    variants: {
      type: 'array',
      description: 'Variantes / déclinaisons du produit (références, couleurs, tailles, conditionnements). Chaque variante a une référence, un libellé et des propriétés. Si aucune variante, retourner un tableau vide.',
      items: {
        type: 'object',
        properties: {
          reference: { type: 'string', description: 'Code/référence unique de la variante (SKU, code article, numéro de modèle)' },
          label: { type: 'string', description: 'Libellé / désignation de la variante' },
          properties: {
            type: 'object',
            description: 'Propriétés spécifiques de la variante (Couleur, Taille, Conditionnement, etc.)',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['reference', 'label', 'properties'],
      },
    },
    images: {
      type: 'array',
      items: { type: 'string' },
      description: 'URLs complètes des meilleures images produit trouvées (reprendre telles quelles depuis les données scrapées).',
    },
    documents: {
      type: 'array',
      items: { type: 'string' },
      description: 'URLs complètes des documents téléchargeables (PDF, notices, fiches techniques, déclarations CE). Reprendre les URLs telles quelles depuis les données scrapées.',
    },
  },
  required: ['description', 'advantages', 'specifications', 'variants', 'images', 'documents'],
} as const
