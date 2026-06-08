import Link from "next/link";

import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };

type Props = {
  /** Right side: user menu, auth CTA, etc. */
  end?: React.ReactNode;
  /** Optional nav links (e.g. Dashboard on inbox) */
  nav?: NavItem[];
  className?: string;
};

export function SiteHeader({ end, nav, className }: Props) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-border/80 bg-card/80 backdrop-blur-md supports-backdrop-filter:bg-card/60",
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link
            href="/"
            className="text-[15px] font-semibold tracking-tight text-foreground"
          >
            Vigil
          </Link>
          {nav && nav.length > 0 && (
            <nav className="flex items-center gap-1" aria-label="App">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1.5 text-sm font-medium transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">{end}</div>
      </div>
    </header>
  );
}
