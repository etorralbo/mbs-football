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

    return { steps, nextAction: next }
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

    return { steps, nextAction: next }
  }

  return { steps: [], nextAction: null }
}
