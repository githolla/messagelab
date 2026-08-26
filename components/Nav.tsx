"use client";

import { usePathname } from "next/navigation";

export function Nav() {
  const pathname = usePathname();
  const onTool = pathname === "/test" || pathname.startsWith("/test/");
  const onGate = pathname === "/gate" || pathname.startsWith("/gate/");
  return (
    <nav className="nav">
      <a href="/test" className={`navcta ${onTool ? "active" : ""}`}>
        Focus Group
      </a>
      <a href="/gate" className={`navcta ${onGate ? "active" : ""}`}>
        Proposal Gate
      </a>
    </nav>
  );
}
