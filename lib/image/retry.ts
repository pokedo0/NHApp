export type RetryOpts = {
  retries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitterRatio?: number;
  shouldRetry?: (e: any, attempt: number) => boolean;
};

export async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withTimeout<T>(
  p: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void
): Promise<T> {
  let to: any;
  const timeoutPromise = new Promise<T>((_, rej) => {
    to = setTimeout(() => {
      onTimeout?.();
      rej(new Error(`timeout_${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    const res = await Promise.race([p, timeoutPromise]);
    clearTimeout(to);
    return res;
  } catch (e) {
    clearTimeout(to);
    throw e;
  }
}

export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOpts
): Promise<T> {
  const {
    retries,
    baseDelayMs = 300,
    maxDelayMs = 5000,
    factor = 2,
    jitterRatio = 0.2,
    shouldRetry = () => true,
  } = opts;

  let attempt = 0;
  while (true) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (attempt >= retries || !shouldRetry(e, attempt)) throw e;
      const pow = Math.min(maxDelayMs, baseDelayMs * Math.pow(factor, attempt));
      const jitter = pow * jitterRatio * (Math.random() * 2 - 1);
      const delay = Math.max(0, Math.floor(pow + jitter));
      await sleep(delay);
      attempt++;
    }
  }
}
