import type { ScrapingTemplate } from './types'

/**
 * Règles universelles non-négociables appliquées à TOUTE extraction produit
 * (cf. mémoire `feedback_scraping_universal_rules`). Injectées en tête de
 * chaque prompt LLM pour qu'aucune instruction vendor/template ne puisse les
 * contourner.
 */
export const UNIVERSAL_RULES = `RÈGLES UNIVERSELLES — extraction produit (priorité absolue, non-négociables) :

1. SPÉCIFICATIONS = paires KEY/VALUE strict.
   Format obligatoire : { name, value, group }. Ne JAMAIS concaténer "Tension : 18 V" en un seul \`name\` ni en une seule \`value\`. Ne JAMAIS résumer plusieurs lignes d'un tableau en une seule paire. Le \`group\` est le titre de section affiché sur la page (ex: "Moteur", "Batterie").

2. EXHAUSTIVITÉ — 100 % du contenu source.
   Extraire TOUS les onglets, sections, accordéons, tableaux présents dans le markdown source. Préserver la hiérarchie sémantique : les titres H1/H2/H3 deviennent des \`group\`, les paragraphes restent des paragraphes, les listes restent des listes (pas de fusion en bloc unique). Ne JAMAIS tronquer ni résumer.

3. DOCUMENTS / PDF — URLs intactes.
   Reprendre chaque URL de document EXACTEMENT telle qu'affichée dans la source. Le nom de fichier original (ex: \`notice-X12345-fr.pdf\`) doit pouvoir être reconstruit depuis l'URL. Ne JAMAIS rewriter, raccourcir ni encoder différemment l'URL.

4. AUCUNE INVENTION.
   Toute information absente du markdown source doit être omise (champ vide, tableau vide, ou valeur null selon le schéma). JAMAIS de complétion depuis tes connaissances générales — mieux vaut un champ vide qu'une valeur fabriquée.`

/**
 * Compose un prompt LLM en injectant les règles universelles, puis le
 * vendorPrompt et le globalPrompt du template, avant les instructions
 * spécifiques à la tâche.
 *
 * Ordre fixe :
 *   0. UNIVERSAL_RULES (toujours en tête, non-overridable)
 *   1. vendorPrompt (commun au fournisseur)
 *   2. globalPrompt (spécifique au template)
 *   3. basePrompt (instructions de la tâche)
 *
 * Chaque section est séparée par "\n---\n" pour aider le modèle à distinguer
 * les niveaux d'instructions.
 */
export function buildEnrichmentPrompt(basePrompt: string, template: ScrapingTemplate | null | undefined): string {
  const parts: string[] = [UNIVERSAL_RULES]
  if (template?.vendorPrompt?.trim()) {
    parts.push(`CONTEXTE FOURNISSEUR (${template.vendorDomain}) :\n${template.vendorPrompt.trim()}`)
  }
  if (template?.globalPrompt?.trim()) {
    parts.push(`INSTRUCTIONS TEMPLATE (${template.name}) :\n${template.globalPrompt.trim()}`)
  }
  parts.push(basePrompt)
  return parts.join('\n---\n')
}
