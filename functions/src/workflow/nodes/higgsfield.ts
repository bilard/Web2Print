// functions/src/workflow/nodes/higgsfield.ts
// Jumeau SERVEUR (cron headless) du node client `higgsfield`. Wire-compatible :
// même `type`, mêmes clés de config, même forme de sortie ({ assets }) que le
// node client. Appelle le cœur partagé directement (le client passe par le
// callable ; le serveur, lui, est déjà dans les functions).
import { registerServerNode } from '../registry'
import { getUserApiKey } from '../apiKeys'
import { runHiggsfield, type HiggsfieldParams } from '../../higgsfield/higgsfieldCore'
import { makeServerFile, type ServerFile } from './serverFile'
import { t } from '../../i18n'

function pickImageUrl(config: Record<string, unknown>, inputs: Record<string, unknown>): string {
  const fromConfig = String(config.imageUrl ?? '').trim()
  if (/^https?:\/\//.test(fromConfig)) return fromConfig
  // Sinon, 1er asset http(s) du port d'entrée `image`.
  const assets = inputs.image
  if (Array.isArray(assets)) {
    for (const a of assets) {
      const url = String((a as { url?: unknown; src?: unknown })?.url ?? (a as { src?: unknown })?.src ?? '')
      if (/^https?:\/\//.test(url)) return url
    }
  }
  return ''
}

registerServerNode({
  type: 'higgsfield',
  run: async (ctx, config, inputs) => {
    ctx.reportConnector?.('higgsfield')
    const mode = config.mode === 'video' ? 'video' : 'image'
    const num = (v: unknown): number | undefined => {
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    const fromPort = typeof inputs.prompt === 'string' ? inputs.prompt.trim() : ''
    const params: HiggsfieldParams = {
      mode,
      prompt: String(config.prompt ?? '').trim() || fromPort,
      aspectRatio: String(config.aspectRatio ?? '1:1'),
      quality: config.quality === '720p' ? '720p' : '1080p',
      videoModel: (['dop-lite', 'dop-turbo', 'dop-standard'] as const).includes(
        config.videoModel as 'dop-lite' | 'dop-turbo' | 'dop-standard',
      )
        ? (config.videoModel as 'dop-lite' | 'dop-turbo' | 'dop-standard')
        : 'dop-turbo',
      imageUrl: mode === 'video' ? pickImageUrl(config, inputs) : undefined,
      styleId: config.styleId ? String(config.styleId) : undefined,
      styleStrength: num(config.styleStrength),
      motionId: config.motionId ? String(config.motionId) : undefined,
      motionStrength: num(config.motionStrength),
      seed: num(config.seed),
      enhancePrompt: config.enhancePrompt === true,
      batchSize: config.batchSize === 4 ? 4 : 1,
    }
    const credentials = await getUserApiKey(ctx.uid, 'higgsfield')
    if (!credentials) throw new Error(t(ctx.locale, 'run.hf.noKey'))
    ctx.log('info', t(ctx.locale, 'run.hf.generating', { mode }))
    const assets = await runHiggsfield(credentials, params)
    ctx.log('info', t(ctx.locale, 'run.hf.generated', { count: assets.length }))
    // `file` = 1er asset téléchargé en ServerFile → pour « Export Google Drive »
    // (port `file`) en cron headless. Best-effort.
    let file: ServerFile | undefined
    try {
      const a = assets[0]
      const res = await fetch(a.url)
      if (res.ok) file = makeServerFile(a.name, a.mimeType, Buffer.from(await res.arrayBuffer()))
    } catch {
      ctx.log('warn', t(ctx.locale, 'run.hf.notDownloadableServer'))
    }
    return { assets, file }
  },
})
