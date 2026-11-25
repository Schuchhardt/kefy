import Icon from '@/components/ui/icons';

/**
 * Preguntas frecuentes en acordeón (<details>): no alarga la página en el
 * móvil y las respuestas siguen en el HTML para buscadores y motores de
 * respuesta. Por defecto la primera va abierta (`openFirst`). Acompañar siempre
 * con `faqJsonLd` de las mismas preguntas (lib/seo.ts).
 */
export default function FaqList({ items, openFirst = true }: { items: { q: string; a: string }[]; openFirst?: boolean }) {
  return (
    <div className="faq-list faq-accordion">
      {items.map((f, i) => (
        <details key={f.q} className="faq-item" open={openFirst && i === 0}>
          <summary className="faq-q">
            <span>{f.q}</span>
            <Icon name="chevron-down" size={18} className="faq-chevron" />
          </summary>
          <p className="faq-a">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
