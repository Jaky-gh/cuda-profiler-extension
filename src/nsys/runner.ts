import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import * as vscode from "vscode";

let RUNNING: Promise<{
  csvPath: string;
  reportPath: string;
  meta: { command: string; cwd: string };
}> | null = null;

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function execSpawn(
  exe: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { cwd, windowsHide: true });

    let stderr = "";
    let stdout = "";

    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${exe} failed (code ${code}).\n${stdout}\n${stderr}`));
    });
  });
}

async function getWorkspaceFolder(): Promise<vscode.WorkspaceFolder> {
  const wf = vscode.workspace.workspaceFolders?.[0];
  if (!wf) throw new Error("Open a folder/workspace first.");
  return wf;
}

function resolveCwd(cwdSetting: string, workspace: string): string {
  // allow ${workspaceFolder} and default to workspace if blank
  const s = (cwdSetting ?? "").trim();
  if (!s) return workspace;
  return s.replace(/\$\{workspaceFolder\}/g, workspace);
}

function pickNewest(paths: string[]): string | null {
  if (paths.length === 0) return null;
  return (
    paths
      .map((p) => ({ p, mtime: fs.statSync(p).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0]?.p ?? null
  );
}

function safeBasename(p: string) {
  // nsys will create files like `${prefix}.csv` / `${prefix}_something.csv`
  // we match by basename(prefix) to avoid absolute-path issues on Windows
  return path.basename(p);
}

export async function runNsysAndExportCsv(): Promise<{
  csvPath: string;
  reportPath: string;
  meta: { command: string; cwd: string };
}> {
  if (RUNNING) return RUNNING;

  RUNNING = (async () => {
    try {
      const wf = await getWorkspaceFolder();
      const cfg = vscode.workspace.getConfiguration("cudaProfiler");

      // ---------- config ----------
      const command = (cfg.get<string>("command") ?? "").trim();
      if (!command) throw new Error("Set cudaProfiler.command in Settings.");

      const workspaceRoot = wf.uri.fsPath;
      const cwdSetting = cfg.get<string>("cwd") ?? "${workspaceFolder}";
      const cwd = resolveCwd(cwdSetting, workspaceRoot);

      const outRel = (cfg.get<string>("outputDir") ?? ".vscode/cuda-profiler").trim();
      const outDir = path.isAbsolute(outRel) ? outRel : path.join(workspaceRoot, outRel);
      ensureDir(outDir);

      const nsysPathCfg = (cfg.get<string>("nsysPath") ?? "").trim();
      const nsysExe = nsysPathCfg || "nsys.exe";

      // ---------- profile run ----------
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const prefix = path.join(outDir, `nsys-${stamp}`);

      // Nsight Systems 2026.x compatible trace set (no osrt)
      const collectArgs = [
        "profile",
        "--trace=cuda,nvtx",
        "--sample=none",
        "--cpuctxsw=none",
        "-o",
        prefix,
        "cmd.exe",
        "/d",
        "/s",
        "/c",
        command
      ];

      console.log("[cuda-profiler] nsys profile:", nsysExe, collectArgs.join(" "));
      await execSpawn(nsysExe, collectArgs, cwd);

      // ---------- locate report ----------
      const possible = [`${prefix}.nsys-rep`, `${prefix}.qdrep`];
      const reportPath = possible.find((p) => fs.existsSync(p));

      if (!reportPath) {
        const files = fs
          .readdirSync(outDir)
          .filter((f) => f.includes(`nsys-${stamp}`))
          .join(", ");
        throw new Error(`Nsight Systems report not found for prefix ${prefix}. Files: ${files}`);
      }

      // ---------- export CSV via stats ----------
      const statsOutPrefix = `${prefix}-stats`;

      const statsArgs = [
        "stats",
        "--report",
        "cuda_gpu_kern_sum",
        "--format",
        "csv",
        "-o",
        statsOutPrefix,
        reportPath
      ];

      console.log("[cuda-profiler] nsys stats:", nsysExe, statsArgs.join(" "));
      await execSpawn(nsysExe, statsArgs, cwd);

      // ---------- find produced CSV ----------
      const base = safeBasename(statsOutPrefix).toLowerCase();

      const csvCandidates = fs
        .readdirSync(outDir)
        .filter((f) => f.toLowerCase().endsWith(".csv"))
        .map((f) => path.join(outDir, f))
        .filter((full) => path.basename(full).toLowerCase().startsWith(base));

      // If we found “matching prefix” CSVs, pick the newest of those.
      // Otherwise, fall back to newest CSV in the folder (helps if nsys changes naming).
      const csvPath =
        pickNewest(csvCandidates) ??
        pickNewest(
          fs
            .readdirSync(outDir)
            .filter((f) => f.toLowerCase().endsWith(".csv"))
            .map((f) => path.join(outDir, f))
        );

      if (!csvPath) throw new Error("nsys stats produced no CSV files.");

      console.log("[cuda-profiler] CSV candidates:", csvCandidates);
      console.log("[cuda-profiler] using CSV:", csvPath);

      return { csvPath, reportPath, meta: { command, cwd } };
    } finally {
      RUNNING = null;
    }
  })();

  return RUNNING;
}
