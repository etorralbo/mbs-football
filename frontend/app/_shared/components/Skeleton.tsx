export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/8 ${className}`} />
}

export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-white/8 bg-[#131922] p-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-2 h-3 w-2/3" />
    </div>
  )
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
