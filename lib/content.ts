// Re-exports — all types come from @/locales/types, data from locale files.
// This file exists for backwards compatibility with existing imports.

export type {
  NavLink,
  FooterItem,
  WaitlistInterest,
  WaitlistCopy,
  HeroStat,
  DemoOutput,
  Pain,
  StatCard,
  Step,
  MultOutput,
  BrandBullet,
  KillerPoint,
  DashStat,
  DashPost,
  ApBullet,
  CalDay,
  FeatureItem,
  FeatureLayer,
  WhoSegment,
  PlanFeature,
  Plan,
  CreditItem,
  CreditPack,
  CmpRow,
  FaqItem,
  Testimonial,
  KefyCopy,
  CommonCopy,
  BlogCopy,
} from '@/locales/types';

import esLanding from '@/locales/es/landing';
import enLanding from '@/locales/en/landing';
import type { KefyCopy } from '@/locales/types';

export const KEFY_COPY: Record<string, KefyCopy> = {
  es: esLanding,
  en: enLanding,
};
