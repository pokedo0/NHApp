import { getMe } from "@/api/online/me";
import type { Me } from "@/api/online/types";
import { useEffect, useState } from "react";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export function useOnlineMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;

    getMe()
      .then((res) => {
        if (!cancelled) {
          setMe(res);
        }
      })
      .catch((err) => {
        console.error("Failed to load me:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!me?.id || !me.username) return;

    const controller = new AbortController();

    fetch(`${API_BASE_URL}/api/users/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: me.id,
        username: me.username,
      }),
      signal: controller.signal,
    }).catch(() => {});

    return () => controller.abort();
  }, [me?.id, me?.username]);

  return me;
}
