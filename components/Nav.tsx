"use client";

import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();
  const onTool = pathname === "/test" || pathname.startsWith("/test/");
  return (
    <nav className="nav">
      <a href="/test" className={`navcta ${onTool ? "active" : ""}`}>
        Focus Group
      </a>
    </nav>
  );
}
