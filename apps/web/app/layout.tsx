import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeScript } from "@/components/theme/theme-script";
import { AppPromoScript } from "@/features/promotions/app-promo-script";
import { TooltipProvider } from "@/components/ui/tooltip";
import { siteUrl } from "@/lib/seo/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
  preload: true,
});

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#080F1A" },
  ],
};

const origin = siteUrl();

export const metadata: Metadata = {
  ...(origin ? { metadataBase: origin } : {}),
  title: {
    default: "IPO Singh | All IPO Insights. One Place.",
    template: "%s | IPO Singh",
  },
  description: "All IPO insights. One place. Indian IPO lists, calendars, and stored issue pages.",
  applicationName: "IPO Singh",
  openGraph: {
    title: "IPO Singh | All IPO Insights. One Place.",
    description: "All IPO insights. One place. Indian IPO lists, calendars, and stored issue pages.",
    siteName: "IPO Singh",
    type: "website",
    locale: "en_IN",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "IPO Singh. All IPO insights. One place." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "IPO Singh | All IPO Insights. One Place.",
    description: "All IPO insights. One place. Indian IPO lists, calendars, and stored issue pages.",
    images: ["/opengraph-image.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ThemeScript />
        <AppPromoScript />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-control focus:bg-primary-solid focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <TooltipProvider>
            <div className="flex flex-1 flex-col">{children}</div>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
