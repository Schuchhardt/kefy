import Link from 'next/link';

const privacyContent: Record<string, { title: string; sub: string; sections: { h: string; p: string }[] }> = {
  es: {
    title: 'Política de privacidad',
    sub: 'Última actualización: mayo 2026',
    sections: [
      { h: 'Información que recopilamos', p: 'Recopilamos información que nos proporcionas directamente, como nombre, correo electrónico y datos de tu marca al registrarte. También recopilamos datos de uso de la plataforma para mejorar el servicio.' },
      { h: 'Uso de la información', p: 'Usamos tu información para operar y mejorar Kefy, enviarte comunicaciones relacionadas con el servicio, procesar pagos y cumplir con obligaciones legales.' },
      { h: 'Compartir información', p: 'No vendemos tu información personal. Podemos compartirla con proveedores de servicios que nos ayudan a operar la plataforma (alojamiento, pagos, email), bajo acuerdos de confidencialidad.' },
      { h: 'Cookies', p: 'Utilizamos cookies esenciales para el funcionamiento de la plataforma y cookies analíticas para entender cómo se usa el servicio. Puedes gestionar las cookies desde tu navegador.' },
      { h: 'Seguridad', p: 'Implementamos medidas técnicas y organizativas para proteger tu información. Sin embargo, ningún método de transmisión por internet es 100% seguro.' },
      { h: 'Retención de datos', p: 'Conservamos tu información mientras tu cuenta esté activa o según sea necesario para proporcionar el servicio. Puedes solicitar la eliminación de tus datos escribiéndonos a privacidad@kefy.app.' },
      { h: 'Tus derechos', p: 'Tienes derecho a acceder, rectificar y eliminar tu información personal. Para ejercer estos derechos, contáctanos en privacidad@kefy.app' },
      { h: 'Cambios a esta política', p: 'Podemos actualizar esta política periódicamente. Te notificaremos por email sobre cambios materiales.' },
    ],
  },
  en: {
    title: 'Privacy Policy',
    sub: 'Last updated: May 2026',
    sections: [
      { h: 'Information We Collect', p: 'We collect information you provide directly, such as name, email and brand data when registering. We also collect platform usage data to improve the service.' },
      { h: 'Use of Information', p: 'We use your information to operate and improve Kefy, send service-related communications, process payments and comply with legal obligations.' },
      { h: 'Sharing Information', p: 'We do not sell your personal information. We may share it with service providers who help us operate the platform (hosting, payments, email), under confidentiality agreements.' },
      { h: 'Cookies', p: 'We use essential cookies for platform functionality and analytics cookies to understand service usage. You can manage cookies from your browser.' },
      { h: 'Security', p: 'We implement technical and organizational measures to protect your information. However, no internet transmission method is 100% secure.' },
      { h: 'Data Retention', p: 'We retain your information while your account is active or as needed to provide the service. You can request deletion of your data by emailing privacy@kefy.app.' },
      { h: 'Your Rights', p: 'You have the right to access, rectify and delete your personal information. To exercise these rights, contact us at privacy@kefy.app' },
      { h: 'Changes to This Policy', p: 'We may update this policy periodically. We will notify you by email about material changes.' },
    ],
  },
};

export default async function PrivacidadPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const content = privacyContent[lang] ?? privacyContent['es'];

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
