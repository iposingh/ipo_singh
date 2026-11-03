type Observed = { observedAt: string | null } | null;

/** Uses the provider observation time. A fetch time is not shown as the data timestamp. */
export function providerObservedAt(input: { gmp: Observed; subscription: Observed }): Date | null {
  const stamps = [input.gmp?.observedAt, input.subscription?.observedAt].flatMap((value) => {
    if (!value) return [];
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? [] : [date];
  });
  return stamps.reduce<Date | null>((latest, date) => {
    if (!latest || date.getTime() > latest.getTime()) return date;
    return latest;
  }, null);
}
