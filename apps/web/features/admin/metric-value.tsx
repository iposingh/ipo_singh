export function MetricValue({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">Unavailable</span>;
  return <span>{value.toLocaleString("en-IN")}</span>;
}
