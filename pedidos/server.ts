import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Add JSON parsing middleware
  app.use(express.json());

  // Serve the config.js file from the root directory
  app.get("/config.js", (req, res) => {
    res.sendFile(path.join(process.cwd(), "config.js"));
  });

  // API Proxy Route for Google Sheets
  app.get("/api/proxy-sheet", async (req, res) => {
    try {
      const sheetUrl = req.query.url as string;
      if (!sheetUrl) {
        res.status(400).json({ success: false, error: "A URL da planilha é obrigatória." });
        return;
      }

      // Parse the Google Sheets URL to build the CSV export URL
      let exportUrl = sheetUrl.trim();

      if (exportUrl.includes("/pubhtml")) {
        // e.g. https://docs.google.com/spreadsheets/d/e/2PACX-1v.../pubhtml
        exportUrl = exportUrl.replace("/pubhtml", "/pub?output=csv");
      } else if (exportUrl.includes("/pub") && !exportUrl.includes("output=csv")) {
        // e.g. https://docs.google.com/spreadsheets/d/e/2PACX-1v.../pub?gid=0
        if (exportUrl.includes("?")) {
          exportUrl += "&output=csv";
        } else {
          exportUrl += "?output=csv";
        }
      } else if (!exportUrl.includes("/pub?") && !exportUrl.includes("/export?")) {
        // Handle regular edit link: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=GID
        const docMatch = exportUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (docMatch) {
          const spreadsheetId = docMatch[1];
          exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
          
          // Extract gid if present
          const gidMatch = sheetUrl.match(/[?#&]gid=([0-9]+)/);
          if (gidMatch) {
            const gid = gidMatch[1];
            exportUrl += `&gid=${gid}`;
          }
        }
      }

      console.log(`Proxying request from Sheet URL: ${sheetUrl} -> Export URL: ${exportUrl}`);

      const response = await fetch(exportUrl);
      if (!response.ok) {
        throw new Error(`O Google Sheets respondeu com status ${response.status}. Verifique se a planilha é pública ou está compartilhada.`);
      }

      const csvData = await response.text();

      // Extract title of the spreadsheet if possible
      let title = "";
      try {
        if (sheetUrl.includes("docs.google.com/spreadsheets")) {
          let titleUrl = sheetUrl.trim();
          if (titleUrl.includes("/export") || titleUrl.includes("/pub?")) {
            const docMatch = titleUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
            if (docMatch) {
              titleUrl = `https://docs.google.com/spreadsheets/d/${docMatch[1]}/edit`;
            }
          }
          const titleRes = await fetch(titleUrl);
          if (titleRes.ok) {
            const html = await titleRes.text();
            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
              let parsedTitle = titleMatch[1].trim();
              parsedTitle = parsedTitle
                .replace(/\s*-\s*Google\s+Sheets/gi, "")
                .replace(/\s*-\s*Google\s+Planilhas/gi, "")
                .replace(/\s*-\s*Google\s+Drive/gi, "")
                .replace(/\s*-\s*Google\s+Docs/gi, "")
                .trim();
              if (parsedTitle) {
                title = parsedTitle;
              }
            }
          }
        } else {
          const urlObj = new URL(sheetUrl);
          const pathname = urlObj.pathname;
          const lastSegment = pathname.substring(pathname.lastIndexOf('/') + 1);
          if (lastSegment) {
            const dotIdx = lastSegment.lastIndexOf('.');
            const name = dotIdx !== -1 ? lastSegment.substring(0, dotIdx) : lastSegment;
            if (name && !name.includes('?')) {
              title = decodeURIComponent(name);
            }
          }
        }
      } catch (titleErr) {
        console.error("Falha ao extrair título da planilha:", titleErr);
      }

      res.json({ success: true, csv: csvData, title: title || undefined });
    } catch (error: any) {
      console.error("Erro ao obter planilha:", error);
      res.status(500).json({ success: false, error: error.message || "Erro interno do servidor ao carregar a planilha." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
