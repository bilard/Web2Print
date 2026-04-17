import type { ScrapingTemplate } from './types'

/**
 * Compose un prompt LLM en injectant le vendorPrompt puis le globalPrompt
 * du template, avant les instructions spécifiques à la tâche.
 *
 * Ordre fixe :
 *   1. vendorPrompt (commun au fournisseur)
 *   2. globalPrompt (spécifique au template)
 *   3. basePrompt (instructions de la tâche)
 *
 * Chaque section est séparée par "\n---\n" pour aider le modèle à distinguer
 * les niveaux d'instructions.
 */
export function buildEnrichmentPrompt(basePrompt: string, template: ScrapingTemplate | null | undefined): string {
  if (!template) return basePrompt
  const parts: string[] = []
  if (template.vendorPrompt?.trim()) {
    parts.push(`CONTEXTE FOURNISSEUR (${template.vendorDomain}) :\n${template.vendorPrompt.trim()}`)
  }
  if (template.globalPrompt?.trim()) {
    parts.push(`INSTRUCTIONS TEMPLATE (${template.name}) :\n${template.globalPrompt.trim()}`)
  }
  parts.push(basePrompt)
  return parts.join('\n---\n')
}
