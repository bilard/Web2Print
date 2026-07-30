// functions/src/workflow/nodes/webScraping.ts
// Jumeau SERVEUR du node unifié « Web Scraping » : aiguille selon config.mode vers
// le run serveur de l'ancien node correspondant (scrape-url / list-products /
// web-search). Le mode « ask » n'a pas d'équivalent serveur → refusé proprement.
import { registerServerNode, getServerNode } from '../registry'
import { t } from '../../i18n'

const MODE_TO_TYPE: Record<string, string> = {
  scrape: 'scrape-url',
  list: 'list-products',
  search: 'web-search',
  ask: 'web-ask',
}

registerServerNode({
  type: 'web-scraping',
  run: async (ctx, config, inputs) => {
    const mode = String((config as { mode?: string }).mode ?? 'scrape')
    const target = getServerNode(MODE_TO_TYPE[mode] ?? '')
    if (!target) throw new Error(t(ctx.locale, 'run.ws.modeNotServer', { mode }))
    return target.run(ctx, config, inputs)
  },
})
