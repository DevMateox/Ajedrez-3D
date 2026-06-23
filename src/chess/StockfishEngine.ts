/**
 * Capa de comunicación con el motor Stockfish ejecutado en un Web Worker.
 * Dado un FEN, devuelve el mejor movimiento en notación UCI.
 */
export interface StockfishOptions {
  depth?: number;
  movetime?: number;
  /** Stockfish Skill Level 0-20. Lower = weaker & more random. */
  skill?: number;
  /** Number of candidate lines to consider; one is picked at random. */
  multiPv?: number;
}

interface PendingRequest {
  resolve: (move: string) => void;
  candidates: string[]; // best move per multipv line, indexed by multipv-1
  multiPv: number;
}

export class StockfishEngine {
  readonly worker: Worker;
  private ready = false;
  readonly readyPromise: Promise<void>;
  private pending: PendingRequest | null = null;

  constructor() {
    this.worker = new Worker("/stockfish.js");
    this.readyPromise = new Promise((resolve) => {
      const onReady = (e: MessageEvent) => {
        const line = String(e.data);
        if (line === "uciok") {
          this.worker.postMessage("isready");
        } else if (line === "readyok") {
          this.ready = true;
          this.worker.removeEventListener("message", onReady);
          resolve();
        }
      };
      this.worker.addEventListener("message", onReady);
      this.worker.postMessage("uci");
    });

    this.worker.addEventListener("message", (e) => {
      const line = String(e.data);
      if (!this.pending) return;

      // Parse multipv candidate lines: "info ... multipv N ... pv <move> ..."
      if (
        line.startsWith("info") &&
        line.includes(" multipv ") &&
        line.includes(" pv ")
      ) {
        const mpvMatch = line.match(/ multipv (\d+) /);
        const pvMatch = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (mpvMatch && pvMatch) {
          const idx = Number.parseInt(mpvMatch[1], 10) - 1;
          this.pending.candidates[idx] = pvMatch[1];
        }
        return;
      }

      if (line.startsWith("bestmove")) {
        const fallback = line.split(" ")[1];
        const pool = this.pending.candidates.filter(Boolean);
        // Weighted pick favoring stronger lines: weights [n, n-1, ..., 1].
        let chosen = fallback;
        if (pool.length > 1) {
          const weights = pool.map((_, i) => pool.length - i);
          const total = weights.reduce((a, b) => a + b, 0);
          let r = Math.random() * total;
          for (let i = 0; i < pool.length; i++) {
            r -= weights[i];
            if (r <= 0) {
              chosen = pool[i];
              break;
            }
          }
        } else if (pool.length === 1) {
          chosen = pool[0];
        }
        const resolve = this.pending.resolve;
        this.pending = null;
        resolve(chosen);
      }
    });
  }

  /**
   * Espera hasta que el motor Stockfish esté listo para recibir comandos.
   */
  async ready$(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Pide al motor que calcule el mejor movimiento para la posición FEN dada.
   */
  async getBestMove(fen: string, opts: StockfishOptions = {}): Promise<string> {
    if (!this.ready) await this.readyPromise;
    const multiPv = Math.max(1, opts.multiPv ?? 1);
    const skill = opts.skill;
    return new Promise((resolve) => {
      this.pending = { resolve, candidates: [], multiPv };
      if (typeof skill === "number") {
        this.worker.postMessage(
          `setoption name Skill Level value ${Math.max(0, Math.min(20, skill))}`,
        );
      }
      this.worker.postMessage(`setoption name MultiPV value ${multiPv}`);
      this.worker.postMessage("ucinewgame");
      this.worker.postMessage(`position fen ${fen}`);
      if (opts.movetime) {
        this.worker.postMessage(`go movetime ${opts.movetime}`);
      } else {
        this.worker.postMessage(`go depth ${opts.depth ?? 10}`);
      }
    });
  }

  destroy() {
    this.worker.terminate();
  }
}
