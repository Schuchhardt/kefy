import Link from 'next/link';

const cookiesContent: Record<string, { title: string; sub: string; sections: { h: string; p: string }[] }> = {
  es: {
    title: 'Política de cookies',
    sub: 'Última actualización: mayo 2026',
    sections: [
      { h: '¿Qué son las cookies?', p: 'Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo cuando visitas un sitio web. Permiten que el sitio recuerde tus preferencias y mejoren tu experiencia de usuario.' },
      { h: 'Cookies que usamos', p: 'Utilizamos cookies esenciales necesarias para el funcionamiento básico del sitio (autenticación, sesión), cookies de preferencias para recordar tus configuraciones de idioma y visualización, y cookies analíticas para entender cómo se usa el servicio.' },
      { h: 'Cookies de terceros', p: 'Podemos usar servicios de análisis como Vercel Analytics. Estos servicios pueden colocar sus propias cookies. Consulta sus políticas de privacidad para más información.' },
      { h: 'Gestión de cookies', p: 'Puedes controlar y eliminar cookies desde la configuración de tu navegador. Ten en cuenta que deshabilitar cookies esenciales puede afectar el funcionamiento del sitio.' },
      { h: 'Cambios a esta política', p: 'Podemos actualizar esta política de cookies periódicamente. Te recomendamos revisarla regularmente.' },
      { h: 'Contacto', p: 'Para preguntas sobre nuestro uso de cookies, escríbenos a privacidad@kefy.app' },
    ],
  },
  en: {
    title: 'Cookie Policy',
    sub: 'Last updated: May 2026',
    sections: [
      { h: 'What Are Cookies?', p: 'Cookies are small text files stored on your device when you visit a website. They allow the site to remember your preferences and improve your user experience.' },
      { h: 'Cookies We Use', p: 'We use essential cookies necessary for basic site functionality (authentication, session), preference cookies to remember your language and display settings, and analytics cookies to understand how the service is used.' },
      { h: 'Third-Party Cookies', p: 'We may use analytics services like Vercel Analytics. These services may place their own cookies. See their privacy policies for more information.' },
      { h: 'Managing Cookies', p: 'You can control and delete cookies from your browser settings. Note that disabling essential cookies may affect site functionality.' },
      { h: 'Changes to This Policy', p: 'We may update this cookie policy periodically. We recommend reviewing it regularly.' },
      { h: 'Contact', p: 'For questions about our use of cookies, write to privacy@kefy.app' },
    ],
  },
};

export default async function CookiesPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const content = cookiesContent[lang] ?? cookiesContent['es'];

  return (
    <div className="page-layout">
      <div className="container">
        <Link href={`/${lang}`} className="back-link">
          ← {lang === 'en' ? 'Back to home' : 'Volver al inicio'}
        </Link>
        <h1>{content.title}</h1>
        <p className="page-sub">{content.sub}</p>
        <div className="prose">
          {content.sections.map((s, i) => (
            <div key={i}>
              <h2>{s.h}</h2>
              <p>{s.p}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
