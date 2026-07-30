import "./globals.css";

export const metadata = {
  title: "Gestão Simples",
  description: "Sistema de gestão para ateliês e prestadores de serviço.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
