import type { TeamCopy } from '@/locales/es/dashboard/team';

const en: TeamCopy = {
  seats: (used: number, limit: number) => `${used} of ${limit} ${limit === 1 ? 'seat used' : 'seats used'}`,
  membersLabel: 'Team members',
  you: 'you',
  roleMember: 'Member',
  roleAdmin: 'Admin',
  roleOwner: 'Owner',
  // Invite
  inviteTitle: 'Invite someone',
  emailLabel: 'Email address',
  emailPlaceholder: 'email@example.com',
  roleLabel: 'Role',
  invite: 'Invite',
  inviting: 'Sending…',
  invited: (email: string) => `Invitation sent to ${email}.`,
  sentNoEmail: 'Invitation created, but the email could not be sent. Resend it later.',
  inviteError: 'Could not send the invitation. Please try again.',
  invalidEmail: 'Enter a valid email address.',
  alreadyMember: 'That person is already on your team.',
  planFull: 'Your plan has no room for more members. Upgrade to invite someone else.',
  seePlans: 'See plans',
  onlyManagers: 'Only the owner or an admin can manage the team.',
  // Pending
  pending: 'Pending invitations',
  emptyPending: 'No pending invitations.',
  expired: 'expired',
  revoke: 'Revoke',
  revokeAria: (email: string) => `Revoke the invitation to ${email}`,
  revokeError: 'Could not revoke the invitation. Please try again.',
  // Remove
  remove: 'Remove',
  removeAria: (name: string) => `Remove ${name} from the team`,
  confirmRemove: (name: string) => `Remove ${name} from the team?`,
  confirmRemoveBody: 'They will lose access to the organization right away. You can invite them again later.',
  cancel: 'Cancel',
  removeError: 'Could not remove the member. Please try again.',
  removeOnlyOwner: 'Only the owner can remove an admin.',
  // Loading
  loading: 'Loading team…',
  loadError: "We couldn't load the team.",
  retry: 'Retry',
};

export default en;
