// src/features/brandkit/useObjectStyles.ts
// Styles d'objets réutilisables (globaux, par utilisateur) : capture des
// propriétés visuelles d'un objet sélectionné, application en 1 clic sur la
// sélection. Stockage users/{uid}.objectStyles, chargement one-shot (mêmes
// précautions que le kit de marque — pas de hook de sync permanent).
import { useCallback, useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import type { FabricObject, Textbox } from 'fabric'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

/** Propriétés visuelles capturées (objet + texte le cas échéant). */
const SHAPE_PROPS = ['fill', 'stroke', 'strokeWidth', 'opacity', 'rx', 'ry'] as const
const TEXT_PROPS = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'underline',
  'textAlign', 'lineHeight', 'charSpacing',
] as const

export interface ObjectStyle {
  id: string
  name: string
  props: Record<string, unknown>
}

/** Extrait les propriétés de style d'un objet (pur vis-à-vis du canvas). */
export function captureStyle(obj: FabricObject, name: string): ObjectStyle {
  const props: Record<string, unknown> = {}
  for (const k of SHAPE_PROPS) {
    const v = (obj as unknown as Record<string, unknown>)[k]
    // Les fills non-string (gradients/patterns) ne sont pas portables tels quels.
    if (v !== undefined && (k !== 'fill' && k !== 'stroke' ? true : typeof v === 'string' || v === null)) {
      props[k] = v
    }
  }
  if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') {
    for (const k of TEXT_PROPS) {
      const v = (obj as unknown as Record<string, unknown>)[k]
      if (v !== undefined) props[k] = v
    }
  }
  return { id: `style_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, props }
}

/** Applique un style à un objet (les props texte sont ignorées sur les formes). */
export function applyStyle(obj: FabricObject, style: ObjectStyle): void {
  const isText = obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text'
  for (const [k, v] of Object.entries(style.props)) {
    if (!isText && (TEXT_PROPS as readonly string[]).includes(k)) continue
    obj.set(k as keyof FabricObject, v as never)
  }
  if (isText) {
    // Purge les styles per-caractère pour que le style s'applique uniformément.
    ;(obj as Textbox).styles = {}
    ;(obj as Textbox).dirty = true
  }
  obj.setCoords()
}

interface UseObjectStyles {
  /** null = chargement. */
  styles: ObjectStyle[] | null
  add: (style: ObjectStyle) => void
  remove: (id: string) => void
}

export function useObjectStyles(): UseObjectStyles {
  const uid = useAuthStore((s) => s.user?.uid)
  const [styles, setStyles] = useState<ObjectStyle[] | null>(null)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (cancelled) return
        const list = snap.data()?.objectStyles as ObjectStyle[] | undefined
        setStyles(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setStyles([])
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  const persist = useCallback(
    (next: ObjectStyle[]) => {
      setStyles(next)
      if (uid) void setDoc(doc(db, 'users', uid), { objectStyles: next }, { merge: true })
    },
    [uid],
  )

  const add = useCallback((style: ObjectStyle) => persist([...(styles ?? []), style]), [styles, persist])
  const remove = useCallback((id: string) => persist((styles ?? []).filter((s) => s.id !== id)), [styles, persist])

  return { styles, add, remove }
}
