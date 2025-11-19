import NetInfo, { NetInfoStateType } from "@react-native-community/netinfo";
import { Platform } from "react-native";
import { Pool } from "./Pool";

function defaultByPlatform() {
  return Platform.OS === "android" ? 8 : 6;
}

const pool = new Pool(defaultByPlatform());

export const imageRequestPool = {
  acquire: (pri: "low" | "normal" | "high" = "normal") => pool.acquire(pri),
  setConcurrency: (n: number) => pool.setSize(n),
};

NetInfo.addEventListener((state) => {
  let n = defaultByPlatform();
  if (state.type === NetInfoStateType.cellular) {
    const gen = state.details?.cellularGeneration;
    if (gen === "2g") n = 2;
    else if (gen === "3g") n = 3;
    else if (gen === "4g") n = 5;
    else if (gen === "5g") n = 6;
  } else if (state.type === NetInfoStateType.wifi) {
    n = defaultByPlatform();
  } else if (state.isInternetReachable === false) {
    n = 1;
  }
  pool.setSize(n);
});
