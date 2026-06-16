// src/lib/domExport.ts
// Export d'un élément du DOM en PNG / PDF (html2canvas + jsPDF, chargés en lazy —
// déjà des dépendances des nodes export). Fond sombre pour matcher le thème.
const BG = '#0b0b0f'

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function snapshot(el: HTMLElement): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import('html2canvas')
  return html2canvas(el, { backgroundColor: BG, scale: 2, useCORS: true, logging: false })
}

export async function exportElementToPng(el: HTMLElement, filename: string): Promise<void> {
  const canvas = await snapshot(el)
  await new Promise<void>((resolve) =>
    canvas.toBlob((b) => { if (b) downloadBlob(b, filename); resolve() }, 'image/png'),
  )
}

export async function exportElementToPdf(el: HTMLElement, filename: string): Promise<void> {
  const [canvas, { default: jsPDF }] = await Promise.all([snapshot(el), import('jspdf')])
  const img = canvas.toDataURL('image/png')
  const pdf = new jsPDF({
    orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [canvas.width, canvas.height],
  })
  pdf.addImage(img, 'PNG', 0, 0, canvas.width, canvas.height)
  pdf.save(filename)
}
