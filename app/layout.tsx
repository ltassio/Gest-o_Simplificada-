export const metadata = {
  title: "Gestão Simples",
  description: "Backend das API Routes do Gestão Simples",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
