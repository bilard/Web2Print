// Service worker minimaliste : relais entre content script et popup.
// Stocke les captures en cours dans chrome.storage.session pour que le
// popup les récupère même après une fermeture/réouverture.

const BUFFER_KEY = 'pim_capture_buffer'
const TEMPLATE_KEY = 'pim_draft_template'

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'pim-capture') {
    // Buffer la capture et notifier le popup ouvert
    chrome.storage.session.get([BUFFER_KEY], (res) => {
      const buffer = res[BUFFER_KEY] || []
      buffer.push({ ...msg, capturedAt: Date.now() })
      chrome.storage.session.set({ [BUFFER_KEY]: buffer }, () => {
        chrome.runtime.sendMessage({ type: 'pim-capture-buffered' }).catch(() => {})
      })
    })
    sendResponse({ ok: true })
    return true
  }
})
