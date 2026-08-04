import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
// Visuel de couverture via Image IA (Gemini). Ne passe PAS par useImageGeneration
// (dont l'upload final vers la galerie exige useEditorStore.projectId — toujours
// null sur /catalog/:id, aucun projet éditeur n'y est ouvert → échec systématique).
// On appelle directement generateImageBase64 (même cascade de modèles/erreurs) puis
// on uploade en Firebase Storage users/{uid}/catalogCovers/ (bucket CORS déjà ouvert
// pour la capture html2canvas, cf. cors.json) avant de stocker l'URL dans le doc.
import { useState } from 'react'
import { toast } from 'sonner'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase/config'
import { generateImageBase64, NANO_BANANA_PRO_MODELS } from '@/features/nanobana/generateImageBase64'
import { removeBackground } from '@/features/imaging/removeBackground'
import { useCatalogStore } from '@/stores/catalog.store'
import { pagePx } from './components/pages/catalogCss'
import { t } from '@/lib/i18n'

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

/**
 * Brief d'EMBLÈME de marque. Nano Banana est un modèle INSTRUIT : il suit une
 * consigne de design formulée en phrases, là où un empilement de mots-clés
 * (style Midjourney) le fait dériver. On lui donne donc un cahier des charges
 * de graphiste — dont la contrainte qui compte vraiment en print : rester
 * lisible à 10 mm. Jamais de lettrage : le nom est composé typographiquement
 * (un modèle d'image l'orthographierait mal).
 */
export function emblemPrompt(name: string, accent: string): string {
  return `Design a brand emblem for a professional tools and hardware retailer called "${name}".\n`
    + `It must be ONE single simple geometric mark with a strong silhouette — the kind of icon that stays perfectly readable when printed at 10 mm wide.\n`
    + `Style: flat vector, solid fills, even confident strokes, balanced geometry, generous empty margin all around, perfectly centred.\n`
    + `Colours: only two — ${accent} and a dark neutral. Nothing else.\n`
    + `Background: plain pure white, completely uniform.\n`
    + `Do not add: text, letters, numbers, words, monograms, gradients, shadows, bevels, 3D, reflections, photorealism, mascots, or a second competing symbol.`
}

/**
 * ⚠ LE PROMPT DE L'UTILISATEUR EST ENVOYÉ TEL QUEL. Les briefs photo maison
 * (packshot studio, direction artistique, listes d'interdits) ont été retirés :
 * ils dénaturaient la demande — « une illustration d'ambiance dans un atelier »
 * finissait en packshot sur fond gris.
 *
 * Deux seuls ajustements, tous deux demandés explicitement :
 *  1. mention du MOTEUR retirée — « via Nano Banana 2 » se retrouvait DESSINÉ
 *     dans l'image (lettrage « NANO BANANA 2 » et banane jaune au centre) ;
 *  2. consigne « décor sans aucun texte » ajoutée — le visuel est un FOND sur
 *     lequel la maquette pose ensuite ses propres titres, logo et bandeaux ;
 *     sans elle, le modèle dessine une couverture complète et les deux
 *     typographies se superposent.
 */
const ENGINE_MENTION_RE = /\b(?:via|avec|using|with)\s+(?:nano\s*bananas?(?:\s*(?:2|pro))?|imagen|midjourney|dall[·.\s-]?e\s*\d*|firefly|stable\s*diffusion|flux)\b\s*(?:et|and)?\s*/gi

/** Le prompt réclame-t-il lui-même du lettrage dans l'image ? */
const WANTS_TEXT_RE = /\b(?:textes?|lettrages?|titres?|typographies?|slogans?|mots?|inscriptions?|écritures?|text|lettering|headline|typography)\b/i

function coverBackdropPrompt(prompt: string): string {
  const cleaned = prompt.replace(ENGINE_MENTION_RE, '').replace(/\s{2,}/g, ' ').trim()
  // PRIORITÉ AU PROMPT DE L'UTILISATEUR : la consigne « sans texte » est placée
  // en dernier, donc en position de force face au modèle. Si la demande réclame
  // elle-même du lettrage, on ne l'ajoute PAS — sinon on écraserait la demande.
  if (WANTS_TEXT_RE.test(cleaned)) return cleaned
  // ⚠ NE PAS interdire TOUT texte : dans un commerce, la signalétique, les
  // emballages et les marques FONT la scène. Les bannir donnait un magasin
  // stérilisé — rayons anonymes, cartons nus, ambiance irréelle. On ne bannit
  // donc que le LETTRAGE DE COUVERTURE superposé, celui qui entrerait en
  // concurrence avec la typographie de la maquette.
  return `${cleaned}\n\n`
    + `IMPORTANT — produis la PHOTO SEULE, pas une couverture déjà composée. `
    + `N'ajoute par-dessus l'image AUCUN titre, AUCUN gros lettrage, AUCUN bandeau ou cartouche de texte, AUCUN slogan, AUCUN filigrane, AUCUN logo plaqué en surimpression : les titres du catalogue seront posés ensuite par la mise en page. `
    + `En revanche, tout ce qui appartient NATURELLEMENT à la scène doit rester présent et crédible — signalétique de rayon, panneaux du magasin, emballages, étiquettes, marques sur les produits : c'est ce qui rend le lieu vivant et réaliste.`
}

/** Cibles d'un visuel de catalogue : couverture, 4e, ou LOGO de marque. */
export type CoverTarget = 'cover' | 'back' | 'logo'


/** Détoure l'emblème (rembg → PNG alpha recadré au sujet). Échec = image intacte. */
async function cutout(blob: Blob, mimeType: string): Promise<{ blob: Blob; mimeType: string }> {
  const src = URL.createObjectURL(blob)
  try {
    const { url } = await removeBackground(src)
    const png = await (await fetch(url)).blob()
    URL.revokeObjectURL(url)
    return { blob: png, mimeType: 'image/png' }
  } catch (e) {
    // Repli VISIBLE : un carré blanc autour du logo doit s'expliquer, sinon il
    // se confond avec « la fonctionnalité n'est pas déployée ».
    console.warn('[catalogue] détourage de l’emblème indisponible, fond conservé :', e)
    toast.warning(t('tst.cat.logoCutoutFailed'), { description: t('tst.cat.logoCutoutFailedDesc') })
    return { blob, mimeType }
  } finally {
    URL.revokeObjectURL(src)
  }
}

export function useCoverImage() {
  const [generating, setGenerating] = useState(false)

  /** Range un blob dans le bucket à CORS ouvert et renvoie son URL publique. */
  const uploadToCovers = async (uid: string, blob: Blob, mimeType: string, target: CoverTarget): Promise<string> => {
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/svg+xml' ? 'svg' : 'jpg'
    const fileRef = storageRef(storage, `users/${uid}/catalogCovers/${Date.now()}_${target}.${ext}`)
    await uploadBytes(fileRef, blob, { contentType: mimeType })
    return getDownloadURL(fileRef)
  }

  const apply = (target: CoverTarget, url: string) => {
    const s = useCatalogStore.getState()
    if (target === 'cover') s.setCoverImageUrl(url)
    else if (target === 'back') s.setBackCoverImageUrl(url)
    else s.setLogoUrl(url)
  }

  const generateCover = async (prompt: string, target: CoverTarget) => {
    if (!prompt.trim()) { toast.error(t('tst.cat.promptRequired')); return }
    const uid = getWorkspaceUid()
    if (!uid) { toast.error(t('tst.cat.visualSignIn')); return }
    setGenerating(true)
    try {
      const s = useCatalogStore.getState()
      // Un logo est CARRÉ (emblème), pas au format de la page.
      const { w, h } = target === 'logo' ? { w: 512, h: 512 } : pagePx(s.format)
      // Couverture et logo partent à l'IMPRESSION et ne sont générés qu'une
      // fois : on demande explicitement « Nano Banana 2 » (Gemini 3 Pro Image)
      // en tête de cascade. La cascade par défaut attaquait le modèle FLASH.
      const { mimeType, base64 } = await generateImageBase64({
        prompt: target === 'logo' ? prompt : coverBackdropPrompt(prompt),
        targetWidth: w, targetHeight: h, models: NANO_BANANA_PRO_MODELS,
      })
      // L'EMBLÈME est détouré : Nano Banana ne sait pas produire d'alpha, et son
      // fond blanc formait un cartouche disgracieux sur les bandeaux colorés.
      // Échec du détourage → on garde l'image pleine (jamais de blocage).
      const shaped = target === 'logo'
        ? await cutout(base64ToBlob(base64, mimeType), mimeType)
        : { blob: base64ToBlob(base64, mimeType), mimeType }
      apply(target, await uploadToCovers(uid, shaped.blob, shaped.mimeType, target))
      toast.success(t(target === 'logo' ? 'tst.cat.logoGenerated' : 'tst.cat.coverGenerated'))
    } catch (e) {
      toast.error(t('tst.cat.visualFailed', {
        fallback: t(target === 'logo' ? 'tst.cat.visualFailedLogo' : 'tst.cat.visualFailedCover'),
        message: e instanceof Error ? e.message : t('tst.cat.genericError'),
      }))
    } finally {
      setGenerating(false)
    }
  }

  /** Visuel FOURNI par l'utilisateur (son vrai logo) — même bucket, donc même
   *  garantie CORS à l'export que les visuels générés. */
  const uploadImage = async (file: File, target: CoverTarget) => {
    const uid = getWorkspaceUid()
    if (!uid) { toast.error(t('tst.cat.signInToLoad')); return }
    setGenerating(true)
    try {
      apply(target, await uploadToCovers(uid, file, file.type || 'image/png', target))
      toast.success(t('tst.cat.visualLoaded'))
    } catch (e) {
      toast.error(t('tst.cat.loadFailed', { message: e instanceof Error ? e.message : t('tst.cat.genericError') }))
    } finally {
      setGenerating(false)
    }
  }

  return { generating, generateCover, uploadImage }
}
