type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "Loading" }: LoadingStateProps) {
  return (
    <div role="status" className="flex items-center gap-3 text-sm text-muted">
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none"
      />
      <span>{label}</span>
    </div>
  );
}
