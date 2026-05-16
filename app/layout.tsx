export default function RootLayout({ children }: { children: React.ReactNode }) {
  // <html> y <body> los provee app/[lang]/layout.tsx con el lang correcto.
  // suppressHydrationWarning evita el error de Next.js por atributos que
  // cambian en el cliente (lang, clases de fuentes).
  return (
    <html suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
