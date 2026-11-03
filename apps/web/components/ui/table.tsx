import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TableColumn<Row> = {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  numeric?: boolean;
};

type TableProps<Row> = {
  caption: string;
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row) => string;
  emptyLabel?: string;
};

export function Table<Row>({ caption, columns, rows, getRowKey, emptyLabel = "No rows" }: TableProps<Row>) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-panel border border-border bg-surface">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="px-4 py-3 text-left text-sm text-muted">{caption}</caption>
        <thead className="bg-background text-muted">
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={cn(
                  "px-4 py-3 font-medium",
                  column.numeric ? "text-right" : "text-left",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="border-t border-border">
              <td colSpan={columns.length} className="px-4 py-8 text-center text-muted">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={getRowKey(row)} className="border-t border-border">
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn(
                      "px-4 py-3 align-middle text-foreground",
                      column.numeric ? "text-right tabular-nums" : null,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
