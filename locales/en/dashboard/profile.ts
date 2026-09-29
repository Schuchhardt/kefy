import type { ProfileCopy } from '@/locales/es/dashboard/profile';

const en: ProfileCopy = {
  dateLocale: 'en-US',
  title: 'My profile',
  subtitle: 'Your personal information and password',
  sectionInfo: 'Personal information',
  sectionPassword: 'Password',
  sectionOrg: 'Organization',
  nameLabel: 'Name',
  namePlaceholder: 'Your name',
  emailLabel: 'Email address',
  emailNote: 'Your email cannot be changed.',
  joined: (date: string) => `Member since ${date}`,
  saveProfile: 'Save changes',
  saved: 'Changes saved',
  saveError: 'Could not save your changes. Please try again.',
  // Password
  currentPassword: 'Current password',
  newPassword: 'New password',
  newPasswordHint: 'At least 8 characters.',
  confirmPassword: 'Confirm new password',
  changePassword: 'Change password',
  passwordChanged: 'Password updated',
  passwordMismatch: 'Passwords do not match.',
  passwordWrong: 'Your current password is not correct.',
  passwordError: 'Could not change your password. Please try again.',
  // Organization
  orgLabel: 'Organization',
  roleLabel: 'Your role',
  planLabel: 'Plan',
  orgManage: 'Manage in Settings',
  roles: { owner: 'Owner', admin: 'Admin', member: 'Member' },
};

export default en;
