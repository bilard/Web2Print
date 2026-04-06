import { useEffect } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

const googleProvider = new GoogleAuthProvider()

export function useAuthInit() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user)
      setLoading(false)
    })
    return unsubscribe
  }, [setUser, setLoading])
}

export function useSignInWithGoogle() {
  return () => signInWithPopup(auth, googleProvider)
}

export function useSignOut() {
  const { setUser } = useAuthStore()
  return async () => {
    await signOut(auth)
    setUser(null)
  }
}
