export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (__DEV__
    ? "http://10.0.2.2:3000" // Android-эмулятор ходит на локальный хост через 10.0.2.2 :contentReference[oaicite:2]{index=2}
    : `${process.env.EXPO_PUBLIC_API_BASE_URL}`); // здесь подставь свой URL на Render

export const API_TIMEOUT_MS = 10000;
