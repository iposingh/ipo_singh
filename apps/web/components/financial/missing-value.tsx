type MissingValueProps = {
  label?: string;
};

export function MissingValue({ label = "Unavailable" }: MissingValueProps) {
  return <span className="text-muted">{label}</span>;
}
