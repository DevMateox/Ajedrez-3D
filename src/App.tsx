/**
 * Componente principal de la aplicación React.
 * Inicializa el renderizador 3D, crea el gestor de juego y mantiene
 * el estado de la partida para mostrar la interfaz de usuario.
 */
import { useEffect, useRef, useState } from "react";
import { ChessRenderer } from "@/chess/ChessRender";
import { GameManager, type GameState } from "@/chess/GameManager";
import { getGameTexts } from "./states/StatesText";

export const App = () => {
  /** Contenedor HTML donde se monta el canvas WebGL del tablero 3D. */
  const mountRef = useRef<HTMLDivElement | null>(null);
  /** Referencia al gestor de juego para iniciar, resetear y consultar el estado. */
  const managerRef = useRef<GameManager | null>(null);
  /** Estado actual de la partida proporcionado por GameManager. */
  const [state, setState] = useState<GameState | null>(null);

  const isStartDisabled = state?.isPlaying || state?.status !== "playing";
   const isGameOver =
     state?.status !== "playing" && (state?.moveCount ?? 0) > 0;

  const { statusLabel, resultTitle, resultSubtitle } = getGameTexts(
    state?.status,
    state?.turn,
    state?.isPlaying,
  );

  useEffect(() => {
    if (!mountRef.current) return;
    const renderer = new ChessRenderer(mountRef.current);
    const manager = new GameManager(renderer, {
      whiteDepth: 10,
      blackDepth: 10,
      turnDelayMs: 350,
    });
    managerRef.current = manager;
    const unsub = manager.subscribe(setState);
    return () => {
      unsub();
      manager.destroy();
      renderer.destroy();
    };
  }, []);

  /** Inicia la partida y activa el bucle de juego. */
 const handleStart = () => {
   if (!managerRef.current) return;
   void managerRef.current.start(); 
 };

  /** Reinicia el tablero y detiene el juego activo. */
  const handleReset = () => {
    managerRef.current?.reset();
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0" />

      <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-between p-6">
        <div className="pointer-events-auto">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Stockfish × Stockfish
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Ajedrez 3D
          </h1>
        </div>
        <div className="pointer-events-auto rounded-lg bg-white/50 px-4 py-2 text-sm">
          <span className="text-foreground">Estado: </span>
          <span className="font-medium">{statusLabel}</span>
        </div>
      </header>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-4 p-6">
        <div className="pointer-events-auto flex gap-3">
          <button
            onClick={handleStart}
            disabled={isStartDisabled}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {state?.isPlaying ? "Jugando…" : "Iniciar partida"}
          </button>

          <button
            onClick={handleReset}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-white/20"
          >
            Reiniciar
          </button>
        </div>
        <div className="pointer-events-auto flex gap-6 rounded-lg border border-border bg-card/70 px-5 py-2 text-xs text-muted-foreground backdrop-blur">
          <span>
            Movimientos:{" "}
            <span className="text-foreground">{state?.moveCount ?? 0}</span>
          </span>
          <span>
            Profundidad blancas: <span className="text-foreground">10</span>
          </span>
          <span>
            Profundidad negras: <span className="text-foreground">10</span>
          </span>
        </div>
      </div>

      {isGameOver && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60">
          <div className="pointer-events-auto max-w-sm rounded-2xl bg-card p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <svg
                className="h-8 w-8 text-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
            </div>
            <h2 className="text-2xl tracking-tight text-foreground">
              {resultTitle}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{resultSubtitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Movimientos totales: {state?.moveCount}
            </p>
            <button
              onClick={handleReset}
              className="mt-6 w-full rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Volver a jugar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
