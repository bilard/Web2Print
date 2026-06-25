import { doc, setDoc, collection, query, where, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'
import { generatePluginToken, sha256Hex } from './pluginTokenCrypto'

const COLLECTION = 'pluginTokens'

export interface PluginToken {
  id: string
  label: string
  createdAt: Date | null
  lastUsedAt: Date | null
  revoked: boolean
}

export function usePluginTokens() {
  /** Crée un token, persiste son hash (= doc-id) et renvoie le token EN CLAIR. */
  const createToken = async (label: string): Promise<string | null> => {
    const user = auth.currentUser
    if (!user) return null
    const token = generatePluginToken()
    const id = await sha256Hex(token)
    await setDoc(doc(db, COLLECTION, id), {
      uid: user.uid,
      label: label.trim() || 'Plugin InDesign',
      createdAt: serverTimestamp(),
      lastUsedAt: null,
      revoked: false,
    })
    return token
  }

  const listTokens = async (): Promise<PluginToken[]> => {
    const user = auth.currentUser
    if (!user) return []
    const snap = await getDocs(query(collection(db, COLLECTION), where('uid', '==', user.uid)))
    return snap.docs
      .map((d) => {
        const x = d.data()
        return {
          id: d.id,
          label: x.label ?? '',
          createdAt: x.createdAt?.toDate?.() ?? null,
          lastUsedAt: x.lastUsedAt?.toDate?.() ?? null,
          revoked: x.revoked === true,
        }
      })
      .filter((t) => !t.revoked) // les KEYs supprimées (legacy soft-revoked) n'apparaissent plus
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
  }

  /** Supprime définitivement une KEY (le doc disparaît → token plus résoluble côté serveur). */
  const deleteToken = async (id: string): Promise<void> => {
    const user = auth.currentUser
    if (!user) return
    await deleteDoc(doc(db, COLLECTION, id))
  }

  return { createToken, listTokens, deleteToken }
}
