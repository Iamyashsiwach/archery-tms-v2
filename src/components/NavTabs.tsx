"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavTabs({ base, links }: { base: string; links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="-mx-4 mt-3 overflow-x-auto border-b border-neutral-200 px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {links.map(({ href, label }) => {
          const url = base + href;
          const active = href === "" ? path === url : path.startsWith(url);
          return (
            <li key={url}>
              <Link
                href={url}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm ${
                  active ? "border-neutral-900 font-semibold text-neutral-900" : "border-transparent text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
