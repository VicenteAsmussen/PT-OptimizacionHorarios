const hitosHiGHS = {
  "OPTIMIZACION:HIGHS_INICIO": "inicio",
  "OPTIMIZACION:HIGHS_PREPROCESAMIENTO": "preprocesamiento",
  "OPTIMIZACION:HIGHS_FIN_PREPROCESAMIENTO": "fin_preprocesamiento",
  "OPTIMIZACION:HIGHS_PREPROCESAMIENTO_DESACTIVADO": "preprocesamiento_desactivado",
  "OPTIMIZACION:HIGHS_BUSQUEDA": "busqueda",
  "OPTIMIZACION:HIGHS_INFORME": "informe",
  "OPTIMIZACION:HIGHS_LIMITE_TIEMPO": "limite_tiempo",
} as const;

type HitoHiGHS = typeof hitosHiGHS[keyof typeof hitosHiGHS];
type EventoRegistroHiGHS = { tipo: "configuracion"; limiteSolverSegundos: number } |
  { tipo: "no_disponible" } | { tipo: "hito"; hito: HitoHiGHS };

export interface RegistroHiGHS {
  configurado: boolean;
  limiteSolverSegundos?: number;
  hitos: { hito: HitoHiGHS; tiempoDesdeSolverMs: number }[];
}

export interface ProgresoSolverJulia {
  tiempoSolverSegundos: number;
  nodos: number;
  objetivoCandidato: number | null;
  cotaDual: number | null;
  brechaRelativa: number | null;
}

export interface DiagnosticoProcesoJulia {
  origenFin: "salida" | "watchdog" | "interrupcion" | "error";
  fase: "arranque" | "solver" | "extraccion";
  subfaseSolver?: "transferencia" | "resolucion";
  tiemposMs: {
    total: number;
    arranque: number;
    inicioJulia?: number;
    carga?: number;
    construccion?: number;
    llamadaSolver?: number;
    transferencia?: number;
    resolucion?: number;
    extraccion?: number;
  };
  muestrasProgreso: ProgresoSolverJulia[];
  progresoNoDisponible: boolean;
  registroHiGHS?: RegistroHiGHS;
}

/** El registro nativo solo transporta códigos cerrados y un límite numérico. */
// Reconoce únicamente hitos y configuración permitidos del registro nativo del cálculo.
export function leerRegistroHiGHS(linea: string): EventoRegistroHiGHS | undefined {
  if (Object.hasOwn(hitosHiGHS, linea)) return { tipo: "hito", hito: hitosHiGHS[linea as keyof typeof hitosHiGHS] };
  if (linea === "OPTIMIZACION:HIGHS_NO_DISPONIBLE") return { tipo: "no_disponible" };
  const prefijo = "OPTIMIZACION:HIGHS_CONFIGURACION ";
  if (!linea.startsWith(prefijo) || linea.length > 128) return;
  try {
    const dato = JSON.parse(linea.slice(prefijo.length));
    if (!dato || typeof dato !== "object" || Array.isArray(dato) || Object.keys(dato).length !== 1 ||
      !Object.hasOwn(dato, "limiteSolverSegundos") || typeof dato.limiteSolverSegundos !== "number" ||
      !Number.isFinite(dato.limiteSolverSegundos) || dato.limiteSolverSegundos <= 0 || dato.limiteSolverSegundos > 1e30) return;
    return { tipo: "configuracion", limiteSolverSegundos: dato.limiteSolverSegundos };
  } catch { return; }
}

/** Solo admite métricas numéricas, nunca texto del solucionador, rutas o entradas. */
// Extrae métricas numéricas acotadas del canal de progreso sin propagar texto arbitrario.
export function leerProgresoSolver(linea: string): ProgresoSolverJulia | undefined {
  const prefijo = "OPTIMIZACION:PROGRESO ";
  if (!linea.startsWith(prefijo) || linea.length > 512) return;
  try {
    const dato = JSON.parse(linea.slice(prefijo.length));
    const campos = ["tiempoSolverSegundos", "nodos", "objetivoCandidato", "cotaDual", "brechaRelativa"];
    if (!dato || typeof dato !== "object" || Array.isArray(dato) ||
      Object.keys(dato).length !== campos.length || campos.some(campo => !Object.hasOwn(dato, campo))) return;
    // Descarta valores no numéricos o desmesurados antes de guardar métricas del solucionador.
    const finito = (valor: unknown): valor is number => typeof valor === "number" && Number.isFinite(valor) && Math.abs(valor) <= 1e30;
    if (!finito(dato.tiempoSolverSegundos) || dato.tiempoSolverSegundos < 0 ||
      !Number.isSafeInteger(dato.nodos) || dato.nodos < 0 ||
      [dato.objetivoCandidato, dato.cotaDual, dato.brechaRelativa].some(valor => valor !== null && !finito(valor)) ||
      (dato.brechaRelativa !== null && dato.brechaRelativa < 0)) return;
    return { tiempoSolverSegundos: dato.tiempoSolverSegundos, nodos: dato.nodos,
      objetivoCandidato: dato.objetivoCandidato, cotaDual: dato.cotaDual, brechaRelativa: dato.brechaRelativa };
  } catch { return; }
}
