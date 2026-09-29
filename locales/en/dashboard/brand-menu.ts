import type { BrandMenuCopy } from '@/locales/es/dashboard/brand-menu';

const en: BrandMenuCopy = {
  switchBrand: (name: string) => `Switch brand (current: ${name})`,
  noBrand: 'No brand',
  brandsLabel: 'Your brands',
  newBrand: 'New brand',
  nameLabel: 'Brand name',
  namePlaceholder: 'Brand name',
  create: 'Create',
  creating: 'Creating…',
  cancel: 'Cancel',
  planLimit: "You've reached your plan's brand limit.",
  upgrade: 'Upgrade plan',
  createError: 'Could not create the brand. Please try again.',
};

export default en;
