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
