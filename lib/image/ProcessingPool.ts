export class ProcessingPool {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private max = 2) {}

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (this.active < this.max) {
          this.active += 1;
          const release = () => {
            this.active = Math.max(0, this.active - 1);
            const next = this.queue.shift();
            next && next();
          };
          resolve(release);
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }
}

export const imageProcessingPool = new ProcessingPool(2);
