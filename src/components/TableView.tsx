import React from "react";
import { APP_CONFIG } from "@/config";

interface TableViewProps { data: any; }

function extractTable(data: any): Array<Record<string, any>> | null {
  if (Array.isArray(data) && data.length && typeof data[0] === "object") return data as any[];
  if (data && typeof data === "object") {
    for (const key of Object.keys(data)) {
      const value = (data as any)[key];
      if (Array.isArray(value) && value.length && typeof value[0] === "object") return value as any[];
    }
  }
  return null;
}

const TableView: React.FC<TableViewProps> = ({ data }) => {
  const rows = extractTable(data);
  if (!rows) return null;
  const columns = Object.keys(rows[0] ?? {}).slice(0, APP_CONFIG.MAX_TABLE_COLUMNS);

  return (
    <div className="w-full overflow-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t">
              {columns.map((col) => (
                <td key={col} className="px-3 py-2 align-top">
                  {String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TableView;
