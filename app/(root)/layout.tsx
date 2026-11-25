// Layout mínimo de `/`, que solo redirige a /es (el proxy ya lo hace antes;
// esto es la red de seguridad). El layout raíz de verdad es app/[lang]/layout.tsx,
// que pone <html lang> según la ruta.
export default function RootRedirectLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
