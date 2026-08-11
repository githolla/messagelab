"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "A/B Message Test" },
  { href: "/review", label: "UX Page Review" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {LINKS.map((l) => (
        <a key={l.href} href={l.href} className={pathname === l.href ? "active" : ""}>
          {l.label}
        </a>
      ))}
    </nav>
  );
}
