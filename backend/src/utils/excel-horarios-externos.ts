import ExcelJS from "exceljs";
import { horariosRepository } from "../repositories/horarios.repository.js";
import { ForbiddenError } from "./errors.js";
import { encabezadosExcelSalas, normalizarTextoCelda, normalizarDia, analizarHorario, agruparBloquesEnSesiones, formatearHorario } from "./excel-salas.js";
import { normalizarNombreExcel, normalizarTipoHoraExcel } from "./excel-comun.js";

/** Valida todo el archivo antes de escribir. Sala N es visual: se ignora incluso no vacía. */
export async function importarHorariosExternos(semestreId: number, departamentoId: number, archivo: Buffer, carreraId?: number) {
  const errores: { fila: number; columna: string; mensaje: string }[] = [];
  const error = (fila: number, columna: string, mensaje: string) => errores.push({ fila, columna, mensaje });
  const rechazado = () => ({ ofertasCreadas: 0, horariosCreados: 0, errores });
  const libro = new ExcelJS.Workbook();
  try { await libro.xlsx.load(Uint8Array.from(archivo).buffer); }
  catch { error(1, "archivo", "Adjunte un Excel .xlsx válido."); return rechazado(); }
  if (libro.worksheets.length !== 1) { error(1, "archivo", "Debe contener exactamente una hoja."); return rechazado(); }
  const hoja = libro.worksheets[0]!;
  encabezadosExcelSalas.forEach((encabezado, indice) => {
    if (hoja.getRow(1).getCell(indice + 1).value !== encabezado) error(1, encabezado, `Use el encabezado exacto «${encabezado}».`);
  });
  if (hoja.columnCount > encabezadosExcelSalas.length) error(1, "archivo", "Hay columnas adicionales.");
  if (errores.length) return rechazado();
  if (!await horariosRepository.checkSemestreExists(semestreId)) { error(1, "semestreId", "El semestre no existe."); return rechazado(); }
  const contexto = await horariosRepository.findContextoExternos(semestreId, departamentoId, carreraId);
  if (!contexto.departamentoValido) throw new ForbiddenError("Departamento inexistente o no externo para la carrera de la secretaria");
  const propuestas: Parameters<typeof horariosRepository.crearExternosEnTransaccion>[1] = [];
  const claves = new Set<string>();
  const ocupaciones = new Set(contexto.ocupaciones.map((ocupacion) => `${ocupacion.profesorId}:${ocupacion.bloqueId}`));
  hoja.eachRow((fila, numeroFila) => {
    if (numeroFila === 1) return;
    const texto = (columna: number) => normalizarTextoCelda(fila.getCell(columna).value);
    if (!Array.from({ length: 25 }, (_, indice) => texto(indice + 1)).some(Boolean)) return;
    const codigo = texto(1); const seccion = Number(texto(3)); const cupos = Number(texto(4));
    const asignatura = contexto.asignaturas.find((candidata) => candidata.codigo === codigo);
    if (!asignatura) error(numeroFila, "Código Asig.", "Asignatura inexistente o fuera de la carrera autorizada.");
    if (asignatura && normalizarNombreExcel(texto(2)) !== normalizarNombreExcel(asignatura.nombre)) error(numeroFila, "Nombre Asignatura", `Indique «${asignatura.nombre}».`);
    if (!texto(3) || !Number.isSafeInteger(seccion) || seccion < 1 || seccion > 2147483647) error(numeroFila, "Sección", "Indique un entero positivo.");
    if (!texto(4) || !Number.isSafeInteger(cupos) || cupos < 0 || cupos > 2147483647) error(numeroFila, "Cupos", "Indique un entero no negativo.");
    const profesores = contexto.profesores.filter((profesor) => normalizarNombreExcel(profesor.nombre) === normalizarNombreExcel(texto(5)));
    if (!texto(5) || profesores.length !== 1) error(numeroFila, "Profesor", "Profesor inexistente o ambiguo en el departamento. Corrija el nombre o registre el profesor antes de importar.");
    const clave = JSON.stringify([codigo, seccion]);
    if (claves.has(clave) || contexto.ofertas.some((oferta) => oferta.asignaturaCodigo === codigo && oferta.seccion === seccion)) error(numeroFila, "Sección", "La oferta ya existe o está repetida en el archivo.");
    claves.add(clave);
    const sesiones: { bloqueId: number; tipoHoraId: number }[] = [];
    const bloquesUsados = new Set<number>();
    for (let numero = 1; numero <= 5; numero++) {
      const inicio = 6 + (numero - 1) * 4;
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
        const ocupacion = `${profesores[0]?.id}:${bloque.id}`;
        if (bloquesUsados.has(bloque.id) || ocupaciones.has(ocupacion)) error(numeroFila, `Horario ${numero}`, "Bloque repetido o profesor ocupado en el semestre.");
        bloquesUsados.add(bloque.id); ocupaciones.add(ocupacion);
        sesiones.push({ bloqueId: bloque.id, tipoHoraId: tipos[0]!.id });
      }
    }
    if (!sesiones.length) error(numeroFila, "Horario 1", "Incluya al menos una sesión válida.");
    propuestas.push({ asignaturaCodigo: codigo, profesorId: profesores[0]?.id ?? 0, seccion, cupos, sesiones });
  });
  if (!propuestas.length) error(2, "archivo", "Incluya al menos una oferta.");
  if (errores.length) return rechazado();
  await horariosRepository.crearExternosEnTransaccion(semestreId, propuestas);
  return { ofertasCreadas: propuestas.length, horariosCreados: propuestas.reduce((total, fila) => total + fila.sesiones.length, 0), errores };
}
