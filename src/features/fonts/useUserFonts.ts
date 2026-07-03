// src/features/fonts/useUserFonts.ts
// Chargement des polices utilisateur : injection via l'API FontFace dans
// document.fonts (partagé avec les rendus hors écran de l'export — waitAssets
// attend document.fonts.ready avant capture html2canvas).
import { useCallback, useEffect, useState } from 'react'
import { addGoogleFont, deleteUserFont, listUserFonts, uploadUserFont, type UserFont } from './userFontsApi'

const injected = new Set<string>()

async function injectFont(font: UserFont): Promise<void> {
  if (injected.has(font.family) || typeof document === 'undefined') return
  injected.add(font.family)
  try {
    if (font.kind === 'google') {
      // Deux <link> : avec graisses (peut 400 si la famille ne les a pas toutes)
      // + plain en secours — celui qui échoue est ignoré par le navigateur.
      const fam = font.family.replace(/ /g, '+')
      for (const spec of [`${fam}:wght@400;500;600;700;800`, fam]) {
        const id = `user-gfont-${spec}`
        if (document.getElementById(id)) continue
        const link = document.createElement('link')
        link.id = id; link.rel = 'stylesheet'
        link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`
        document.head.appendChild(link)
      }
      return
    }
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

/** Liste réactive + upload/ajout Google/suppression (injection immédiate). */
export function useUserFonts(): {
  fonts: UserFont[]
  busy: boolean
  upload: (file: File) => Promise<void>
  addGoogle: (input: string) => Promise<string>
  remove: (font: UserFont) => Promise<void>
} {
  const [fonts, setFonts] = useState<UserFont[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void ensureUserFontsLoaded().then((f) => { if (!cancelled) setFonts(f) })
    return () => { cancelled = true }
  }, [])

  const refresh = useCallback(async () => {
    cache = null
    setFonts(await ensureUserFontsLoaded())
  }, [])

  const upload = useCallback(async (file: File) => {
    setBusy(true)
    try {
      const font = await uploadUserFont(file)
      await injectFont(font)
      await refresh()
    } finally { setBusy(false) }
  }, [refresh])

  const addGoogle = useCallback(async (input: string) => {
    setBusy(true)
    try {
      const font = await addGoogleFont(input)
      await injectFont(font)
      await refresh()
      return font.family
    } finally { setBusy(false) }
  }, [refresh])

  const remove = useCallback(async (font: UserFont) => {
    setBusy(true)
    try {
      await deleteUserFont(font)
      await refresh()
    } finally { setBusy(false) }
  }, [refresh])

  return { fonts, busy, upload, addGoogle, remove }
}
