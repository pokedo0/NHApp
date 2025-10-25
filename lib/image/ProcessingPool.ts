import { Pool } from "./Pool";

const DEFAULT_CPU = 2;

const pool = new Pool(DEFAULT_CPU);

export const imageProcessingPool = {
  acquire: (pri: "low" | "normal" | "high" = "normal") => pool.acquire(pri),
  setConcurrency: (n: number) => pool.setSize(n),
};
