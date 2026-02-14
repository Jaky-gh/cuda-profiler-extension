# CUDA Profiler VS Code Extension

A Visual Studio Code extension that integrates CUDA profiling workflows directly into the editor.  
It allows developers to launch CUDA applications, collect profiling reports using NVIDIA Nsight Systems, and visualize profiling data inside VS Code.

This extension is designed to simplify the profiling workflow for CUDA developers by reducing context switching between the terminal, Nsight tools, and the editor.

---

## Features

- Run CUDA applications from VS Code
- Launch NVIDIA Nsight Systems profiling (`nsys`)
- Capture profiling reports automatically
- Display profiling results in a custom VS Code panel
- Configurable executable and profiler paths
- Designed for CUDA + CMake based projects

---

## Requirements

- VS Code
- NVIDIA CUDA Toolkit
- NVIDIA Nsight Systems (`nsys`) installed
- A compiled CUDA executable to profile
- Windows or Linux environment supported by Nsight Systems

---

## Extension Settings

This extension contributes the following settings:

| Setting | Description |
|---------|-------------|
| `cudaProfiler.command` | Path to the CUDA executable to run |
| `cudaProfiler.nsysPath` | Path to the `nsys` profiler executable |

Example:

```json
{
  "cudaProfiler.command": "./build/myapp.exe",
  "cudaProfiler.nsysPath": "C:\\Program Files\\NVIDIA Corporation\\Nsight Systems\\target-windows-x64\\nsys.exe"
}
