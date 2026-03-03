'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/shared/auth/AuthContext'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { AthleteHome } from './AthleteHome'

export default function HomePage() {
  const { role, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (role === 'COACH') router.replace('/templates')
  }, [role, router])

  if (loading || role === 'COACH') {
    return (
      <div className="p-6">
        <SkeletonList rows={4} />
      </div>
    )
  }

  if (role === 'ATHLETE') return <AthleteHome />
  return null
}
