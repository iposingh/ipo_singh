import { SearchBox } from "@/features/search/search-box";

type SiteSearchProps = {
  id?: string;
  className?: string;
  defaultQuery?: string;
  formKey?: string;
};

export function SiteSearch({ id = "site-search", className, defaultQuery = "", formKey }: SiteSearchProps) {
  return <SearchBox key={formKey} id={id} className={className} initialQuery={defaultQuery} />;
}
