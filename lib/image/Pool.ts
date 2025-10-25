export type Release = () => void;
type Pri = 0 | 1 | 2; // low=0, normal=1, high=2

export class Pool {
  private size: number;
  private used = 0;
  private q: Array<{ pri: Pri; id: number; resolve: (r: Release) => void }> = [];
  private seq = 0;

  constructor(size: number) {
    this.size = Math.max(1, size | 0);
  }

  setSize(n: number) {
    this.size = Math.max(1, n | 0);
    this.pump();
  }

  acquire(pri: "low" | "normal" | "high" = "normal"): Promise<Release> {
    const p: Pri = pri === "high" ? 2 : pri === "low" ? 0 : 1;
    return new Promise<Release>((resolve) => {
      const id = ++this.seq;
      const grant = () => {
        this.used++;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.used = Math.max(0, this.used - 1);
          this.pump();
        });
      };
      if (this.used < this.size) {
        grant();
      } else {
        this.q.push({ pri: p, id, resolve: grant });
        this.q.sort((a, b) => (b.pri - a.pri) || (a.id - b.id));
      }
    });
  }

  private pump() {
    while (this.used < this.size && this.q.length > 0) {
      const next = this.q.shift()!;
      next.resolve(() => {});
    }
  }
}
