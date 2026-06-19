import { useEffect, useRef } from 'react'
import { useModuleIntentStore } from '@/stores/moduleIntent.store'

/**
 * Consomme une seule fois l'intent courant si son préfixe correspond à `prefix`.
 * `apply` reçoit l'action (l'intent privé de « <prefix>: »). Re-déclenché sur
 * chaque `set` du store (dép. `seq`), même intent identique.
 */
export function useModuleIntent(prefix: string, apply: (action: string) => void): void {
  const intent = useModuleIntentStore((s) => s.intent)
  const seq = useModuleIntentStore((s) => s.seq)
  const setIntent = useModuleIntentStore((s) => s.set)
  const applyRef = useRef(apply)
  applyRef.current = apply

  useEffect(() => {
    if (!intent) return
    const p = `${prefix}:`
    if (!intent.startsWith(p)) return
    applyRef.current(intent.slice(p.length))
    setIntent(null) // one-shot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq])
}
