/**
 * Attend qu'un élément correspondant au sélecteur soit présent dans le DOM.
 * Résout `true` dès qu'il apparaît, `false` au bout de `timeoutMs` (dégradation
 * gracieuse : on n'attend jamais indéfiniment, driver.js affichera alors une
 * bulle centrée). Polling léger via requestAnimationFrame.
 */
export function waitForElement(selector: string, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      resolve(true)
      return
    }
    const start = performance.now()
    const tick = () => {
      if (document.querySelector(selector)) {
        resolve(true)
        return
      }
      if (performance.now() - start >= timeoutMs) {
        resolve(false)
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}
