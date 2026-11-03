import type { ReactNode } from "react";

type ErrorStateProps = {
  title: string;
  message: string;
  action?: ReactNode;
};

export function ErrorState({ title, message, action }: ErrorStateProps) {
  return (
    <div role="alert" className="rounded-panel border border-border bg-surface px-5 py-8">
      <p className="text-sm font-medium text-negative-text">Error</p>
      <h3 className="mt-1 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
