import { useState, useEffect, useMemo, FormEvent, Fragment, useRef } from "react";
import { 
  FileSpreadsheet, 
  Download, 
  Search, 
  Calendar, 
  HelpCircle, 
  CheckCircle, 
  AlertCircle, 
  X, 
  RefreshCw, 
  TableProperties, 
  ChevronLeft, 
  ChevronRight, 
  Info, 
  ExternalLink,
  SlidersHorizontal,
  FileText,
  ChevronDown,
  Check,
  Filter
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SheetParseResult } from "./types";
import { 
  parseCSV, 
  processRawCSV, 
  parseDateString, 
  generateSemicolonCSV,
  formatDateToYYYYMMDD
} from "./utils";
import { DEMO_CSV_DATA } from "./data";

export default function App() {
  // Application State
  const [sheetUrl, setSheetUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [sheetData, setSheetData] = useState<SheetParseResult | null>(null);
  
  // Filtering States
  const [pendingColIndex, setPendingColIndex] = useState<number>(-1);
  const [pendingStartDate, setPendingStartDate] = useState<string>("");
  const [pendingEndDate, setPendingEndDate] = useState<string>("");
  const [pendingSearchQuery, setPendingSearchQuery] = useState<string>("");

  const [appliedColIndex, setAppliedColIndex] = useState<number>(-1);
  const [appliedStartDate, setAppliedStartDate] = useState<string>("");
  const [appliedEndDate, setAppliedEndDate] = useState<string>("");
  const [appliedSearchQuery, setAppliedSearchQuery] = useState<string>("");

  // Column Visibility States
  const [pendingVisibleColumns, setPendingVisibleColumns] = useState<Record<number, boolean>>({});
  const [appliedVisibleColumns, setAppliedVisibleColumns] = useState<Record<number, boolean>>({});
  
  // Column Visibility Combobox States
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState<boolean>(false);
  const [colSearchQuery, setColSearchQuery] = useState<string>("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside listener for column dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsColumnDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  
  // Expanded Rows State for Master-Detail View
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  // Reset expanded rows on filter, search or page changes
  useEffect(() => {
    setExpandedRows({});
  }, [appliedColIndex, appliedStartDate, appliedEndDate, appliedSearchQuery, currentPage, rowsPerPage]);

  // Find column corresponding to "itens" or similar
  const itemsColIndex = useMemo(() => {
    if (!sheetData) return -1;
    const candidates = [
      "itens", "itens do pedido", "items", "produtos", "produto", "product", "description", "descrição", "descriçao", "detalhes"
    ];
    return sheetData.headers.findIndex(h => 
      candidates.some(c => h.toLowerCase().trim() === c || h.toLowerCase().trim().includes(c))
    );
  }, [sheetData]);

  // UI toggles
  const [showInstructions, setShowInstructions] = useState<boolean>(false);
  const [showPreviewExport, setShowPreviewExport] = useState<boolean>(false);
  const [delimiter, setDelimiter] = useState<string>(";");
  const [sheetName, setSheetName] = useState<string>("planilha_filtrada");

  // Sync selected Date Column when sheet data changes
  useEffect(() => {
    if (sheetData) {
      let initialCol = -1;
      
      // Look for a column explicitly named or containing "Data/Hora" (case-insensitive)
      const dataHoraCol = sheetData.columns.find((col) => {
        const nameLower = col.name.trim().toLowerCase();
        return nameLower === "data/hora" || nameLower === "data hora" || nameLower.includes("data/hora") || nameLower.includes("data hora");
      });
      
      if (dataHoraCol) {
        initialCol = dataHoraCol.index;
      } else if (sheetData.detectedDateColumnIndex !== null) {
        initialCol = sheetData.detectedDateColumnIndex;
      } else if (sheetData.columns.length > 0) {
        initialCol = 0;
      }
      
      setPendingColIndex(initialCol);
      setAppliedColIndex(initialCol);
      
      // Calculate min and max dates of the initial column as the default range
      let defaultStart = "";
      let defaultEnd = "";
      if (initialCol !== -1 && sheetData.rows.length > 0) {
        const parsedDates = sheetData.rows
          .map(row => parseDateString(row[initialCol]))
          .filter((d): d is Date => d !== null);
          
        if (parsedDates.length > 0) {
          parsedDates.sort((a, b) => a.getTime() - b.getTime());
          defaultStart = formatDateToYYYYMMDD(parsedDates[0]);
          defaultEnd = formatDateToYYYYMMDD(parsedDates[parsedDates.length - 1]);
        }
      }
      
      setPendingStartDate(defaultStart);
      setPendingEndDate(defaultEnd);
      setPendingSearchQuery("");
      
      setAppliedStartDate(defaultStart);
      setAppliedEndDate(defaultEnd);
      setAppliedSearchQuery("");

      // Initialize all columns as visible by default
      const initialVisibleCols: Record<number, boolean> = {};
      sheetData.headers.forEach((_, idx) => {
        initialVisibleCols[idx] = true;
      });
      setPendingVisibleColumns(initialVisibleCols);
      setAppliedVisibleColumns(initialVisibleCols);
      
      setCurrentPage(1);
    }
  }, [sheetData]);

  // Handle Google Sheets Loading via Backend Proxy
  const handleLoadSheet = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!sheetUrl.trim()) {
      setError("Por favor, insira um link válido do Google Sheets.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);
    setShowPreviewExport(false);

    try {
      const response = await fetch(`/api/proxy-sheet?url=${encodeURIComponent(sheetUrl.trim())}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Ocorreu um erro ao carregar os dados da planilha.");
      }

      const rawRows = parseCSV(data.csv);
      if (rawRows.length === 0) {
        throw new Error("A planilha está vazia ou não possui colunas válidas.");
      }

      const processed = processRawCSV(rawRows, sheetUrl.trim());
      setSheetData(processed);
      if (data.title) {
        setSheetName(data.title);
      } else {
        setSheetName("planilha_filtrada");
      }
      setSuccessMsg("Planilha carregada com sucesso do Google Sheets!");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro de conexão ao carregar a planilha pública.");
    } finally {
      setIsLoading(false);
    }
  };

  // Load Built-in Demo Data Instantly
  const handleLoadDemo = () => {
    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);
    setShowPreviewExport(false);
    
    // Simulate slight network delay for premium organic feel
    setTimeout(() => {
      try {
        const rawRows = parseCSV(DEMO_CSV_DATA);
        const processed = processRawCSV(rawRows, "https://docs.google.com/spreadsheets/d/demo-preview/edit");
        setSheetData(processed);
        setSheetName("Planilha de Demonstração");
        setSheetUrl("https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvAHK6v5C_hM10tK8aW3Y3sF5_zA/edit (Demonstração)");
        setSuccessMsg("Dados de demonstração carregados com sucesso!");
      } catch (err: any) {
        setError("Erro ao carregar dados de demonstração.");
      } finally {
        setIsLoading(false);
      }
    }, 450);
  };

  // Reset App state
  const handleClear = () => {
    setSheetUrl("");
    setSheetData(null);
    setSheetName("planilha_filtrada");
    setError(null);
    setSuccessMsg(null);
    setPendingColIndex(-1);
    setPendingStartDate("");
    setPendingEndDate("");
    setPendingSearchQuery("");
    setAppliedColIndex(-1);
    setAppliedStartDate("");
    setAppliedEndDate("");
    setAppliedSearchQuery("");
    setPendingVisibleColumns({});
    setAppliedVisibleColumns({});
    setCurrentPage(1);
    setShowPreviewExport(false);
  };

  // Check if column visibility sets are equal
  const isVisibleColumnsEqual = (a: Record<number, boolean>, b: Record<number, boolean>) => {
    if (!sheetData) return true;
    return sheetData.headers.every((_, idx) => {
      const valA = a[idx] !== false; // defaults to true
      const valB = b[idx] !== false; // defaults to true
      return valA === valB;
    });
  };

  // Check if there are unapplied filter changes
  const hasPendingChanges = useMemo(() => {
    return (
      pendingColIndex !== appliedColIndex ||
      pendingStartDate !== appliedStartDate ||
      pendingEndDate !== appliedEndDate ||
      pendingSearchQuery !== appliedSearchQuery ||
      !isVisibleColumnsEqual(pendingVisibleColumns, appliedVisibleColumns)
    );
  }, [
    pendingColIndex, appliedColIndex,
    pendingStartDate, appliedStartDate,
    pendingEndDate, appliedEndDate,
    pendingSearchQuery, appliedSearchQuery,
    pendingVisibleColumns, appliedVisibleColumns,
    sheetData
  ]);

  // Manually apply current filter values to screen & table
  const handleApplyFilters = () => {
    setAppliedColIndex(pendingColIndex);
    setAppliedStartDate(pendingStartDate);
    setAppliedEndDate(pendingEndDate);
    setAppliedSearchQuery(pendingSearchQuery);
    setAppliedVisibleColumns({ ...pendingVisibleColumns });
    setCurrentPage(1);
    setSuccessMsg("Filtros de data, busca e colunas visíveis aplicados com sucesso!");
    // Auto close error if any
    setError(null);
  };

  // Core Filtering Engine (calculates based strictly on applied filters)
  const { filteredRows, invalidDateCount, totalDateParsedCount } = useMemo(() => {
    if (!sheetData || appliedColIndex === -1) {
      return { filteredRows: [], invalidDateCount: 0, totalDateParsedCount: 0 };
    }

    let invalidDates = 0;
    let parsedDates = 0;

    // Boundary timestamps
    const startBoundary = appliedStartDate ? new Date(appliedStartDate + "T00:00:00").getTime() : null;
    const endBoundary = appliedEndDate ? new Date(appliedEndDate + "T23:59:59.999").getTime() : null;

    const results = sheetData.rows.filter((row) => {
      const cellValue = row[appliedColIndex];
      const rowDate = parseDateString(cellValue);

      // Stat tracking for the selected column
      if (cellValue && cellValue.trim() !== "") {
        if (rowDate) {
          parsedDates++;
        } else {
          invalidDates++;
        }
      }

      // 1. Date range filter
      if (startBoundary !== null || endBoundary !== null) {
        if (!rowDate) {
          return false; // Skip rows that don't have a valid parseable date if date filters are active
        }
        const rowTime = rowDate.getTime();
        if (startBoundary !== null && rowTime < startBoundary) return false;
        if (endBoundary !== null && rowTime > endBoundary) return false;
      }

      // 2. Keyword/Search filter across visible columns only
      if (appliedSearchQuery.trim() !== "") {
        const query = appliedSearchQuery.toLowerCase().trim();
        const matchesSearch = row.some((cell, cellIdx) => {
          if (appliedVisibleColumns[cellIdx] === false) return false;
          return cell !== undefined && String(cell).toLowerCase().includes(query);
        });
        if (!matchesSearch) return false;
      }

      return true;
    });

    return {
      filteredRows: results,
      invalidDateCount: invalidDates,
      totalDateParsedCount: parsedDates
    };
  }, [sheetData, appliedColIndex, appliedStartDate, appliedEndDate, appliedSearchQuery, appliedVisibleColumns]);

  // Paginated rows for preview
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredRows, currentPage, rowsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));

  // Reset pagination page if bounds are exceeded
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [filteredRows, totalPages, currentPage]);

  // Handle Export of Semicolon Separated CSV
  const handleExportCSV = () => {
    if (!sheetData) return;

    try {
      // Filter out columns that are not selected/visible
      const visibleIndices = sheetData.headers
        .map((_, idx) => idx)
        .filter(idx => appliedVisibleColumns[idx] !== false);

      const headers = visibleIndices.map(idx => sheetData.headers[idx]);
      const rowsForExport = filteredRows.map(row => visibleIndices.map(idx => row[idx]));

      const csvContent = generateSemicolonCSV(headers, rowsForExport, delimiter);
      
      // Create a blob and trigger browser download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      
      // Generate clean filename
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const filename = `dados_filtrados_${year}-${month}-${day}.csv`;
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError("Erro ao gerar e exportar arquivo CSV.");
    }
  };

  // Preview generated semicolon content (first few lines)
  const semicolonPreviewText = useMemo(() => {
    if (!sheetData) return "";
    const limit = Math.min(filteredRows.length, 5);
    const previewRows = filteredRows.slice(0, limit);

    // Filter out columns that are not selected/visible
    const visibleIndices = sheetData.headers
      .map((_, idx) => idx)
      .filter(idx => appliedVisibleColumns[idx] !== false);

    const headers = visibleIndices.map(idx => sheetData.headers[idx]);
    const rowsForExport = previewRows.map(row => visibleIndices.map(idx => row[idx]));

    return generateSemicolonCSV(headers, rowsForExport, delimiter);
  }, [sheetData, filteredRows, delimiter, appliedVisibleColumns]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] font-sans antialiased pb-20 selection:bg-emerald-100 selection:text-emerald-900" id="main-container">
      {/* Visual background accents */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-linear-to-b from-emerald-50/50 to-transparent -z-10" />

      {/* Main App Bar / Header */}
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-40 transition-shadow duration-200" id="app-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shadow-xs">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 font-display">
                Filtro de Planilhas Google
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Extraia e segmente dados por data com exportação em ponto e vírgula (;)
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              id="help-toggle-btn"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Instruções</span>
            </button>
            {sheetData && (
              <button
                onClick={handleClear}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 border border-transparent rounded-lg transition-colors cursor-pointer"
                id="clear-btn"
              >
                <X className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        
        {/* Help/Instructions Panel */}
        <AnimatePresence>
          {showInstructions && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
              id="instructions-panel"
            >
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex space-x-3">
                    <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg mt-0.5">
                      <Info className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 font-display">
                        Como preparar e obter o link do Google Sheets
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Siga os passos rápidos para que o aplicativo consiga ler os dados corretamente.
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowInstructions(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                  {[
                    {
                      step: "01",
                      title: "Abra a Planilha",
                      desc: "Abra o documento desejado no Google Sheets no seu navegador."
                    },
                    {
                      step: "02",
                      title: "Clique em Compartilhar",
                      desc: "Acesse o botão 'Compartilhar' azul no canto superior direito."
                    },
                    {
                      step: "03",
                      title: "Acesso Geral",
                      desc: "Altere de 'Restrito' para 'Qualquer pessoa com o link' em modo Leitor."
                    },
                    {
                      step: "04",
                      title: "Copie e Cole",
                      desc: "Copie o link da barra de endereços (ou do botão copiar link) e cole no formulário abaixo."
                    }
                  ].map((item, idx) => (
                    <div key={idx} className="relative p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="absolute top-3 right-3 text-2xl font-bold text-emerald-200/60 font-display">
                        {item.step}
                      </span>
                      <h4 className="text-xs font-bold text-slate-800 pr-6">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-amber-50/50 border border-amber-100 rounded-xl flex items-start space-x-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    <strong>Importante:</strong> Suas colunas de data podem estar em qualquer formato comum (ex: <code>19/07/2026</code> ou <code>2026-07-19</code>). O nosso algoritmo de IA e parsing tentará identificar automaticamente a coluna correspondente!
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Alerts */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start space-x-3 shadow-2xs" id="error-banner">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-red-900">Erro ao processar dados</h3>
              <p className="text-xs text-red-700 mt-0.5 leading-relaxed">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start space-x-3 shadow-2xs animate-fade-in" id="success-banner">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-emerald-900">Sucesso!</h3>
              <p className="text-xs text-emerald-700 mt-0.5">{successMsg}</p>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* App Layout: Input/Source section */}
        {!sheetData ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-xs max-w-3xl mx-auto" id="input-card">
            <div className="text-center max-w-md mx-auto mb-8">
              <div className="inline-flex p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 shadow-xs mb-4">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 font-display">
                Comece inserindo sua planilha
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Insira o link compartilhado de visualização do Google Sheets para extrair os dados, filtrar por data e exportar em formato separado por ponto e vírgula (;).
              </p>
            </div>

            <form onSubmit={handleLoadSheet} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Link da Planilha do Google Sheets
                </label>
                <div className="relative">
                  <input
                    type="url"
                    required
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 focus:bg-white transition-all focus:ring-3 focus:ring-emerald-100"
                    id="sheet-url-input"
                  />
                  <div className="absolute right-3.5 top-3 text-slate-400">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 inline-flex items-center justify-center space-x-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold text-sm rounded-xl transition-all shadow-xs hover:shadow-md cursor-pointer disabled:cursor-not-allowed"
                  id="submit-url-btn"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Carregando dados...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>Carregar Planilha</span>
                    </>
                  )}
                </button>
                
                <button
                  type="button"
                  onClick={handleLoadDemo}
                  disabled={isLoading}
                  className="inline-flex items-center justify-center space-x-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition-colors border border-slate-200 cursor-pointer disabled:opacity-50"
                  id="load-demo-btn"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Usar Planilha Exemplo</span>
                </button>
              </div>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center space-x-6 text-[11px] text-slate-400 font-medium">
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block"></span>
                <span>Bypass de CORS Seguro</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block"></span>
                <span>Filtro de Data Integrado</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block"></span>
                <span>Exportador Ponto e Vírgula (;)</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-6" id="loaded-view">
            {/* Control Panel Card */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-[10px] font-bold tracking-widest text-emerald-600 uppercase">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse inline-block"></span>
                    <span>Origem Conectada</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5 font-display truncate max-w-xl">
                    <TableProperties className="w-4 h-4 text-slate-400" />
                    <span>{sheetUrl.substring(0, 80)}{sheetUrl.length > 80 ? "..." : ""}</span>
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleLoadSheet()}
                    className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Recarregar dados originais"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Recarregar</span>
                  </button>
                  <button
                    onClick={handleClear}
                    className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Trocar Planilha</span>
                  </button>
                </div>
              </div>

              {/* Filtering Controls Row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                
                {/* 1. Date Column Selector */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Campos
                  </label>
                  <select
                    value={pendingColIndex}
                    onChange={(e) => {
                      const newCol = Number(e.target.value);
                      setPendingColIndex(newCol);
                      
                      // Pre-fill with the default range of the newly selected column
                      if (sheetData && newCol !== -1) {
                        const parsedDates = sheetData.rows
                          .map(row => parseDateString(row[newCol]))
                          .filter((d): d is Date => d !== null);
                          
                        if (parsedDates.length > 0) {
                          parsedDates.sort((a, b) => a.getTime() - b.getTime());
                          setPendingStartDate(formatDateToYYYYMMDD(parsedDates[0]));
                          setPendingEndDate(formatDateToYYYYMMDD(parsedDates[parsedDates.length - 1]));
                        } else {
                          setPendingStartDate("");
                          setPendingEndDate("");
                        }
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-emerald-500 focus:bg-white transition-colors"
                    id="column-select"
                  >
                    {sheetData.columns.map((col) => (
                      <option key={col.index} value={col.index}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-emerald-600 font-semibold mt-1 inline-block">
                    {sheetData.detectedDateColumnIndex === pendingColIndex ? "✓ Coluna auto-detectada" : "Coluna customizada"}
                  </span>
                </div>

                {/* 2. Start Date */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Data Inicial
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={pendingStartDate}
                      onChange={(e) => {
                        setPendingStartDate(e.target.value);
                      }}
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-emerald-500 focus:bg-white transition-colors"
                      id="start-date-input"
                    />
                    <div className="absolute left-2.5 top-2.5 text-slate-400">
                      <Calendar className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                {/* 3. End Date */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Data Final
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={pendingEndDate}
                      onChange={(e) => {
                        setPendingEndDate(e.target.value);
                      }}
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-emerald-500 focus:bg-white transition-colors"
                      id="end-date-input"
                    />
                    <div className="absolute left-2.5 top-2.5 text-slate-400">
                      <Calendar className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                {/* 4. Text Search */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Pesquisar Texto (Opcional)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Pesquisar por termo..."
                      value={pendingSearchQuery}
                      onChange={(e) => {
                        setPendingSearchQuery(e.target.value);
                      }}
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 focus:bg-white transition-colors"
                      id="search-input"
                    />
                    <div className="absolute left-2.5 top-2.5 text-slate-400">
                      <Search className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Column Selection Combobox */}
              <div className="mt-6 pt-5 border-t border-slate-100" ref={dropdownRef}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                      <span>Campos para exibir no resultado</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Escolha quais colunas serão exibidas na tabela e incluídas no arquivo CSV final.
                    </p>
                  </div>
                </div>

                <div className="relative">
                  {/* Combobox Trigger Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsColumnDropdownOpen(!isColumnDropdownOpen);
                      setColSearchQuery(""); // clear search on toggle
                    }}
                    className="w-full flex items-center justify-between bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-700 shadow-3xs transition-all cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <TableProperties className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="font-medium truncate text-slate-600">
                        {(() => {
                          const selectedCount = sheetData.headers.filter((_, idx) => pendingVisibleColumns[idx] !== false).length;
                          const totalCount = sheetData.headers.length;
                          if (selectedCount === totalCount) return "Todos os campos selecionados";
                          if (selectedCount === 0) return "Nenhum campo selecionado";
                          return `${selectedCount} de ${totalCount} campos selecionados`;
                        })()}
                      </span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${isColumnDropdownOpen ? "rotate-180 text-emerald-600" : ""}`} />
                  </button>

                  {/* Dropdown Options List */}
                  <AnimatePresence>
                    {isColumnDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15 }}
                        className="absolute parent-dropdown z-30 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-72 overflow-hidden flex flex-col"
                      >
                        {/* Dropdown Header: Search & Multi-actions */}
                        <div className="p-2 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-2">
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Pesquisar campos..."
                              value={colSearchQuery}
                              onChange={(e) => setColSearchQuery(e.target.value)}
                              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                            {colSearchQuery && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setColSearchQuery("");
                                }}
                                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center justify-between px-1">
                            <span className="text-[10px] text-slate-400 font-medium">
                              Atalhos rápidos:
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const allSelected: Record<number, boolean> = {};
                                  sheetData.headers.forEach((_, idx) => {
                                    allSelected[idx] = true;
                                  });
                                  setPendingVisibleColumns(allSelected);
                                }}
                                className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline transition-colors cursor-pointer"
                              >
                                Marcar Todos
                              </button>
                              <span className="text-slate-300 text-[10px]">|</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const noneSelected: Record<number, boolean> = {};
                                  sheetData.headers.forEach((_, idx) => {
                                    noneSelected[idx] = false;
                                  });
                                  if (pendingColIndex !== -1) {
                                    noneSelected[pendingColIndex] = true;
                                  } else if (sheetData.headers.length > 0) {
                                    noneSelected[0] = true;
                                  }
                                  setPendingVisibleColumns(noneSelected);
                                }}
                                className="text-[10px] font-bold text-slate-500 hover:text-slate-700 hover:underline transition-colors cursor-pointer"
                              >
                                Desmarcar Todos
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Dropdown Options Scrollable */}
                        <div className="overflow-y-auto max-h-48 py-1 divide-y divide-slate-50">
                          {(() => {
                            const filteredHeaders = sheetData.headers
                              .map((header, idx) => ({ header, idx }))
                              .filter(({ header }) =>
                                header.toLowerCase().includes(colSearchQuery.toLowerCase())
                              );

                            if (filteredHeaders.length === 0) {
                              return (
                                <div className="p-4 text-center text-xs text-slate-400 font-medium">
                                  Nenhum campo encontrado
                                </div>
                              );
                            }

                            return filteredHeaders.map(({ header, idx }) => {
                              const isChecked = pendingVisibleColumns[idx] !== false;
                              const isDateCol = idx === pendingColIndex;
                              return (
                                <label
                                  key={idx}
                                  className="flex items-center justify-between px-3.5 py-2 hover:bg-slate-50/80 cursor-pointer select-none transition-colors"
                                >
                                  <div className="flex items-center space-x-2.5 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        setPendingVisibleColumns((prev) => ({
                                          ...prev,
                                          [idx]: !isChecked,
                                        }));
                                      }}
                                      className="w-3.5 h-3.5 text-emerald-600 focus:ring-emerald-500 border-slate-300 rounded cursor-pointer shrink-0"
                                    />
                                    <span className="font-mono text-xs text-slate-700 truncate">
                                      {header}
                                    </span>
                                    {isDateCol && (
                                      <span className="text-[8px] bg-emerald-100 text-emerald-800 px-1 rounded font-sans font-bold shrink-0">
                                        Filtro Data
                                      </span>
                                    )}
                                  </div>
                                  {isChecked && (
                                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  )}
                                </label>
                              );
                            });
                          })()}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Manual Apply Filters Trigger Bar */}
              <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-emerald-50/30 rounded-2xl border border-emerald-100/50">
                <div className="text-xs">
                  {hasPendingChanges ? (
                    <span className="text-amber-600 font-semibold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 animate-bounce" />
                      <span>Filtros alterados! Clique no botão ao lado para atualizar os dados na tela antes de exportar.</span>
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4" />
                      <span>Os dados abaixo estão totalmente atualizados com os filtros configurados.</span>
                    </span>
                  )}
                </div>
                <button
                  onClick={handleApplyFilters}
                  className={`w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-2xs hover:shadow-sm ${
                    hasPendingChanges 
                    ? "bg-amber-500 hover:bg-amber-600 text-white animate-pulse" 
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                  }`}
                  id="apply-filter-btn"
                >
                  <Search className="w-4 h-4" />
                  <span>Filtrar Dados</span>
                </button>
              </div>

              {/* Data Status Summary Bar */}
              <div className="mt-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
                  <div>
                    Total na planilha: <strong className="text-slate-900">{sheetData.rows.length}</strong>
                  </div>
                  <div className="h-4 w-px bg-slate-200 inline-block hidden sm:block"></div>
                  <div>
                    Após filtros: <strong className="text-emerald-600 text-sm">{filteredRows.length}</strong>
                  </div>
                  {invalidDateCount > 0 && (
                    <>
                      <div className="h-4 w-px bg-slate-200 inline-block hidden sm:block"></div>
                      <div className="flex items-center space-x-1 text-amber-600">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{invalidDateCount} linhas sem data válida na coluna</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                  <div className="flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-2xs">
                    <label htmlFor="delimiter-input" className="text-xs font-semibold text-slate-500">
                      delimitador
                    </label>
                    <input
                      id="delimiter-input"
                      type="text"
                      value={delimiter}
                      onChange={(e) => setDelimiter(e.target.value)}
                      className="w-8 py-0.5 text-center text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-md focus:outline-hidden focus:border-emerald-500 focus:bg-white transition-colors"
                      maxLength={5}
                    />
                  </div>

                  <button
                    onClick={() => setShowPreviewExport(!showPreviewExport)}
                    className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>{showPreviewExport ? "Ocultar Estrutura CSV" : "Estrutura CSV"}</span>
                  </button>

                  <button
                    onClick={handleExportCSV}
                    disabled={filteredRows.length === 0}
                    className="inline-flex items-center space-x-2 px-4.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                    id="export-csv-btn"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar Dados</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Generated Semicolon Structure live preview (Visual Proof and confirmation of formatting) */}
            <AnimatePresence>
              {showPreviewExport && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -10 }}
                  className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-sm text-slate-300 font-mono text-xs overflow-hidden"
                  id="semicolon-preview-container"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                      Visualização de Arquivo de Saída (Separado por {delimiter || "espaço"})
                    </span>
                    <button 
                      onClick={() => setShowPreviewExport(false)}
                      className="text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap max-h-40 leading-relaxed text-slate-300" id="raw-semicolon-preview">
                    {semicolonPreviewText || "Nenhum dado coincide com os filtros aplicados."}
                    {filteredRows.length > 5 && (
                      <span className="text-slate-500 italic block mt-1">
                        ... (+ {filteredRows.length - 5} linhas filtradas omitidas na visualização)
                      </span>
                    )}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Live Data Preview Table Card */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="px-6 py-4.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-slate-50/50">
                <div className="flex items-center space-x-2">
                  <TableProperties className="w-4.5 h-4.5 text-slate-400" />
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-display">
                    Pré-visualização dos Resultados
                  </h3>
                </div>
                
                <div className="flex items-center space-x-3">
                  {itemsColIndex !== -1 && filteredRows.length > 0 && (
                    <button
                      onClick={() => {
                        const allPageExpanded = paginatedRows.every((_, idx) => {
                          const absIdx = (currentPage - 1) * rowsPerPage + idx;
                          return expandedRows[absIdx];
                        });
                        const nextState: Record<number, boolean> = { ...expandedRows };
                        paginatedRows.forEach((_, idx) => {
                          const absIdx = (currentPage - 1) * rowsPerPage + idx;
                          nextState[absIdx] = !allPageExpanded;
                        });
                        setExpandedRows(nextState);
                      }}
                      className="text-[11px] font-semibold text-slate-600 hover:text-emerald-700 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-3xs transition-all flex items-center space-x-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3 text-slate-400 animate-pulse" />
                      <span>
                        {paginatedRows.every((_, idx) => expandedRows[(currentPage - 1) * rowsPerPage + idx]) ? "Recolher Todos" : "Expandir Detalhes (Itens)"}
                      </span>
                    </button>
                  )}
                  <span className="px-2.5 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 shrink-0">
                    {filteredRows.length} linhas filtradas
                  </span>
                </div>
              </div>

              {/* Table Wrapper */}
              <div className="overflow-x-auto max-w-full">
                {filteredRows.length === 0 ? (
                  <div className="py-16 text-center max-w-md mx-auto" id="no-results-view">
                    <div className="inline-flex p-3 bg-slate-50 text-slate-400 border border-slate-100 rounded-xl mb-3">
                      <Search className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-800">
                      Nenhum registro encontrado
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Ajuste os filtros de Data Inicial, Data Final ou Pesquisa para exibir os dados correspondentes.
                    </p>
                  </div>
                ) : (
                  <>
                    <table className="w-full text-left border-collapse" id="preview-table">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/40">
                          {itemsColIndex !== -1 && (
                            <th className="p-3.5 w-12 text-center text-xs font-bold text-slate-400 bg-slate-50/20 border-r border-slate-100"></th>
                          )}
                          {sheetData.headers.map((header, idx) => {
                            if (appliedVisibleColumns[idx] === false) return null;
                            return (
                              <th 
                                key={idx} 
                                className={`p-3.5 text-xs font-bold text-slate-700 whitespace-nowrap ${
                                  idx === appliedColIndex ? "bg-emerald-50/50 text-emerald-900 border-x border-emerald-100/50" : ""
                                }`}
                              >
                                <div className="flex items-center space-x-1">
                                  <span>{header}</span>
                                  {idx === appliedColIndex && (
                                    <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  )}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-xs text-slate-600">
                        {paginatedRows.map((row, rowIdx) => {
                          const absoluteIndex = (currentPage - 1) * rowsPerPage + rowIdx;
                          const isExpanded = !!expandedRows[absoluteIndex];
                          return (
                            <Fragment key={rowIdx}>
                              <tr className={`hover:bg-slate-50/50 transition-colors ${isExpanded ? "bg-emerald-50/5" : ""}`}>
                                {itemsColIndex !== -1 && (
                                  <td className="p-3 text-center border-r border-slate-100">
                                    <button
                                      onClick={() => {
                                        setExpandedRows(prev => ({
                                          ...prev,
                                          [absoluteIndex]: !prev[absoluteIndex]
                                        }));
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-emerald-600 focus:outline-hidden cursor-pointer"
                                      title={isExpanded ? "Recolher itens" : "Expandir itens"}
                                    >
                                      <ChevronRight className={`w-4 h-4 transform transition-transform duration-200 ${isExpanded ? "rotate-90 text-emerald-600 font-bold" : ""}`} />
                                    </button>
                                  </td>
                                )}
                                {row.map((cell, cellIdx) => {
                                  if (appliedVisibleColumns[cellIdx] === false) return null;
                                  const isSearchMatch = appliedSearchQuery && String(cell).toLowerCase().includes(appliedSearchQuery.toLowerCase());
                                  return (
                                    <td 
                                      key={cellIdx} 
                                      className={`p-3.5 whitespace-nowrap ${
                                        cellIdx === appliedColIndex ? "bg-emerald-50/10 font-semibold text-emerald-800 border-x border-emerald-100/20" : ""
                                      } ${isSearchMatch ? "bg-amber-100/40 text-amber-900 font-medium" : ""}`}
                                    >
                                      {cell !== "" ? cell : <span className="text-slate-300 italic">vazio</span>}
                                    </td>
                                  );
                                })}
                              </tr>
                              {itemsColIndex !== -1 && isExpanded && (
                                <tr key={`detail-${rowIdx}`} className="bg-slate-50/30">
                                  <td colSpan={sheetData.headers.filter((_, idx) => appliedVisibleColumns[idx] !== false).length + 1} className="p-4 bg-slate-50/15">
                                    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-3xs max-w-2xl ml-4 mr-4">
                                      <div className="flex items-center space-x-2 mb-2">
                                        <div className="p-1 bg-emerald-50 rounded-md text-emerald-600 border border-emerald-100/40">
                                          <FileText className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-sans">
                                          {sheetData.headers[itemsColIndex]} (Detalhes do registro)
                                        </span>
                                      </div>
                                      <p className="text-sm font-semibold text-slate-800 whitespace-pre-wrap font-sans pl-1">
                                        {row[itemsColIndex] || <span className="text-slate-300 italic font-normal">Nenhum item informado</span>}
                                      </p>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}
              </div>

              {/* Table Pagination / Controls */}
              {filteredRows.length > 0 && (
                <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/20" id="pagination-controls">
                  <div className="flex items-center space-x-3 text-xs text-slate-500">
                    <span>Exibir</span>
                    <select
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2 py-1 bg-white border border-slate-200 rounded-md focus:outline-hidden focus:border-emerald-500"
                    >
                      {[5, 10, 25, 50].map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                    <span>registros por página</span>
                  </div>

                  <div className="flex items-center space-x-1 text-xs">
                    <span className="text-slate-500 mr-2">
                      Mostrando {Math.min(filteredRows.length, (currentPage - 1) * rowsPerPage + 1)}-{Math.min(filteredRows.length, currentPage * rowsPerPage)} de {filteredRows.length}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 text-slate-500 hover:text-slate-800 disabled:text-slate-300 hover:bg-slate-100 disabled:hover:bg-transparent rounded-lg border border-slate-200 disabled:border-slate-100 transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-3 py-1 font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg">
                      Pág. {currentPage} de {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 text-slate-500 hover:text-slate-800 disabled:text-slate-300 hover:bg-slate-100 disabled:hover:bg-transparent rounded-lg border border-slate-200 disabled:border-slate-100 transition-colors cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
