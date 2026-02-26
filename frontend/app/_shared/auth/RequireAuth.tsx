'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/app/_shared/auth/supabaseClient'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    // Check existing session on mount.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthorized(true)
      } else {
        router.replace('/login')
      }
    })

    // Redirect on sign-out or token expiry.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAuthorized(false)
        router.replace('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  if (!authorized) return null

  return <>{children}</>
}
