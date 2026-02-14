import * as fs from "fs";

export type KernelRow = {
  name: string;
  calls?: number;
  totalMs?: number;
  avgMs?: number;
};

function nsToMs(ns: number): number {
  return ns / 1_000_000; // 1e6 ns = 1 ms
}

/**
 * Parses Nsight Systems "cuda_gpu_kern_sum" CSV:
 * Time (%),Total Time (ns),Instances,Avg (ns),...,Name
 */
export function parseNsysKernelCsv(csvPath: string): KernelRow[] {
  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const idxName = findIndex(header, "Name");
  const idxTotal = findIndex(header, "Total Time (ns)");
  const idxAvg = findIndex(header, "Avg (ns)");
  const idxInstances = findIndex(header, "Instances");

  if (idxName === -1) return [];

  const out: KernelRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const name = (cols[idxName] ?? "").trim();
    if (!name) continue;

    const totalNs = idxTotal >= 0 ? toNumber(cols[idxTotal]) : undefined;
    const avgNs = idxAvg >= 0 ? toNumber(cols[idxAvg]) : undefined;
    const calls = idxInstances >= 0 ? toInt(cols[idxInstances]) : undefined;

    out.push({
      name: stripOuterQuotes(name),
      calls,
      totalMs: totalNs === undefined ? undefined : nsToMs(totalNs),
      avgMs: avgNs === undefined ? undefined : nsToMs(avgNs)
    });
  }

  return out;
}

function findIndex(header: string[], colName: string): number {
  const target = colName.toLowerCase();
  return header.findIndex((h) => stripOuterQuotes(h).trim().toLowerCase() === target);
}

function toNumber(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const v = Number(stripOuterQuotes(s).trim());
  return Number.isFinite(v) ? v : undefined;
}

function toInt(s: string | undefined): number | undefined {
  const n = toNumber(s);
  return n === undefined ? undefined : Math.trunc(n);
}

function stripOuterQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/""/g, '"');
  }
  return t;
}

/**
 * Minimal CSV line parser supporting quoted fields and commas inside quotes.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  result.push(cur);
  return result;
}
