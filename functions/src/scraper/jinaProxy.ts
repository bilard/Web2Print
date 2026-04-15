import { onRequest } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/v2'

/**
 * Proxy serveur pour r.jina.ai avec injectPageScript.
 * onRequest + CORS manuel : plus robuste que onCall (qui perd les headers CORS
 * sur certaines erreurs 5xx du Cloud Run gateway).
 *
 * POST body : { url, apiKey, injectScript?, timeout? }
 * Réponse : { markdown, html, images, links } ou { error }
 */
export const jinaScrape = onRequest(
  { region: 'europe-west1', timeoutSeconds: 300, memory: '512MiB', cors: true },
  async (req, res) => {
    // CORS explicite (onRequest + cors:true le fait déjà, mais on le garantit).
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' })
      return
    }

    const { url, apiKey, injectScript, timeout } = (req.body ?? {}) as {
      url?: string
      apiKey?: string
      injectScript?: string
      timeout?: number
    }

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'url manquant' })
      return
    }
    if (!apiKey || typeof apiKey !== 'string') {
      res.status(400).json({ error: 'apiKey manquant' })
      return
    }

    const jinaTimeoutSec = timeout ?? 90
    const body: Record<string, unknown> = {
      url,
      engine: 'browser',
      timeout: jinaTimeoutSec,
      noCache: true,
      withLinksSummary: true,
      withImagesSummary: true,
      withIframe: true,
      withShadowDom: true,
      returnFormat: 'html,markdown',
    }
    if (injectScript && typeof injectScript === 'string') {
      body.injectPageScript = [injectScript]
    }

    // AbortController pour couper proprement si Jina dépasse (évite que
    // la function timeout sans renvoyer de réponse).
    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), (jinaTimeoutSec + 30) * 1000)

    try {
      logger.info('[jinaScrape] POST →', { url, hasScript: !!injectScript, timeout: jinaTimeoutSec })
      const jinaRes = await fetch('https://r.jina.ai/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!jinaRes.ok) {
        const text = await jinaRes.text().catch(() => '')
        logger.warn('[jinaScrape] Jina HTTP error', { status: jinaRes.status, body: text.slice(0, 300) })
        res.status(200).json({
          markdown: '',
          html: '',
          images: {},
          links: {},
          error: `Jina HTTP ${jinaRes.status}`,
        })
        return
      }

      const json = (await jinaRes.json()) as {
        data?: {
          content?: string
          html?: string
          images?: Record<string, string>
          links?: Record<string, string>
        }
      }
      const data = json?.data ?? {}
      logger.info('[jinaScrape] ✓ OK', {
        mdLen: (data.content ?? '').length,
        htmlLen: (data.html ?? '').length,
        imgCount: Object.keys(data.images ?? {}).length,
        linkCount: Object.keys(data.links ?? {}).length,
      })
      res.status(200).json({
        markdown: data.content ?? '',
        html: data.html ?? '',
        images: data.images ?? {},
        links: data.links ?? {},
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[jinaScrape] fetch threw', { msg })
      // Toujours 200 avec erreur en body → le client peut fallback proprement
      // sans perdre les CORS headers (que Cloud Run strip parfois sur 5xx).
      res.status(200).json({
        markdown: '',
        html: '',
        images: {},
        links: {},
        error: msg,
      })
    } finally {
      clearTimeout(abortTimer)
    }
  }
)
