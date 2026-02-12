import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import * as vscode from "vscode";

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function execSpawn(exe: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { cwd, windowsHide: true });

    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${exe} failed (code ${code}). ${stderr}`));
    });
  });
}

async function getWorkspaceFolder(): Promise<vscode.WorkspaceFolder> {
  const wf = vscode.workspace.workspaceFolders?.[0];
  if (!wf) throw new Error("Open a folder/workspace first.");
  return wf;
}

export async function runNsysAndExportCsv(): Promise<{
  csvPath: string;
  reportPath: string;
  meta: { command: string; cwd: string };
}> {
  const wf = await getWorkspaceFolder();
  const cfg = vscode.workspace.getConfiguration("cudaProfiler");

  const command = (cfg.get<string>("command") ?? "").trim();
  if (!command) throw new Error("Set cudaProfiler.command in Settings.");

  const cwdSetting = cfg.get<string>("cwd") ?? "${workspaceFolder}";
  const cwd = cwdSetting.replace("${workspaceFolder}", wf.uri.fsPath);

  const outRel = cfg.get<string>("outputDir") ?? ".vscode/cuda-profiler";
  const outDir = path.isAbsolute(outRel) ? outRel : path.join(wf.uri.fsPath, outRel);
  ensureDir(outDir);

  const nsysPathCfg = (cfg.get<string>("nsysPath") ?? "").trim();
  const nsysExe = nsysPathCfg || "nsys.exe";

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = path.join(outDir, `nsys-${stamp}`);

  const collectArgs = ["profile", "-o", prefix, "cmd.exe", "/d", "/s", "/c", command];
  await execSpawn(nsysExe, collectArgs, cwd);

  const possible = [`${prefix}.nsys-rep`, `${prefix}.qdrep`];
  const reportPath = possible.find((p) => fs.existsSync(p));
  if (!reportPath) {
    const files = fs.readdirSync(outDir).filter((f) => f.includes(`nsys-${stamp}`));
    throw new Error(`Nsight Systems report not found for prefix ${prefix}. Files: ${files.join(", ")}`);
  }

  const statsOutPrefix = `${prefix}-stats`;
  const statsArgs = ["stats", "--export=csv", "-o", statsOutPrefix, reportPath];
  await execSpawn(nsysExe, statsArgs, cwd);

  const csvCandidates = fs
    .readdirSync(outDir)
    .filter((f) => f.startsWith(path.basename(statsOutPrefix)) && f.toLowerCase().endsWith(".csv"))
    .map((f) => path.join(outDir, f));

  if (csvCandidates.length === 0) throw new Error("No CSV produced by `nsys stats --export=csv`.");

  const preferred = csvCandidates.find((p) => p.toLowerCase().includes("cuda") && p.toLowerCase().includes("kern"));
  const csvPath = preferred || csvCandidates[0];

  return { csvPath, reportPath, meta: { command, cwd } };
}
