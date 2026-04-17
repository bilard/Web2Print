/**
 * Service worker de l'extension Web2Print Capture.
 *
 * Rôles :
 *  1. Répondre au ping de Web2Print (externally_connectable → sendMessage).
 *  2. Accepter une connexion port (chrome.runtime.connect) depuis Web2Print
 *     et la garder ouverte tant que le user utilise le Scraping Hub.
 *  3. Ouvrir un onglet cible (open-and-capture) et injecter le content script.
 *  4. Relayer les messages dans les 2 sens entre le port Web2Print et l'onglet.
 */

type TabId = number

interface WebPort {
  port: chrome.runtime.Port
  activeTabId: TabId | null
  tags: Array<{ selector: string; label: string }>
}

let webPort: WebPort | null = null

// ─── Messaging one-shot (ping) ─────────────────────────────────────────────
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'ping') {
    sendResponse({ type: 'pong', version: chrome.runtime.getManifest().version })
    return true
  }
  return false
})

// ─── Connexion port persistant ─────────────────────────────────────────────
chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.name !== 'w2p-capture') return
  console.log('[w2p-bg] port connected')
  webPort = { port, activeTabId: null, tags: [] }
  chrome.storage.local.set({ connected: true })

  port.onMessage.addListener((msg) => {
    handleWebMessage(msg).catch((err) => {
      port.postMessage({ type: 'error', message: String(err?.message ?? err) })
    })
  })

  port.onDisconnect.addListener(() => {
    console.log('[w2p-bg] port disconnected')
    if (webPort?.activeTabId) {
      chrome.tabs.remove(webPort.activeTabId).catch(() => { /* déjà fermé */ })
    }
    chrome.storage.local.set({ connected: false })
    webPort = null
  })
})

async function handleWebMessage(msg: unknown): Promise<void> {
  if (!webPort) return
  const m = msg as { type: string } & Record<string, unknown>
  switch (m.type) {
    case 'open-and-capture':
      await openCaptureTab(m.url as string, m.templateTags as Array<{ selector: string; label: string }>)
      return
    case 'set-persistent-tags':
      webPort.tags = (m.tags as Array<{ selector: string; label: string }>) ?? []
      await sendToTab({ type: 'pim-set-persistent-tags', tags: webPort.tags })
      return
    case 'set-active-selector':
      await sendToTab({ type: 'pim-set-active-selector', selector: m.selector as string | null })
      return
    case 'clear-tags':
      webPort.tags = []
      await sendToTab({ type: 'pim-clear-persistent-tags' })
      return
    case 'set-mode':
      await sendToTab({ type: 'pim-set-mode', mode: m.mode as string })
      return
    case 'close-tab':
      if (webPort.activeTabId) {
        await chrome.tabs.remove(webPort.activeTabId).catch(() => { /* noop */ })
        webPort.activeTabId = null
      }
      return
    default:
      console.warn('[w2p-bg] unknown message type:', m.type)
  }
}

async function openCaptureTab(url: string, tags: Array<{ selector: string; label: string }>): Promise<void> {
  if (!webPort) return
  // Fermer l'ancien onglet si présent.
  if (webPort.activeTabId) {
    await chrome.tabs.remove(webPort.activeTabId).catch(() => { /* noop */ })
  }
  const tab = await chrome.tabs.create({ url, active: true })
  if (typeof tab.id !== 'number') throw new Error('Impossible de créer l\'onglet')
  webPort.activeTabId = tab.id
  webPort.tags = tags
  // L'injection du content script se fera automatiquement via le listener
  // chrome.tabs.onUpdated ci-dessous quand la page sera complètement chargée.
}

// ─── Injection auto du content script au chargement de l'onglet capture ────
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return
  if (!webPort || webPort.activeTabId !== tabId) return
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    })
    // Le content script répondra avec 'ready' → on relaie à Web2Print
    // via relayFromTab ci-dessous.
  } catch (err) {
    webPort.port.postMessage({ type: 'error', message: `Injection impossible : ${String((err as Error)?.message)}` })
  }
})

// ─── Relais des messages depuis le content script vers Web2Print ───────────
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!webPort || sender.tab?.id !== webPort.activeTabId) return false
  const m = msg as { type: string }
  // Filtrer : seuls les messages du protocole pim- et 'ready' sont relayés.
  if (!m?.type?.startsWith('pim-') && m?.type !== 'ready') return false
  if (m.type === 'ready') {
    webPort.port.postMessage({ type: 'ready', tabId: sender.tab!.id, url: sender.tab!.url ?? '' })
    // Ré-envoyer les tags bufferisés une fois le content prêt.
    if (webPort.tags.length > 0) {
      sendToTab({ type: 'pim-set-persistent-tags', tags: webPort.tags })
    }
  } else if (m.type === 'pim-capture') {
    webPort.port.postMessage({
      type: 'capture',
      ...(msg as Record<string, unknown>),
    })
  } else if (m.type === 'pim-preview-result') {
    // Ignoré — le protocole multi-tags n'en a plus besoin, mais on évite le warning.
  }
  return false
})

// ─── Détection fermeture onglet ────────────────────────────────────────────
chrome.tabs.onRemoved.addListener((tabId) => {
  if (webPort && webPort.activeTabId === tabId) {
    webPort.activeTabId = null
    webPort.port.postMessage({ type: 'tab-closed', tabId })
  }
})

async function sendToTab(msg: unknown): Promise<void> {
  if (!webPort?.activeTabId) return
  try {
    await chrome.tabs.sendMessage(webPort.activeTabId, msg)
  } catch (err) {
    console.warn('[w2p-bg] sendMessage to tab failed', err)
  }
}

console.log('[w2p-bg] background ready')
