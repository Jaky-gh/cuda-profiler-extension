export type KernelRow = {
    name: string;
    calls?: number;
    totalMs?: number;
    avgMs?: number;
  
    occupancy?: number; // 0..1
    dramGBs?: number;
    l2GBs?: number;
  };
  
  export type ProfileReport = {
    tool: "nsys";
    command: string;
    cwd: string;
    generatedAt: number;
    kernels: KernelRow[];
  };