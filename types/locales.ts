// Landing-page copy, blog, dashboard navigation and common app strings
// — types only; data lives in `locales/es/**` and `locales/en/**`.

export interface NavLink {
  id:    string;
  label: string;
  path?: string;
}

export interface FooterItem {
  label: string;
  href:  string;
}

export interface WaitlistInterest {
  value: string;
  label: string;
}

export interface WaitlistCopy {
  title:               string;
  subtitle:            string;
  nameLbl:             string;
  namePlaceholder:     string;
  emailLbl:            string;
  emailPlaceholder:    string;
  interestLbl:         string;
  interestPlaceholder: string;
  interestOptions:     WaitlistInterest[];
  submit:              string;
  submitting:          string;
  successTitle:        string;
  successSub:          string;
  errorGeneric:        string;
  errorDuplicate:      string;
}

export interface HeroStat   { big: string; lbl: string; }
export interface DemoOutput { channel: string; meta: string; body: string; }
export interface DemoMessage { platform: string; from: string; text: string; type: string; pts: number; }
export interface DemoDMMessage { sender: 'user' | 'brand'; text: string; }
export interface Pain { num: string; t: string; d: string; }
export interface StatCard { v: number; pre?: string; suf?: string; d: string; warm?: boolean; }
export interface Step { n: string; ic: string; t: string; d: string; }
export interface MultOutput { k: string; sub: string; }
export interface BrandBullet { ic: string; t: string; }
export interface KillerPoint { k: string; d: string; }
export interface DashStat { lbl: string; v: string; d: string; }
export interface DashPost { ic: string; text: string; eng: string; winner: boolean; boost: string; }
export interface ApBullet { ic: string; t: string; }
export interface CalDay { day: string; items: { ic: string; t: string }[]; }
export interface FeatureItem { ic: string; t: string; d: string; }
export interface FeatureLayer { name: string; badge: string; badgeColor?: string; items: string[]; }
export interface WhoSegment { ic: string; t: string; d: string; }
export interface PlanFeature { dim?: boolean; t: string; }
export interface Plan {
  name:          string;
  price:         string;
  annualPrice?:  string;
  annualBilled?: string;
  per:           string;
  tagline:       string;
  features:      (string | PlanFeature)[];
  cta:           string;
  featured?:     boolean;
  badge?:        string;
  launchPrice?:  string;
}
export interface CreditItem { ic: string; label: string; }
export interface CreditPack { credits: string; price: string; popular?: boolean; }
export interface CmpRow { feature: string; values: string[]; }
export interface FaqItem { q: string; a: string; }
export interface Testimonial { q: string; name: string; role: string; flag: string; avatar: string; }
export interface EngageScoreItem { type: string; pts: string; }
export interface EngageStagePill { key: string; label: string; emoji: string; }

export interface KefyCopy {
  nav: { links: NavLink[]; primary: string; };
  waitlist: WaitlistCopy;
  hero: { tag: string; h1: string[]; h1em: string; sub: string; cta1: string; cta2: string; ctaNote?: string; emailPlaceholder?: string; stats: HeroStat[]; };
  demo: {
    contextLbl: string; contextProduct: string; contextDesc: string;
    channelsLbl: string; goalLbl: string; goalK: string; goalV: string;
    audienceK: string; audienceV: string; url: string;
    outputs: { linkedin: DemoOutput; meta: DemoOutput; x: DemoOutput, facebook: DemoOutput };
    stepLabels: string[];
    strategyLbl: string;
    strategyGoal: string;
    strategyNiche: string;
    postBody: string;
    postPublished: string;
    postScheduleLabel?: string;
    postScheduledFor?: string;
    inboxTitle: string;
    scoreLabel: string;
    inboxMessages: DemoMessage[];
    autoReplyLabel: string;
    autoReplyText: string;
    pipelineLbl: string;
    pipelineStages: string[];
    leadName: string;
    leadScore: string;
    // New rich demo fields
    brandLogoSrc?: string;
    brandProductSrc?: string;
    brandHandle?: string;
    brandAudience?: string;
    brandTone?: string;
    brandCategory?: string;
    marketPills?: string[];
    commentThread?: DemoDMMessage[];
    dmThread?: DemoDMMessage[];
    dmTriggerLabel?: string;
    linkSentLabel?: string;
    linkSentUrl?: string;
    linkSentTime?: string;
    qualifiedLabel?: string;
    commentPostCaption?: string;
    commentLabel?: string;
    dmLabel?: string;
    scoreBarLabel?: string;
    stepDescriptions?: string[];
    creationSteps?: string[];
    creationStepsLong?: string[];
    progressLabel?: string;
    botThoughts?: string[];
    commentBrandReply?: string;
    instagramNow?: string;
    statusGenerating?: string;
    statusAssembling?: string;
    imageGenerating?: string;
    imageReady?: string;
    likesLabel?: string;
  };
  problem: { tag: string; h2: string; intro: string; pains: Pain[]; stats: StatCard[]; result?: string; };
  how: { tag: string; h2: string; intro: string; steps: Step[]; closer: string[]; noNeeds?: string[]; };
  mult: { tag: string; h2: string[]; sub: string; bullets: { ic: string; t: string }[]; inLbl: string; inV: string; outLbl: string; outputs: MultOutput[]; };
  brand: { tag: string; h2: string[]; sub: string; bullets: BrandBullet[]; kit: { palette: string; type: string; logo: string; tone: string; toneV: string; typeV: string }; };
  killer: { tag: string; h2: string[]; sub: string; points: KillerPoint[]; dash: { title: string; range: string; stats: DashStat[]; posts: DashPost[] }; };
  autopilot: { tag: string; h2: string[]; sub: string; bullets: ApBullet[]; closer: string; togglePilot: string; toggleManual: string; schedule: CalDay[]; };
  engage: {
    tag: string; h2: string; sub: string;
    bullets: { ic: string; t: string }[];
    scoringTitle: string; scoringItems: EngageScoreItem[];
    pipelineTitle: string; stages: EngageStagePill[];
  };
  strategy: {
    tag: string; h2: string; sub: string;
    objectives: { slug: string; ic: string; t: string; d: string }[];
    industriesTitle: string;
    industries: { ic: string; t: string }[];
    layersTitle: string;
    layers: { num: string; t: string; items: string[] }[];
    cta: string;
  };
  features: { tag: string; h2: string; items: FeatureItem[]; layers?: FeatureLayer[]; };
  who: { tag: string; h2: string[]; segments: WhoSegment[]; };
  channels: { h3: string[]; sub: string; items: string[]; };
  cmp: { tag: string; h2: string; cols: string[]; rows: (string | string[])[]; partial: string; simpleMode?: boolean; withoutTitle?: string; withoutItems?: string[]; withTitle?: string; withItems?: string[]; };
  lang: { h2: string[]; em: string; sub: string; more: string; };
  pricing: {
    tag: string; h2: string; sub: string;
    billingToggle: { monthly: string; annual: string };
    trialBadge: string; trialSub: string; trialCta: string; trialNote: string;
    plans: Plan[];
    closer: string;
    creditTitle: string; creditItems: CreditItem[]; creditNote: string; creditPacksCta: string;
    packTitle: string; packs: CreditPack[]; packPopular: string; packNote: string;
    cmpFeature: string; cmpRows: CmpRow[];
    faqTitle: string; faq: FaqItem[];
    enterpriseTitle: string; enterpriseSub: string; enterpriseCta: string;
    betaMode?: boolean; betaCopy?: string; betaCta?: string; betaCtaNote?: string;
  };
  testi: { tag: string; h2: string; items: Testimonial[]; placeholder?: string; };
  final: { tag: string; h2: string; sub: string; cta: string; note: string; };
  footer: { tagline: string; cols: { h: string; items: FooterItem[] }[]; origin: string; copy: string; };
}

export interface CommonCopy {
  notFound: { msg: string; cta: string };
  metadata: {
    title:       string;
    description: string;
    keywords:    string[];
    ogLocale:    string;
  };
}

export interface BlogCopy {
  title:      string;
  sub:        string;
  readMore:   string;
  empty:      string;
  back:       string;
  backToList: string;
  by:         string;
}

export type DashboardPage =
  | 'home'
  | 'brand'
  | 'analytics'
  | 'strategy'
  | 'calendar'
  | 'settings'
  | 'autopilot'
  | 'ads'
  | 'content'
  | 'engage'
  | 'inbox';
