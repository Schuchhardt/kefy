import Link from 'next/link';

const aboutContent: Record<string, {
  title: string;
  titleEm: string;
  sub: string;
  story: { h: string; p: string }[];
  teamTitle: string;
  team: { initials: string; name: string; role: string }[];
}> = {
  es: {
    title: 'Somos un equipo que',
    titleEm: 'vivió el problema.',
    sub: 'Kefy nació de una frustración real: hacer marketing para nuestros propios negocios era caro, fragmentado y consumía demasiado tiempo.',
    story: [
      {
        h: 'El origen',
        p: 'Somos un equipo multidisciplinario de desarrolladores, emprendedores y diseñadores. Entre todos manejamos o hemos manejado pymes, tiendas online y proyectos de software. Y todos enfrentamos el mismo problema: el marketing era la parte que más nos costaba.',
      },
      {
        h: 'El problema que vivimos',
        p: 'Probamos contratar agencias — carísimas. Probamos herramientas separadas — fragmentadas. Probamos contratar freelancers — inconsistentes. Nunca había una sola solución que entendiera nuestra marca, generara contenido de calidad, lo publicara en el momento correcto y midiera los resultados.',
      },
      {
        h: 'La solución que construimos',
        p: 'Decidimos construir la plataforma que queríamos usar. Una que aprendiera nuestra identidad de marca, generara contenido en todos los formatos, lo programara inteligentemente y nos diera visibilidad real sobre lo que funcionaba. Eso es Kefy.',
      },
      {
        h: 'Por qué lo lanzamos al público',
        p: 'Después de usarlo en nuestras propias empresas y con clientes de diseño y consultoría, nos dimos cuenta de que el problema era universal. Cualquier negocio sin un equipo de marketing dedicado enfrenta exactamente esto. Así que decidimos compartirlo.',
      },
      {
        h: 'Hecho en LATAM',
        p: 'Somos un equipo distribuido en Latinoamérica. Conocemos los matices del mercado hispano, las particularidades del español de cada región, y los desafíos reales de hacer crecer un negocio en LATAM. Eso se refleja en cada decisión que tomamos.',
      },
    ],
    teamTitle: 'El equipo',
    team: [
      { initials: 'SC', name: 'Sebastián', role: 'Fundador & CEO' },
      { initials: 'Dev', name: 'Ingeniería', role: 'Desarrollo de producto' },
      { initials: 'DS', name: 'Diseño', role: 'UX & Brand' },
      { initials: '+', name: 'Tú', role: 'Únete al equipo →' },
    ],
  },
  en: {
    title: 'We're a team that',
    titleEm: 'lived the problem.',
    sub: 'Kefy was born from a real frustration: doing marketing for our own businesses was expensive, fragmented and time-consuming.',
    story: [
      {
        h: 'The origin',
        p: 'We're a multidisciplinary team of developers, entrepreneurs and designers. Together we manage or have managed SMBs, online stores and software projects. And we all faced the same problem: marketing was the hardest part.',
      },
      {
        h: 'The problem we lived',
        p: 'We tried hiring agencies — too expensive. We tried separate tools — too fragmented. We tried freelancers — too inconsistent. There was never a single solution that understood our brand, generated quality content, published at the right time and measured results.',
      },
      {
        h: 'The solution we built',
        p: 'We decided to build the platform we wanted to use. One that would learn our brand identity, generate content across all formats, schedule it intelligently and give us real visibility into what worked. That's Kefy.',
      },
      {
        h: 'Why we launched it publicly',
        p: 'After using it in our own companies and with design and consulting clients, we realized the problem was universal. Any business without a dedicated marketing team faces exactly this. So we decided to share it.',
      },
      {
        h: 'Made in LATAM',
        p: 'We're a distributed team across Latin America. We know the nuances of the Hispanic market, the particularities of Spanish in each region, and the real challenges of growing a business in LATAM. That's reflected in every decision we make.',
      },
    ],
    teamTitle: 'The team',
    team: [
      { initials: 'SC', name: 'Sebastián', role: 'Founder & CEO' },
      { initials: 'Dev', name: 'Engineering', role: 'Product development' },
      { initials: 'DS', name: 'Design', role: 'UX & Brand' },
      { initials: '+', name: 'You', role: 'Join the team →' },
    ],
  },
};

export default async function SobreKefyPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const content = aboutContent[lang] ?? aboutContent['es'];

  return (
    <div className="page-layout">
      <div className="container">
        <Link href={`/${lang}`} className="back-link">
          ← {lang === 'en' ? 'Back to home' : 'Volver al inicio'}
        </Link>

        <h1>
          {content.title}{' '}
          <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>{content.titleEm}</em>
        </h1>
        <p className="page-sub">{content.sub}</p>

        <div className="prose">
          {content.story.map((s, i) => (
            <div key={i}>
              <h2>{s.h}</h2>
              <p>{s.p}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '56px' }}>
          <h2 style={{ fontFamily: 'var(--font-syne), serif', fontWeight: 700, fontSize: '20px', letterSpacing: '-0.02em', marginBottom: '24px' }}>
            {content.teamTitle}
          </h2>
          <div className="about-team-grid">
            {content.team.map((member, i) => (
              <div key={i} className="about-team-card">
                <div className="about-team-avatar">{member.initials}</div>
                <div className="about-team-name">{member.name}</div>
                <div className="about-team-role">{member.role}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
