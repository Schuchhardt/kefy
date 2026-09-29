import type { SocialCopy } from '@/locales/es/dashboard/social';

const en: SocialCopy = {
  dateLocale: 'en-US',
  connectError: 'Could not connect the account. Please try again.',
  connectedOk: (network: string) => `${network} connected successfully`,
  connected: 'Connected',
  connectNew: 'Connect new',
  connectAria: (network: string) => `Connect ${network}`,
  connectAgainAria: (network: string) => `Connect another ${network} account`,
  redirecting: 'Redirecting…',
  disconnect: 'Disconnect',
  disconnectAria: (account: string, network: string) => `Disconnect ${account} (${network})`,
  confirmDisconnectTitle: (account: string) => `Disconnect ${account}?`,
  confirmDisconnectBody: 'Autopilot rules that use it will stop working. You can connect it again whenever you want.',
  confirmDisconnect: 'Yes, disconnect',
  cancel: 'Cancel',
  disconnectError: 'Could not disconnect the account. Please try again.',
  disconnectForbidden: 'Only the owner or an admin can disconnect accounts.',
  expires: (date: string) => `expires ${date}`,
  accountStatus: {
    active: 'Active',
    expired: 'Expired',
    revoked: 'Revoked',
  },
  connectTitle: 'Connect your social networks',
  connectDesc: 'Connect at least one account to start publishing from Kefy.',
  ctaTitle: 'Great, now create your first content',
  ctaDesc: 'Your social account is connected and ready to publish.',
  ctaButton: 'Create first content',
  xSensitiveHint: 'If your images show up on X behind a sensitive-content warning, untick “Mark media you post as having material that may be sensitive” in X → Settings and privacy → Privacy and safety → Your posts. It’s a setting on your X account; Kefy can’t override it when publishing.',
  xSensitiveLink: 'Open X settings',
  autoConnecting: (network: string) => `Connecting ${network}…`,
  autoConnectUnknownPlatform: 'The connection link points to a network Kefy doesn’t support. Pick one from the list.',
  autoConnectBrandNotFound: 'The link’s brand isn’t one of your brands, so no account was connected.',
  autoConnectBrandSwitchError: 'Couldn’t switch to the link’s brand. Please try again.',
};

export default en;
