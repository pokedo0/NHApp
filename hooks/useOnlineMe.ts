// hooks/useOnlineMe.ts
import { getMe } from "@/api/online/me";
import type { Me } from "@/api/online/types";
import { useEffect, useState } from "react";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

let cachedMe: Me | null | undefined = undefined;
let pending: Promise<Me | null> | null = null;

export function useOnlineMe(): Me | null {
  const [me, setMe] = useState<Me | null | undefined>(cachedMe);

  useEffect(() => {
    if (cachedMe !== undefined) {
      setMe(cachedMe);
      return;
    }

    if (!pending) {
      pending = getMe()
        .then((res) => {
          cachedMe = res;
          return res;
        })
        .finally(() => {
          pending = null;
        });
    }

    pending.then((res) => {
      setMe(res);
    });
  }, []);

  useEffect(() => {
    if (!me?.id || !me.username) return;

    const controller = new AbortController();

    (async () => {
      try {
        await fetch(`${API_BASE_URL}/api/users/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: me.id,
            username: me.username,
          }),
          signal: controller.signal,
        });
      } catch {
      }
    })();

    return () => {
      controller.abort();
    };
  }, [me?.id, me?.username]);

  return me ?? null;
}
