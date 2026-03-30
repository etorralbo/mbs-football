// ---------------------------------------------------------------------------
// Onboarding / Membership / Invites (Sprint 5)
// ---------------------------------------------------------------------------

export interface MembershipItem {
  team_id: string
  team_name: string
  role: 'COACH' | 'ATHLETE'
  is_owner: boolean
}

export interface MeResponse {
  user_id: string
  memberships: MembershipItem[]
  active_team_id: string | null
}

export interface CreateTeamResponse {
  team_id: string
  membership_id: string
  role: string
}

export interface CreateInviteResponse {
  token: string
  join_url: string
  team_id: string
  expires_at: string | null
}

export interface AcceptInviteResponse {
  status: 'joined' | 'already_member' | 'not_eligible'
  team_id: string
  team_name: string
}

export interface InvitePreviewResponse {
  team_name: string
  coach_name: string
  role: string
  email: string | null
  expires_at: string | null
}

// ---------------------------------------------------------------------------
// Workout Templates
// ---------------------------------------------------------------------------

export interface WorkoutTemplate {
  id: string
  team_id: string
  title: string
  description: string | null
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
}

export interface ExerciseVideo {
  provider: 'YOUTUBE'
  /** Canonical YouTube watch URL: https://www.youtube.com/watch?v={external_id} */
  url: string
  /** 11-character YouTube video ID. Derive embed URLs from this — never from raw user input. */
  external_id: string
}

export interface Exercise {
  id: string
  /** Null for company (official) exercises. */
  coach_id: string | null
  owner_type: 'COMPANY' | 'COACH'
  /** False for company exercises — they cannot be edited or deleted. */
  is_editable: boolean
  name: string
  description: string
  /** Categorisation tags, e.g. ["strength", "lower-body"]. */
  tags: string[]
  /** True if the requesting coach has bookmarked this exercise. */
  is_favorite: boolean
  /** Attached YouTube video, or null if none. */
  video: ExerciseVideo | null
  /** Legacy internal media asset ID — kept for backward compatibility. */
  video_asset_id: string | null
  created_at: string
  updated_at: string
}

export interface SetPrescription {
  order:  number
  reps:   number | null
  weight: number | null
  rpe:    number | null
}

export interface BlockItem {
  id: string
  workout_block_id: string
  order: number
  sets: SetPrescription[]
  exercise: Exercise
}

export interface WorkoutBlock {
  id: string
  workout_template_id: string
  order: number
  name: string
  notes: string | null
  items: BlockItem[]
}

export interface WorkoutTemplateDetail extends WorkoutTemplate {
  blocks: WorkoutBlock[]
  /** Server-derived: true iff the template has ≥1 block with ≥1 exercise. */
  is_ready: boolean
}

// ---------------------------------------------------------------------------
// AI Draft
// ---------------------------------------------------------------------------

export interface SuggestedExercise {
  exercise_id: string
  score: number
  reason: string
}

export interface AiDraftBlock {
  name: string
  notes: string
  suggested_exercises: SuggestedExercise[]
}

export interface AiDraftResponse {
  title: string
  blocks: AiDraftBlock[]
  source?: 'ai' | 'fallback'
}

// ---------------------------------------------------------------------------
// Workout Sessions
// ---------------------------------------------------------------------------

export const BLOCK_NAMES = [
  'Preparation to Movement',
  'Plyometrics',
  'Primary Strength',
  'Secondary Strength',
  'Auxiliary Strength',
  'Recovery',
] as const

export type BlockName = (typeof BLOCK_NAMES)[number]

/** Shape returned by GET /v1/workout-sessions (list) */
export interface WorkoutSessionSummary {
  id: string
  assignment_id: string
  athlete_id: string
  workout_template_id: string
  template_title: string
  athlete_name: string
  scheduled_for: string | null
  completed_at: string | null
  cancelled_at: string | null
  exercise_count: number
  exercises_logged_count: number
}

export interface SessionLogEntry {
  set_number: number
  reps: number | null
  weight: number | null
  rpe: number | null
}

export interface SessionLog {
  log_id: string
  block_name: string
  exercise_id: string
  notes: string | null
  entries: SessionLogEntry[]
}

/** Shape returned by GET /v1/workout-sessions/{id} */
export interface WorkoutSessionDetail {
  id: string
  status: string  // "pending" | "completed"
  workout_template_id: string
  template_title: string
  athlete_profile_id: string
  scheduled_for: string | null
  logs: SessionLog[]
}

// ---------------------------------------------------------------------------
// Builder API — block created/returned without items
// (POST /v1/workout-templates/{id}/blocks, PATCH /v1/blocks/{id})
// ---------------------------------------------------------------------------

export interface WorkoutBlockSummary {
  id: string
  workout_template_id: string
  order: number
  name: string
  notes: string | null
}

// ---------------------------------------------------------------------------
// Save from AI (POST /v1/workout-templates/from-ai)
// ---------------------------------------------------------------------------

export interface SaveFromAiItem {
  exercise_id: string
  order: number
}

export interface SaveFromAiBlock {
  name: string
  notes: string | null
  items: SaveFromAiItem[]
}

export interface SaveFromAiRequest {
  title: string
  blocks: SaveFromAiBlock[]
}

// ---------------------------------------------------------------------------
// Session Execution view (GET /v1/workout-sessions/{id}/execution)
// ---------------------------------------------------------------------------

export interface ExecutionSetLog {
  set_number: number   // 1-based: first set = 1
  reps: number | null
  weight: number | null
  rpe: number | null
  done: boolean
}

export interface ExecutionItem {
  exercise_id: string
  exercise_name: string
  prescription: Record<string, unknown>
  logs: ExecutionSetLog[]
  video?: ExerciseVideo | null
}

export interface SessionExecutionBlock {
  name: string
  key: string          // slugified, e.g. "PRIMARY_STRENGTH"
  order: number
  items: ExecutionItem[]
}

export interface SessionExecution {
  session_id: string
  status: 'pending' | 'completed'
  workout_template_id: string
  template_title: string
  athlete_profile_id: string
  scheduled_for: string | null
  blocks: SessionExecutionBlock[]
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface FunnelResponse {
  team_created: number
  invite_created: number
  invite_accepted: number
  template_created_ai: number
  assignment_created: number
  session_first_log_added: number
  session_completed: number
}
