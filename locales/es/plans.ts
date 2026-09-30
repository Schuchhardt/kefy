// Cómo se describe cada plan dentro de la app (Ajustes → Plan y facturación).
// Los números salen de lib/plans.ts: aquí solo está la redacción.

const es = {
  names: { starter: 'Starter', pro: 'Pro', business: 'Business' },
  per: '/ mes',
  popular: 'Más popular',
  brands: (n: string) => (n === '1' ? '1 marca' : `${n} marcas`),
  socialConnections: (n: string) => `${n} conexiones sociales`,
  credits: (n: string) => `${n} créditos IA / mes`,
  assistantMessages: (n: string) => `Asistente IA: ${n} mensajes / mes`,
  members: (n: string) => (n === '1' ? '1 miembro' : `${n} miembros del equipo`),
  included: [
    'Posts, carruseles, reels y stories',
    'Calendario y programación',
    'Piloto automático',
    'Inbox y respuestas automáticas',
    'API y servidor MCP',
  ],
};

export default es;
export type PlansCopy = typeof es;
