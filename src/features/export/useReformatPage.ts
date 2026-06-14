// src/features/export/useReformatPage.ts
// Orchestration UI du « Reformater (IA) » : au changement de format, décide
// (shouldReformat) de lancer le re-layout LLM vers une NOUVELLE page adaptée
// (page source intacte). Réutilise le moteur existant via declineToPages.
import { useCallback } from 'react'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useUIStore } from '@/stores/ui.store'
import { withProgress } from '@/stores/progress.store'
import { notify } from '@/lib/notify'
import { useDeclineToPages } from './useDeclineToPages'
import { shouldReformat, buildReformatTarget } from './reformatRule'

export function useReformatPage() {
  const { declineToPages } = useDeclineToPages()

  /** Lance le re-layout IA vers une nouvelle page si la règle l'autorise.
   * Renvoie true si le re-layout a été déclenché (l'appelant ne doit alors PAS
   * retailler la page courante en place). */
  const reformatPage = useCallback(
    async (wPt: number, hPt: number, presetLabel?: string): Promise<boolean> => {
      const canvas = globalFabricCanvas
      if (!canvas) return false
      const { canvasWidth, canvasHeight } = useUIStore.getState()
      // Exclut grille, marques de coupe ET fond de page (rect/image toujours
      // présents) : une page « vide » doit compter 0 objet pour ne PAS déclencher
      // l'IA (règle anti-spam — cf. spec).
      const designObjectCount = canvas
        .getObjects()
        .filter((o) => !o.data?.isGrid && !o.data?.isPrintMark && !o.data?.isPageBg).length

      if (!shouldReformat({ designObjectCount, srcW: canvasWidth, srcH: canvasHeight, dstW: wPt, dstH: hPt })) {
        return false
      }

      const target = buildReformatTarget(wPt, hPt, presetLabel)
      try {
        // Mise à l'échelle PROPORTIONNELLE qui préserve la composition (mode
        // 'cover' : le design remplit le format, le trop-plein est rogné). Pas
        // de LLM : déterministe, instantané. Réutilise la plomberie déclinées.
        const { updated } = await withProgress(
          'Adaptation du format…',
          () => declineToPages([target], { navigateToLast: true, transform: 'cover' }),
        )
        const verb = updated > 0 ? 'régénérée' : 'créée'
        notify.success('Format adapté', `Page « ${target.label} » ${verb} — design mis à l'échelle pour remplir le format, page d'origine conservée.`)
      } catch (err) {
        console.error('[reformatPage] échec :', err)
        notify.error('Adaptation du format échouée', String(err).slice(0, 160))
      }
      return true
    },
    [declineToPages],
  )

  return { reformatPage }
}
