type AdSlotProps = {
  label?: string;
};

export function AdSlot({ label = "Advertising" }: AdSlotProps) {
  return (
    <aside aria-label={label} className="rounded-panel border border-dashed border-border bg-surface px-4 py-4">
      <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">Advertising</p>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
        This space is reserved for a future advertisement. No advertisement is loaded.
      </p>
    </aside>
  );
}
