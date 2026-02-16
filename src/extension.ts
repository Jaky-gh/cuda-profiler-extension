import * as vscode from "vscode";
import { ProfilerViewProvider } from "./ui/viewProvider";
import { runNsysAndExportCsv } from "./nsys/runner";
import { parseNsysKernelCsv } from "./nsys/parseCsv";
import { ProfileReport } from "./model/types";

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "cuda-profiler" activated');

  const viewProvider = new ProfilerViewProvider(context);

  let lastCsvPath: string | undefined;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("cudaProfilerView", viewProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cudaProfiler.openPanel", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.cudaProfilerContainer");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cudaProfiler.reloadLast", async () => {
      await vscode.commands.executeCommand("cudaProfiler.openPanel");

      if (!lastCsvPath) {
        vscode.window.showInformationMessage("No previous CSV path. Run Nsight Systems first.");
        return;
      }

      try {
        const kernels = parseNsysKernelCsv(lastCsvPath);

        const cfg = vscode.workspace.getConfiguration("cudaProfiler");
        const command = (cfg.get<string>("command") ?? "").trim();

        const wf = vscode.workspace.workspaceFolders?.[0];
        const cwdSetting = cfg.get<string>("cwd") ?? "${workspaceFolder}";
        const cwd = wf ? cwdSetting.replace("${workspaceFolder}", wf.uri.fsPath) : cwdSetting;

        const report: ProfileReport = {
          tool: "nsys",
          command,
          cwd,
          generatedAt: Date.now(),
          kernels
        };

        viewProvider.setReport(report);
        viewProvider.refresh();
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message ?? String(e));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cudaProfiler.runNsys", async () => {
      try {
        await vscode.commands.executeCommand("cudaProfiler.openPanel");

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "CUDA Profiler: Running Nsight Systems…",
            cancellable: false
          },
          async () => {
            const { csvPath, meta } = await runNsysAndExportCsv();
            lastCsvPath = csvPath;

            const kernels = parseNsysKernelCsv(csvPath);

            const report: ProfileReport = {
              tool: "nsys",
              command: meta.command,
              cwd: meta.cwd,
              generatedAt: Date.now(),
              kernels
            };

            viewProvider.setReport(report);
            viewProvider.refresh();

            if (kernels.length === 0) {
              vscode.window.showWarningMessage(
                "Nsight Systems ran, but no kernel rows were parsed from the CSV."
              );
            }
          }
        );
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message ?? String(e));
      }
    })
  );
}

export function deactivate() {}
