import { Skeleton } from '@/app/_shared/components/Skeleton'

/** Skeleton that mimics TodaySessionCard + recent list on /athlete */
function HomeLoading() {
  return (
    <div>
      {/* TodaySessionCard skeleton */}
      <div className="mt-6 rounded-xl border border-white/8 bg-[#131922] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-36" />
          </div>
          <Skeleton className="h-12 w-12 rounded-full" />
        </div>
        <Skeleton className="mt-6 h-11 w-full rounded-lg" />
      </div>

      {/* Recent section skeleton */}
      <div className="mt-8">
        <Skeleton className="h-3 w-16" />
        <div className="mt-3 space-y-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-white/8 bg-[#131922] px-4 py-3"
            >
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Skeleton that mimics SessionOverview on /athlete/session/[id] */
function SessionLoading() {
  return (
    <div>
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3 w-32" />
      </div>

      {/* Blocks */}
      <div className="mt-6 space-y-6">
        {[0, 1].map((block) => (
          <div key={block}>
            <Skeleton className="h-3 w-36" />
            <div className="mt-2 space-y-2">
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="flex items-center gap-3 rounded-lg border border-white/8 bg-[#131922] px-4 py-3"
                >
                  <Skeleton className="h-6 w-6 flex-shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-2.5 w-28" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <Skeleton className="mt-8 h-11 w-full rounded-lg" />
    </div>
  )
}

interface Props {
  variant: 'home' | 'session'
}

export function AthleteLoading({ variant }: Props) {
  return (
    <div aria-busy="true" aria-label="Loading…">
      <span className="sr-only">Loading…</span>
      {variant === 'home' ? <HomeLoading /> : <SessionLoading />}
    </div>
  )
}
