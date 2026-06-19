import type { BrandKit } from '@/types/brand-kit';

export type WizardStepId =
  | 'name' | 'website' | 'mission' | 'industry' | 'language'
  | 'locations' | 'emojis' | 'comm_style' | 'tone' | 'tagline'
  | 'colors' | 'fonts' | 'logo' | 'notes'
  | 'company_size' | 'niche' | 'target_audience' | 'differentiators'
  | 'challenges' | 'competitors';

export interface WizardStep {
  id:             WizardStepId;
  section:        1 | 2;
  field:          keyof BrandKit | null;
  aiField?:       string;
  isArray?:       boolean;
  isTone?:        boolean;
  isColor?:       boolean;
  isFont?:        boolean;
  isBoolean?:     boolean;
  isUrl?:         boolean;
  isLogo?:        boolean;
  isCompanySize?: boolean;
  isSelect?:      boolean;
  selectOptions?: { value: string; label: string }[];
}

export interface BrandKitWizardProps {
  locale:      string;
  orgName?:    string;
  onComplete:  () => void;
}
