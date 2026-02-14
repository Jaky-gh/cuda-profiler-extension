import * as vscode from "vscode";
import { ProfileReport } from "../model/types";

console.log("### VIEW PROVIDER FILE LOADED ###");

const STATE_KEY = "cudaProfiler.lastReport";

export class ProfilerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "cudaProfilerView";

  private view?: vscode.WebviewView;
  private lastReport?: ProfileReport;

  private fallbackPanel?: vscode.WebviewPanel;

  constructor(private readonly context: vscode.ExtensionContext) {}

  isResolved(): boolean {
    return !!this.view;
  }

  resolveWebviewView(view: vscode.WebviewView) {
    console.log("[cuda-profiler] resolveWebviewView called");

    this.view = view;
    view.webview.options = { enableScripts: true };

    view.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "jump" && typeof msg?.kernel === "string") {
        await this.jumpToKernelCallsite(msg.kernel);
      }
    });

    // If the view resolves after profiling, reload last report from state
    if (!this.lastReport) {
      const saved = this.context.globalState.get<ProfileReport>(STATE_KEY);
      if (saved) this.lastReport = saved;
    }

    this.render();
  }

  setReport(report: ProfileReport) {
    console.log("[cuda-profiler] setReport kernels =", report.kernels?.length);

    this.lastReport = report;

    // Persist so sidebar view can populate even if it resolves later
    void this.context.globalState.update(STATE_KEY, report);

    // Update sidebar view if it exists
    this.render();

    // Update fallback panel if open
    if (this.fallbackPanel) {
      this.fallbackPanel.webview.html = this.buildHtml();
    }
  }

  showFallbackPanel() {
    if (this.fallbackPanel) {
      this.fallbackPanel.reveal();
      return;
    }

    this.fallbackPanel = vscode.window.createWebviewPanel(
      "cudaProfilerFallback",
      "CUDA Profiler: Kernel Summary",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    this.fallbackPanel.onDidDispose(() => {
      this.fallbackPanel = undefined;
    });

    this.fallbackPanel.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "jump" && typeof msg?.kernel === "string") {
        await this.jumpToKernelCallsite(msg.kernel);
      }
    });

    this.fallbackPanel.webview.html = this.buildHtml();
  }

  private render() {
    if (!this.view) return;

    try {
      this.view.webview.html = this.buildHtml();
    } catch (e: any) {
      const msg = e?.stack ?? e?.message ?? String(e);
      console.error("[cuda-profiler] render failed:", msg);
      this.view.webview.html = `<html><body style="font-family: var(--vscode-font-family); padding: 8px;">
        <h3>CUDA Profiler UI error</h3>
        <pre>${escapeHtml(msg)}</pre>
      </body></html>`;
    }
  }

  private buildHtml(): string {
    const kernels = this.lastReport?.kernels ?? [];

    const rowsHtml = kernels
      .map(
        (k, idx) => `
      <tr data-kernel="${escapeHtml(k.name)}">
        <td>${idx + 1}</td>
        <td class="name">${escapeHtml(k.name)}</td>
        <td>${fmt(k.totalMs)}</td>
        <td>${fmt(k.avgMs)}</td>
        <td>${k.calls ?? ""}</td>
      </tr>`
      )
      .join("");

    const headerText = this.lastReport?.command
      ? `nsys • ${escapeHtml(this.lastReport.command)}`
      : `Run "CUDA Profiler: Run Nsight Systems" to populate kernel timings.`;

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: var(--vscode-font-family); padding: 8px; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid var(--vscode-editorGroup-border); padding: 6px; font-size: 12px; }
    tr:hover { background: var(--vscode-list-hoverBackground); cursor: pointer; }
    .name { word-break: break-all; }
  </style>
</head>
<body>
  <div class="muted">${headerText}</div>

  <table>
    <thead>
      <tr><th>#</th><th>Kernel</th><th>Total (ms)</th><th>Avg (ms)</th><th>Calls</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <script>
    const vscode = acquireVsCodeApi();
    document.querySelectorAll("tr[data-kernel]").forEach(tr => {
      tr.addEventListener("click", () => {
        vscode.postMessage({ type: "jump", kernel: tr.getAttribute("data-kernel") });
      });
    });
  </script>
</body>
</html>`;
  }

  private async jumpToKernelCallsite(kernelName: string) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;

    const patterns = [`${kernelName}<<<`, kernelName];

    for (const pattern of patterns) {
      const hit = await findFirstTextHitByScanningFiles(pattern, "**/*.{cu,cuh,cpp,h,hpp}");
      if (hit) {
        const doc = await vscode.workspace.openTextDocument(hit.uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: true });
        editor.selection = new vscode.Selection(hit.range.start, hit.range.start);
        editor.revealRange(hit.range, vscode.TextEditorRevealType.InCenter);
        return;
      }
    }

    vscode.window.showInformationMessage(`No callsite found for kernel: ${kernelName}`);
  }
}

// ---- helpers ----
async function findFirstTextHitByScanningFiles(
  needle: string,
  includeGlob: string
): Promise<{ uri: vscode.Uri; range: vscode.Range } | null> {
  const MAX_FILES = 4000;
  const MAX_BYTES = 2_000_000;

  const files = await vscode.workspace.findFiles(
    includeGlob,
    "**/{node_modules,.git,build,dist,out,.vscode}/**",
    MAX_FILES
  );

  for (const uri of files) {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const text = doc.getText();
      if (text.length > MAX_BYTES) continue;

      const idx = text.indexOf(needle);
      if (idx >= 0) {
        const start = doc.positionAt(idx);
        const end = doc.positionAt(idx + needle.length);
        return { uri, range: new vscode.Range(start, end) };
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function fmt(n?: number) {
  if (n === undefined) return "";
  return n.toFixed(3);
}

function escapeHtml(s: any) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" } as any)[c]
  );
}
