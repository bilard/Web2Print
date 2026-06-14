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
        // « Mise en page fluide » : l'IA ré-agence le design par BLOCS cohérents
        // pour le nouveau format ; repli proportionnel (cover) garanti.
        const { usedFallback, updated } = await withProgress(
          'Mise en page fluide (IA)…',
          () => declineToPages([target], { navigateToLast: true, transform: 'fluid' }),
        )
        const verb = updated > 0 ? 'régénérée' : 'créée'
        if (usedFallback) {
          notify.warning('Format adapté (repli proportionnel)', `Page « ${target.label} » ${verb} — IA indisponible, mise à l'échelle proportionnelle appliquée.`)
        } else {
          notify.success('Mise en page fluide appliquée', `Page « ${target.label} » ${verb} — design ré-agencé par l'IA, page d'origine conservée.`)
        }
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
