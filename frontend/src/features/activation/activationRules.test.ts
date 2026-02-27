import { describe, it, expect } from "vitest"
import { computeActivation, type ActivationInput } from "./activationRules"

// Fully-activated base (all steps done) — each test overrides only what it needs.
const coachBase: ActivationInput = {
  role: "COACH",
  hasMembership: true,
  templatesCount: 1,
  sessionsCount: 1,
  hasCompletedSession: false,
}

const athleteBase: ActivationInput = {
  role: "ATHLETE",
  hasMembership: true,
  templatesCount: 0,
  sessionsCount: 1,
  hasCompletedSession: true,
}

describe("computeActivation — COACH", () => {
  it("returns create_team as nextAction when coach has no membership", () => {
    const result = computeActivation({
      ...coachBase,
      hasMembership: false,
      templatesCount: 0,
      sessionsCount: 0,
    })

    expect(result.steps).toHaveLength(3)
    expect(result.nextAction?.key).toBe("create_team")
    expect(result.steps[0].completed).toBe(false)
    expect(result.steps[1].completed).toBe(false)
    expect(result.steps[2].completed).toBe(false)
  })

  it("returns create_template as nextAction when coach has membership but no templates", () => {
    const result = computeActivation({
      ...coachBase,
      hasMembership: true,
      templatesCount: 0,
      sessionsCount: 0,
    })

    expect(result.nextAction?.key).toBe("create_template")
    expect(result.steps[0].completed).toBe(true)
    expect(result.steps[1].completed).toBe(false)
    expect(result.steps[2].completed).toBe(false)
  })

  it("returns assign_session as nextAction when coach has templates but no sessions", () => {
    const result = computeActivation({
      ...coachBase,
      hasMembership: true,
      templatesCount: 1,
      sessionsCount: 0,
    })

    expect(result.nextAction?.key).toBe("assign_session")
    expect(result.steps[0].completed).toBe(true)
    expect(result.steps[1].completed).toBe(true)
    expect(result.steps[2].completed).toBe(false)
  })

  it("returns null nextAction when all coach steps are complete", () => {
    const result = computeActivation(coachBase)

    expect(result.nextAction).toBeNull()
    expect(result.steps.every((s) => s.completed)).toBe(true)
  })
})

describe("computeActivation — ATHLETE", () => {
  it("returns join_team as nextAction when athlete has no membership", () => {
    const result = computeActivation({
      ...athleteBase,
      hasMembership: false,
      sessionsCount: 0,
      hasCompletedSession: false,
    })

    expect(result.steps).toHaveLength(3)
    expect(result.nextAction?.key).toBe("join_team")
    expect(result.steps[0].completed).toBe(false)
    expect(result.steps[1].completed).toBe(false)
    expect(result.steps[2].completed).toBe(false)
  })

  it("returns view_session as nextAction when athlete has membership but no sessions", () => {
    const result = computeActivation({
      ...athleteBase,
      hasMembership: true,
      sessionsCount: 0,
      hasCompletedSession: false,
    })

    expect(result.nextAction?.key).toBe("view_session")
    expect(result.steps[0].completed).toBe(true)
    expect(result.steps[1].completed).toBe(false)
    expect(result.steps[2].completed).toBe(false)
  })

  it("returns null nextAction when athlete has completed a session", () => {
    const result = computeActivation(athleteBase)

    expect(result.nextAction).toBeNull()
    expect(result.steps.every((s) => s.completed)).toBe(true)
  })
})
