'use client'

import { useAuth } from '@/src/shared/auth/AuthContext'
import { SkeletonList } from '@/app/_shared/components/Skeleton'
import { CoachHome } from './CoachHome'
import { AthleteHome } from './AthleteHome'

export default function HomePage() {
  const { role, loading } = useAuth()

  if (loading) {
    return (
      <div className="p-6">
        <SkeletonList rows={4} />
      </div>
    )
  }

  if (role === 'COACH') return <CoachHome />
  if (role === 'ATHLETE') return <AthleteHome />
  return null
}
