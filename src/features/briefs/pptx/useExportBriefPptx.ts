import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, updateDoc, serverTimestamp, getDocs, collection } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { buildBriefPptx } from './buildBriefPptx'
import type { Brief, BriefImage } from '@/features/briefs/types'

interface Args {
  brief: Brief
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 60)
}

/**
 * Construit le PPTX du brief, déclenche le téléchargement navigateur,
 * et marque le brief comme `completed`.
 */
export function useExportBriefPptx() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brief }: Args) => {
      // Récupère les images du brief depuis la sous-collection
      const snap = await getDocs(collection(db, 'briefs', brief.id, 'images'))
      const images: BriefImage[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BriefImage))

      const blob = await buildBriefPptx({ brief, images })
      const filename = `${safeFilename(brief.clientName || 'brief')}-${brief.id.slice(0, 6)}.pptx`
      triggerDownload(blob, filename)

      await updateDoc(doc(db, 'briefs', brief.id), {
        status: 'completed',
        updatedAt: serverTimestamp(),
      })

      return { filename, slideCount: brief.deck?.slides.length ?? 0 }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['brief', vars.brief.id] })
      qc.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}
