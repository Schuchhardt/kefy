// ─── Cliente mínimo de GitHub Issues ─────────────────────────────────────────
//
// Solo crea issues. Lo usa lib/services/feedback.ts para que los usuarios
// reporten errores y pidan funciones desde el asistente. Ver docs/assistant.md
// («Reportar errores y pedir funciones»).
//
// Env:
//   GITHUB_FEEDBACK_TOKEN  Token fine-grained con «Issues: read and write» solo
//                          sobre el repo de destino.
//   GITHUB_FEEDBACK_REPO   owner/repo donde se crean (p. ej. Schuchhardt/kefy).

const GITHUB_API = 'https://api.github.com';
const TIMEOUT_MS = 8000;

export interface CreatedIssue {
  number: number;
  url: string;
}

export function githubFeedbackConfigured(): boolean {
  return !!process.env.GITHUB_FEEDBACK_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_FEEDBACK_REPO ?? '');
}

/**
 * Crea un issue. Las etiquetas que no existan en el repo las crea GitHub al
 * vuelo (el token necesita permiso de escritura en Issues).
 */
export async function createGithubIssue(input: { title: string; body: string; labels: string[] }): Promise<CreatedIssue> {
  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  const repo = process.env.GITHUB_FEEDBACK_REPO;
  if (!token || !repo) throw new Error('GitHub feedback not configured');

  const res = await fetch(`${GITHUB_API}/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'kefy-feedback',
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json() as { number?: number; html_url?: string };
  if (typeof data.number !== 'number' || typeof data.html_url !== 'string') {
    throw new Error('GitHub: unexpected response');
  }
  return { number: data.number, url: data.html_url };
}
