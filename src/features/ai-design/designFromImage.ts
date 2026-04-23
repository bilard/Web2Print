/**
 * Pipeline complet : Image Nano Banana → SVG éditable 100% fidèle
 *
 * Flux:
 * 1. User donne prompt
 * 2. Nano Banana génère image
 * 3. Claude Vision analyse l'image
 * 4. Claude génère SVG éditable
 * 5. SVG chargé dans l'éditeur
 */

import { analyzeDesignImage, type DesignAnalysis } from './analyzeDesignImage'
import { generateSvgFromAnalysis } from './generateSvgFromAnalysis'

export interface DesignFromImageResult {
  svg: string
  analysis: DesignAnalysis
  editableElements: Array<{
    id: string
    type: 'text' | 'image'
    bbox: { x: number; y: number; w: number; h: number }
    properties: Record<string, unknown>
  }>
  widthMm: number
  heightMm: number
}

/**
 * Analyse une image de design et génère un SVG éditable 100% fidèle.
 *
 * @param imageBase64 - Image Nano Banana en base64 (JPEG ou PNG)
 * @param widthMm - Largeur du canvas en mm
 * @param heightMm - Hauteur du canvas en mm
 * @returns SVG éditable + metadata
 */
export async function createDesignFromImage(
  imageBase64: string,
  widthMm: number,
  heightMm: number
): Promise<DesignFromImageResult> {
  // Step 1: Analyse l'image via Claude Vision
  console.log('[DesignFromImage] Analysing design image...')
  const analysis = await analyzeDesignImage(imageBase64)
  console.log('[DesignFromImage] Analysis complete:', analysis)

  // Step 2: Génère SVG éditable basé sur l'analyse
  console.log('[DesignFromImage] Generating editable SVG...')
  const { svg, editableElements } = generateSvgFromAnalysis(analysis, widthMm, heightMm)
  console.log('[DesignFromImage] SVG generated, editable elements:', editableElements.length)

  return {
    svg,
    analysis,
    editableElements,
    widthMm,
    heightMm,
  }
}
