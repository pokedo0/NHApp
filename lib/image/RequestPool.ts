import { Platform } from "react-native";
import { Pool } from "./Pool";

const DEFAULT_NET = Platform.OS === "android" ? 8 : 6;

const pool = new Pool(DEFAULT_NET);

export const imageRequestPool = {
  acquire: (pri: "low" | "normal" | "high" = "normal") => pool.acquire(pri),
  setConcurrency: (n: number) => pool.setSize(n),
};
