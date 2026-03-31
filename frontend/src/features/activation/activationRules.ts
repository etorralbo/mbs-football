export type ActivationInput = {
  role: "COACH" | "ATHLETE"
  hasMembership: boolean
  templatesCount: number
  sessionsCount: number
  hasCompletedSession: boolean
}

export type ActivationStep = {
  key: string
  label: string
  completed: boolean
  href: string
}

export type ActivationResult = {
  steps: ActivationStep[]
  nextAction: ActivationStep | null
  /** True only when every step is completed and real data exists (template + session). */
  allComplete: boolean
}

export function computeActivation(input: ActivationInput): ActivationResult {
  if (input.role === "COACH") {
    const steps: ActivationStep[] = [
      {
        key: "create_team",
        label: "Create your team",
        completed: input.hasMembership,
        href: "/onboarding",
      },
      {
        key: "create_template",
        label: "Create first template",
        completed: input.templatesCount > 0,
        href: "/templates",
      },
      {
        key: "assign_session",
        label: "Assign first session",
        completed: input.sessionsCount > 0,
        href: "/sessions",
      },
    ]

    const next = steps.find((s) => !s.completed) ?? null
    // "done" requires real data: at least one template AND at least one session.
    const allComplete = next === null && input.templatesCount > 0 && input.sessionsCount > 0

    return { steps, nextAction: next, allComplete }
  }

  if (input.role === "ATHLETE") {
    const steps: ActivationStep[] = [
      {
        key: "join_team",
        label: "Join your team",
        completed: input.hasMembership,
        href: "/onboarding",
      },
      {
        key: "view_session",
        label: "Open assigned session",
        completed: input.sessionsCount > 0,
        href: "/sessions",
      },
      {
        key: "complete_session",
        label: "Complete first session",
        completed: input.hasCompletedSession,
        href: "/sessions",
      },
    ]

    const next = steps.find((s) => !s.completed) ?? null
    const allComplete = next === null && input.hasCompletedSession

    return { steps, nextAction: next, allComplete }
  }

  return { steps: [], nextAction: null, allComplete: false }
}
