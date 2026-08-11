import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ecos del Alma · Content Studio",
  description: "Automatización de contenido y publicación para Ecos del Alma",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
