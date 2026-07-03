// src/features/fonts/useUserFonts.ts
// Chargement des polices utilisateur : injection via l'API FontFace dans
// document.fonts (partagé avec les rendus hors écran de l'export — waitAssets
// attend document.fonts.ready avant capture html2canvas).
import { useCallback, useEffect, useState } from 'react'
import { deleteUserFont, listUserFonts, uploadUserFont, type UserFont } from './userFontsApi'

const injected = new Set<string>()

async function injectFont(font: UserFont): Promise<void> {
  if (injected.has(font.family) || typeof document === 'undefined') return
  injected.add(font.family)
  try {
    const face = new FontFace(font.family, `url(${font.url})`)
    document.fonts.add(face)
    await face.load()
  } catch (e) {
    console.warn('[fonts] chargement échoué :', font.family, e)
  }
}

let cache: Promise<UserFont[]> | null = null

/**
 * Charge (une fois par session) la liste des polices perso ET les injecte —
 * appelé au boot du builder pour que l'export fonctionne même sans passer
 * par l'étape Style.
 */
export function ensureUserFontsLoaded(): Promise<UserFont[]> {
  if (!cache) {
    cache = listUserFonts().then(async (fonts) => {
      await Promise.all(fonts.map(injectFont))
      return fonts
    }).catch((e) => { console.warn('[fonts] liste indisponible', e); cache = null; return [] })
  }
  return cache
}

/** Liste réactive + upload/suppression (les nouvelles polices sont injectées immédiatement). */
export function useUserFonts(): { fonts: UserFont[]; busy: boolean; upload: (file: File) => Promise<void>; remove: (font: UserFont) => Promise<void> } {
  const [fonts, setFonts] = useState<UserFont[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void ensureUserFontsLoaded().then((f) => { if (!cancelled) setFonts(f) })
    return () => { cancelled = true }
  }, [])

  const upload = useCallback(async (file: File) => {
    setBusy(true)
    try {
      const font = await uploadUserFont(file)
      await injectFont(font)
      cache = null
      setFonts(await ensureUserFontsLoaded())
    } finally { setBusy(false) }
  }, [])

  const remove = useCallback(async (font: UserFont) => {
    setBusy(true)
    try {
      await deleteUserFont(font)
      cache = null
      setFonts(await ensureUserFontsLoaded())
    } finally { setBusy(false) }
  }, [])

  return { fonts, busy, upload, remove }
}
