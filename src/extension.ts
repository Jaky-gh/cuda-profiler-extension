import * as vscode from "vscode";
import { ProfilerViewProvider } from "./ui/viewProvider";
import { runNsysAndExportCsv } from "./nsys/runner";
import { parseNsysKernelCsv } from "./nsys/parseCsv";
import { ProfileReport } from "./model/types";

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "cuda-profiler" activated');

  const viewProvider = new ProfilerViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ProfilerViewProvider.viewType, viewProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cudaProfiler.openPanel", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.cudaProfilerContainer");
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

            const kernels = parseNsysKernelCsv(csvPath);

            const report: ProfileReport = {
              tool: "nsys",
              command: meta.command,
              cwd: meta.cwd,
              generatedAt: Date.now(),
              kernels
            };

            viewProvider.setReport(report);

            if (kernels.length === 0) {
              vscode.window.showWarningMessage(
                "Nsight Systems ran, but no kernel rows were parsed from the CSV. Your nsys version may output a different CSV table — we’ll adjust parsing next."
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
