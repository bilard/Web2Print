// functions/src/workflow/nodes/higgsfield.ts
// Jumeau SERVEUR (cron headless) du node client `higgsfield`. Wire-compatible :
// même `type`, mêmes clés de config, même forme de sortie ({ assets }) que le
// node client. Appelle le cœur partagé directement (le client passe par le
// callable ; le serveur, lui, est déjà dans les functions).
import { registerServerNode } from '../registry'
import { getUserApiKey } from '../apiKeys'
import { runHiggsfield, type HiggsfieldParams } from '../../higgsfield/higgsfieldCore'

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
    const params: HiggsfieldParams = {
      mode,
      prompt: String(config.prompt ?? ''),
      aspectRatio: String(config.aspectRatio ?? '1:1'),
      quality: config.quality === '720p' ? '720p' : '1080p',
      videoModel: (['dop-lite', 'dop-turbo', 'dop-standard'] as const).includes(
        config.videoModel as 'dop-lite' | 'dop-turbo' | 'dop-standard',
      )
        ? (config.videoModel as 'dop-lite' | 'dop-turbo' | 'dop-standard')
        : 'dop-turbo',
      imageUrl: mode === 'video' ? pickImageUrl(config, inputs) : undefined,
    }
    const credentials = await getUserApiKey(ctx.uid, 'higgsfield')
    if (!credentials) throw new Error('Clé Higgsfield absente du profil (Paramètres → Connecteurs).')
    ctx.log('info', `Higgsfield ${mode} — génération en cours…`)
    const assets = await runHiggsfield(credentials, params)
    ctx.log('info', `Higgsfield : ${assets.length} asset(s) généré(s).`)
    return { assets }
  },
})
