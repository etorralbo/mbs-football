export type PostActionEvent =
  | 'team_created'
  | 'invite_accepted'
  | 'template_created_ai'

export type Role = 'COACH' | 'ATHLETE'

/**
 * Returns the client-side route to navigate to after a P0 product action.
 * Returns null when the caller should stay on the current page.
 */
export function getPostActionRedirect(
  event: PostActionEvent,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _: Role,
): string | null {
  switch (event) {
    case 'team_created':
      // Coach just created a team — guide them to invite athletes
      return '/team'
    case 'invite_accepted':
      // Athlete just joined — guide them to the home dashboard
      return '/home'
    case 'template_created_ai':
      // Stay on the template detail page; banner guides the next step
      return null
    default:
      return '/templates'
  }
}
