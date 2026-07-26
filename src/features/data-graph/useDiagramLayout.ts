import { useCallback, useEffect, useRef, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import type { Node } from '@xyflow/react'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

export type NodePositions = Record<string, { x: number; y: number }>

/** Persiste les positions des tables du diagramme dans `users/{uid}.dataModelLayout`
 *  (setDoc merge — n'écrase pas les autres champs). `layout` = positions chargées
 *  (null tant que non chargé) ; `saveLayout` sauvegarde en différé (debounce). */
export function useDiagramLayout() {
  const uid = useAuthStore((s) => s.user?.uid)
  const [layout, setLayout] = useState<NodePositions | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!uid) { setLayout(null); return }
    let alive = true
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (!alive) return
        const saved = (snap.data() as { dataModelLayout?: NodePositions } | undefined)?.dataModelLayout
        setLayout(saved && typeof saved === 'object' ? saved : {})
      })
      .catch(() => { if (alive) setLayout({}) })
    return () => { alive = false }
  }, [uid])

  const saveLayout = useCallback((nodes: Node[]) => {
    if (!uid) return
    const positions: NodePositions = {}
    nodes.forEach((n) => { positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) } })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setDoc(doc(db, 'users', uid), { dataModelLayout: positions }, { merge: true }).catch(() => { /* best-effort */ })
    }, 600)
  }, [uid])

  return { layout, saveLayout }
}
