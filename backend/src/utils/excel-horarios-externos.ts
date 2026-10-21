import ExcelJS from "exceljs";
import { horariosRepository } from "../repositories/horarios.repository.js";
import { ForbiddenError } from "./errors.js";
import { normalizarTextoCelda, normalizarDia, analizarHorario, agruparBloquesEnSesiones, formatearHorario } from "./excel-salas.js";
import { normalizarNombreExcel, normalizarTipoHoraExcel } from "./excel-comun.js";

import { normalizarRut } from "./rut.js";

/** Formato externo independiente del Excel de solicitud/asignación de salas. */
export const encabezadosExcelExternos = [
  "Código Asig.", "Nombre Asignatura", "Sección", "Cupos", "RUT Profesor", "Profesor",
  ...[1, 2, 3, 4, 5].flatMap((numero) => [`Tipo Hora ${numero}`, `Día ${numero}`, `Horario ${numero}`, `Sala ${numero}`]),
] as const;

/** Valida todo el archivo antes de escribir. Sala N es visual: se ignora incluso no vacía. */
export async function importarHorariosExternos(planificacionSemestreId: number, departamentoId: number, archivo: Buffer, carreraId?: number) {
  const errores: { fila: number; columna: string; mensaje: string; codigoAsignatura?: string; nombreAsignatura?: string; valor?: string }[] = [];
  const advertencias: { fila: number; columna: string; mensaje: string }[] = [];
  const error = (fila: number, columna: string, mensaje: string) => errores.push({ fila, columna, mensaje });
  const rechazado = () => ({ ofertasCreadas: 0, horariosCreados: 0, errores, advertencias });
  const libro = new ExcelJS.Workbook();
  try { await libro.xlsx.load(Uint8Array.from(archivo).buffer); }
  catch { error(1, "archivo", "Adjunte un Excel .xlsx válido."); return rechazado(); }
  if (libro.worksheets.length !== 1) { error(1, "archivo", "Debe contener exactamente una hoja."); return rechazado(); }
  const hoja = libro.worksheets[0]!;
  encabezadosExcelExternos.forEach((encabezado, indice) => {
    if (hoja.getRow(1).getCell(indice + 1).value !== encabezado) error(1, encabezado, `Use el encabezado exacto «${encabezado}».`);
  });
  if (hoja.columnCount > encabezadosExcelExternos.length) error(1, "archivo", "Hay columnas adicionales.");
  if (errores.length) return rechazado();
  if (!await horariosRepository.checkPlanificacionExists(planificacionSemestreId)) { error(1, "planificacionSemestreId", "La planificación no existe."); return rechazado(); }
  const contexto = await horariosRepository.findContextoExternos(planificacionSemestreId, departamentoId, carreraId);
  if (!contexto.departamentoValido) throw new ForbiddenError("Departamento inexistente o no externo para la carrera de la secretaria");
  const propuestas: Parameters<typeof horariosRepository.crearExternosEnTransaccion>[1] = [];
  const claves = new Set<string>();
  const codigos = new Set(contexto.asignaturas.map(asignatura => asignatura.codigo));
  const ofertasReemplazadas = new Set(contexto.ofertas.filter(oferta => codigos.has(oferta.asignaturaCodigo)).map(oferta => oferta.id));
  const ocupaciones = new Set(contexto.ocupaciones.filter(ocupacion => !ofertasReemplazadas.has(ocupacion.ofertaId)).map((ocupacion) => `${ocupacion.profesorId}:${ocupacion.bloqueId}`));
  hoja.eachRow((fila, numeroFila) => {
    if (numeroFila === 1) return;
    const texto = (columna: number) => normalizarTextoCelda(fila.getCell(columna).value);
    if (!Array.from({ length: encabezadosExcelExternos.length }, (_, indice) => texto(indice + 1)).some(Boolean)) return;
    const codigo = texto(1); const seccion = Number(texto(3)); const cupos = Number(texto(4));
    const asignatura = contexto.asignaturas.find((candidata) => candidata.codigo === codigo);
    const error = (fila: number, columna: string, mensaje: string) => {
      const indice = encabezadosExcelExternos.indexOf(columna);
      errores.push({ fila, columna, mensaje, codigoAsignatura: codigo, nombreAsignatura: asignatura?.nombre ?? texto(2), valor: indice >= 0 ? texto(indice + 1) : "" });
    };
    if (!codigo) { error(numeroFila, "Código Asig.", "Indique el código de la asignatura."); return; }
    if (!asignatura) return;
    if (asignatura && normalizarNombreExcel(texto(2)) !== normalizarNombreExcel(asignatura.nombre)) error(numeroFila, "Nombre Asignatura", `Indique «${asignatura.nombre}».`);
    if (!texto(3) || !Number.isSafeInteger(seccion) || seccion < 1 || seccion > 2147483647) error(numeroFila, "Sección", "Indique un entero positivo.");
    if (!texto(4) || !Number.isSafeInteger(cupos) || cupos < 0 || cupos > 2147483647) error(numeroFila, "Cupos", "Indique un entero no negativo.");
    const rut = normalizarRut(texto(5));
    const profesores = rut ? contexto.profesores.filter((profesor) => normalizarRut(profesor.rut) === rut) : [];
    const profesor = profesores.length === 1 && profesores[0]!.departamentoId === departamentoId ? profesores[0] : undefined;
    if (!rut) error(numeroFila, "RUT Profesor", "Indique un RUT válido con dígito verificador.");
    else if (!profesor) error(numeroFila, "RUT Profesor", "Profesor inexistente, ambiguo o fuera del departamento autorizado. Registre el profesor antes de importar.");
    const clave = JSON.stringify([codigo, seccion]);
    if (claves.has(clave)) error(numeroFila, "Sección", "La asignatura/sección está repetida en el archivo.");
    claves.add(clave);
    const sesiones: { bloqueId: number; tipoHoraId: number }[] = [];
    const bloquesUsados = new Set<number>();
    for (let numero = 1; numero <= 5; numero++) {
      const inicio = 7 + (numero - 1) * 4;
      // Sala N nunca identifica sesiones ni salas: se persiste exclusivamente null.
      if (![texto(inicio), texto(inicio + 1), texto(inicio + 2)].some(Boolean)) continue;
      const tipos = contexto.tipos.filter((tipo) => normalizarTipoHoraExcel(tipo.tipo) === normalizarTipoHoraExcel(texto(inicio)));
      if (!texto(inicio) || tipos.length !== 1) error(numeroFila, `Tipo Hora ${numero}`, "Tipo de hora inexistente o ambiguo.");
      const dia = normalizarDia(texto(inicio + 1)); const horario = analizarHorario(texto(inicio + 2));
      if (!dia.exito) error(numeroFila, `Día ${numero}`, dia.error);
      if (!horario.exito) error(numeroFila, `Horario ${numero}`, horario.error);
      if (!dia.exito || !horario.exito || tipos.length !== 1) continue;
      const bloques = contexto.bloques.filter((bloque) => {
        const diaBloque = normalizarDia(bloque.dia);
        return diaBloque.exito && diaBloque.valor === dia.valor && bloque.horaInicio >= horario.valor.horaInicio && bloque.horaTermino <= horario.valor.horaTermino;
      });
      const agrupadas = agruparBloquesEnSesiones(bloques);
      if (!agrupadas.exito || agrupadas.valor.length !== 1 || formatearHorario(agrupadas.valor[0]!) !== formatearHorario(horario.valor)) {
        error(numeroFila, `Horario ${numero}`, "El rango debe corresponder exactamente a bloques institucionales consecutivos."); continue;
      }
      for (const bloque of bloques) {
        const ocupacion = `${profesor?.id}:${bloque.id}`;
        if (bloquesUsados.has(bloque.id) || ocupaciones.has(ocupacion)) error(numeroFila, `Horario ${numero}`, "Bloque repetido o profesor ocupado en el semestre.");
        bloquesUsados.add(bloque.id); ocupaciones.add(ocupacion);
        sesiones.push({ bloqueId: bloque.id, tipoHoraId: tipos[0]!.id });
      }
    }
    if (!sesiones.length) error(numeroFila, "Horario 1", "Incluya al menos una sesión válida.");
    propuestas.push({ asignaturaCodigo: codigo, profesorId: profesor?.id ?? 0, seccion, cupos, sesiones });
  });
  if (!propuestas.length) error(2, "archivo", "El archivo no contiene ofertas de asignaturas de esta carrera y departamento. No se modificó la carga anterior.");
  if (errores.length) return rechazado();
  const resumen = await horariosRepository.sincronizarExternosEnTransaccion(planificacionSemestreId, departamentoId, propuestas, carreraId);
  const asignaturasCargadas = contexto.asignaturas.filter(asignatura => propuestas.some(fila => fila.asignaturaCodigo === asignatura.codigo)).map(asignatura => ({
    codigo: asignatura.codigo, nombre: asignatura.nombre, semestreMalla: asignatura.semestreMalla,
    secciones: propuestas.filter(fila => fila.asignaturaCodigo === asignatura.codigo).map(fila => fila.seccion).sort((a, b) => a - b),
  }));
  return { ...resumen, horariosCreados: propuestas.reduce((total, fila) => total + fila.sesiones.length, 0), asignaturasCargadas, errores, advertencias };
}
