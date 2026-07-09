// src/features/dam/useDamFolderUpload.ts
// Importe N images locales (un dossier) vers un dossier Google Drive choisi.
//
// Pont : `damUpload` (serveur) récupère une URL, pas un blob local. On dépose
// donc chaque fichier dans un emplacement Storage temporaire de l'utilisateur
// (`users/{uid}/dam-temp/…`, autorisé par storage.rules), on en obtient un
// downloadURL public (hostname firebasestorage NON bloqué côté CF), que la CF
// re-télécharge et écrit dans Drive (avec sa validation magic-bytes). Le fichier
// temporaire est supprimé après coup. Aucun redéploiement de functions requis.
import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { auth, storage, functions } from '@/lib/firebase/config'
import { removeBackground } from '@/features/imaging/removeBackground'
import { useAccessStore } from '@/stores/access.store'
import { DEMO_PERMISSION } from '@/features/access/permissions'

const damUpload = httpsCallable<
  { url: string; fileName: string; folderId: string },
  { fileId: string; webViewLink: string }
>(functions, 'damUpload')

const UPLOAD_CONCURRENCY = 4
const IMAGE_RE = /\.(jpe?g|png|webp|gif|svg)$/i

interface FolderUploadProgress {
  total: number
  done: number
  ok: number
  failed: number
  current: string | null
}

export interface FolderUploadResult {
  ok: number
  failed: number
  links: { fileName: string; webViewLink: string }[]
  errors: { fileName: string; message: string }[]
}

function isImageFile(f: File): boolean {
  return f.type.startsWith('image/') || IMAGE_RE.test(f.name)
}

export function useDamFolderUpload() {
  const [progress, setProgress] = useState<FolderUploadProgress | null>(null)
  const abortRef = useRef(false)

  const cancel = useCallback(() => { abortRef.current = true }, [])

  const uploadFolder = useCallback(
    async (files: File[], folderId: string, opts?: { removeBg?: boolean }): Promise<FolderUploadResult> => {
      const uid = auth.currentUser?.uid
      if (!uid) throw new Error('Connexion requise.')

      const images = files.filter(isImageFile)
      abortRef.current = false

      const result: FolderUploadResult = { ok: 0, failed: 0, links: [], errors: [] }

      // Quota compte démo : pré-tranche à la limite restante (le serveur `damUpload`
      // reste le garde dur, mais on évite d'envoyer des uploads voués à l'échec).
      const acc = useAccessStore.getState()
      const isDemo = !acc.isOwner && acc.permissions.has(DEMO_PERMISSION)
      let toUpload = images
      if (isDemo) {
        const limit = acc.limits.damAssets
        const remaining = Math.max(0, limit - acc.usage.damAssets)
        if (remaining <= 0) {
          toast.error(`Limite démo atteinte : ${limit} assets DAM maximum.`)
          return result
        }
        if (images.length > remaining) {
          toast.warning(`Limite démo : seuls ${remaining}/${images.length} fichiers importés (${limit} assets max).`)
          toUpload = images.slice(0, remaining)
        }
      }

      let done = 0
      setProgress({ total: toUpload.length, done: 0, ok: 0, failed: 0, current: null })

      const queue = [...toUpload]
      const runOne = async (file: File) => {
        if (abortRef.current) return
        setProgress((p) => (p ? { ...p, current: file.name } : p))
        // Détourage optionnel AVANT upload : le fichier devient un PNG alpha.
        // Un échec de détourage n'empêche pas l'import (image d'origine conservée).
        let payload: { blob: Blob; name: string; type: string } = { blob: file, name: file.name, type: file.type }
        if (opts?.removeBg) {
          const objUrl = URL.createObjectURL(file)
          try {
            const { url } = await removeBackground(objUrl)
            const png = await (await fetch(url)).blob()
            URL.revokeObjectURL(url)
            payload = { blob: png, name: `${file.name.replace(/\.[^.]+$/, '')}.png`, type: 'image/png' }
          } catch (err) {
            console.warn('[import DAM] détourage échoué, image d’origine conservée :', file.name, err)
          } finally {
            URL.revokeObjectURL(objUrl)
          }
        }
        const ext = (payload.name.match(IMAGE_RE)?.[1] ?? (payload.type.split('/')[1] || 'jpg')).toLowerCase()
        const tempPath = `users/${uid}/dam-temp/${crypto.randomUUID()}.${ext}`
        const tempRef = storageRef(storage, tempPath)
        try {
          await uploadBytes(tempRef, payload.blob, { contentType: payload.type || `image/${ext}` })
          const url = await getDownloadURL(tempRef)
          const { webViewLink } = (await damUpload({ url, fileName: payload.name, folderId })).data
          result.ok++
          result.links.push({ fileName: payload.name, webViewLink })
          if (isDemo) useAccessStore.getState().bumpUsage({ damAssets: 1 }) // miroir du compteur serveur
        } catch (err) {
          result.failed++
          result.errors.push({ fileName: file.name, message: err instanceof Error ? err.message : String(err) })
        } finally {
          void deleteObject(tempRef).catch(() => {}) // nettoyage best-effort
          done++
          setProgress((p) => (p ? { ...p, done, ok: result.ok, failed: result.failed } : p))
        }
      }

      const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, async () => {
        while (queue.length && !abortRef.current) {
          const next = queue.shift()
          if (next) await runOne(next)
        }
      })
      await Promise.all(workers)
      setProgress((p) => (p ? { ...p, current: null } : p))
      return result
    },
    [],
  )

  return { uploadFolder, progress, cancel, isImageFile }
}
