import Link from "next/link";
import { footerNav } from "@/lib/navigation/routes";
import { indexablePaths } from "@/lib/seo/site";

export function SiteFooter() {
  const discover = indexablePaths.filter((item) => footerNav.every((link) => link.href !== item.path));
  return (
    <footer className="mt-auto border-t border-border bg-surface pb-[calc(5.5rem+var(--app-promo-bar)+env(safe-area-inset-bottom))] lg:pb-10">
      <div className="mx-auto grid w-full max-w-[70rem] gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-foreground">IPO Singh</p>
          <p className="max-w-2xl text-sm leading-6 text-muted">All IPO insights. One place.</p>
        </div>
        <nav aria-label="IPO pages">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {discover.map((item) => (
              <li key={item.path}>
                <Link href={item.path} className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {footerNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="max-w-3xl text-sm leading-6 text-muted">
          Lists show issues stored by IPO Singh and stay empty when none are stored. Mainboard and SME issues are listed separately. GMP and subscription appear on
          each IPO page, with the licensed source named and each value marked missing, zero or stale. Nothing on this
          site is investment advice.
        </p>
      </div>
    </footer>
  );
}
