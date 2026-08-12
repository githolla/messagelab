import "./globals.css";
import type { Metadata } from "next";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Message Lab — test messages & experiences with simulated audiences",
  description:
    "Pre-test two versions of a message against a simulated audience panel, and get an expert UI/UX review of any web page — for any industry.",
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
            <small>audience &amp; UX testing</small>
          </a>
          <Nav />
        </header>
        <main>{children}</main>
        <footer className="app">
          Panel results are simulated audience responses — directional signal for testing, not a
          prediction of real-world performance. Page reviews are one model&apos;s expert read of a
          screenshot, not a usability test.
        </footer>
      </body>
    </html>
  );
}
