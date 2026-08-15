// Le tableau tel qu'on le VOIT : une image, ou une page PDF.
//
// ⚠⚠ `html2canvas` et `jspdf` sont importés à la DEMANDE. Les charger avec l'écran ferait
// payer plusieurs centaines de kilo-octets à qui ne fera jamais d'export — le module BI est
// déjà l'un des plus lourds de l'application.
//
// ⚠ La capture prend le fond RÉEL de la page : sans lui, un thème sombre rendrait un PNG à
// fond transparent, illisible dès qu'on le colle dans un document blanc.
import { debugLog } from '@/lib/debugLog'

/** Nom de fichier sûr, horodaté : deux exports du même tableau ne s'écrasent pas. */
function fileName(boardName: string, ext: string): string {
  const clean = boardName.replace(/[^\p{L}\p{N} _-]/gu, ' ').trim() || 'tableau'
  // ⚠⚠ `\D` et surtout PAS une classe de caractères entre crochets : Tailwind scanne les
  // sources — commentaires compris — et prend un tel littéral pour une classe utilitaire
  // arbitraire. Il génère alors une règle CSS invalide, et le build échoue très loin d'ici,
  // sur un message qui ne nomme aucun fichier.
  const stamp = new Date().toISOString().slice(0, 16).replace(/\D/g, '')
  return `${clean}-${stamp}.${ext}`
}

async function capture(el: HTMLElement): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import('html2canvas')
  const backgroundColor = getComputedStyle(document.body).backgroundColor || '#0b0b0f'
  return html2canvas(el, {
    backgroundColor,
    // ⚠ Double densité : un tableau capturé à 1× est illisible dès qu'on le projette ou
    // qu'on l'imprime. Au-delà de 2, le canvas dépasse vite les limites du navigateur.
    scale: 2,
    logging: false,
    // Les images du tableau viennent de Storage : sans cela, elles sortent en cases vides.
    useCORS: true,
  })
}

export async function exportBoardToPng(el: HTMLElement, boardName: string): Promise<void> {
  const canvas = await capture(el)
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = fileName(boardName, 'png')
  a.click()
  debugLog('[bi-export] PNG', canvas.width, '×', canvas.height)
}

export async function exportBoardToPdf(el: HTMLElement, boardName: string): Promise<void> {
  const canvas = await capture(el)
  const { jsPDF } = await import('jspdf')
  // ⚠ La page épouse l'image plutôt que l'inverse : forcer un A4 paysage sur un tableau
  // haut le réduirait à une bande illisible en haut d'une page vide.
  const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait'
  const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height] })
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height)
  pdf.save(fileName(boardName, 'pdf'))
  debugLog('[bi-export] PDF', orientation, canvas.width, '×', canvas.height)
}
