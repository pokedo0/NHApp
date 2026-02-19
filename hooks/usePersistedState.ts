import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!mounted) return;
        if (raw != null) setValue(JSON.parse(raw));
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [key]);
  const update = async (next: T) => {
    setValue(next);
    try {
      await AsyncStorage.setItem(key, JSON.stringify(next));
    } catch {}
  };
  return [value, update] as const;
}
