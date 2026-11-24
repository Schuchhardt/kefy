import type { NicheId } from '@/lib/niches';
import type { NicheCopy, OfferCopy } from '@/types/locales';
import type { NichesCopy, PricedFaq } from '@/locales/es/niches';

// English copy for the industry landing pages (/en/for/<industry>). Same rules
// as locales/es/niches.ts: the platform never promises ads, prices come from
// lib/plans.ts.

const offers = {
  h2: 'Two ways to keep your social media up to date',
  sub: 'We do it for you, or you do it yourself with the same platform we use.',
  whatsapp: 'Hi, I’d like to know how Kefy’s social media service works.',
  service: {
    label: 'We do it for you',
    title: 'Social media service',
    price: (usd: string) => `USD ${usd} / month`,
    features: [
      'We post every week, in your business’s look',
      'We set up and run your ads',
      'We answer messages and comments, nights and weekends too',
      'You just let us know when something new comes up',
    ],
    cta: 'Chat with us on WhatsApp',
    note: 'We start with a review of your accounts, free of charge.',
  } satisfies OfferCopy,
  platform: {
    label: 'You do it',
    title: 'Kefy platform',
    from: 'From',
    price: (usd: string) => `USD ${usd} / month`,
    features: [
      'Creates posts, carousels, reels and stories in your brand',
      'You approve them and they go out on your accounts',
      'Autopilot if you’d rather not review each one',
      'Comments and messages in one inbox, with auto-replies',
    ],
    cta: 'Try it free',
    note: '30 days free · No card · Cancel anytime',
  } satisfies OfferCopy,
  agency: {
    h2: 'A plan for how many clients you serve',
    sub: 'Each client is a brand in Kefy. Every account starts with 30 free days of Starter, which includes 1 brand; to serve more clients you pick Pro or Business.',
    price: (usd: string) => `USD ${usd} / month`,
    proTagline: (brands: string) => `Up to ${brands} clients, each with its own brand.`,
    businessTagline: (brands: string, members: string) => `Up to ${brands} clients and ${members} people on your team.`,
    proCta: 'Try it free',
    businessCta: 'See a 15-minute demo',
    note: '30 days free · No card · Cancel anytime',
  },
};

const faqService: PricedFaq[] = [
  {
    q: 'What do you need from me to get started?',
    a: () => 'What you already have: photos, services, prices and promotions. We start with a free review of your accounts and plan the first month from there.',
  },
  {
    q: 'How much is it and what’s included?',
    a: (service) => `USD ${service} a month. It covers the posts, running the ads and answering messages. You decide the budget that goes into the ads.`,
  },
  {
    q: 'What if I’d rather do it myself?',
    a: (_service, platform) => `Use the platform: from USD ${platform} a month, with 30 free days and no card. Kefy creates the posts in your brand and you approve them before they go out.`,
  },
];

const faqPlatform: PricedFaq[] = [
  {
    q: 'What happens when the 30 free days end?',
    a: () => 'Everything you created stays there. To keep publishing you pick a plan; we don’t ask for a card to start, so nothing is charged unless you choose to.',
  },
  {
    q: 'What if I’d rather you do it?',
    a: (service) => `We also run social media: USD ${service} a month per brand, with posts, ads and answers to messages. Write to us and we’ll talk.`,
  },
];

const niches = {
  dental: {
    name: 'Dental clinics',
    card: 'Up-to-date promotions and every enquiry answered, after hours too.',
    meta: {
      title: 'Social media for dental clinics | Kefy',
      description: 'We post your clinic’s treatments and promotions, run the ads and answer enquiries by message, at night too. From USD 200 a month.',
    },
    hero: {
      tag: 'For dental clinics',
      h1: 'Your clinic, active on social media every week.',
      em: 'And every enquiry answered, at night too.',
      sub: 'We post your treatments and promotions, run the ads that lead to your booking page and answer anyone asking about prices, payment plans or the first check-up. You look after patients.',
    },
    pains: {
      h2: 'What we see in many clinics',
      items: [
        { t: 'Enquiries that come in at night get answered the next day.', d: 'By then, whoever asked about an implant has already written to another clinic.' },
        { t: 'Promotions expire without anyone hearing about them.', d: 'The website still shows a date that has passed and they never make it to Instagram.' },
        { t: 'Great reviews are only seen by people already on your website.', d: 'Your best proof isn’t where people decide which clinic to choose.' },
      ],
    },
    does: {
      h2: 'We take care of your social media',
      items: [
        { t: 'We post every week', d: 'Treatments, promotions with their real end date, your team and what your patients say, in your clinic’s look.' },
        { t: 'We run your ads', d: 'Campaigns that lead to your booking page or your WhatsApp, for the promotions that matter to you.' },
        { t: 'We answer every enquiry', d: 'Prices, payment plans, insurance and check-ups, by message and in comments. Your team only gets people ready to book.' },
      ],
    },
    ideas: {
      h2: 'What we would post this month',
      sub: 'Examples that come from your own clinic, no stock photos.',
      items: [
        'This month’s promotion, with its end date',
        'What the first check-up includes',
        'How long braces take and how to pay for them',
        'Whitening myths and facts',
        'Who looks after you: the clinic’s team',
        'A patient’s review, with their permission',
      ],
    },
    faq: [
      { q: 'Who answers the messages?', a: 'We do, with the information we agree on with you: prices, payment plans, insurance and opening hours. If someone asks a clinical question, we pass it on to your team.' },
      { q: 'Does it work if I already have a booking page?', a: 'Yes, even better: the ads and the replies lead to that page, so people book without calling.' },
    ],
    final: { h2: 'Don’t lose the next late-night enquiry.', sub: 'Tell us about your clinic on WhatsApp and we’ll show you how we work.' },
    whatsapp: 'Hi, I have a dental clinic and I’d like to know how you handle social media.',
  },
  estetica: {
    name: 'Aesthetic clinics',
    card: 'Treatments and seasonal campaigns posted, and every price question answered.',
    meta: {
      title: 'Social media for aesthetic clinics and spas | Kefy',
      description: 'We post your treatments and seasonal campaigns, run the ads and answer anyone asking about prices or payment plans. From USD 200 a month.',
    },
    hero: {
      tag: 'For aesthetic clinics and spas',
      h1: 'Your treatments and promotions, on social media every week.',
      em: 'And every price question answered.',
      sub: 'We post your treatments and seasonal campaigns, run the ads and answer anyone asking about prices or payment plans, so they arrive at the consultation already informed.',
    },
    pains: {
      h2: 'What we see in many clinics',
      items: [
        { t: 'People ask for prices by message and nobody gets to reply.', d: 'Between one client and the next, messages pile up and go cold.' },
        { t: 'The seasonal campaign gets posted once and disappears.', d: 'The summer plan lasts weeks, but it shows up on social media for a single day.' },
        { t: 'Packages and gift cards depend on someone remembering them.', d: 'The holidays are when they sell most, and when there’s least time to post them.' },
      ],
    },
    does: {
      h2: 'We take care of your social media',
      items: [
        { t: 'We post every week', d: 'Treatments, results shared with your clients’ permission, your team and every campaign until the day it ends.' },
        { t: 'We run your ads', d: 'Campaigns for the season and your packages, leading to your bookings or your WhatsApp.' },
        { t: 'We answer every enquiry', d: 'Prices, payment plans and availability, by message and in comments. Your team only gets people ready for a consultation.' },
      ],
    },
    ideas: {
      h2: 'What we would post this month',
      sub: 'Examples that come from your own clinic.',
      items: [
        'The seasonal plan, with its end date',
        'What the free consultation includes',
        'Questions about a treatment, in a carousel',
        'Before and after care for a session',
        'Gift cards for the holidays',
        'Who looks after you and their training',
      ],
    },
    faq: [
      { q: 'Who answers the messages?', a: 'We do, with the prices, payment plans and hours we agree on with you. Anything that needs professional judgement goes to your team.' },
      { q: 'Can you post client results?', a: 'Only the ones you share with us, with the client’s permission. If you don’t have any, we work with treatments, your team and common questions.' },
    ],
    final: { h2: 'Get this season’s campaign in front of everyone looking for it.', sub: 'Tell us about your clinic on WhatsApp and we’ll show you how we work.' },
    whatsapp: 'Hi, I have an aesthetic clinic and I’d like to know how you handle social media.',
  },
  fitness: {
    name: 'Pilates, yoga and fitness studios',
    card: 'Classes, workshops and your trial class on social media while you teach.',
    meta: {
      title: 'Social media for pilates, yoga and fitness studios | Kefy',
      description: 'We post your classes and workshops, run the ads and answer anyone asking about a trial class. From USD 200 a month.',
    },
    hero: {
      tag: 'For pilates, yoga and fitness studios',
      h1: 'Your studio’s social media up to date while you teach.',
      em: 'And every question about the trial class answered.',
      sub: 'We post your classes, workshops and promotions, run the ads and answer anyone who wants to try. You focus on your students.',
    },
    pains: {
      h2: 'What we see in many studios',
      items: [
        { t: 'The person teaching the classes also runs the accounts.', d: 'And between classes there’s no time left to post.' },
        { t: 'The homepage still promotes a workshop that already happened.', d: 'Whoever visits today has no idea what’s next.' },
        { t: 'People ask about the trial class and the reply comes late.', d: 'By then they’ve signed up somewhere else.' },
      ],
    },
    does: {
      h2: 'We take care of your social media',
      items: [
        { t: 'We post every week', d: 'Schedules, classes, workshops before and after, and your community, in your studio’s look.' },
        { t: 'We run your ads', d: 'Campaigns for the trial class, workshops and seasonal promotions.' },
        { t: 'We answer every enquiry', d: 'Schedules, prices, memberships and the trial class. You only get people ready to come.' },
      ],
    },
    ideas: {
      h2: 'What we would post this month',
      sub: 'Examples that come from your own studio.',
      items: [
        'How to book the trial class',
        'Pre-sale for the next workshop',
        'How the last workshop went, in a reel',
        'The bring-a-friend promotion',
        'This week’s schedule',
        'Meet your instructors',
      ],
    },
    faq: [
      { q: 'Do I need to record videos?', a: 'It helps, but it’s not required. With photos of your classes and studio we put together posts, carousels and reels.' },
      { q: 'Does it work if I already have a booking system?', a: 'Yes: posts, ads and replies lead to that system, so people book on their own.' },
    ],
    final: { h2: 'Fill your next workshop before it starts.', sub: 'Tell us about your studio on WhatsApp and we’ll show you how we work.' },
    whatsapp: 'Hi, I have a studio and I’d like to know how you handle social media.',
  },
  academias: {
    name: 'Schools and academies',
    card: 'Courses, enrolment dates and spots posted, and every enquiry answered.',
    meta: {
      title: 'Social media for schools, academies and test-prep centers | Kefy',
      description: 'We post your courses and enrolment dates, run the ads and answer enquiries about prices, schedules and spots. From USD 200 a month.',
    },
    hero: {
      tag: 'For schools, academies and test-prep centers',
      h1: 'Let people hear about your courses before enrolment closes.',
      em: 'And make sure every enquiry gets an answer.',
      sub: 'We post your courses with their dates and spots, run the enrolment ads and answer anyone asking about prices, schedules or locations.',
    },
    pains: {
      h2: 'What we see in many schools',
      items: [
        { t: 'Next term’s enrolment is decided months before it starts.', d: 'If your accounts are quiet during those weeks, another school shows up first.' },
        { t: 'With many courses, each one is posted once and gets lost.', d: 'The enrolment discount expires before the people looking for it ever see it.' },
        { t: 'Enquiries arrive at all hours and from every campus.', d: 'Prices, schedules, requirements: always the same questions, always waiting.' },
      ],
    },
    does: {
      h2: 'We take care of your social media',
      items: [
        { t: 'We post every week', d: 'Courses, start dates, spots and enrolment discounts, until the day they end.' },
        { t: 'We run your ads', d: 'Enrolment and admission campaigns in the cities where you have campuses.' },
        { t: 'We answer every enquiry', d: 'Prices, schedules, requirements and locations, by message and in comments. Your team only gets people ready to enrol.' },
      ],
    },
    ideas: {
      h2: 'What we would post this month',
      sub: 'Examples that come from your own school.',
      items: [
        'Start dates and spots for each course',
        'The enrolment discount and when it ends',
        'A day of classes, in a reel',
        'What a former student says, with their permission',
        'How enrolment works',
        'Campuses, schedules and formats',
      ],
    },
    faq: [
      { q: 'Does it work if we have several campuses?', a: 'Yes. We post what’s happening at each campus and the ads are shown in the cities you choose.' },
      { q: 'Can you promote many courses at once?', a: 'Yes: we plan a calendar so every course gets its turn before its start date, without one burying the other.' },
    ],
    final: { h2: 'Let next term’s enrolment start on your social media.', sub: 'Tell us about your school on WhatsApp and we’ll show you how we work.' },
    whatsapp: 'Hi, I run a school and I’d like to know how you handle social media.',
  },
  turismo: {
    name: 'Vacation rentals and lodges',
    card: 'Your cabins or lodge on social media all year, with the link to book direct.',
    meta: {
      title: 'Social media for cabins, lodges and vacation rentals | Kefy',
      description: 'We show your place all year, run the ads and answer anyone asking about dates with the link to book direct. From USD 200 a month.',
    },
    hero: {
      tag: 'For cabins, lodges and boutique hotels',
      h1: 'Your place on social media all year, with the link to book direct.',
      em: 'No commission in between.',
      sub: 'We show your place in every season, run the ads and answer anyone asking about dates, with the link to your booking engine or your WhatsApp.',
    },
    pains: {
      h2: 'What we see in many properties',
      items: [
        { t: 'People who find you on social media end up booking on Airbnb or Booking.', d: 'And you pay a commission on that booking.' },
        { t: 'In high season there’s no time to post or reply.', d: 'Guests come first, and social media is left for later.' },
        { t: 'People ask about dates and the reply comes late.', d: 'By then they’ve booked somewhere else.' },
      ],
    },
    does: {
      h2: 'We take care of your social media',
      items: [
        { t: 'We post all year', d: 'Your place in every season, the experience of staying there and what there is to do nearby.' },
        { t: 'We run your ads', d: 'Campaigns before each season and long weekend, leading to your direct booking.' },
        { t: 'We answer every enquiry', d: 'Dates, prices and amenities, always with the link to book with you.' },
      ],
    },
    ideas: {
      h2: 'What we would post this month',
      sub: 'Examples that come from your own place.',
      items: [
        'Your place this season, in a reel',
        'Things to do nearby: trails, beaches and restaurants',
        'Breakfast and the little details of a stay',
        'Availability for the next long weekend',
        'Why booking direct is worth it',
        'What your guests say, with their permission',
      ],
    },
    faq: [
      { q: 'Does it work if I’m already on Airbnb and Booking?', a: 'Yes. It isn’t about leaving those platforms, but about getting people who discover you on social media to book with you.' },
      { q: 'What if I don’t have a booking engine?', a: 'Replies lead to your WhatsApp or email, where you close the booking as you already do.' },
    ],
    final: { h2: 'Let next season be booked directly with you.', sub: 'Tell us about your place on WhatsApp and we’ll show you how we work.' },
    whatsapp: 'Hi, I have a vacation rental and I’d like to know how you handle social media.',
  },
  hogar: {
    name: 'Home improvement',
    card: 'Your finished projects on social media and every quote request answered with what you need.',
    meta: {
      title: 'Social media for kitchens, enclosures, landscaping and home projects | Kefy',
      description: 'We post your finished projects, run the ads and answer every enquiry asking for what you need to quote. From USD 200 a month.',
    },
    hero: {
      tag: 'For kitchens, enclosures, landscaping, solar and remodeling',
      h1: 'Your finished projects, on social media every week.',
      em: 'And every quote request with what you need to know.',
      sub: 'We post your projects with the photos you already have, run the ads and answer every enquiry asking for location, measurements and project type. You only get people who want the site visit.',
    },
    pains: {
      h2: 'What we see in many companies',
      items: [
        { t: 'People who ask on social media never reach the quote form.', d: 'They write, nobody replies in time, and they get a quote elsewhere.' },
        { t: 'You have hundreds of finished projects that never get posted.', d: 'The best proof of your work is sitting in your phone.' },
        { t: 'Enquiries arrive without location, measurements or budget.', d: 'And every quote starts with five back-and-forth questions.' },
      ],
    },
    does: {
      h2: 'We take care of your social media',
      items: [
        { t: 'We post every week', d: 'A different project each time, with its materials, the before and the after.' },
        { t: 'We run your ads', d: 'Campaigns in the areas where you work, leading to your form or your WhatsApp.' },
        { t: 'We answer and qualify', d: 'We ask for location, measurements and project type. You only get people who want the site visit.' },
      ],
    },
    ideas: {
      h2: 'What we would post this month',
      sub: 'Examples that come from your own projects.',
      items: [
        'The before and after of a project',
        'One project a week, with its materials',
        'How we work: visit, quote and installation',
        'Timelines and warranty, as common questions',
        'The team on site',
        'The areas where you work',
      ],
    },
    faq: [
      { q: 'Do I need professional photos?', a: 'No. With the photos you already have of your projects we create posts in your company’s look.' },
      { q: 'Do you prepare the quotes?', a: 'No: we collect what you need to quote (location, measurements, project type) and pass you the contact. You do the quote and the visit.' },
    ],
    final: { h2: 'Let your finished projects bring in the next ones.', sub: 'Tell us about your company on WhatsApp and we’ll show you how we work.' },
    whatsapp: 'Hi, I have a home improvement company and I’d like to know how you handle social media.',
  },
  agencias: {
    name: 'Marketing agencies',
    card: 'More clients per person: Kefy drafts the pieces and your team edits and schedules them.',
    meta: {
      title: 'Kefy for marketing agencies and social media managers | Kefy',
      description: 'Each client is a brand with its kit and strategy. Kefy drafts the month’s calendar and your team edits and schedules instead of starting from scratch. 30 days free.',
    },
    hero: {
      tag: 'For agencies and social media managers',
      h1: 'More clients per person, without growing the team.',
      em: 'Kefy drafts the pieces; your team edits and schedules them.',
      sub: 'Each client becomes a brand with its colors, tone and strategy. The month’s calendar comes out of it, and your designer adjusts instead of starting from scratch.',
    },
    pains: {
      h2: 'What we see in many agencies',
      items: [
        { t: 'Every new client means dozens more pieces a month.', d: 'For the same social media manager and the same designer.' },
        { t: 'Every piece starts from a blank page.', d: 'Even though the client’s brand, tone and strategy are already defined.' },
        { t: 'Each client’s comments and messages live in a different account.', d: 'Checking them all every day is another job.' },
      ],
    },
    does: {
      h2: 'What Kefy does for your agency',
      items: [
        { t: 'One brand per client', d: 'Colors, fonts, logo, tone and strategy, picked up from their website. Every piece comes out in their identity.' },
        { t: 'The month’s calendar, drafted', d: 'Posts, carousels, reels and stories for every network. Your team edits and schedules them, or leaves them on autopilot.' },
        { t: 'Messages with auto-replies', d: 'Each brand’s comments and messages in one inbox, with auto-replies based on your rules.' },
      ],
    },
    ideas: {
      h2: 'What Kefy produces for each client',
      sub: 'All inside the client’s brand, ready to review.',
      items: [
        'Monthly calendar with posts, carousels, reels and stories',
        'Copy in Spanish or English, in each brand’s tone',
        'Images and videos in the client’s colors and fonts',
        'Scheduling across 11 networks',
        'Autopilot for maintenance clients',
        'API and MCP server to plug in your own tools',
      ],
    },
    faq: [
      { q: 'How many people on my team can use it?', a: 'Pro is for one person; Business adds up to 5 team members working on the same brands.' },
      { q: 'What if the client already has a strategy?', a: 'You save it as the brand’s own strategy (objective, KPI, call to action and calendar) and Kefy follows it in every piece. If they don’t have one, you pick one from the catalog.' },
    ],
    final: { h2: 'Take on your next client with the same team.', sub: 'Try it free for 30 days with one brand, or we’ll show you in 15 minutes with an account from an industry you already serve.' },
    whatsapp: 'Hi, I run an agency and I’d like to see Kefy working with a brand.',
  },
} satisfies Record<NicheId, NicheCopy>;

const en: NichesCopy = {
  index: {
    tag: 'By industry',
    footer: 'Industries',
    h2: 'Built for your industry',
    sub: 'What we post and how we reply changes with your business. See how it looks in yours.',
  },
  labels: {
    pains: 'What we see',
    does: 'What we do',
    ideas: 'Ideas',
    offers: 'Pricing',
    faq: 'FAQ',
  },
  ctas: {
    whatsapp: 'Chat with us on WhatsApp',
    diy: 'I’d rather do it myself',
    demo: 'See a 15-minute demo',
    serviceNote: (usd: string) => `USD ${usd} a month · We start with a free review of your accounts`,
    newTab: '(opens in a new tab)',
  },
  offers,
  faqService,
  faqPlatform,
  niches,
};

export default en;
