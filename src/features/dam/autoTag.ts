// Tagging IA automatique des assets DAM : appelle la callable damAnalyzeImage
// (Gemini, déjà utilisée par l'onglet « Analyse IA » de la lightbox) puis
// persiste tags + couleur dominante + description sur le doc dam_assets.
// Best-effort : un échec d'analyse ne doit jamais faire échouer la sauvegarde.
import { httpsCallable } from 'firebase/functions'
import { doc, updateDoc } from 'firebase/firestore'
import { db, functions } from '@/lib/firebase/config'

interface AnalysisResult {
  subject?: string
  description?: string
  labels?: string[]
  colors?: string[]
  objects?: string[]
  tags?: string[]
}

const analyzeImageFn = httpsCallable<{ imageUrl: string }, AnalysisResult>(functions, 'damAnalyzeImage')

/**
 * Analyse l'image et enrichit le doc dam_assets (tags = union tags+labels+objects
 * dédupliquée, ≤ 20 ; couleur dominante ; description si absente). Fire-and-forget.
 */
export async function autoTagAsset(assetId: string, imageUrl: string): Promise<void> {
  try {
    const { data } = await analyzeImageFn({ imageUrl })
    const tags = [...new Set([...(data.tags ?? []), ...(data.labels ?? []), ...(data.objects ?? [])]
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean))].slice(0, 20)
    if (tags.length === 0) return
    const patch: Record<string, unknown> = { tags }
    if (data.colors?.[0]) patch.color = data.colors[0]
    if (data.subject) patch.aiSubject = data.subject
    await updateDoc(doc(db, 'dam_assets', assetId), patch)
  } catch (err) {
    console.warn('[autoTagAsset] analyse échouée (non bloquant):', err)
  }
}
