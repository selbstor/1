export const config = {
  get pedidos(): string {
    return (window as any).APP_CONFIG?.pedidos || "https://docs.google.com/spreadsheets/d/e/2PACX-1vSbcOCbWT91wgXhKdgoZcxoFeartiLRXRzw-XFHdEXVT2gJ3LjCiS85WJzEweZAN8aUQI_10lZjl1Pe/pub?gid=180773339&single=true&output=csv";
  }
};
