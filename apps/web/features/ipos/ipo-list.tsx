import type { Ipo } from "@ipo-singh/contracts";
import { EmptyState } from "@/components/ui/empty-state";
import { IpoGuruCreditLink } from "@/features/ipo-details/source-credit-link";
import { isIpoGuruSource } from "@/features/ipo-details/source-credit";
import { IpoCard } from "@/features/ipos/ipo-card";
import { IpoTable } from "@/features/ipos/ipo-table";

type IpoListProps = {
  items: readonly Ipo[];
  emptyTitle: string;
  emptyDescription: string;
  caption?: string;
  credit?: boolean;
};

export function IpoList({ items, emptyTitle, emptyDescription, caption = "IPO issues", credit = true }: IpoListProps) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  const showCredit = credit && items.some((ipo) => isIpoGuruSource(ipo.provenance.sourceName));
  return (
    <>
      {showCredit ? (
        <p className="text-sm text-muted">
          <IpoGuruCreditLink />
        </p>
      ) : null}
      <ul className="grid gap-4 md:hidden">
        {items.map((ipo) => (
          <li key={ipo.id}>
            <IpoCard ipo={ipo} />
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <IpoTable items={items} caption={caption} />
      </div>
    </>
  );
}
