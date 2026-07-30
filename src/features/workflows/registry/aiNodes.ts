import { ImagePlus } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { generateImage, type ReferenceImage } from '@/features/briefs/ai/geminiImageClient'
import { t } from '@/lib/i18n'

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

const generateImageNode: NodeSpec<
  GenerateImageConfig,
  GenerateImageInputs,
  GenerateImageOutputs
> = {
  type: 'generate-image',
  category: 'enrichment',
  labelKey: 'node.generate-image.label',
  descriptionKey: 'node.generate-image.desc',
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
      labelKey: 'node.generate-image.f1',
      required: true,
      helpKey: 'node.generate-image.f2',
    },
    {
      name: 'count',
      kind: 'number',
      labelKey: 'node.generate-image.f3',
      default: 1,
      helpKey: 'node.generate-image.f4',
    },
    {
      name: 'aspectRatio',
      kind: 'select',
      labelKey: 'node.generate-image.f5',
      default: '1:1',
      options: [
        { value: '1:1', labelKey: 'opt.aspect.square' },
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
      throw new Error(t('run.ai.promptMissing'))
    }

    const refs: ReferenceImage[] = []
    if (inputs.reference) {
      const ref = inputs.reference
      const mimeType = ref.type || 'image/png'
      if (mimeType.startsWith('image/')) {
        const data = await blobToBase64(ref)
        refs.push({ mimeType, data, label: 'Référence' })
        ctx.log('info', t('run.ai.refAttached', { kb: (ref.size / 1024).toFixed(1) }))
      } else {
        ctx.log('warn', t('run.ai.refIgnored', { type: mimeType }))
      }
    }

    const finalPrompt = `${prompt}\n\n[Aspect ratio cible : ${config.aspectRatio}]`
    const total = Math.max(1, Math.min(4, Math.floor(Number(config.count) || 1)))
    ctx.log('info', t('run.ai.generating', { total }))

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
        ctx.log('info', t('run.ai.imageOk', { i: i + 1, total, kb: (blob.size / 1024).toFixed(1) }))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ctx.log('error', t('run.ai.imageFailed', { i: i + 1, total, message: msg }))
      }
    }

    ctx.setProgress?.(100)
    if (assets.length === 0) {
      throw new Error(t('run.ai.noImage'))
    }

    const first = assets[0]
    const file = new File([first.blob], first.name, { type: first.mimeType })
    return { assets, file }
  },
}

nodeRegistry.register(generateImageNode)
