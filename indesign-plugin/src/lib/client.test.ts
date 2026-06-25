// indesign-plugin/src/lib/client.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildUrl, PluginClient } from './client'

describe('buildUrl', () => {
  it('joint sans double slash', () => {
    expect(buildUrl('https://x/pluginApi', '/datasets')).toBe('https://x/pluginApi/datasets')
    expect(buildUrl('https://x/pluginApi/', '/datasets')).toBe('https://x/pluginApi/datasets')
  })
})

describe('PluginClient', () => {
  it('envoie le Bearer et mappe la liste', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ datasets: [{ docId: 'd1', fileName: 'Cat', sheetCount: 1, rowCount: 3 }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const c = new PluginClient('https://x/pluginApi', 'w2p_t')
    const ds = await c.listDatasets()
    expect(ds[0].fileName).toBe('Cat')
    expect(fetchMock).toHaveBeenCalledWith('https://x/pluginApi/datasets',
      expect.objectContaining({ headers: { Authorization: 'Bearer w2p_t' } }))
  })
  it('jette sur réponse non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'x' }) }))
    await expect(new PluginClient('https://x/pluginApi', 'bad').listDatasets()).rejects.toThrow(/401/)
  })
})
