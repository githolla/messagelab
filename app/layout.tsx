import "./globals.css";
import type { Metadata } from "next";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Message Lab — simulated focus groups powered by persona-agents",
  description:
    "Convene a simulated focus group of persona-agents that react in character to your product, landing page, strategy, or concept — and for a live site, walk through it themselves. Get a structured report.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="app">
          <a className="brand" href="/">
            <span className="logomark" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="9" width="2.6" height="5" rx="1" fill="#8b909b" />
                <rect x="6.7" y="5.5" width="2.6" height="8.5" rx="1" fill="#fff" />
                <rect x="11.9" y="2" width="2.6" height="12" rx="1" fill="#7c93ff" />
              </svg>
            </span>
            <span className="logo">
              Message<span>Lab</span>
            </span>
            <small>simulated focus groups</small>
          </a>
          <Nav />
        </header>
        <main>{children}</main>
        <footer className="app">
          Focus group results are simulated persona-agent responses — directional signal for testing,
          not a prediction of real-world performance. Validate high-stakes decisions with real people.
        </footer>
      </body>
    </html>
  );
}
