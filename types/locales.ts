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
/**
 * Un plan tal como lo anuncia la landing. Solo hay precio mensual: Stripe no
 * tiene precios anuales (la landing anunciaba «Anual — 20% OFF»).
 * `contact`: el botón lleva a hablar con ventas en vez de al registro.
 */
export interface Plan {
  name:          string;
  price:         string;
  per:           string;
  tagline:       string;
  features:      (string | PlanFeature)[];
  cta:           string;
  featured?:     boolean;
  badge?:        string;
  contact?:      boolean;
}
export interface CreditItem { ic: string; label: string; }
export interface CmpRow { feature: string; values: string[]; }
export interface FaqItem { q: string; a: string; }
/**
 * Dato verificable sobre el producto. Sustituye a los testimonios: mientras no
 * haya clientes reales con permiso para citarlos, la sección muestra hechos
 * comprobables en el propio producto en vez de opiniones atribuidas a personas.
 */
export interface ProofPoint { k: string; lbl: string; d: string; }
export interface EngageScoreItem { type: string; pts: string; }
export interface EngageStagePill { key: string; label: string; emoji: string; }

/** Llamada a la acción única de la landing: el mismo texto y la misma nota en
 *  nav, hero, precios y final (antes había cinco verbos para la misma acción). */
export interface LandingCta { label: string; note: string; }

/** Lo que incluyen todos los planes (no cambia entre ellos). */
export interface PlanIncluded { title: string; items: string[]; }

export interface KefyCopy {
  nav: {
    ariaLabel: string;
    links: NavLink[];
    menuOpen: string; menuClose: string;
    languageLabel: string;
    languages: { es: string; en: string };
  };
  cta: LandingCta;
  hero: {
    tag: string; h1: string[]; h1em: string; sub: string;
    emailPlaceholder: string; emailLabel: string;
  };
  demo: {
    ariaLabel: string;
    stepsLabel: string;
    pause: string; play: string;
    stepLabels: string[];
    stepDescriptions: string[];
    creationSteps: string[];
    creationStepsLong: string[];
    progressLabel: string;
    contextProduct: string;
    brandHandle: string;
    brandLogoSrc: string;
    brandProductSrc: string;
    productAlt: string;
    instagramNow: string;
    likesLabel: string;
    commentPostCaption: string;
    imageGenerating: string;
    imageReady: string;
    statusGenerating: string;
    statusAssembling: string;
    postPublished: string;
    postScheduledFor: string;
    commenterName: string;
    commenterHandle: string;
    commentThread: DemoDMMessage[];
    commentBrandReply: string;
    dmChannel: string;
    dmBadge: string;
    dmThread: DemoDMMessage[];
    autoReplyLabel: string;
    botThoughts: string[];
    leadName: string;
    leadHandle: string;
    leadScore: string;
    scoreLabel: string;
    scoreBarLabel: string;
    pipelineStages: string[];
    qualifiedLabel: string;
    linkSentLabel: string;
    linkSentUrl: string;
    linkSentTime: string;
    linkSentVia: string;
  };
  problem: { tag: string; h2: string; pains: { num: string; t: string }[]; result: string; };
  how: { tag: string; h2: string; steps: Step[]; closer: string[]; };
  brand: {
    tag: string; h2: string[]; sub: string; bullets: BrandBullet[];
    kit: {
      title: string; status: string; brandName: string;
      palette: string; type: string; logo: string; tone: string; toneV: string; typeV: string;
      applied: string; formats: string[];
    };
  };
  autopilot: {
    tag: string; h2: string[]; sub: string; bullets: ApBullet[]; closer: string;
    togglePilot: string; toggleManual: string; modeLabel: string;
    calendarTitle: string; schedule: CalDay[];
  };
  channels: { h3: string[]; sub: string; items: string[]; };
  testi: { tag: string; h2: string; sub: string; proof: ProofPoint[]; };
  pricing: {
    tag: string; h2: string; sub: string;
    trialBadge: string; trialSub: string;
    plans: Plan[];
    included: PlanIncluded;
    closer: string;
    creditTitle: string; creditItems: CreditItem[]; creditNote: string;
    cmpFeature: string; cmpRows: CmpRow[]; cmpScrollHint: string;
    faqTitle: string; faq: FaqItem[];
    enterpriseTitle: string; enterpriseSub: string; enterpriseCta: string;
    compareAll: string;
  };
  final: { tag: string; h2: string; sub: string; };
  footer: { tagline: string; cols: { h: string; items: FooterItem[] }[]; origin: string; copy: string; socialLabel: string; };

  // ── Secciones que ya no se montan en la página ────────────────────────────
  // Sus componentes (Mult, Strategy, Features, AutoEngage, Killer, Who,
  // Comparison, BilingualBand) siguen en el repo hasta que se borren; la copy
  // se conserva solo para que compilen. No se renderiza en ninguna ruta.
  // Ver docs/auditoria-ux.md, «Pendiente».
  mult: { tag: string; h2: string[]; sub: string; bullets: { ic: string; t: string }[]; inLbl: string; inV: string; outLbl: string; outputs: MultOutput[]; };
  killer: { tag: string; h2: string[]; sub: string; points: KillerPoint[]; dash: { title: string; range: string; stats: DashStat[]; posts: DashPost[] }; };
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
  cmp: { tag: string; h2: string; cols: string[]; rows: (string | string[])[]; partial: string; simpleMode?: boolean; withoutTitle?: string; withoutItems?: string[]; withTitle?: string; withItems?: string[]; };
  lang: { h2: string[]; em: string; sub: string; more: string; };
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
