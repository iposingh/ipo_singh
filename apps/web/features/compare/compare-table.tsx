import type { CompareColumn, CompareRow } from "@/features/compare/rows";
import { CompareValue } from "@/features/compare/compare-value";

function rowClass(differs: boolean): string {
  return differs ? "bg-background" : "bg-surface";
}

export function CompareTable({ columns, rows }: { columns: readonly CompareColumn[]; rows: readonly CompareRow[] }) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">
        GMP is unofficial and does not guarantee listing returns. A marked row only means the stored values are not the same. No issue is ranked or recommended.
      </p>
      <ul className="grid gap-4 md:hidden">
        {columns.map((column, index) => (
          <li key={column.state === "stored" ? column.ipo.slug : column.slug} className="rounded-panel border border-border bg-surface p-4">
            <dl className="grid gap-3">
              {rows.map((row) => {
                const cell = row.cells[index];
                if (!cell) return null;
                return (
                  <div key={row.id} className={row.differs ? "rounded-control bg-background px-3 py-2" : undefined}>
                    <dt className="text-sm text-muted">
                      {row.label}
                      {row.differs ? <span className="text-foreground"> · Values differ</span> : null}
                    </dt>
                    <dd className="mt-1 text-sm">
                      <CompareValue display={cell.display} />
                    </dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden min-w-0 overflow-x-auto md:block">
        <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
          <caption className="px-4 py-3 text-left text-sm text-muted">
            Side-by-side stored figures. Marked rows differ. No issue is recommended.
          </caption>
          <thead>
            <tr className="bg-surface">
              <th scope="col" className="sticky left-0 bg-surface px-4 py-3 font-medium text-muted">
                Field
              </th>
              {columns.map((column) => (
                <th key={column.state === "stored" ? column.ipo.slug : column.slug} scope="col" className="px-4 py-3 font-medium">
                  {column.state === "stored" ? column.ipo.companyName : "Not stored"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={rowClass(row.differs)}>
                <th scope="row" className="sticky left-0 bg-inherit px-4 py-3 font-medium">
                  {row.label}
                  {row.differs ? <span className="mt-1 block text-xs font-normal text-muted">Values differ</span> : null}
                </th>
                {row.cells.map((cell, index) => {
                  const column = columns[index];
                  const key = column?.state === "stored" ? column.ipo.slug : (column?.slug ?? String(index));
                  return (
                    <td key={`${row.id}:${key}`} className="px-4 py-3 align-top">
                      <CompareValue display={cell.display} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
