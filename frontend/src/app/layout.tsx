import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrologWeb — Intérprete SWI-Prolog en la Nube",
  description: "Ejecuta SWI-Prolog avanzado en el navegador con colaboración en tiempo real. Diseñado para cursos de Inteligencia Artificial.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Anti-flash: apply saved theme before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  var t = localStorage.getItem('prologweb_theme');
  if (!t) t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
