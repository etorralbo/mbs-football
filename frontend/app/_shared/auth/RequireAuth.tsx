'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/app/_shared/auth/supabaseClient'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    // Check existing session on mount.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthorized(true)
      } else {
        // Preserve invite URLs so the user lands back on the join page after auth.
        const next = encodeURIComponent(pathname)
        router.replace(`/login?next=${next}`)
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
  }, [router, pathname])

  if (!authorized) return null

  return <>{children}</>
}
