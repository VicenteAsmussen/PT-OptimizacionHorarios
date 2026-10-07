import ExcelJS from "exceljs";
import { analizarHorario, normalizarDia, normalizarCodigoSala, normalizarTextoCelda, agruparBloquesEnSesiones, encabezadosExcelSalas, formatearHorario, maximoSesionesExcelSalas, type BloqueExcelSala } from "../utils/excel-salas.js";
import { horariosRepository } from "../repositories/horarios.repository.js";
import {
  type CreateHorarioDTO,
  type UpdateHorarioDTO,
  type HorarioQueryDTO,
  type MiHorarioQueryDTO,
} from "../validations/horarios.validation.js";
import { NotFoundError, ConflictError, BadRequestError, ForbiddenError } from "../utils/errors.js";

function normalizarTipoHora(tipo: string): string {
  return tipo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export const horariosService = {
  async importarExcelSalas(semestreId: number, archivo: Buffer) {
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
    const { entradas, salas } = await horariosRepository.findParaImportarSalas(semestreId);
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
      const codigo = texto(1); const sem = texto(2); const seccion = texto(3);
      for (const [valor, columna] of [[codigo, "Código Asig."], [sem, "Sem"], [seccion, "Sección"]]) {
        if (!valor) error(numeroFila, columna!, "Este campo es obligatorio para identificar la sesión.");
      }
      const candidatas = sesiones.filter((sesion) => {
        const oferta = sesion.entradas[0]!.oferta;
        return oferta.asignatura.codigo === codigo && String(oferta.asignatura.semestreMalla) === sem && String(oferta.seccion) === seccion;
      });
      if (codigo && sem && seccion && !candidatas.length) error(numeroFila, "Código Asig.", "No existe esta asignatura/Sem/sección en el semestre indicado. Revise la clave visible.");
      for (let numero = 1; numero <= maximoSesionesExcelSalas; numero++) {
        const inicio = 9 + (numero - 1) * 3;
        const diaTexto = texto(inicio); const horarioTexto = texto(inicio + 1); const salaTexto = texto(inicio + 2);
        if (!diaTexto && !horarioTexto && !salaTexto) continue;
        const dia = normalizarDia(diaTexto); const horario = analizarHorario(horarioTexto);
        if (!dia.exito) error(numeroFila, `Día ${numero}`, dia.error);
        if (!horario.exito) error(numeroFila, `Horario ${numero}`, horario.error);
        const salasCoincidentes = salas.filter((sala) => normalizarCodigoSala(sala.nombre) === normalizarCodigoSala(salaTexto));
        if (salaTexto && salasCoincidentes.length !== 1) error(numeroFila, `Sala ${numero}`, `La sala «${salaTexto}» no existe o su nombre es ambiguo. Revise el listado de salas.`);
        if (!dia.exito || !horario.exito) continue;
        const coincidencias = candidatas.filter((sesion) => sesion.dia === dia.valor && sesion.horario === formatearHorario(horario.valor));
        if (coincidencias.length !== 1) {
          error(numeroFila, `Horario ${numero}`, "No se encuentra una sesión única para esta clave visible, día y horario. Vuelva a exportar el semestre."); continue;
        }
        const sesion = coincidencias[0]!; const oferta = sesion.entradas[0]!.oferta;
        if (texto(4) && texto(4) !== normalizarTextoCelda(oferta.asignatura.nombre)) error(numeroFila, "Nombre Asignatura", `El nombre esperado es «${oferta.asignatura.nombre}».`);
        if (texto(8) && texto(8) !== normalizarTextoCelda(oferta.profesor.nombre)) error(numeroFila, "Profesor", `El profesor esperado es «${oferta.profesor.nombre}».`);
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
    for (const entrada of entradas) {
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
    if (propuestas.size) await horariosRepository.actualizarSalasEnTransaccion(semestreId,
      [...propuestas.values()].map(({ id, salaId }) => ({ id, salaId })));
    return { actualizadas, pendientes, errores };
  },

  async exportarExcelSalas(semestreId: number): Promise<{ buffer: Buffer; nombreArchivo: string }> {
    const semestre = await horariosRepository.findSemestreById(semestreId);
    if (!semestre) throw new NotFoundError(`Semestre con ID ${semestreId} no encontrado`);
    const entradas = await horariosRepository.findParaExportarSalas(semestreId);
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
      const horasPorTipo = (tipo: string) => asignatura.tiposHora
        .filter((asignacion) => normalizarTipoHora(asignacion.tipoHora.tipo) === tipo)
        .reduce((total, asignacion) => total + asignacion.horas, 0);
      const celdas: (string | number)[] = [
        asignatura.codigo, asignatura.semestreMalla, oferta.seccion, asignatura.nombre,
        horasPorTipo("teorica"), horasPorTipo("practica"), horasPorTipo("laboratorio") + horasPorTipo("laboratory"),
        oferta.profesor.nombre,
      ];
      for (let numeroSesion = 0; numeroSesion < maximoSesionesExcelSalas; numeroSesion++) {
        const sesion = resultado.valor[numeroSesion];
        // Nunca exportar la sala asignada: este archivo se completa externamente.
        celdas.push(sesion?.dia ?? "", sesion ? formatearHorario(sesion) : "", "");
      }
      hoja.addRow(celdas);
    }
    return {
      buffer: Buffer.from(await libro.xlsx.writeBuffer()),
      nombreArchivo: `Resumen Malla (${semestre.codigo}).xlsx`,
    };
  },

  async getAllHorarios(filter?: HorarioQueryDTO) {
    return await horariosRepository.findAll(filter);
  },

  async getHorarioById(id: number) {
    const horario = await horariosRepository.findById(id);
    if (!horario) {
      throw new NotFoundError(`Horario con ID ${id} no encontrado`);
    }
    return horario;
  },

  async createHorario(dto: CreateHorarioDTO) {
    const oferta = await horariosRepository.findOfertaWithDetails(dto.ofertaId);
    if (!oferta) {
      throw new BadRequestError(`La oferta de asignatura con ID ${dto.ofertaId} no existe`);
    }

    const semestreId = dto.semestreId ?? oferta.semestreId;
    if (dto.semestreId && dto.semestreId !== oferta.semestreId) {
      throw new BadRequestError(
        `El semestre indicado (${dto.semestreId}) no coincide con el semestre de la oferta (${oferta.semestreId})`
      );
    }

    const semExists = await horariosRepository.checkSemestreExists(semestreId);
    if (!semExists) {
      throw new BadRequestError(`El semestre con ID ${semestreId} no existe`);
    }

    const bloqueExists = await horariosRepository.checkBloqueExists(dto.bloqueId);
    if (!bloqueExists) {
      throw new BadRequestError(`El bloque horario con ID ${dto.bloqueId} no existe`);
    }

    const thExists = await horariosRepository.checkTipoHoraExists(dto.tipoHoraId);
    if (!thExists) {
      throw new BadRequestError(`El tipo de hora con ID ${dto.tipoHoraId} no existe`);
    }

    if (dto.salaId) {
      const salaExists = await horariosRepository.checkSalaExists(dto.salaId);
      if (!salaExists) {
        throw new BadRequestError(`La sala con ID ${dto.salaId} no existe`);
      }

      // Hard Constraint 1: Choque de sala en el mismo bloque y semestre
      const salaConflict = await horariosRepository.findBySalaBloqueSemestre(
        dto.salaId,
        dto.bloqueId,
        semestreId
      );
      if (salaConflict) {
        throw new ConflictError(
          `Conflicto de horario: La sala ya se encuentra ocupada en este bloque para el semestre indicado`
        );
      }
    }

    // Hard Constraint 2: Choque de la misma oferta en el mismo bloque
    const ofertaConflict = await horariosRepository.findByOfertaBloque(
      dto.ofertaId,
      dto.bloqueId
    );
    if (ofertaConflict) {
      throw new ConflictError(
        `Conflicto de horario: Esta sección de asignatura ya tiene una clase asignada en el bloque indicado`
      );
    }

    // Hard Constraint 3: Choque de profesor en el mismo bloque y semestre
    const profConflict = await horariosRepository.findByProfesorBloqueSemestre(
      oferta.profesorId,
      dto.bloqueId,
      semestreId
    );
    if (profConflict) {
      throw new ConflictError(
        `Conflicto de horario: El docente '${oferta.profesor.nombre}' ya tiene otra clase asignada en este bloque horario`
      );
    }

    const created = await horariosRepository.create({
      ...dto,
      semestreId,
    });

    return await this.getHorarioById(created.id);
  },

  async updateHorario(id: number, dto: UpdateHorarioDTO) {
    const existing = await this.getHorarioById(id);

    const targetOfertaId = dto.ofertaId ?? existing.ofertaId;
    const targetSalaId = dto.salaId !== undefined ? dto.salaId : existing.salaId;
    const targetBloqueId = dto.bloqueId ?? existing.bloqueId;
    const targetTipoHoraId = dto.tipoHoraId ?? existing.tipoHoraId;
    const targetSemestreId = dto.semestreId ?? existing.semestreId;

    const oferta = await horariosRepository.findOfertaWithDetails(targetOfertaId);
    if (!oferta) {
      throw new BadRequestError(`La oferta de asignatura con ID ${targetOfertaId} no existe`);
    }

    if (targetSemestreId !== oferta.semestreId) {
      throw new BadRequestError(
        `El semestre indicado (${targetSemestreId}) no coincide con el semestre de la oferta (${oferta.semestreId})`
      );
    }

    if (dto.salaId) {
      const salaExists = await horariosRepository.checkSalaExists(dto.salaId);
      if (!salaExists) {
        throw new BadRequestError(`La sala con ID ${dto.salaId} no existe`);
      }
    }

    if (dto.bloqueId) {
      const bloqueExists = await horariosRepository.checkBloqueExists(dto.bloqueId);
      if (!bloqueExists) {
        throw new BadRequestError(`El bloque horario con ID ${dto.bloqueId} no existe`);
      }
    }

    if (dto.tipoHoraId) {
      const thExists = await horariosRepository.checkTipoHoraExists(dto.tipoHoraId);
      if (!thExists) {
        throw new BadRequestError(`El tipo de hora con ID ${dto.tipoHoraId} no existe`);
      }
    }

    if (dto.semestreId) {
      const semExists = await horariosRepository.checkSemestreExists(dto.semestreId);
      if (!semExists) {
        throw new BadRequestError(`El semestre con ID ${dto.semestreId} no existe`);
      }
    }

    // Validar Choque de Sala
    if (targetSalaId) {
      const salaConflict = await horariosRepository.findBySalaBloqueSemestre(
        targetSalaId,
        targetBloqueId,
        targetSemestreId
      );
      if (salaConflict && salaConflict.id !== id) {
        throw new ConflictError(
          `Conflicto de horario: La sala ya se encuentra ocupada en este bloque para el semestre indicado`
        );
      }
    }

    // Validar Choque de Oferta
    const ofertaConflict = await horariosRepository.findByOfertaBloque(
      targetOfertaId,
      targetBloqueId
    );
    if (ofertaConflict && ofertaConflict.id !== id) {
      throw new ConflictError(
        `Conflicto de horario: Esta sección de asignatura ya tiene una clase asignada en el bloque indicado`
      );
    }

    // Validar Choque de Profesor
    const profConflict = await horariosRepository.findByProfesorBloqueSemestre(
      oferta.profesorId,
      targetBloqueId,
      targetSemestreId
    );
    if (profConflict && profConflict.id !== id) {
      throw new ConflictError(
        `Conflicto de horario: El docente '${oferta.profesor.nombre}' ya tiene otra clase asignada en este bloque horario`
      );
    }

    await horariosRepository.update(id, {
      ...dto,
      semestreId: targetSemestreId,
    });

    return await this.getHorarioById(id);
  },

  async deleteHorario(id: number) {
    await this.getHorarioById(id);
    await horariosRepository.delete(id);
  },

  async deleteHorariosByOferta(ofertaId: number) {
    const oferta = await horariosRepository.findOfertaWithDetails(ofertaId);
    if (!oferta) {
      throw new NotFoundError(`Oferta de asignatura con ID ${ofertaId} no encontrada`);
    }
    return await horariosRepository.deleteByOferta(ofertaId);
  },

  async getMiHorario(usuarioId: number, query?: MiHorarioQueryDTO) {
    const profesor = await horariosRepository.findProfesorByUsuarioId(usuarioId);
    if (!profesor) {
      throw new ForbiddenError("El usuario autenticado no tiene un perfil de profesor asociado");
    }

    let semestreId = query?.semestreId;
    if (!semestreId) {
      const semestreActual = await horariosRepository.findActualSemestre();
      if (semestreActual) {
        semestreId = semestreActual.id;
      }
    }

    return await horariosRepository.findAll({
      semestreId,
      profesorId: profesor.id,
    });
  },
};
