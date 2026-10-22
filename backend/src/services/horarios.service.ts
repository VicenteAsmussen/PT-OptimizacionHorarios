import ExcelJS from "exceljs";
import { type AlcanceCarrera } from "../utils/alcance-carrera.js";
import { analizarHorario, normalizarDia, normalizarCodigoSala, normalizarTextoCelda, agruparBloquesEnSesiones, encabezadosExcelSalas, formatearHorario, maximoSesionesExcelSalas, type BloqueExcelSala } from "../utils/excel-salas.js";
import { horariosRepository } from "../repositories/horarios.repository.js";
import { planificacionesSemestresService } from "./planificaciones-semestres.service.js";
import {
  type CreateHorarioDTO,
  type UpdateHorarioDTO,
  type HorarioQueryDTO,
  type MiHorarioQueryDTO,
} from "../validations/horarios.validation.js";
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from "../utils/errors.js";

import { normalizarTipoHoraExcel as normalizarTipoHora } from "../utils/excel-comun.js";
import { importarHorariosExternos } from "../utils/excel-horarios-externos.js";
import { calcularCoberturaExterna } from "../utils/cobertura-externos.js";

type UsuarioExcelSalas = { id: number; rol: string };

async function resolverCarreraExcel(usuario: UsuarioExcelSalas): Promise<number | undefined> {
  if (usuario.rol === "admin") return undefined;
  if (usuario.rol !== "secretaria") throw new ForbiddenError("El usuario no tiene acceso al Excel de salas");
  const perfil = await horariosRepository.findCarreraSecretariaByUsuarioId(usuario.id);
  if (!perfil?.carreraId) throw new ForbiddenError("El usuario autenticado no tiene un perfil de secretaria con carrera asociada");
  return perfil.carreraId;
}

export const horariosService = {
  async coberturaExcelExternos(planificacionSemestreId: number, departamentoId: number, usuario: UsuarioExcelSalas) {
    const carreraId = await resolverCarreraExcel(usuario);
    const planificacion = await horariosRepository.findPlanificacionById(planificacionSemestreId);
    if (!planificacion || (carreraId !== undefined && planificacion.carreraId !== carreraId)) throw new ForbiddenError("La planificación no pertenece a su carrera");
    const contexto = await horariosRepository.findContextoExternos(planificacionSemestreId, departamentoId, carreraId);
    if (!contexto.departamentoValido) throw new ForbiddenError("El departamento no es externo para la carrera seleccionada");
    const conHorario = new Set(contexto.ocupaciones.map(ocupacion => ocupacion.ofertaId));
    return { codigoPeriodo: planificacion.codigo,
      cobertura: calcularCoberturaExterna(contexto.asignaturas, planificacion.codigo, contexto.ofertas.filter(oferta => conHorario.has(oferta.id))) };
  },
  async importarExcelExternos(planificacionSemestreId: number, departamentoId: number, archivo: Buffer, usuario: UsuarioExcelSalas) {
    const carreraId = await resolverCarreraExcel(usuario);
    const planificacion = await horariosRepository.findPlanificacionById(planificacionSemestreId);
    if (!planificacion || (carreraId !== undefined && planificacion.carreraId !== carreraId)) throw new ForbiddenError("La planificación no pertenece a su carrera");
    return importarHorariosExternos(planificacionSemestreId, departamentoId, archivo, carreraId);
  },
  async importarExcelSalas(planificacionSemestreId: number, archivo: Buffer, usuario: UsuarioExcelSalas) {
    const carreraId = await resolverCarreraExcel(usuario);
    const planificacion = await horariosRepository.findPlanificacionById(planificacionSemestreId);
    if (!planificacion || (carreraId !== undefined && planificacion.carreraId !== carreraId)) throw new ForbiddenError("La planificación no pertenece a su carrera");
    const errores: { fila: number; columna: string; mensaje: string }[] = [];
    const error = (fila: number, columna: string, mensaje: string) => errores.push({ fila, columna, mensaje });
    const rechazado = () => ({ actualizadas: 0, pendientes: 0, errores });
    const libro = new ExcelJS.Workbook();
    try { await libro.xlsx.load(Uint8Array.from(archivo).buffer); }
    catch { error(1, "archivo", "No se pudo leer el archivo. Adjunte un Excel .xlsx válido."); return rechazado(); }
    if (libro.worksheets.length !== 1) {
      error(1, "archivo", "El archivo debe contener exactamente una hoja con el formato exportado."); return rechazado();
    }
    const hoja = libro.worksheets[0]!;
    encabezadosExcelSalas.forEach((encabezado, indice) => {
      if (hoja.getRow(1).getCell(indice + 1).value !== encabezado) {
        error(1, encabezado, `La columna ${indice + 1} debe tener el encabezado exacto «${encabezado}». Use el archivo exportado.`);
      }
    });
    if (hoja.columnCount > encabezadosExcelSalas.length) error(1, "archivo", "Hay columnas adicionales. Use únicamente las columnas del archivo exportado.");
    if (errores.length) return rechazado();
    const { entradas, salas, entradasParaConflictos = entradas } = carreraId === undefined
      ? await horariosRepository.findParaImportarSalas(planificacionSemestreId)
      : await horariosRepository.findParaImportarSalas(planificacionSemestreId, carreraId);
    type Entrada = typeof entradas[number];
    const grupos = new Map<string, Entrada[]>();
    for (const entrada of entradas) {
      const tipo = normalizarTipoHora(entrada.tipoHora.tipo);
      if (tipo === "laboratorio" || tipo === "laboratory") continue;
      const clave = JSON.stringify([entrada.oferta.asignatura.codigo, entrada.oferta.seccion, entrada.oferta.profesorId, tipo]);
      const grupo = grupos.get(clave) ?? []; grupo.push(entrada); grupos.set(clave, grupo);
    }
    const sesiones: { entradas: Entrada[]; dia: string; horario: string }[] = [];
    for (const grupo of grupos.values()) {
      const agrupadas = agruparBloquesEnSesiones(grupo.map((entrada) => entrada.bloque));
      if (!agrupadas.exito) {
        error(1, "archivo", `${grupo[0]!.oferta.asignatura.codigo}: ${agrupadas.error} Corrija el horario antes de importar.`); continue;
      }
      for (const sesion of agrupadas.valor) {
        sesiones.push({ dia: sesion.dia, horario: formatearHorario(sesion),
          entradas: grupo.filter((entrada) => {
            const dia = normalizarDia(entrada.bloque.dia);
            return dia.exito && dia.valor === sesion.dia && sesion.numerosBloque.includes(entrada.bloque.numeroBloque);
          }) });
      }
    }
    const propuestas = new Map<number, { id: number; salaId: number | null; fila: number; columna: string }>();
    let actualizadas = 0; let pendientes = 0;
    hoja.eachRow((fila, numeroFila) => {
      if (numeroFila === 1) return;
      const texto = (columna: number) => normalizarTextoCelda(fila.getCell(columna).value);
      if (!Array.from({ length: encabezadosExcelSalas.length }, (_, indice) => texto(indice + 1)).some(Boolean)) return;
      const codigo = texto(1); const seccion = texto(3);
      for (const [valor, columna] of [[codigo, "Código Asig."], [seccion, "Sección"]]) {
        if (!valor) error(numeroFila, columna!, "Este campo es obligatorio para identificar la sesión.");
      }
      const candidatas = sesiones.filter((sesion) => {
        const oferta = sesion.entradas[0]!.oferta;
        return oferta.asignatura.codigo === codigo && String(oferta.seccion) === seccion;
      });
      if (codigo && seccion && !candidatas.length) error(numeroFila, "Código Asig.", "No existe esta asignatura/sección en el semestre indicado. Revise la clave visible.");
      for (let numero = 1; numero <= maximoSesionesExcelSalas; numero++) {
        const inicio = 7 + (numero - 1) * 4;
        const tipoTexto = texto(inicio - 1);
        const diaTexto = texto(inicio); const horarioTexto = texto(inicio + 1); const salaTexto = texto(inicio + 2);
        if (!tipoTexto && !diaTexto && !horarioTexto && !salaTexto) continue;
        if (!tipoTexto) error(numeroFila, `Tipo Hora ${numero}`, "Indique el tipo de hora de la sesión.");
        const dia = normalizarDia(diaTexto); const horario = analizarHorario(horarioTexto);
        if (!dia.exito) error(numeroFila, `Día ${numero}`, dia.error);
        if (!horario.exito) error(numeroFila, `Horario ${numero}`, horario.error);
        const salasCoincidentes = salas.filter((sala) => normalizarCodigoSala(sala.nombre) === normalizarCodigoSala(salaTexto));
        if (salaTexto && salasCoincidentes.length !== 1) error(numeroFila, `Sala ${numero}`, `La sala «${salaTexto}» no existe o su nombre es ambiguo. Revise el listado de salas.`);
        if (!dia.exito || !horario.exito) continue;
        const coincidencias = candidatas.filter((sesion) => normalizarTipoHora(sesion.entradas[0]!.tipoHora.tipo) === normalizarTipoHora(tipoTexto) && sesion.dia === dia.valor && sesion.horario === formatearHorario(horario.valor));
        if (coincidencias.length !== 1) {
          error(numeroFila, `Horario ${numero}`, "No se encuentra una sesión única para esta clave visible, día y horario. Vuelva a exportar el semestre."); continue;
        }
        const sesion = coincidencias[0]!; const oferta = sesion.entradas[0]!.oferta;
        if (texto(2) && texto(2) !== normalizarTextoCelda(oferta.asignatura.nombre)) error(numeroFila, "Nombre Asignatura", `El nombre esperado es «${oferta.asignatura.nombre}».`);
        if (texto(5) && texto(5) !== normalizarTextoCelda(oferta.profesor.nombre)) error(numeroFila, "Profesor", `El profesor esperado es «${oferta.profesor.nombre}».`);
        if (sesion.entradas.some((entrada) => propuestas.has(entrada.id))) {
          error(numeroFila, `Horario ${numero}`, "La sesión está repetida en el archivo. Inclúyala solo una vez."); continue;
        }
        if (salaTexto && salasCoincidentes.length !== 1) continue;
        const salaId = salaTexto ? salasCoincidentes[0]!.id : null;
        for (const entrada of sesion.entradas) propuestas.set(entrada.id, { id: entrada.id, salaId, fila: numeroFila, columna: `Sala ${numero}` });
        if (salaId === null) pendientes++; else actualizadas++;
      }
    });
    // Evaluar el estado final permite liberar o intercambiar salas en el mismo lote.
    const ocupaciones = new Map<string, Entrada[]>();
    for (const entrada of entradasParaConflictos) {
      const salaId = propuestas.has(entrada.id) ? propuestas.get(entrada.id)!.salaId : entrada.salaId;
      if (salaId === null) continue;
      const clave = `${entrada.bloqueId}:${salaId}`;
      const ocupantes = ocupaciones.get(clave) ?? []; ocupantes.push(entrada); ocupaciones.set(clave, ocupantes);
    }
    for (const ocupantes of ocupaciones.values()) {
      if (ocupantes.length < 2) continue;
      for (const entrada of ocupantes) {
        const propuesta = propuestas.get(entrada.id);
        if (propuesta) error(propuesta.fila, propuesta.columna, `Conflicto: sala ocupada en el bloque de ${entrada.bloque.dia} ${entrada.bloque.horaInicio}. Revise las otras sesiones del semestre.`);
      }
    }
    if (errores.length) return rechazado();
    if (propuestas.size) {
      const cambios = [...propuestas.values()].map(({ id, salaId }) => ({ id, salaId }));
      if (carreraId === undefined) await horariosRepository.actualizarSalasEnTransaccion(planificacionSemestreId, cambios);
      else await horariosRepository.actualizarSalasEnTransaccion(planificacionSemestreId, cambios, carreraId);
    }
    return { actualizadas, pendientes, errores };
  },

  async exportarExcelSalas(planificacionSemestreId: number, usuario: UsuarioExcelSalas): Promise<{ buffer: Buffer; nombreArchivo: string }> {
    const carreraId = await resolverCarreraExcel(usuario);
    const planificacion = await horariosRepository.findPlanificacionById(planificacionSemestreId);
    if (!planificacion) throw new NotFoundError(`Planificación con ID ${planificacionSemestreId} no encontrada`);
    if (carreraId !== undefined && planificacion.carreraId !== carreraId) throw new ForbiddenError("La planificación no pertenece a su carrera");
    const entradas = carreraId === undefined
      ? await horariosRepository.findParaExportarSalas(planificacionSemestreId)
      : await horariosRepository.findParaExportarSalas(planificacionSemestreId, carreraId);
    const grupos = new Map<string, { entrada: typeof entradas[number]; bloques: BloqueExcelSala[] }>();
    for (const entrada of entradas) {
      const tipo = normalizarTipoHora(entrada.tipoHora.tipo);
      if (tipo === "laboratorio" || tipo === "laboratory") continue;
      const clave = JSON.stringify([
        entrada.oferta.asignatura.codigo, entrada.oferta.seccion, entrada.oferta.profesorId, tipo,
      ]);
      const grupo = grupos.get(clave);
      if (grupo) grupo.bloques.push(entrada.bloque);
      else grupos.set(clave, { entrada, bloques: [entrada.bloque] });
    }

    if (grupos.size === 0) {
      throw new BadRequestError("No hay horarios generados para este semestre que se puedan exportar (se excluyen laboratorios).");
    }

    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet("Resumen Malla");
    hoja.columns = encabezadosExcelSalas.map((encabezado) => ({ header: encabezado, width: 20 }));
    hoja.getRow(1).font = { bold: true };
    hoja.views = [{ state: "frozen", ySplit: 1 }];
    // Orden estable independiente del orden de las entradas devueltas por la BD.
    for (const [, grupo] of [...grupos.entries()].sort(([primera], [segunda]) => primera.localeCompare(segunda))) {
      const { oferta, tipoHora } = grupo.entrada;
      const asignatura = oferta.asignatura;
      const referencia = `${asignatura.codigo}, sección ${oferta.seccion}, profesor ${oferta.profesor.nombre}, tipo ${tipoHora.tipo}`;
      const resultado = agruparBloquesEnSesiones(grupo.bloques);
      if (!resultado.exito) throw new BadRequestError(`${referencia}: ${resultado.error} Revise los bloques del horario antes de exportar.`);
      if (resultado.valor.length > maximoSesionesExcelSalas) {
        throw new BadRequestError(`${referencia}: tiene ${resultado.valor.length} sesiones; el máximo es ${maximoSesionesExcelSalas}. Revise la distribución de bloques antes de exportar.`);
      }
      const celdas: (string | number)[] = [
        asignatura.codigo, asignatura.nombre, oferta.seccion, oferta.cupos, oferta.profesor.nombre,
      ];
      for (let numeroSesion = 0; numeroSesion < maximoSesionesExcelSalas; numeroSesion++) {
        const sesion = resultado.valor[numeroSesion];
        // Nunca exportar la sala asignada: este archivo se completa externamente.
        celdas.push(sesion ? tipoHora.tipo : "", sesion?.dia ?? "", sesion ? formatearHorario(sesion) : "", "");
      }
      hoja.addRow(celdas);
    }
    return {
      buffer: Buffer.from(await libro.xlsx.writeBuffer()),
      nombreArchivo: `Resumen Malla (${planificacion.codigo}).xlsx`,
    };
  },

  async getAllHorarios(filtro?: HorarioQueryDTO, alcance?: AlcanceCarrera) {
    if (filtro?.planificacionSemestreId) await planificacionesSemestresService.getById(filtro.planificacionSemestreId, alcance);
    return horariosRepository.findAll(filtro, alcance);
  },

  async getHorarioById(id: number, alcance?: AlcanceCarrera) {
    const horario = await horariosRepository.findById(id);
    if (!horario || (alcance && horario.planificacionSemestre.carreraId !== alcance.carreraId)) throw new NotFoundError(`Horario con ID ${id} no encontrado`);
    return horario;
  },

  async validarEntrada(datos: CreateHorarioDTO, alcance?: AlcanceCarrera, id?: number) {
    const oferta = await horariosRepository.findOfertaWithDetails(datos.ofertaId);
    if (!oferta) throw new BadRequestError("La oferta no existe");
    await planificacionesSemestresService.getById(oferta.planificacionSemestreId, alcance);
    const planificacionSemestreId = datos.planificacionSemestreId ?? oferta.planificacionSemestreId;
    await planificacionesSemestresService.getById(planificacionSemestreId, alcance);
    if (planificacionSemestreId !== oferta.planificacionSemestreId) throw new BadRequestError("La planificación indicada no coincide con la planificación de la oferta");
    if (!await horariosRepository.checkBloqueExists(datos.bloqueId)) throw new BadRequestError("El bloque horario no existe");
    if (!await horariosRepository.checkTipoHoraExists(datos.tipoHoraId)) throw new BadRequestError("El tipo de hora no existe");
    if (datos.salaId) {
      if (!await horariosRepository.checkSalaExists(datos.salaId)) throw new BadRequestError("La sala no existe");
      const conflicto = await horariosRepository.findBySalaBloquePlanificacion(datos.salaId, datos.bloqueId, planificacionSemestreId);
      if (conflicto && conflicto.id !== id) throw new ConflictError("Conflicto de horario: sala ocupada en esta planificación");
    }
    const conflictoOferta = await horariosRepository.findByOfertaBloque(datos.ofertaId, datos.bloqueId);
    if (conflictoOferta && conflictoOferta.id !== id) throw new ConflictError("Conflicto de horario: sección ocupada en este bloque");
    const conflictoProfesor = await horariosRepository.findByProfesorBloquePlanificacion(oferta.profesorId, datos.bloqueId, planificacionSemestreId);
    if (conflictoProfesor && conflictoProfesor.id !== id) throw new ConflictError("Conflicto de horario: profesor ocupado en esta planificación");
    return { ...datos, planificacionSemestreId };
  },

  async createHorario(datos: CreateHorarioDTO, alcance?: AlcanceCarrera) {
    const entrada = await this.validarEntrada(datos, alcance);
    const creada = await horariosRepository.create(entrada);
    return this.getHorarioById(creada.id, alcance);
  },

  async updateHorario(id: number, datos: UpdateHorarioDTO, alcance?: AlcanceCarrera) {
    const existente = await this.getHorarioById(id, alcance);
    const entrada = await this.validarEntrada({
      ofertaId: datos.ofertaId ?? existente.ofertaId,
      salaId: datos.salaId === undefined ? existente.salaId : datos.salaId,
      bloqueId: datos.bloqueId ?? existente.bloqueId,
      tipoHoraId: datos.tipoHoraId ?? existente.tipoHoraId,
      planificacionSemestreId: datos.planificacionSemestreId ?? existente.planificacionSemestreId,
    }, alcance, id);
    await horariosRepository.update(id, entrada, existente.planificacionSemestreId);
    return this.getHorarioById(id, alcance);
  },

  async deleteHorario(id: number, alcance?: AlcanceCarrera) {
    const existente = await this.getHorarioById(id, alcance);
    await horariosRepository.delete(id, existente.planificacionSemestreId);
  },

  async deleteHorariosByOferta(ofertaId: number, alcance?: AlcanceCarrera) {
    const oferta = await horariosRepository.findOfertaWithDetails(ofertaId);
    if (!oferta) throw new NotFoundError("Oferta no encontrada");
    await planificacionesSemestresService.getById(oferta.planificacionSemestreId, alcance);
    return horariosRepository.deleteByOferta(ofertaId, oferta.planificacionSemestreId);
  },

  async getMiHorario(usuarioId: number, consulta?: MiHorarioQueryDTO) {
    const profesor = await horariosRepository.findProfesorByUsuarioId(usuarioId);
    if (!profesor) throw new ForbiddenError("El usuario autenticado no tiene un perfil de profesor asociado");
    const usuario = { id: usuarioId, rol: "profesor" };
    if (consulta?.planificacionSemestreId) await planificacionesSemestresService.getById(consulta.planificacionSemestreId, undefined, usuario);
    const permitidas = new Set((await planificacionesSemestresService.getAll(undefined, undefined, usuario)).map(fila => fila.id));
    return (await horariosRepository.findAll({ planificacionSemestreId: consulta?.planificacionSemestreId, profesorId: profesor.id }))
      .filter(fila => permitidas.has(fila.planificacionSemestreId));
  },
};
