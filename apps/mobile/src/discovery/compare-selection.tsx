import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { toggleCompareSlug } from "../discovery/selection";

type CompareSelection = {
  slugs: readonly string[];
  notice: string | null;
  toggle: (slug: string) => void;
  clear: () => void;
};

const CompareContext = createContext<CompareSelection | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<{ slugs: string[]; notice: string | null }>({ slugs: [], notice: null });
  const value = useMemo<CompareSelection>(() => ({
    slugs: selection.slugs,
    notice: selection.notice,
    toggle(slug: string) {
      setSelection((current) => {
        const next = toggleCompareSlug(current.slugs, slug);
        const notice = next.rejected === "full"
          ? "Comparison holds 4 IPOs. Remove one to add another."
          : next.rejected === "invalid"
            ? "That IPO address is not valid."
            : null;
        return { slugs: next.slugs, notice };
      });
    },
    clear() {
      setSelection({ slugs: [], notice: null });
    },
  }), [selection]);
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompareSelection(): CompareSelection {
  const value = useContext(CompareContext);
  if (!value) throw new Error("Compare selection is unavailable.");
  return value;
}
