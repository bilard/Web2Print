// src/features/catalog/useCatalogAutosave.ts
// Autosauvegarde debouncée du catalogue : chaque mutation du store (hors données
// brutes rechargées) réécrit users/{uid}/catalogs/{id} après 2 s d'inactivité.
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useCatalogStore } from '@/stores/catalog.store'
import { saveCatalog } from './catalogsApi'

export function useCatalogAutosave(): { saving: boolean } {
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const unsub = useCatalogStore.subscribe((s, prev) => {
      if (!s.catalogId) return
      // Champs persistés seulement (rawRows/rawColumns sont rechargés depuis la source).
      const changed = s.name !== prev.name || s.sourceRef !== prev.sourceRef || s.selectedRowIds !== prev.selectedRowIds
        || s.levelKeys !== prev.levelKeys || s.treeEdits !== prev.treeEdits || s.prompt !== prev.prompt
        || s.plan !== prev.plan || s.fieldMap !== prev.fieldMap || s.format !== prev.format
        || s.coverImageUrl !== prev.coverImageUrl || s.backCoverImageUrl !== prev.backCoverImageUrl
      if (!changed) return
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(async () => {
        setSaving(true)
        try { await saveCatalog(useCatalogStore.getState().toDoc()) }
        catch (e) { toast.error(`Sauvegarde échouée : ${String((e as Error).message)}`) }
        finally { setSaving(false) }
      }, 2000)
    })
    return () => { unsub(); if (timer.current) clearTimeout(timer.current) }
  }, [])
  return { saving }
}
