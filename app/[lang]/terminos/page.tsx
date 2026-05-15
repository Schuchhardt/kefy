import Link from 'next/link';
import { KEFY_COPY } from '@/lib/content';

const legalContent: Record<string, { title: string; sub: string; sections: { h: string; p: string }[] }> = {
  es: {
    title: 'Términos de servicio',
    sub: 'Última actualización: mayo 2026',
    sections: [
      { h: 'Aceptación de los términos', p: 'Al acceder y utilizar Kefy, aceptas quedar vinculado por estos Términos de Servicio. Si no estás de acuerdo con alguna parte de estos términos, no podrás acceder al servicio.' },
      { h: 'Descripción del servicio', p: 'Kefy es una plataforma de marketing todo-en-uno que permite generar, programar y publicar contenido en múltiples canales digitales. El servicio se encuentra actualmente en fase beta.' },
      { h: 'Cuentas de usuario', p: 'Eres responsable de mantener la confidencialidad de tu cuenta y contraseña. Notifica a Kefy de inmediato sobre cualquier uso no autorizado de tu cuenta.' },
      { h: 'Uso aceptable', p: 'Te comprometes a no utilizar el servicio para generar contenido ilegal, difamatorio, fraudulento o que viole derechos de terceros. Kefy se reserva el derecho a suspender cuentas que violen esta política.' },
      { h: 'Propiedad intelectual', p: 'El contenido generado con Kefy usando tu información de marca es tuyo. Kefy retiene los derechos sobre la plataforma, su tecnología y metodologías.' },
      { h: 'Limitación de responsabilidad', p: 'Kefy se proporciona "tal como está". No garantizamos que el servicio sea ininterrumpido o libre de errores. En ningún caso seremos responsables por daños indirectos o lucro cesante.' },
      { h: 'Modificaciones', p: 'Nos reservamos el derecho de modificar estos términos en cualquier momento. Te notificaremos por email con al menos 7 días de anticipación antes de cambios materiales.' },
      { h: 'Contacto', p: 'Para preguntas sobre estos términos, escríbenos a legal@kefy.app' },
    ],
  },
  en: {
    title: 'Terms of Service',
    sub: 'Last updated: May 2026',
    sections: [
      { h: 'Acceptance of Terms', p: 'By accessing and using Kefy, you agree to be bound by these Terms of Service. If you disagree with any part of these terms, you may not access the service.' },
      { h: 'Description of Service', p: 'Kefy is an all-in-one marketing platform that allows you to generate, schedule and publish content across multiple digital channels. The service is currently in beta.' },
      { h: 'User Accounts', p: 'You are responsible for maintaining the confidentiality of your account and password. Notify Kefy immediately of any unauthorized use of your account.' },
      { h: 'Acceptable Use', p: 'You agree not to use the service to generate illegal, defamatory, fraudulent content or content that infringes third-party rights. Kefy reserves the right to suspend accounts violating this policy.' },
      { h: 'Intellectual Property', p: 'Content generated with Kefy using your brand information belongs to you. Kefy retains rights to the platform, its technology and methodologies.' },
      { h: 'Limitation of Liability', p: 'Kefy is provided "as is". We do not guarantee the service will be uninterrupted or error-free. In no event shall we be liable for indirect damages or lost profits.' },
      { h: 'Modifications', p: 'We reserve the right to modify these terms at any time. We will notify you by email at least 7 days before material changes.' },
      { h: 'Contact', p: 'For questions about these terms, write to legal@kefy.app' },
    ],
  },
};

export default async function TerminosPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const content = legalContent[lang] ?? legalContent['es'];
  const copy = KEFY_COPY[lang] ?? KEFY_COPY['es'];

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
