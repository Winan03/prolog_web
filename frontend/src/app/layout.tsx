import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrologWeb — Intérprete SWI-Prolog en la Nube",
  description: "Ejecuta SWI-Prolog avanzado en el navegador con colaboración en tiempo real. Diseñado para cursos de Inteligencia Artificial.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
