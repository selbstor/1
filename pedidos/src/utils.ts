import { SheetColumn, SheetParseResult } from "./types";

/**
 * Parses a raw CSV string into a 2D array of cells.
 * Correctly handles double-quoted cells, embedded commas, and escaped quotes.
 */
export function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let entry = "";
  
  // Normalize line endings to LF
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  
  for (let i = 0; i < normalizedText.length; i++) {
    const char = normalizedText[i];
    const nextChar = normalizedText[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        entry += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(entry);
      entry = "";
    } else if (char === "\n" && !inQuotes) {
      row.push(entry);
      // Only push non-empty rows or rows that have actual columns
      if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
        result.push(row);
      }
      row = [];
      entry = "";
    } else {
      entry += char;
    }
  }
  
  // Handle final token if there is one
  if (entry || row.length > 0) {
    row.push(entry);
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
      result.push(row);
    }
  }
  
  return result;
}

/**
 * Attempts to parse a string into a valid JavaScript Date.
 * Supports:
 * - DD/MM/YYYY or DD-MM-YYYY (Very common in Portuguese/Brazilian sheets)
 * - YYYY-MM-DD
 * - MM/DD/YYYY
 * - Standard Date.parse strings
 */
export function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  const cleanStr = dateStr.trim();
  if (!cleanStr) return null;

  // 1. Try DD/MM/YYYY or DD-MM-YYYY with optional time (e.g. "19/07/2026" or "19/07/2026 14:30")
  const dmyRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
  const dmyMatch = cleanStr.match(dmyRegex);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1; // 0-indexed month
    const year = parseInt(dmyMatch[3], 10);
    
    // Check for optional time
    const timePart = cleanStr.substring(dmyMatch[0].length).trim();
    const timeMatch = timePart.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      return new Date(year, month, day, hours, minutes, seconds);
    }
    return new Date(year, month, day);
  }

  // 2. Try YYYY-MM-DD or YYYY/MM/DD
  const ymdRegex = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/;
  const ymdMatch = cleanStr.match(ymdRegex);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    
    // Check for optional time
    const timePart = cleanStr.substring(ymdMatch[0].length).trim();
    const timeMatch = timePart.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      return new Date(year, month, day, hours, minutes, seconds);
    }
    return new Date(year, month, day);
  }

  // 3. Try standard JavaScript Date.parse (handles ISO, MM/DD/YYYY, etc.)
  const timestamp = Date.parse(cleanStr);
  if (!isNaN(timestamp)) {
    return new Date(timestamp);
  }

  return null;
}

/**
 * Checks if a string looks like it could be a date
 */
export function isDateString(value: string): boolean {
  if (!value) return false;
  // If it's a pure number like "12345", it's probably not a date string in this context
  if (/^\d+$/.test(value.trim()) && value.trim().length < 6) return false;
  return parseDateString(value) !== null;
}

/**
 * Processes raw CSV cells into structured SheetParseResult,
 * identifying headers, columns, types, and the most likely Date column index.
 */
export function processRawCSV(rawRows: string[][], sourceUrl: string): SheetParseResult {
  if (rawRows.length === 0) {
    return {
      url: sourceUrl,
      headers: [],
      rows: [],
      columns: [],
      detectedDateColumnIndex: null,
    };
  }

  const headers = rawRows[0];
  const rows = rawRows.slice(1);
  const numColumns = headers.length;
  
  // Calculate column profiles by scanning up to 30 sample rows
  const columns: SheetColumn[] = [];
  let detectedDateColumnIndex: number | null = null;
  let maxDateCount = 0;

  for (let colIdx = 0; colIdx < numColumns; colIdx++) {
    let dateCount = 0;
    let numberCount = 0;
    let totalSampled = 0;

    const sampleLimit = Math.min(rows.length, 30);
    for (let rowIdx = 0; rowIdx < sampleLimit; rowIdx++) {
      const val = rows[rowIdx][colIdx];
      if (val !== undefined && val.trim() !== "") {
        totalSampled++;
        if (isDateString(val)) {
          dateCount++;
        } else if (!isNaN(Number(val.trim().replace(",", ".")))) {
          numberCount++;
        }
      }
    }

    let detectedType: "date" | "number" | "text" = "text";
    if (totalSampled > 0) {
      if (dateCount / totalSampled >= 0.5) {
        detectedType = "date";
      } else if (numberCount / totalSampled >= 0.5) {
        detectedType = "number";
      }
    }

    // Fallback detection based on header name if no strong column profile
    const colName = headers[colIdx]?.toLowerCase() || "";
    if (detectedType === "text") {
      if (colName.includes("data") || colName.includes("date") || colName.includes("criado") || colName.includes("created")) {
        // If header name strongly indicates date, elevate it to date type
        detectedType = "date";
      }
    }

    columns.push({
      name: headers[colIdx] || `Coluna ${colIdx + 1}`,
      index: colIdx,
      detectedType,
    });

    // Pick the date column with the highest count of parsed dates
    if (detectedType === "date" && dateCount >= maxDateCount) {
      maxDateCount = dateCount;
      detectedDateColumnIndex = colIdx;
    }
  }

  // If no date column was detected by data profile, check header names
  if (detectedDateColumnIndex === null) {
    for (let colIdx = 0; colIdx < numColumns; colIdx++) {
      const colName = headers[colIdx]?.toLowerCase() || "";
      if (colName.includes("data") || colName.includes("date") || colName.includes("criado") || colName.includes("created")) {
        detectedDateColumnIndex = colIdx;
        break;
      }
    }
  }

  return {
    url: sourceUrl,
    headers,
    rows,
    columns,
    detectedDateColumnIndex,
  };
}

/**
 * Formats a Date object to YYYY-MM-DD
 */
export function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formats a Date object to European/Brazilian format (DD/MM/YYYY HH:mm:ss)
 */
export function formatToDateTime(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Generates a CSV text where columns are separated by a delimiter (default: semicolon).
 * Cleans internal delimiters inside values to prevent format breakage.
 */
export function generateSemicolonCSV(headers: string[], rows: string[][], delimiter: string = ";"): string {
  const allLines = [headers, ...rows];
  // Safely escape any special character in delimiter for regex use
  const delimEscaped = delimiter.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const delimRegex = delimiter ? new RegExp(delimEscaped, 'g') : null;

  return allLines
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return "";
          let cleanCell = String(cell);
          if (delimRegex) {
            // Replace any custom delimiter inside data with a space to avoid broken structure
            cleanCell = cleanCell.replace(delimRegex, " ");
          }
          // If the cell contains newlines, replace them with spaces for clean single-line records
          cleanCell = cleanCell.replace(/\n/g, " ").replace(/\r/g, "");
          return cleanCell;
        })
        .join(delimiter)
    )
    .join("\r\n");
}

export interface ParsedItemsTable {
  headers: string[];
  rows: string[][];
}

/**
 * Parses an items/products detail text cell into a structured table.
 * Automatically handles multi-line lists, various delimiters (-, |, ;, comma),
 * and dynamically infers or builds appropriate table column titles.
 */
export function parseItemsDetail(text: string, columnHeader: string): ParsedItemsTable {
  if (!text) return { headers: [columnHeader], rows: [] };

  // Determine if we should split by newline or other delimiters
  let lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  
  // If there's only one line but it contains semicolons (;) or pipes (|), let's split it into lines by that separator
  if (lines.length === 1) {
    if (text.includes(";")) {
      lines = text.split(";").map(p => p.trim()).filter(p => p.length > 0);
    } else if (text.includes("|")) {
      lines = text.split("|").map(p => p.trim()).filter(p => p.length > 0);
    }
  }

  if (lines.length === 0) {
    return { headers: [columnHeader], rows: [] };
  }

  // Detect internal delimiter for columns within each line (e.g. separating quantity, product name, value)
  // Common delimiters: ' - ', ' | ', ';', '\t'
  const delimiters = [' - ', ' | ', ';', '\t'];
  let bestDelim = '';
  let maxCount = 0;

  for (const delim of delimiters) {
    let count = 0;
    for (const line of lines) {
      if (line.includes(delim)) {
        count++;
      }
    }
    // If it appears in at least half of the non-empty lines, or in the only line
    if (count > maxCount && (count >= lines.length / 2 || lines.length === 1)) {
      maxCount = count;
      bestDelim = delim;
    }
  }

  // If no structured delimiter is found but we have a comma, check if we can use comma as delimiter
  // (avoiding Brazilian currency decimal separator like 350,00)
  if (!bestDelim && text.includes(",")) {
    let commaCount = 0;
    for (const line of lines) {
      const parts = line.split(",");
      if (parts.length > 1) {
        let looksLikeDecimal = false;
        for (let i = 1; i < parts.length; i++) {
          const part = parts[i].trim();
          if (/^\d{2}(\s|$)/.test(part) && /^\d+$/.test(parts[i-1].trim().slice(-1))) {
            looksLikeDecimal = true;
          }
        }
        if (!looksLikeDecimal) {
          commaCount++;
        }
      }
    }
    if (commaCount >= lines.length / 2 || lines.length === 1) {
      bestDelim = ",";
    }
  }

  let parsedRows: string[][] = [];
  if (bestDelim) {
    parsedRows = lines.map(line => {
      return line.split(bestDelim).map(part => {
        let p = part.trim();
        // Remove surrounding quotes
        if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1).trim();
        if (p.startsWith("'") && p.endsWith("'")) p = p.slice(1, -1).trim();
        return p;
      });
    });
  } else {
    // Simple list where each line is a single column cell
    parsedRows = lines.map(line => [line]);
  }

  // Let's check if the first row is a header row (contains keywords or is all text while others have numbers)
  const firstRow = parsedRows[0];
  const commonHeaderKeywords = [
    "id", "qtd", "quant", "prod", "item", "val", "preço", "price", "desc", "nome", 
    "name", "total", "status", "sku", "código", "codigo", "unit", "unid", "subtotal"
  ];

  const hasHeaderKeywords = firstRow.some(cell => 
    commonHeaderKeywords.some(keyword => cell.toLowerCase().includes(keyword))
  );

  const isFirstRowAllText = firstRow.every(cell => isNaN(Number(cell.replace(/[\$R\s,\.-]/g, ''))));
  const hasNumericValues = parsedRows.some(row => 
    row.some(cell => {
      const cleanVal = cell.replace(/[\$R\s\.-]/g, '').replace(',', '.');
      return cell.trim() !== "" && !isNaN(Number(cleanVal)) && cleanVal.length > 0;
    })
  );

  const isMultiRow = parsedRows.length > 1;
  const isFirstRowHeader = firstRow.length > 1 && isMultiRow && (hasHeaderKeywords || (isFirstRowAllText && hasNumericValues));

  // Process rows to extract quantity ending in 'x' or 'X'
  const processedRows = parsedRows.map((row, idx) => {
    // If it's the header row, we don't want to parse quantity out of it
    if (idx === 0 && isFirstRowHeader) {
      return {
        qtd: "QTD",
        cells: row
      };
    }

    let extractedQtd = "-";
    const cleanedCells = row.map(cell => {
      // Matches quantity ending in 'x' or 'X', like '2x', '10X', '(3x)', '1.5x'
      const match = cell.match(/(?:\b|\()(\d+(?:\.\d+)?\s*[xX])(?:\b|\))/);
      if (match && extractedQtd === "-") {
        extractedQtd = match[1].trim().replace(/[xX]/g, '').trim();
        // Remove the matched pattern from the cell text
        let cleaned = cell.replace(match[0], '').trim();
        // Clean up remaining empty parentheses or brackets
        cleaned = cleaned.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '').trim();
        // Clean up leading/trailing delimiters
        cleaned = cleaned.replace(/^[\s\-\|;,]+|[\s\-\|;,]+$/g, '').trim();
        // Clean up multiple spaces
        cleaned = cleaned.replace(/\s+/g, ' ');
        return cleaned;
      }
      return cell;
    });

    return {
      qtd: extractedQtd,
      cells: cleanedCells
    };
  });

  const remainingRows = processedRows.map(r => r.cells);
  let headers: string[] = [];
  let dataRows: string[][] = [];

  if (isFirstRowHeader) {
    const firstCellHeader = processedRows[0].cells[0] || "Produtos";
    const otherCellHeaders = processedRows[0].cells.slice(1);
    headers = [firstCellHeader, "QTD", ...otherCellHeaders];
    dataRows = processedRows.slice(1).map(r => {
      const firstCell = r.cells[0] || "";
      const otherCells = r.cells.slice(1);
      return [firstCell, r.qtd, ...otherCells];
    });
  } else {
    // Infer headers based on remaining columns
    const maxCols = Math.max(...remainingRows.map(r => r.length), 1);
    let baseHeaders: string[] = [];
    if (maxCols === 1) {
      baseHeaders = ["Produtos"];
    } else if (maxCols === 2) {
      baseHeaders = ["Produtos", "Valor"];
    } else if (maxCols === 3) {
      baseHeaders = ["Produtos", "Valor", "Informação"];
    } else {
      baseHeaders = Array.from({ length: maxCols }, (_, i) => i === 0 ? "Produtos" : `Campo ${i + 1}`);
    }
    
    const firstCellHeader = baseHeaders[0] || "Produtos";
    const otherCellHeaders = baseHeaders.slice(1);
    headers = [firstCellHeader, "QTD", ...otherCellHeaders];
    dataRows = processedRows.map(r => {
      const firstCell = r.cells[0] || "";
      const otherCells = r.cells.slice(1);
      return [firstCell, r.qtd, ...otherCells];
    });
  }

  return { headers, rows: dataRows };
}
