/**
 * Gestor del ciclo de partida.
 * Controla el estado de chess.js, la comunicación con Stockfish y la sincronización del render.
 */
import { Chess, type Move } from "chess.js";
import { StockfishEngine } from "./StockfishEngine";
import { ChessRenderer, type PieceData } from "./ChessRender";

export interface GameState {
  fen: string;
  turn: "w" | "b";
  status: "playing" | "checkmate" | "stalemate" | "draw";
  lastMove?: string;
 // history: string[];
  moveCount: number;
  isPlaying: boolean;
}

export interface GameConfig {
  whiteDepth?: number;
  blackDepth?: number;
  whiteMovetime?: number;
  blackMovetime?: number;
  turnDelayMs?: number;
}

export class GameManager {
  readonly chess = new Chess();
  readonly engine: StockfishEngine;
  readonly renderer: ChessRenderer;

  private running = false;
  readonly config: Required<GameConfig>;
  readonly listeners = new Set<(s: GameState) => void>();

  constructor(renderer: ChessRenderer, config: GameConfig = {}) {
    this.engine = new StockfishEngine();
    this.renderer = renderer;

    this.config = {
      whiteDepth: config.whiteDepth ?? 14,
      blackDepth: config.blackDepth ?? 6,
      whiteMovetime: config.whiteMovetime ?? 0,
      blackMovetime: config.blackMovetime ?? 0,
      turnDelayMs: config.turnDelayMs ?? 400,
    };

    void this.syncRenderer();
  }

  /**
   * Suscribe un listener de estado y devuelve una función de limpieza.
   */
  subscribe(fn: (s: GameState) => void): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }

  /**
   * Genera el estado actual de la partida que necesita la UI.
   */
  getState(): GameState {
    return {
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      status: this.getStatus(),
      moveCount: this.chess.history().length,
     // history: this.chess.history(),
      isPlaying: this.running,
    };
  }

  /**
   * Inicia el bucle de juego si no está ya en ejecución.
   */
  async start() {
    if (this.running) return;

    this.running = true;
    this.emit();
    await this.engine.ready$();
    this.loop();
  }

  /**
   * Detiene el bucle de juego en cualquier momento.
   */
  stop() {
    this.running = false;
  }

  /**
   * Reinicia la partida al estado inicial y fuerza la actualización del render.
   */
  reset() {
    this.stop();
    this.chess.reset();
    void this.syncRenderer();
    this.emit();
  }

  /**
   * Libera recursos asociados al motor Stockfish.
   */
  destroy() {
    this.stop();
    this.engine.destroy();
  }

  /**
   * Bucle principal del juego en el que cada jugador pide un movimiento a Stockfish.
   */
  private async loop() {
    while (this.shouldContinue()) {
      const turn = this.chess.turn();
      const skill = this.getRandomSkill();

      const opts = this.buildEngineOptions(turn, skill);

      const uci = await this.getEngineMove(opts);
      if (!uci) break;

      const move = this.applyMoveFromUci(uci);
      if (!move) break;

      await this.animateMove(move);

      this.handleSpecialMoves(move);

      this.emit();

      await this.delayTurn();
    }

    this.finish();
  }

  private getStatus(): GameState["status"] {
    if (this.chess.isCheckmate()) return "checkmate";
    if (this.chess.isStalemate()) return "stalemate";
    if (this.chess.isDraw()) return "draw";
    return "playing";
  }

  private shouldContinue() {
    return this.running && !this.chess.isGameOver();
  }

  private getRandomSkill() {
    return 12 + Math.floor(Math.random() * 8);
  }

  /**
   * Construye las opciones de búsqueda de Stockfish según el turno y skill.
   */
  private buildEngineOptions(turn: "w" | "b", skill: number) {
    const base =
      turn === "w"
        ? {
            depth: this.config.whiteDepth,
            movetime: this.config.whiteMovetime,
          }
        : {
            depth: this.config.blackDepth,
            movetime: this.config.blackMovetime,
          };

    return {
      depth: base.depth,
      movetime: base.movetime || undefined,
      skill,
      multiPv: 3,
    };
  }

  private async getEngineMove(opts: {
    depth: number;
    movetime?: number;
    skill: number;
    multiPv: number;
  }) {
    const uci = await this.engine.getBestMove(this.chess.fen(), opts);
    return uci && uci !== "(none)" ? uci : null;
  }

  /**
   * Convierte la notación UCI devuelta por Stockfish en un movimiento aplicable.
   */
  private applyMoveFromUci(uci: string) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length >= 5 ? uci[4] : undefined;

    try {
      return this.chess.move({ from, to, promotion });
    } catch {
      return null;
    }
  }

  private async animateMove(move: Move) {
    await this.renderer.animateMove(
      move.from,
      move.to,
      move.promotion ?? undefined,
    );
  }

  /**
   * Detecta movimientos especiales que pueden requerir una sincronización completa con el render.
   */
  private handleSpecialMoves(move: Move) {
    if (
      move.isKingsideCastle() ||
      move.isQueensideCastle() ||
      move.isEnPassant()
    ) {
      void this.syncRenderer();
    }
  }

  /**
   * Extrae la posición actual del tablero como una lista de PieceData.
   */
  private boardToPieces(): PieceData[] {
    const board = this.chess.board();
    const out: PieceData[] = [];

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const cell = board[r][f];
        if (cell) {
          out.push({
            type: cell.type,
            color: cell.color,
            square: cell.square,
          });
        }
      }
    }

    return out;
  }

  /**
   * Sincroniza la escena 3D con la posición actual del motor de ajedrez.
   */
  private async syncRenderer() {
    const pieces = this.boardToPieces();
    console.log(`[game] syncRenderer: ${pieces.length} piezas desde chess.js`);

    try {
      await this.renderer.setPosition(pieces);
      console.log("[game] syncRenderer: OK");
    } catch (err) {
      console.error("[game] syncRenderer: FALLÓ", err);
    }
  }

  /**
   * Espera un retardo configurable antes del siguiente turno.
   */
  private async delayTurn() {
    if (!this.running || this.chess.isGameOver()) return;

    await new Promise((r) => setTimeout(r, this.config.turnDelayMs));
  }

  /**
   * Finaliza el bucle de juego cuando la partida termina.
   */
  private finish() {
    this.running = false;
    this.emit();
  }

  /**
   * Notifica a todos los listeners con el estado actualizado de la partida.
   */
  private emit() {
    const state = this.getState();
    this.listeners.forEach((fn) => fn(state));
  }
}
