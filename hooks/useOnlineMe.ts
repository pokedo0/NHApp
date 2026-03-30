import { getMe, hasSession } from "@/api/v2";
import type { Me } from "@/api/v2";
import { getDeviceId, getDeviceName } from "@/utils/deviceId";
import { useEffect, useState } from "react";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export function useOnlineMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;

    hasSession().then((ok) => {
      if (!ok || cancelled) return;
      return getMe()
        .then((res) => {
          if (!cancelled) setMe(res);
        })
        .catch((err) => {
          console.error("Failed to load me:", err);
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!me?.id || !me.username) return;

    const controller = new AbortController();

    Promise.all([getDeviceId(), getDeviceName()])
      .then(([deviceId, deviceName]) => {
        if (controller.signal.aborted) return;
        return fetch(`${API_BASE_URL}/api/users/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: me.id,
            username: me.username,
            deviceId,
            deviceName,
          }),
          signal: controller.signal,
        });
      })
      .then((r) => r?.ok)
      .catch(() => {});

    return () => controller.abort();
  }, [me?.id, me?.username]);

  return me;
}
