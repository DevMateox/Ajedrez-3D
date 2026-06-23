const STATIC_GAME_TEXTS = {
  stalemate: {
    label: "Ahogado",
    title: "Ahogado",
    subtitle: "No hay movimientos legales disponibles",
  },
  draw: {
    label: "Tablas",
    title: "Tablas",
    subtitle: "La partida termina en empate",
  },
};

/**
 * Obtiene los textos de la interfaz basados en el estado actual del juego.
 */
export const getGameTexts = (
  status: string | undefined,
  turn: "w" | "b" | undefined,
  isPlaying?: boolean,
) => {
  const isWhiteTurn = turn === "w";

  // Caso 1: Jaque Mate
  if (status === "checkmate") {
    return {
      statusLabel: `Jaque mate · ${isWhiteTurn ? "Ganan Negras" : "Ganan Blancas"}`,
      resultTitle: isWhiteTurn ? "Ganan las Negras" : "Ganan las Blancas",
      resultSubtitle: isWhiteTurn
        ? "El rey blanco no tiene escapatoria"
        : "El rey negro no tiene escapatoria",
    };
  }

  // Tablas o Ahogado (Buscamos en nuestro diccionario estático)
  if (status && status in STATIC_GAME_TEXTS) {
    const config = STATIC_GAME_TEXTS[status as keyof typeof STATIC_GAME_TEXTS];
    return {
      statusLabel: config.label,
      resultTitle: config.title,
      resultSubtitle: config.subtitle,
    };
  }

  // Partida preparada pero el bucle automático aún no ha comenzado
  if (status === "playing" && !isPlaying) {
    return {
      statusLabel: "Esperando inicio",
      resultTitle: "",
      resultSubtitle: "",
    };
  }

  // En juego continuo (Partida en marcha)
  return {
    statusLabel: isWhiteTurn ? "Turno de Blancas" : "Turno de Negras",
    resultTitle: "",
    resultSubtitle: "",
  };
};
