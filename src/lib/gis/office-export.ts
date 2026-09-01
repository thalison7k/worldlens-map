/**
 * Exportação para pacotes de escritório — Excel (.xls) e Word (.doc).
 *
 * Gera arquivos HTML com os namespaces do Office, formato aberto por
 * Excel/Word/LibreOffice/Google Sheets sem dependências externas. Usado pelos
 * módulos Analytics e Dashboard para relatórios institucionais.
 */
export type Cell = string | number | null | undefined;

export interface Sheet {
  name: string;
  columns: string[];
  rows: Cell[][];
}

export interface ReportSection {
  title: string;
  /** Parágrafos livres antes da tabela. */
  paragraphs?: string[];
  columns?: string[];
  rows?: Cell[][];
}

const esc = (v: Cell) =>
  String(v ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);

function tableHtml(columns: string[], rows: Cell[][]) {
  return `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:11pt">
<thead><tr>${columns
    .map((c) => `<th style="background:#0f2f4f;color:#ffffff;text-align:left">${esc(c)}</th>`)
    .join("")}</tr></thead>
<tbody>${rows
    .map(
      (r) =>
        `<tr>${r
          .map((c) => `<td style="mso-number-format:'General'">${esc(c)}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
}

function download(name: string, body: string, mime: string) {
  const blob = new Blob(["\ufeff", body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Planilha Excel com uma aba por conjunto de dados. */
export function exportExcel(fileName: string, sheets: Sheet[], meta?: Record<string, unknown>) {
  const metaRows = meta
    ? Object.entries(meta).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)] as Cell[])
    : [];
  const all: Sheet[] = metaRows.length
    ? [{ name: "Metadados", columns: ["Campo", "Valor"], rows: metaRows }, ...sheets]
    : sheets;

  const body = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/>
<xml><x:ExcelWorkbook><x:ExcelWorksheets>${all
    .map(
      (s) =>
        `<x:ExcelWorksheet><x:Name>${esc(s.name).slice(0, 31)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>`,
    )
    .join("")}</x:ExcelWorksheets></x:ExcelWorkbook></xml>
</head><body>${all.map((s) => tableHtml(s.columns, s.rows)).join("<br/>")}</body></html>`;
  download(fileName.endsWith(".xls") ? fileName : `${fileName}.xls`, body, "application/vnd.ms-excel");
}

/** Relatório Word com capa, seções e tabelas. */
export function exportWord(fileName: string, title: string, sections: ReportSection[], subtitle?: string) {
  const body = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>
 @page { size: A4; margin: 2cm; }
 body { font-family: Segoe UI, Arial, sans-serif; font-size: 11pt; color:#111827; }
 h1 { color:#0f2f4f; font-size:20pt; margin-bottom:2pt; }
 h2 { color:#0f2f4f; font-size:13pt; margin-top:16pt; }
 .sub { color:#4b5563; font-size:10pt; margin-top:0; }
 p { line-height:1.45; }
</style></head>
<body>
<h1>${esc(title)}</h1>
<p class="sub">${esc(subtitle ?? "")}</p>
${sections
  .map(
    (s) =>
      `<h2>${esc(s.title)}</h2>${(s.paragraphs ?? []).map((p) => `<p>${esc(p)}</p>`).join("")}${
        s.columns && s.rows ? tableHtml(s.columns, s.rows) : ""
      }`,
  )
  .join("")}
<p class="sub">Gerado por GeoOS Environmental · Projeto Integrador VI — Univesp · by GamaTec IA</p>
</body></html>`;
  download(fileName.endsWith(".doc") ? fileName : `${fileName}.doc`, body, "application/msword");
}

export const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
