import type { Ipo } from "@ipo-singh/contracts";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { officialHttpUrl } from "@/features/ipo-details/official-url";

const documentLabels = {
  drhp: "DRHP",
  rhp: "RHP",
  source: "Source",
} as const;

export function DocumentsSection({ ipo }: { ipo: Ipo | null }) {
  const documents = (ipo?.documents ?? []).flatMap((document) => {
    const url = officialHttpUrl(document.url);
    return url ? [{ ...document, url }] : [];
  });
  return (
    <section className="grid gap-4" aria-labelledby="ipo-documents">
      <SectionHeader id="ipo-documents" title="Documents" description="RHP, DRHP, and other links that passed the official address check. Unverified addresses are left out." />
      {documents.length === 0 ? (
        <EmptyState title="No documents are loaded" description="DRHP, RHP and other source documents appear here when the issue includes them." />
      ) : (
        <ul className="grid gap-2">
          {documents.map((document) => (
            <li key={`${document.kind}-${document.url}`}>
              <a href={document.url} className="text-sm font-medium text-link underline-offset-2 hover:underline" target="_blank" rel="noopener noreferrer">
                {document.title || documentLabels[document.kind]}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
