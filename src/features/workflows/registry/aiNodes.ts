// src/features/workflows/registry/aiNodes.ts
import { ImagePlus } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { generateImage, type ReferenceImage } from '@/features/briefs/ai/geminiImageClient'

interface GenerateImageConfig {
  prompt: string
  count: number
  aspectRatio: string
}

interface GenerateImageInputs {
  /** Image de référence optionnelle (drag & drop d'un node Upload). */
  reference?: File | Blob | null
}

interface GeneratedAsset {
  url: string
  type: 'image'
  name: string
  mimeType: string
  size: number
  blob: Blob
}

interface GenerateImageOutputs {
  assets: GeneratedAsset[]
  /** Premier asset comme `file` pour brancher facilement un export ou un Save DAM. */
  file: File | null
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export const generateImageNode: NodeSpec<
  GenerateImageConfig,
  GenerateImageInputs,
  GenerateImageOutputs
> = {
  type: 'generate-image',
  category: 'enrichment',
  label: 'Génération image (Nano Banana)',
  description:
    "Génère une ou plusieurs images via Gemini Nano Banana à partir d'un prompt (option : image de référence en entrée).",
  icon: ImagePlus,
  inputs: [{ name: 'reference', type: 'file', required: false }],
  outputs: [
    { name: 'assets', type: 'asset[]' },
    { name: 'file', type: 'file' },
  ],
  configSchema: [
    {
      name: 'prompt',
      kind: 'textarea',
      label: 'Prompt',
      required: true,
      help: "Description textuelle de l'image à générer.",
    },
    {
      name: 'count',
      kind: 'number',
      label: "Nombre d'images",
      default: 1,
      help: 'Génère N variations en parallèle (1-4 recommandé).',
    },
    {
      name: 'aspectRatio',
      kind: 'select',
      label: 'Ratio',
      default: '1:1',
      options: [
        { value: '1:1', label: 'Carré (1:1)' },
        { value: '4:3', label: 'Standard (4:3)' },
        { value: '3:4', label: 'Portrait (3:4)' },
        { value: '16:9', label: 'Paysage (16:9)' },
        { value: '9:16', label: 'Vertical (9:16)' },
      ],
    },
  ],
  defaultConfig: { prompt: '', count: 1, aspectRatio: '1:1' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const prompt = config.prompt?.trim()
    if (!prompt) {
      throw new Error('Prompt manquant — saisissez une description dans la config du node.')
    }

    const refs: ReferenceImage[] = []
    if (inputs.reference) {
      const ref = inputs.reference
      const mimeType = ref.type || 'image/png'
      if (mimeType.startsWith('image/')) {
        const data = await blobToBase64(ref)
        refs.push({ mimeType, data, label: 'Référence' })
        ctx.log('info', `Référence ${(ref.size / 1024).toFixed(1)} KB jointe`)
      } else {
        ctx.log('warn', `Référence ignorée — type ${mimeType} non supporté`)
      }
    }

    const finalPrompt = `${prompt}\n\n[Aspect ratio cible : ${config.aspectRatio}]`
    const total = Math.max(1, Math.min(4, Math.floor(Number(config.count) || 1)))
    ctx.log('info', `Génération ${total} image(s) Nano Banana…`)

    const assets: GeneratedAsset[] = []
    for (let i = 0; i < total; i++) {
      if (ctx.signal.aborted) break
      ctx.setProgress?.(Math.round((i / total) * 100))
      try {
        const { blob, mimeType } = await generateImage(finalPrompt, refs)
        const ext = mimeType === 'image/png' ? 'png' : 'jpg'
        const name = `nanobanana_${Date.now()}_${i + 1}.${ext}`
        const url = URL.createObjectURL(blob)
        assets.push({
          url,
          type: 'image',
          name,
          mimeType,
          size: blob.size,
          blob,
        })
        ctx.log('info', `${i + 1}/${total} OK (${(blob.size / 1024).toFixed(1)} KB)`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ctx.log('error', `${i + 1}/${total} échec : ${msg}`)
      }
    }

    ctx.setProgress?.(100)
    if (assets.length === 0) {
      throw new Error('Aucune image générée — voir les logs.')
    }

    const first = assets[0]
    const file = new File([first.blob], first.name, { type: first.mimeType })
    return { assets, file }
  },
}

nodeRegistry.register(generateImageNode)
