export type HistoryPoint = {
  label: string;
  value: number;
};

export function HistoryChart({
  title,
  points,
  emptyDescription,
}: {
  title: string;
  points: readonly HistoryPoint[];
  emptyDescription: string;
}) {
  if (points.length === 0) {
    return (
      <figure className="rounded-panel border border-dashed border-border bg-surface px-5 py-8">
        <figcaption className="text-sm font-semibold text-foreground">{title}</figcaption>
        <p className="mt-2 text-sm leading-6 text-muted">{emptyDescription}</p>
      </figure>
    );
  }

  const width = 320;
  const height = 120;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coordinates = points
    .map((point, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = height - ((point.value - min) / span) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <figure className="grid gap-3">
      <figcaption className="text-sm font-semibold text-foreground">{title}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} className="h-32 w-full text-link">
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={coordinates} />
      </svg>
      <ul className="sr-only">
        {points.map((point) => (
          <li key={`${point.label}-${point.value}`}>
            {point.label}: {point.value}
          </li>
        ))}
      </ul>
    </figure>
  );
}
