// Détecte les MODIFICATIONS de la source ouverte dans la page Données (rafale
// d'éditions débouncée) et déclenche le popup « publications reliées ».
// Période de grâce après chaque changement de source : les chargements de
// fichiers/projets ne doivent pas passer pour des éditions utilisateur.
import { useEffect, useRef, useState } from 'react'
import { useExcelStore } from '@/stores/excel.store'
import type { SourceIdent } from './linkedPublications'

const GRACE_MS = 2000
const DEBOUNCE_MS = 2500

export function useSourceSyncPrompt(ident: SourceIdent | null): { open: boolean; close: () => void } {
  const [open, setOpen] = useState(false)
  const identKey = ident ? `${ident.kind}:${ident.kind === 'pim' ? ident.projectId : ident.docId}` : null
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    if (!identKey) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const armedAt = Date.now() + GRACE_MS
    const unsub = useExcelStore.subscribe((s, prev) => {
      if (s.sheets === prev.sheets) return
      if (Date.now() < armedAt) return
      if (openRef.current) return // popup déjà affiché : pas de re-déclenchement
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setOpen(true), DEBOUNCE_MS)
    })
    return () => { unsub(); if (timer) clearTimeout(timer) }
  }, [identKey])

  return { open, close: () => setOpen(false) }
}
