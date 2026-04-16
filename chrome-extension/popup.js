// Popup ultra-simple : juste on/off et reset. L'UX de capture est dans la
// page via content.js (panneau flottant qui reste visible au clic).

const toggleBtn = document.getElementById('toggle')
const resetBtn = document.getElementById('reset')
let isOn = false

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

async function setMode(nextOn) {
  const tab = await getActiveTab()
  if (!tab) return
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'pim-set-mode', mode: nextOn ? 'single' : 'off' })
    isOn = nextOn
    render()
  } catch (err) {
    alert('Impossible d\'activer sur cet onglet — recharge la page (F5) et réessaie.\n\n' + (err && err.message ? err.message : ''))
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
