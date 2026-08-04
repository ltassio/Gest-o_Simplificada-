import { Poppins, JetBrains_Mono } from "next/font/google";
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

// Fonte usada só nos números de destaque do Dashboard (receita, score,
// indicadores) — parte do redesenho "Mostruário" de 04/08/2026. Números em
// monospace com largura fixa por dígito facilitam comparar valores de
// relance, e remetem a etiqueta de preço, combinando com o resto do tema
// (grafite + acentos coral/dourado/verde). Ver .stat-value-mono e
// .score-value em globals.css.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-mono",
  display: "swap",
});

// Script de inicialização do tema claro/escuro (pedido do usuário em
// 04/08/2026, botão em app/dashboard/theme-toggle.tsx). Roda ANTES do
// primeiro paint (síncrono, direto no <head>, sem defer/async) pra aplicar
// o tema salvo no localStorage antes da página desenhar qualquer coisa —
// sem isso, quem tivesse escolhido o fundo claro veria um flash do tema
// escuro (padrão do :root) por uma fração de segundo a cada carregamento,
// até o React hidratar e corrigir.
const themeInitScript = `
(function () {
  try {
    var tema = localStorage.getItem("gs_tema");
    if (tema === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      data-theme="dark"
      suppressHydrationWarning
      className={`${poppins.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Tabler Icons (webfont) — usado nos ícones da sidebar e dos
            títulos de seção a partir do redesenho de 04/08/2026. Carregado
            via CDN (não tem pacote leve no npm equivalente ao next/font
            pra webfonts de ícone); é só um <link> de CSS, sem JS extra. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/tabler-icons.min.css"
        />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
