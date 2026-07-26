// Export PDF : rend chaque page hors écran (createRoot + flushSync), attend polices
// et images, capture html2canvas (scale = dpi/96), ajoute une page jsPDF en mm.
// Mode print : page agrandie du fond perdu + traits de coupe (drawCropMarks).
// Une page qui échoue ne bloque pas l'export : page blanche + récapitulatif.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import type { CatalogPageDescriptor } from './catalogTypes'
import { CatalogPageView } from './components/pages/CatalogPageView'
import { ensureCatalogFonts, type CatalogRenderCtx } from './components/pages/catalogCss'
import { drawCropMarks } from './cropMarks'

export interface CatalogExportOptions { mode: 'screen' | 'print'; dpi: 150 | 300; bleedMm: number; fileName: string }

/** Hex strict `#rrggbb` : repli '#ffffff' si le thème contient une valeur non-hex (ex. 'white'). */
const HEX_RE = /^#[0-9a-f]{6}$/i
function safeHex(hex: string): string { return HEX_RE.test(hex) ? hex : '#ffffff' }

const ASSET_WAIT_TIMEOUT_MS = 15_000

async function waitAssets(host: HTMLElement): Promise<void> {
  await document.fonts.ready
  // 1) Attend la résolution async des images produits (Drive/CORS → blob:/data:) :
  //    tant que data-resolving="true" est présent, l'<img> correspondant n'existe
  //    pas encore dans le DOM (voir ProductCell/useResolvedImage). Borné à 15 s.
  const start = Date.now()
  while (host.querySelector('[data-resolving="true"]') && Date.now() - start < ASSET_WAIT_TIMEOUT_MS) {
    await new Promise((res) => setTimeout(res, 100))
  }
  // 2) Attend le chargement effectif des <img> désormais présents.
  await Promise.all(Array.from(host.querySelectorAll('img')).map((img) =>
    img.complete ? Promise.resolve() : new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res() }),
  ))
}

export function useCatalogExport() {
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)

  const exportPdf = async (pages: CatalogPageDescriptor[], ctx: CatalogRenderCtx, opts: CatalogExportOptions) => {
    ensureCatalogFonts() // charge la feuille de style Google Fonts même sans passage par l'Aperçu
    setExporting(true)
    setProgress(0)
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-99999px;top:0;'
    document.body.appendChild(host)
    const root = createRoot(host)
    const failed: number[] = []
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
      const { widthMm: w, heightMm: h } = ctx.format
      const b = opts.mode === 'print' ? opts.bleedMm : 0
      const scale = opts.dpi / 96
      const pdf = new jsPDF({ orientation: w + 2 * b >= h + 2 * b ? 'landscape' : 'portrait', unit: 'mm', format: [w + 2 * b, h + 2 * b] })
      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage([w + 2 * b, h + 2 * b], w + 2 * b >= h + 2 * b ? 'landscape' : 'portrait')
        if (b > 0) {
          // Un hex de thème invalide (ex. IA/import ayant glissé 'white') ne doit
          // jamais faire planter tout l'export : repli '#ffffff' + garde try/catch.
          try { pdf.setFillColor(safeHex(ctx.plan.theme.pageBg)); pdf.rect(0, 0, w + 2 * b, h + 2 * b, 'F') }
          catch { try { pdf.setFillColor('#ffffff'); pdf.rect(0, 0, w + 2 * b, h + 2 * b, 'F') } catch { /* fond non dessiné, export non bloqué */ } }
        }
        try {
          flushSync(() => root.render(<CatalogPageView page={pages[i]} ctx={ctx} />))
          await waitAssets(host)
          const el = host.firstElementChild as HTMLElement
          const canvas = await html2canvas(el, { scale, useCORS: true, logging: false, backgroundColor: safeHex(ctx.plan.theme.pageBg) })
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', b, b, w, h)
        } catch (e) {
          failed.push(pages[i].pageNumber)
          console.error('[catalog export] page', pages[i].pageNumber, e)
        }
        if (opts.mode === 'print') drawCropMarks(pdf, w, h, b)
        setProgress(Math.round(((i + 1) / pages.length) * 100))
      }
      pdf.save(opts.fileName)
      if (failed.length) toast.error(`Pages en échec (laissées blanches) : ${failed.join(', ')}`)
      else toast.success(`PDF exporté (${pages.length} pages)`)
    } finally {
      root.unmount()
      host.remove()
      setExporting(false)
    }
  }
  return { exporting, progress, exportPdf }
}
