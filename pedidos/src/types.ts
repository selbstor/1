export interface SheetColumn {
  name: string;
  index: number;
  detectedType: "date" | "number" | "text";
}

export interface SheetParseResult {
  url: string;
  headers: string[];
  rows: string[][];
  columns: SheetColumn[];
  detectedDateColumnIndex: number | null;
}

export interface DateFilter {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  columnName: string;
  columnIndex: number;
}
