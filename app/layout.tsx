import { Poppins } from "next/font/google";
import "./globals.css";

export const metadata = {
  title: "Gestão Simples",
  description: "Sistema de gestão para ateliês e prestadores de serviço.",
};

// Fonte principal do app trocada em 01/08/2026 a pedido do usuário, pra
// bater com a fonte usada no material de marca dele (badge "Síntese de
// suprimento" — geométrica, bem arredondada, peso forte). Poppins foi a
// aproximação mais próxima disponível no Google Fonts. Carregada via
// next/font/google (em vez de <link> no <head>) porque o Next.js já
// hospeda o arquivo da fonte junto do resto do app — sem isso haveria uma
// requisição externa ao Google em toda visita, mais lento e um ponto a
// mais de falha.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
