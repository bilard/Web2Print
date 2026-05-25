// src/features/workflows/registry/decomposeNode.ts
//
// Node workflow "Décomposer (SVG éditable)" :
//   input  : SVG produit par image-to-svg / pdf-to-svg (fichier portant l'image bg verrouillée)
//   output : SVG décomposé (textes + formes éditables superposés, image bg cachée)
//
// Réutilise le moteur de décomposition existant (Google Vision → Fabric) sur un
// canvas Fabric hors-écran, sans toucher à l'éditeur ouvert.

import { Wand2 } from 'lucide-react'
import { Canvas } from 'fabric'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { parseSvgToFabric } from '@/features/svg/svgToFabric'
import { decomposeOnCanvas } from '@/features/svg/useImageToSvgDecompose'

interface DecomposeConfig {}

/**
 * Pré-inline les `<image href="http(s)://…">` (URL Firebase) en data URI. Sans ça,
 * le canvas offscreen chargeant une image cross-origin est tainté → `getImageData`
 * et `toDataURL` (requis par la décompo Vision) lèvent une SecurityError.
 * Nécessite que le CORS du bucket autorise le fetch (cf. cors.json).
 */
async function inlineExternalSvgImages(svgText: string): Promise<string> {
  const urls = Array.from(
    svgText.matchAll(/(?:xlink:href|href)\s*=\s*"(https?:\/\/[^"]+)"/g),
    (m) => m[1],
  )
  let out = svgText
  for (const rawUrl of Array.from(new Set(urls))) {
    // URL XML-échappée (&amp;) → décoder pour le fetch (sinon token Firebase cassé,
    // 403), mais remplacer la forme échappée telle qu'elle apparaît dans le SVG.
    const fetchUrl = rawUrl.replace(/&amp;/g, '&')
    const resp = await fetch(fetchUrl)
    if (!resp.ok) throw new Error(`Image inaccessible (${resp.status})`)
    const blob = await resp.blob()
    const dataUri = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.onerror = () => reject(new Error('Lecture image échouée'))
      fr.readAsDataURL(blob)
    })
    out = out.split(rawUrl).join(dataUri)
  }
  return out
}

export const decomposeNode: NodeSpec<
  DecomposeConfig,
  { svg: File },
  { svg: File }
> = {
  type: 'decompose',
  category: 'transformation',
  label: 'Décomposer (SVG éditable)',
  description:
    'Analyse le SVG via Google Vision et superpose des blocs de texte Fabric éditables (bandeaux, prix, mentions). Réutilise le même moteur que le bouton « Décomposer » de l\'éditeur.',
  icon: Wand2,
  inputs: [{ name: 'svg', type: 'file', required: true }],
  outputs: [{ name: 'svg', type: 'file' }],
  configSchema: [],
  defaultConfig: {},
  runtime: 'client',

  run: async (ctx, _config, inputs) => {
    if (!inputs.svg) {
      throw new Error('Aucun fichier SVG fourni — connectez un node image-to-svg ou pdf-to-svg.')
    }

    ctx.log('info', `Décomposition : ${inputs.svg.name}…`)

    let svgText: string
    try {
      svgText = await inputs.svg.text()
    } catch (err) {
      throw new Error(
        `Impossible de lire le fichier SVG : ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // Pré-inline l'image de fond (URL Firebase → data URI) pour que le canvas
    // offscreen ne soit pas tainté (sinon la décompo Vision échoue en secure mode).
    try {
      svgText = await inlineExternalSvgImages(svgText)
    } catch (err) {
      ctx.log(
        'warn',
        `Pré-inline de l'image échoué (la décompo échouera si CORS bloque) : ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // Parse le SVG en objets Fabric (dimensions + objets, sans canvas global).
    let parsed: Awaited<ReturnType<typeof parseSvgToFabric>>
    try {
      parsed = await parseSvgToFabric(svgText)
    } catch (err) {
      throw new Error(
        `Parsing SVG échoué : ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    const { objects, width, height } = parsed
    if (objects.length === 0) {
      ctx.log('warn', 'SVG vide (aucun objet Fabric parsé) — SVG d\'entrée renvoyé inchangé.')
      return { svg: inputs.svg }
    }

    ctx.log('info', `SVG parsé : ${objects.length} objet(s), ${width}×${height}px`)

    // Canvas Fabric hors-écran aux dimensions du document SVG.
    const htmlCanvas = document.createElement('canvas')
    const fabricCanvas = new Canvas(htmlCanvas, {
      width,
      height,
      renderOnAddRemove: false,
    })

    // Ajoute les objets parsés au canvas offscreen.
    for (const obj of objects) {
      fabricCanvas.add(obj)
    }

    // Attend que les images (FabricImage) aient fini de charger en forçant un render
    // et en laissant la microtask queue se vider (les FabricImage chargent via
    // `loadSVGFromString` — elles sont déjà résolues à ce stade, mais on laisse
    // un tick pour garantir que les .width/.height sont propagés).
    fabricCanvas.requestRenderAll()
    await new Promise<void>((resolve) => setTimeout(resolve, 100))

    // Lance la décomposition sur le canvas offscreen.
    // syncStore: false → ne clobber pas le Zustand de l'éditeur ouvert.
    try {
      const { count } = await decomposeOnCanvas(fabricCanvas, {
        log: (level, msg) => ctx.log(level, msg),
        syncStore: false,
      })
      ctx.log('info', `Décomposition terminée — ${count} texte(s)/forme(s) éditables ajouté(s).`)
    } catch (err) {
      // Si la décomposition échoue (clé Vision absente, image inaccessible CORS,
      // quota Gemini, etc.), on renvoie le SVG d'entrée inchangé plutôt que de
      // bloquer le flux.
      const msg = err instanceof Error ? err.message : String(err)
      ctx.log('warn', `Décomposition échouée (SVG d'entrée renvoyé inchangé) : ${msg}`)
      fabricCanvas.dispose()
      return { svg: inputs.svg }
    }

    // Sérialise le canvas Fabric (avec les overlays décomposés) en SVG.
    const svgString = fabricCanvas.toSVG()
    fabricCanvas.dispose()

    const outFile = new File([svgString], 'decompose.svg', { type: 'image/svg+xml' })
    ctx.log('info', `SVG décomposé prêt (${Math.round(svgString.length / 1024)} Ko).`)
    return { svg: outFile }
  },
}

nodeRegistry.register(decomposeNode)
