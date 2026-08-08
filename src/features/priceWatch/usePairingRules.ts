// Règles d'appariement du suivi courant, pour les écrans. Lecture à chaque montage
// (aucun cache : la valeur peut avoir été réécrite par un run entre-temps) et écriture
// qui rend la main sur l'état frais.
import { useCallback, useEffect, useState } from 'react'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { loadPairingRules, savePairingRules } from './pairingRulesStore'
import { DEFAULT_PAIRING_RULES, type PairingRules } from './catalog/pairingRules'

export interface UsePairingRules {
  rules: PairingRules
  /** true tant que la lecture n'a pas abouti — l'écran ne doit pas afficher les défauts
   *  comme s'ils étaient le réglage enregistré. */
  loading: boolean
  /** true si aucun réglage n'existe encore pour ce suivi. */
  fromDefaults: boolean
  updatedAt?: number
  updatedBy?: 'node' | 'screen'
  save: (next: PairingRules) => Promise<void>
  reload: () => void
}

export function usePairingRules(watchId: string | null): UsePairingRules {
  const uid = useWorkspaceUid()
  const [state, setState] = useState<Omit<UsePairingRules, 'save' | 'reload'>>({
    rules: DEFAULT_PAIRING_RULES, loading: true, fromDefaults: true,
  })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!uid || !watchId) {
      setState({ rules: DEFAULT_PAIRING_RULES, loading: false, fromDefaults: true })
      return
    }
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    loadPairingRules(uid, watchId).then((stored) => {
      if (!alive) return
      setState({
        rules: stored.rules, loading: false, fromDefaults: stored.fromDefaults,
        updatedAt: stored.updatedAt, updatedBy: stored.updatedBy,
      })
    })
    return () => { alive = false }
  }, [uid, watchId, tick])

  const save = useCallback(async (next: PairingRules) => {
    if (!uid || !watchId) return
    await savePairingRules(uid, watchId, next, 'screen')
    setState({ rules: next, loading: false, fromDefaults: false, updatedAt: Date.now(), updatedBy: 'screen' })
  }, [uid, watchId])

  return { ...state, save, reload: () => setTick((n) => n + 1) }
}
