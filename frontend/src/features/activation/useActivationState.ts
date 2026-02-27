'use client'

import { useState, useEffect } from 'react'
import { request } from '@/app/_shared/api/httpClient'
import type { MeResponse, WorkoutTemplate, WorkoutSessionSummary } from '@/app/_shared/api/types'
import { computeActivation } from './activationRules'
import type { ActivationStep } from './activationRules'

export type ActivationState = {
  isLoading: boolean
  error: Error | null
  role: 'COACH' | 'ATHLETE' | null
  steps: ActivationStep[]
  nextAction: ActivationStep | null
}

export function useActivationState(): ActivationState {
  const [state, setState] = useState<ActivationState>({
    isLoading: true,
    error: null,
    role: null,
    steps: [],
    nextAction: null,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      // All three fetches fire in parallel; templates/sessions degrade gracefully.
      const [meResult, templatesResult, sessionsResult] = await Promise.allSettled([
        request<MeResponse>('/v1/me'),
        request<WorkoutTemplate[]>('/v1/workout-templates'),
        request<WorkoutSessionSummary[]>('/v1/workout-sessions'),
      ])

      if (cancelled) return

      // /v1/me is required — surface the error and stop.
      if (meResult.status === 'rejected') {
        setState({
          isLoading: false,
          error:
            meResult.reason instanceof Error
              ? meResult.reason
              : new Error('Failed to load profile'),
          role: null,
          steps: [],
          nextAction: null,
        })
        return
      }

      // Templates / sessions: fall back to empty arrays on failure.
      const me = meResult.value
      const templates = templatesResult.status === 'fulfilled' ? templatesResult.value : []
      const sessions = sessionsResult.status === 'fulfilled' ? sessionsResult.value : []

      // Derive the active role from the membership linked to active_team_id,
      // falling back to the first membership for users with a single team.
      const activeMembership = me.active_team_id
        ? me.memberships.find((m) => m.team_id === me.active_team_id)
        : (me.memberships[0] ?? null)

      const role = activeMembership?.role ?? null
      const hasMembership = me.memberships.length > 0

      // No role means the user hasn't completed onboarding yet.
      if (!role) {
        setState({ isLoading: false, error: null, role: null, steps: [], nextAction: null })
        return
      }

      const { steps, nextAction } = computeActivation({
        role,
        hasMembership,
        templatesCount: templates.length,
        sessionsCount: sessions.length,
        hasCompletedSession: sessions.some((s) => s.completed_at !== null),
      })

      setState({ isLoading: false, error: null, role, steps, nextAction })
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
