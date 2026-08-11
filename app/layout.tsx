import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Message Lab — donor appeal pre-testing",
  description:
    "Pre-test fundraising appeal variants against simulated donor personas before you send.",
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
          <h1>
            Message<span>Lab</span>
          </h1>
          <small>donor appeal pre-testing · pilot</small>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
