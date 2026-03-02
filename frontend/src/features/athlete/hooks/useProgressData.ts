import { useEffect, useState } from 'react'
import { request } from '@/app/_shared/api/httpClient'
import type { SessionExecution, WorkoutSessionSummary } from '@/app/_shared/api/types'

// One data point per completed session for a specific exercise.
export interface ProgressPoint {
  date: string           // ISO date string (completed_at)
  label: string          // human-readable date label e.g. "Jun 10"
  maxLoad: number | null // max weight across all sets in that session
  avgRpe: number | null  // average RPE across logged sets
  totalSets: number
}

export interface ExerciseSeries {
  exerciseId: string
  exerciseName: string
  points: ProgressPoint[]  // sorted oldest → newest
}

export type ProgressState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ok'; series: ExerciseSeries[] }

const MAX_SESSIONS = 10  // keep request count bounded

function formatLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function useProgressData(): ProgressState {
  const [state, setState] = useState<ProgressState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // 1. Fetch all sessions, keep only completed ones, most recent first.
        const all = await request<WorkoutSessionSummary[]>('/v1/workout-sessions')
        const completed = all
          .filter((s) => s.completed_at)
          .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())
          .slice(0, MAX_SESSIONS)

        if (completed.length === 0) {
          if (!cancelled) setState({ status: 'empty' })
          return
        }

        // 2. Fetch the execution view for each session in parallel.
        //    Using /execution because it includes exercise_name alongside logs.
        const executions = await Promise.all(
          completed.map((s) =>
            request<SessionExecution>(`/v1/workout-sessions/${s.id}/execution`),
          ),
        )

        if (cancelled) return

        // 3. Aggregate by exercise across sessions.
        const byExercise = new Map<string, { name: string; points: ProgressPoint[] }>()

        executions.forEach((exec, idx) => {
          const session = completed[idx]
          const dateIso = session.completed_at!

          exec.blocks.forEach((block) => {
            block.items.forEach((item) => {
              const logsWithData = item.logs.filter(
                (l) => l.weight != null || l.rpe != null,
              )
              if (logsWithData.length === 0) return

              const weights = logsWithData
                .map((l) => l.weight)
                .filter((w): w is number => w != null)
              const rpes = logsWithData
                .map((l) => l.rpe)
                .filter((r): r is number => r != null)

              const point: ProgressPoint = {
                date: dateIso,
                label: formatLabel(dateIso),
                maxLoad: weights.length > 0 ? Math.max(...weights) : null,
                avgRpe:
                  rpes.length > 0
                    ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10
                    : null,
                totalSets: logsWithData.length,
              }

              if (!byExercise.has(item.exercise_id)) {
                byExercise.set(item.exercise_id, { name: item.exercise_name, points: [] })
              }
              byExercise.get(item.exercise_id)!.points.push(point)
            })
          })
        })

        if (byExercise.size === 0) {
          if (!cancelled) setState({ status: 'empty' })
          return
        }

        // 4. Sort points oldest → newest, series by most-logged first.
        const series: ExerciseSeries[] = Array.from(byExercise.entries())
          .map(([exerciseId, { name, points }]) => ({
            exerciseId,
            exerciseName: name,
            points: points.sort(
              (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
            ),
          }))
          .sort((a, b) => b.points.length - a.points.length)

        if (!cancelled) setState({ status: 'ok', series })
      } catch {
        if (!cancelled) setState({ status: 'error' })
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return state
}
