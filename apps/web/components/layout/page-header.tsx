type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
};

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="max-w-2xl">
      {eyebrow ? <p className="text-xs font-semibold tracking-[0.08em] text-link uppercase">{eyebrow}</p> : null}
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
      {description ? <p className="mt-3 text-base leading-7 text-muted">{description}</p> : null}
    </header>
  );
}
