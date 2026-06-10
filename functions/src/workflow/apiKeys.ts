// functions/src/workflow/apiKeys.ts
import { getFirestore } from 'firebase-admin/firestore'

export async function getUserApiKey(uid: string, keyId: string): Promise<string> {
  const snap = await getFirestore().doc(`users/${uid}`).get()
  const overrides = (snap.data()?.apiKeys?.overrides ?? {}) as Record<string, string>
  return overrides[keyId] ?? ''
}
