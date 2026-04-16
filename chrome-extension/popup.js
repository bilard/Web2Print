// Popup ultra-simple : juste on/off et reset. L'UX de capture est dans la
// page via content.js (panneau flottant qui reste visible au clic).

const toggleBtn = document.getElementById('toggle')
const resetBtn = document.getElementById('reset')
let isOn = false

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

async function ensureContentScript(tabId) {
  // Tenter un ping. Si ça échoue, injecter content.js programmatiquement
  // (cas où l'onglet existait avant l'installation/rechargement de l'extension).
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'pim-ping' })
    return
  } catch {
    /* fall through : on tente une injection */
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
  } catch (err) {
    throw new Error('Injection impossible (page chrome://, page store, ou restriction) : ' + (err && err.message ? err.message : ''))
  }
}

async function setMode(nextOn) {
  const tab = await getActiveTab()
  if (!tab) return
  try {
    await ensureContentScript(tab.id)
    await chrome.tabs.sendMessage(tab.id, { type: 'pim-set-mode', mode: nextOn ? 'single' : 'off' })
    isOn = nextOn
    render()
    // Fermer le popup pour laisser la main au panneau flottant.
    window.close()
  } catch (err) {
    alert('Impossible d\'activer sur cet onglet.\n\n' + (err && err.message ? err.message : 'Recharge la page et réessaie.'))
  }
}

function render() {
  if (isOn) {
    toggleBtn.textContent = '■ Arrêter la capture'
    toggleBtn.classList.remove('primary')
    toggleBtn.classList.add('danger')
  } else {
    toggleBtn.textContent = '▶ Activer la capture'
    toggleBtn.classList.remove('danger')
    toggleBtn.classList.add('primary')
  }
}

toggleBtn.addEventListener('click', () => setMode(!isOn))
resetBtn.addEventListener('click', () => {
  if (confirm('Réinitialiser tout le brouillon de template ?')) {
    chrome.runtime.sendMessage({ type: 'pim-reset-draft' }, () => {
      getActiveTab().then((tab) => {
        if (tab) chrome.tabs.sendMessage(tab.id, { type: 'pim-refresh-panel' }).catch(() => {})
      })
    })
  }
})

render()
