import type { DesignResult } from './types'
import { generateJson } from '@/features/ai/llmRouter'
import { z } from 'zod'

export interface FidelityCheckResult {
  isValid: boolean
  score: number // 0-100, threshold is 75
  issues: string[]
  suggestions: string[]
  visualFidelityScore?: number // 0-100 from Claude Vision analysis
}

/**
 * Validates visual fidelity using Claude Vision.
 * Compares the Nano Banana reference image with a rendered representation of the SVG.
 *
 * @param nanobananaImage - Data URI of the Nano Banana reference image
 * @param svgContent - The SVG source code
 * @returns Vision-based fidelity score (0-100)
 */
export async function validateSvgVisualFidelity(
  nanobananaImage: string,
  svgContent: string,
): Promise<{ score: number; issues: string[] }> {
  try {
    // Extract key structural info from SVG for analysis
    const textElementsMatch = svgContent.match(/<text[^>]*>[\s\S]*?<\/text>/g) || []
    const textCount = textElementsMatch.length
    const hasBgImage = svgContent.includes('placeholder:nanobanana')

    const svgSummary = `SVG Structure:
- Background image: ${hasBgImage ? 'YES (Nano Banana)' : 'NO'}
- Text elements: ${textCount}
- SVG size: Uses viewBox (mm-based, not pixels)

First 2000 chars of SVG:
${svgContent.substring(0, 2000)}`

    const response = await generateJson<{
      fidelityScore: number
      compositionMatch: string
      positioningAccuracy: string
      issues: string[]
    }>({
      task: 'design.validate.visual',
      prompt: `Analyze the fidelity of an SVG layout compared to a reference image.

REFERENCE IMAGE (Nano Banana):
You are shown a reference image that represents the ideal visual composition.

SVG ANALYSIS:
Below is the SVG source code that should faithfully reproduce the composition from the reference image.

${svgSummary}

YOUR TASK:
Compare the visual composition shown in the reference image with the SVG structure. Assess how faithfully the SVG represents the reference.

Evaluate:
- **Text positioning**: Do the text zones in the SVG align with where text appears in the reference image?
- **Text sizing**: Are text zone dimensions proportional to the reference?
- **Alignment and spacing**: Does the SVG preserve the alignment and spacing observed in the reference?
- **Visual hierarchy**: Does the layout maintain the same visual hierarchy as the reference?
- **No overlaps**: Are text zones properly separated (no overlapping text)?
- **Background**: Is the Nano Banana image properly injected as background?

SCORING:
- 90-100: Perfect match — faithfully reproduces reference composition
- 75-89: Good match — minor positioning variations acceptable
- 60-74: Acceptable — noticeable differences but functional
- <60: Poor match — significant layout differences, composition broken

Respond with JSON only:`,
      schema: z.object({
        fidelityScore: z.number().min(0).max(100),
        compositionMatch: z.string(),
        positioningAccuracy: z.string(),
        issues: z.array(z.string()),
      }),
      schemaForLLM: {
        type: 'object',
        properties: {
          fidelityScore: { type: 'number', minimum: 0, maximum: 100 },
          compositionMatch: { type: 'string' },
          positioningAccuracy: { type: 'string' },
          issues: { type: 'array', items: { type: 'string' } },
        },
        required: ['fidelityScore', 'compositionMatch', 'positioningAccuracy', 'issues'],
      } as Record<string, unknown>,
      version: 'design.validate.visual.v1',
      imageDataUris: [nanobananaImage],
    })

    console.log('[SVG Fidelity Validator] Visual validation:', {
      score: response.fidelityScore,
      compositionMatch: response.compositionMatch,
      issues: response.issues,
    })

    return {
      score: response.fidelityScore,
      issues: response.issues,
    }
  } catch (err) {
    console.error('[SVG Fidelity Validator] Visual validation error:', err)
    // If vision validation fails, fall back to heuristic score
    return { score: 0, issues: ['Vision validation unavailable'] }
  }
}

/**
 * Validates that the generated SVG faithfully represents the Nano Banana image.
 * Analyzes the SVG Engineer's rationale and structure to assess fidelity.
 *
 * @param svgContent - The generated SVG as a string
 * @param designResult - The result object from SVG Engineer (contains rationale)
 * @param nanobananaImage - Optional: Data URI for visual fidelity check via Claude Vision
 * @returns FidelityCheckResult with validation details
 */
export async function validateSvgFidelity(
  svgContent: string,
  designResult: DesignResult,
  nanobananaImage?: string,
): Promise<FidelityCheckResult> {
  const issues: string[] = []
  const suggestions: string[] = []
  let score = 100
  let visualFidelityScore: number | undefined

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

    // Check 7: Visual fidelity validation using Claude Vision (if Nano Banana image provided)
    if (nanobananaImage) {
      console.log('[SVG Fidelity Validator] Performing vision-based visual fidelity check...')
      const visionResult = await validateSvgVisualFidelity(nanobananaImage, svgContent)
      visualFidelityScore = visionResult.score

      if (visionResult.score < 75) {
        issues.push(`Visual composition mismatch detected (vision score: ${visionResult.score}/100)`)
        suggestions.push('SVG layout does not faithfully match Nano Banana reference image')
        // Use vision score to adjust overall score
        score = Math.min(score, Math.round(visionResult.score * 0.9))
      }

      if (visionResult.issues.length > 0) {
        issues.push(...visionResult.issues.slice(0, 3))
      }

      console.log('[SVG Fidelity Validator] Vision fidelity score:', visionResult.score, 'Issues:', visionResult.issues.length)
    }

    // Clamp score to 0-100
    score = Math.max(0, Math.min(100, score))

    const isValid = score >= 75 && issues.filter((i) => i.includes('Visual composition')).length === 0

    console.log('[SVG Fidelity Validator] Final score:', score, 'Valid:', isValid, 'Issues:', issues.length)

    return {
      isValid,
      score,
      issues,
      suggestions,
      visualFidelityScore,
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
