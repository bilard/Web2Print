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

/** Défaut du node `text-enrich` (`nodeConfig.ts`) — un flux dont la config est antérieure
 *  au champ est bel et bien plafonné à cette valeur à l'exécution. */
const DEFAULT_MAX_UNITS = 500

export interface TextsNodeSettings {
  mode: ResumeMode
  /** Champs traités au plus par run (`maxUnits`). `null` = pas de plafond, ou pas de carte
   *  « Textes » lisible. */
  maxUnits: number | null
}

/**
 * Ce que la carte « Textes » du flux décide — mode de reprise et plafond par run.
 *
 * ⚠ Ces réglages ne vivent PAS sur l'écran « Suivi » : ils vivent sur la carte, et c'est
 * elle seule qui décide. L'écran ne fait que les LIRE et les dire.
 *
 * ⚠ Un échec de lecture reste EXPLICITE (`error`), jamais confondu avec `loading` ni avec
 * `off` : annoncer « ce flux refera tout » sur la foi d'une lecture ratée serait un
 * mensonge, et un silence n'apprendrait rien.
 */
export function useResumeMode(workflowId: string | null): TextsNodeSettings {
  const uid = useWorkspaceUid()
  const [settings, setSettings] = useState<TextsNodeSettings>({ mode: 'loading', maxUnits: null })

  useEffect(() => {
    if (!uid || !workflowId) { setSettings({ mode: 'noWorkflow', maxUnits: null }); return }
    let alive = true
    setSettings({ mode: 'loading', maxUnits: null })
    getWorkflow(uid, workflowId).then((wf) => {
      if (!alive) return
      const node = wf?.nodes.find((n) => n.type === 'text-enrich')
      if (!node) { setSettings({ mode: 'noNode', maxUnits: null }); return }
      const config = node.config as { incremental?: boolean; maxUnits?: number } | undefined
      // ⚠ Zéro = pas de plafond, exactement comme à l'exécution (`textEnrichNode.ts`) — et
      // `undefined` reprend le défaut du node, pas « illimité ».
      const raw = config?.maxUnits ?? DEFAULT_MAX_UNITS
      setSettings({
        // `incremental` non renseigné = ACTIF : c'est le défaut du node, et un flux ancien
        // (config écrite avant ce champ) reprend bien de façon incrémentale.
        mode: config?.incremental === false ? 'off' : 'on',
        maxUnits: Number(raw) > 0 ? Number(raw) : null,
      })
    }).catch(() => { if (alive) setSettings({ mode: 'error', maxUnits: null }) })
    return () => { alive = false }
  }, [uid, workflowId])

  return settings
}
