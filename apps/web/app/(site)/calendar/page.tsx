import { permanentRedirect } from "next/navigation";

type CalendarAliasParams = Promise<Record<string, string | string[] | undefined>>;

/** Older calendar address. The month calendar lives at /ipo-calendar. */
export default async function CalendarAliasPage({ searchParams }: { searchParams: CalendarAliasParams }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["month", "view", "board"] as const) {
    const value = params[key];
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw) query.set(key, raw);
  }
  const text = query.toString();
  permanentRedirect(text ? `/ipo-calendar?${text}` : "/ipo-calendar");
}
