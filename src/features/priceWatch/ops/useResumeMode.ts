// D'où vient la reprise : ce flux refera-t-il tout, ou seulement ce qui a changé ?
//
// ⚠ Le réglage ne vit PAS sur l'écran « Suivi » : il vit sur la carte « Textes » du flux
// (`text-enrich`, champ `incremental`), et c'est lui seul qui décide. L'écran ne fait que
// le LIRE et le dire — sans quoi l'utilisateur devait ouvrir le flux pour savoir ce qu'un
// lancement allait faire. Ancien logement de cette lecture : `OpsActions`, où elle pilotait
// un bouton « Relancer ce qui reste » qui appelait exactement le même `runWorkflowNow` que
// « Lancer » — un doublon retiré depuis, alors que la lecture, elle, garde tout son sens.
import { useEffect, useState } from 'react'
import { getWorkflow } from '@/features/workflows/persistence/workflowsApi'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import type { ResumeMode } from './opsTypes'

/**
 * Mode de reprise du flux associé à ce suivi.
 *
 * ⚠ Un échec de lecture reste EXPLICITE (`error`), jamais confondu avec `loading` ni avec
 * `off` : annoncer « ce flux refera tout » sur la foi d'une lecture ratée serait un
 * mensonge, et un silence n'apprendrait rien.
 */
export function useResumeMode(workflowId: string | null): ResumeMode {
  const uid = useWorkspaceUid()
  const [mode, setMode] = useState<ResumeMode>('loading')

  useEffect(() => {
    if (!uid || !workflowId) { setMode('noWorkflow'); return }
    let alive = true
    setMode('loading')
    getWorkflow(uid, workflowId).then((wf) => {
      if (!alive) return
      const node = wf?.nodes.find((n) => n.type === 'text-enrich')
      if (!node) { setMode('noNode'); return }
      // `incremental` non renseigné = ACTIF : c'est le défaut du node, et un flux ancien
      // (config écrite avant ce champ) reprend bien de façon incrémentale.
      setMode((node.config as { incremental?: boolean } | undefined)?.incremental === false ? 'off' : 'on')
    }).catch(() => { if (alive) setMode('error') })
    return () => { alive = false }
  }, [uid, workflowId])

  return mode
}
