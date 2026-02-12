import * as fs from "fs";
import { KernelRow } from "../model/types";

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function toMs(value: string): number | undefined {
  const v = value.trim();
  const m = v.match(/^([0-9]*\.?[0-9]+)\s*(ns|us|ms|s)?$/i);
  if (!m) return undefined;
  const num = Number(m[1]);
  if (Number.isNaN(num)) return undefined;
  const unit = (m[2] || "ms").toLowerCase();
  if (unit === "ns") return num / 1e6;
  if (unit === "us") return num / 1e3;
  if (unit === "ms") return num;
  if (unit === "s") return num * 1000;
  return num;
}

export function parseNsysKernelCsv(csvPath: string): KernelRow[] {
  const text = fs.readFileSync(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());

  const col = (variants: string[]) => {
    for (const v of variants) {
      const idx = header.indexOf(v.toLowerCase());
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const nameIdx = col(["name", "kernel name"]);
  const totalIdx = col(["total time", "total", "time"]);
  const avgIdx = col(["avg", "average", "avg time"]);
  const callsIdx = col(["instances", "calls", "count"]);

  if (nameIdx < 0) return [];

  const rows: KernelRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const name = cells[nameIdx]?.trim();
    if (!name) continue;

    const totalMs = totalIdx >= 0 ? toMs(cells[totalIdx] || "") : undefined;
    const avgMs = avgIdx >= 0 ? toMs(cells[avgIdx] || "") : undefined;
    const callsRaw = callsIdx >= 0 ? (cells[callsIdx] || "").replace(/,/g, "") : "";
    const calls = callsRaw ? Number(callsRaw) : undefined;

    rows.push({
      name,
      totalMs,
      avgMs,
      calls: Number.isFinite(calls) ? calls : undefined
    });
  }

  return rows;
}
