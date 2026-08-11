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
            <span className="logo">
              Message<span>Lab</span>
            </span>
            <small>audience testing &amp; UX review</small>
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
