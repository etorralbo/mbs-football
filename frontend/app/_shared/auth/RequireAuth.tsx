'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/app/_shared/auth/tokenStorage'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    if (getToken()) {
      setAuthorized(true)
    } else {
      router.replace('/login')
    }
  }, [router])

  if (!authorized) return null

  return <>{children}</>
}
