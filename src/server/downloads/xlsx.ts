import ExcelJS from "exceljs";
import type { Cell, TableColumn } from "./csv";

/**
 * Excel export: a "Data" sheet (frozen header, numbers stored as numbers,
 * blanks for missing values) and an "About" sheet with the citation,
 * licence and — for demo data — a prominent synthetic warning. The warning
 * is also repeated above the data so it cannot be missed.
 */
export async function toXlsx(input: {
  title: string;
  metadata: Array<[string, string]>;
  columns: TableColumn[];
  rows: Array<Record<string, Cell>>;
  synthetic: boolean;
}): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PopLens";
  wb.created = new Date();
  wb.title = input.title.slice(0, 250);

  const data = wb.addWorksheet("Data");
  let headerRowNo = 1;
  if (input.synthetic) {
    const warn = data.addRow(["SYNTHETIC demo data — not real statistics. Do not cite. See the About sheet."]);
    warn.font = { bold: true, color: { argb: "FF7A2E00" } };
    warn.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE08A" } };
    headerRowNo = 2;
  }
  const header = data.addRow(input.columns.map((c) => c.header));
  header.font = { bold: true };
  data.views = [{ state: "frozen", ySplit: headerRowNo }];
  for (const r of input.rows) {
    data.addRow(
      input.columns.map((c) => {
        const v = r[c.key];
        return v === undefined ? null : v;
      }),
    );
  }
  input.columns.forEach((c, i) => {
    data.getColumn(i + 1).width = Math.min(48, Math.max(10, c.header.length + 2));
  });

  const about = wb.addWorksheet("About");
  about.columns = [
    { header: "Field", key: "label", width: 18 },
    { header: "Value", key: "value", width: 110 },
  ];
  about.getRow(1).font = { bold: true };
  for (const [label, value] of input.metadata) {
    const row = about.addRow({ label, value });
    row.alignment = { wrapText: true, vertical: "top" };
    if (label === "Warning") {
      row.font = { bold: true, color: { argb: "FF7A2E00" } };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE08A" } };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
