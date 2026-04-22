import type { DesignResult } from './types'

export interface FidelityCheckResult {
  isValid: boolean
  score: number // 0-100, threshold is 75
  issues: string[]
  suggestions: string[]
}

/**
 * Validates that the generated SVG faithfully represents the Nano Banana image.
 * Analyzes the SVG Engineer's rationale and structure to assess fidelity.
 *
 * @param svgContent - The generated SVG as a string
 * @param designResult - The result object from SVG Engineer (contains rationale)
 * @returns FidelityCheckResult with validation details
 */
export function validateSvgFidelity(svgContent: string, designResult: DesignResult): FidelityCheckResult {
  const issues: string[] = []
  const suggestions: string[] = []
  let score = 100

  try {
    // Check 1: Image background element exists
    if (!svgContent.includes('href="placeholder:nanobanana"')) {
      issues.push('Missing Nano Banana background image element')
      suggestions.push('Ensure <image href="placeholder:nanobanana" /> is present in SVG')
      score -= 20
    }

    // Check 2: SVG root has viewBox (not pixel dimensions)
    if (!svgContent.includes('viewBox')) {
      issues.push('Missing viewBox attribute - SVG must use viewBox in mm, not pixel dimensions')
      suggestions.push('Add viewBox with mm units, remove width/height pixel attributes')
      score -= 15
    }

    if (svgContent.match(/width="\d+"/)) {
      issues.push('SVG has width in pixels - should use viewBox only')
      suggestions.push('Remove width/height pixel attributes')
      score -= 10
    }

    // Check 3: Text elements exist (should have <text> or <tspan> elements)
    const hasTextElements = svgContent.includes('<text') || svgContent.includes('<tspan')
    if (!hasTextElements) {
      issues.push('No editable text elements found (<text> or <tspan>)')
      suggestions.push('Ensure text zones are created as editable SVG text elements')
      score -= 15
    }

    // Check 4: Rationale indicates visual analysis was done
    const rationale = designResult.rationale || ''
    const rationaleLower = rationale.toLowerCase()

    const hasVisualAnalysis =
      rationaleLower.includes('analyse') ||
      rationaleLower.includes('visual') ||
      rationaleLower.includes('positionnement') ||
      rationaleLower.includes('fidélité')

    if (!hasVisualAnalysis) {
      issues.push('Rationale lacks visual analysis of image composition')
      suggestions.push('Ensure SVG Engineer performs visual analysis of Nano Banana image')
      score -= 10
    }

    // Check 5: Warn if rationale mentions positioning issues
    if (
      rationaleLower.includes('écart') ||
      rationaleLower.includes('correction') ||
      rationaleLower.includes('incohérence') ||
      rationaleLower.includes('ajust')
    ) {
      issues.push('Rationale indicates positioning/alignment adjustments were needed')
      suggestions.push('Verify that visual adjustments were correctly applied')
      score -= 5
    }

    // Check 6: Rationale reasonably long (indicates detailed work)
    if (rationale.length < 50) {
      issues.push('Rationale is too brief - insufficient explanation of visual analysis')
      suggestions.push('Request more detailed visual analysis from SVG Engineer')
      score -= 10
    }

    // Clamp score to 0-100
    score = Math.max(0, Math.min(100, score))

    const isValid = score >= 75 && issues.length === 0

    console.log('[SVG Fidelity Validator] Score:', score, 'Valid:', isValid, 'Issues:', issues.length)

    return {
      isValid,
      score,
      issues,
      suggestions,
    }
  } catch (err) {
    console.error('[SVG Fidelity Validator] Validation error:', err)
    return {
      isValid: false,
      score: 0,
      issues: ['Validation encountered an error'],
      suggestions: ['Check SVG structure and rationale manually'],
    }
  }
}
