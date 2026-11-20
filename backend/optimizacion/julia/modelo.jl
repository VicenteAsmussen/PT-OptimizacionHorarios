using JuMP, HiGHS

"""Traducción de las celdas 12–17 de Code_v2, sin transporte ni persistencia."""
# Construye la programación de componentes y la protección curricular de las ofertas del período.
function construir_modelo(entrada)
    modelo = Model(HiGHS.Optimizer)
    set_silent(modelo)
    set_time_limit_sec(modelo, entrada.parametros.limiteSolverSegundos)
    # r identifica una oferta y su componente T/P/L, con docente y carga ya fijados.
    # La carga «horas» se cuenta en bloques académicos, no en horas de reloj.
    requerimientos = [(oferta=o, componente=c) for o in entrada.ofertas for c in o.componentes]
    indices = eachindex(requerimientos)
    dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
    bloques = 1:16
    categorias = eachindex(entrada.recursos)
    # d es el día, b su posición 1:16 y s el índice de categoría, no un ID de sala física.
    # bloque_id traduce (d,b) al ID que usan disponibilidad, reservas, externos y salida.
    bloque_id = Dict((String(b.dia), Int(b.numeroBloque)) => Int(b.id) for b in entrada.bloques)
    disponibilidad = Set((Int(d.profesorId), Int(d.bloqueId)) for d in entrada.disponibilidades)
    reservas = Set(Int.(entrada.reservas))
    profesores = unique([Int(r.componente.profesorId) for r in requerimientos])
    secciones_programables = [Int(o.id) for o in entrada.ofertas]
    secciones_malla = unique(vcat(secciones_programables, [Int(e.ofertaId) for e in entrada.externos]))
    ocupacion_fija = Set((Int(e.ofertaId), Int(e.bloqueId)) for e in entrada.externos)

    # Celda 12: dominio factible por capacidad, tipo, disponibilidad y reservas.
    # Determina si un bloque y una categoría admiten el componente y todos sus cupos.
    function factible(r, d, b, s)
        requisito = requerimientos[r]
        categoria = entrada.recursos[s]
        tipo = requisito.componente.tipo == "L" ? "Laboratorio" : "Sala"
        return categoria.capacidad >= requisito.oferta.cupos && categoria.tipo == tipo &&
            (Int(requisito.componente.profesorId), bloque_id[(d,b)]) in disponibilidad &&
            !(bloque_id[(d,b)] in reservas)
    end
    # x[r,d,b,s]=1 programa un bloque del componente r en la categoría s.
    # No se crean variables para combinaciones excluidas por factible.
    @variable(modelo, x[r in indices, d in dias, b in bloques, s in categorias; factible(r,d,b,s)], Bin)
    # Continua por diseño. La igualdad con suma de binarias implica integridad.
    # faltante[r] mide bloques no programados, entre cero y la carga íntegra del componente.
    @variable(modelo, 0 <= faltante[r in indices] <= requerimientos[r].componente.horas)
    # Cobertura: cada bloque requerido queda asignado o declarado faltante, sin aumentar la carga.
    @constraint(modelo, cobertura[r in indices],
        sum(x[r,d,b,s] for d in dias, b in bloques, s in categorias if haskey(x,(r,d,b,s))) + faltante[r] == requerimientos[r].componente.horas)
    # Cantidad simultánea por categoría, no suma de asientos ni disponibilidad del catálogo completo.
    @constraint(modelo, recursos[d in dias, b in bloques, s in categorias],
        sum(x[r,d,b,s] for r in indices if haskey(x,(r,d,b,s))) <= entrada.recursos[s].cantidad)
    # Un docente no puede impartir dos componentes gestionados en el mismo bloque.
    @constraint(modelo, docentes[p in profesores, d in dias, b in bloques],
        sum(x[r,d,b,s] for r in indices, s in categorias if requerimientos[r].componente.profesorId == p && haskey(x,(r,d,b,s))) <= 1)

    # Celda 16: z es cero fuera del dominio y y ocupa a lo sumo una categoría.
    # z extiende x con ceros, y suma categorías para expresar presencia del componente.
    @expression(modelo, z[r in indices, d in dias, b in bloques, s in categorias], haskey(x,(r,d,b,s)) ? x[r,d,b,s] : 0)
    @expression(modelo, y[r in indices, d in dias, b in bloques], sum(z[r,d,b,s] for s in categorias))
    @constraint(modelo, una_categoria[r in indices, d in dias, b in bloques], y[r,d,b] <= 1)
    # Todo bloque par ocupado exige el impar anterior, por eso una secuencia no inicia en par.
    @constraint(modelo, inicio_impar[r in indices, d in dias, b in 2:2:16], y[r,d,b] <= y[r,d,b-1])
    # B1 ocupado exige B2, y un nuevo inicio impar B3:B15 exige su bloque siguiente.
    # El mínimo es dos bloques, no una duración par: una secuencia B3:B5 sigue siendo admisible.
    @constraint(modelo, inicio_dos[r in indices, d in dias], y[r,d,1] <= y[r,d,2])
    @constraint(modelo, minimo_dos[r in indices, d in dias, b in 3:2:15], y[r,d,b] - y[r,d,b-1] <= y[r,d,b+1])
    # Si r continúa en b+1, conserva la categoría usada en b, no necesariamente una sala física.
    @constraint(modelo, misma_categoria[r in indices, d in dias, b in 1:15, s in categorias],
        z[r,d,b,s] + y[r,d,b+1] - 1 <= z[r,d,b+1,s])
    # q es ofertaId: agrupar T/P/L mantiene indivisible la sección para detectar topes.
    @expression(modelo, y_seccion[q in secciones_programables, d in dias, b in bloques],
        sum(z[r,d,b,s] for r in indices, s in categorias if requerimientos[r].oferta.id == q))
    # La ocupación agregada también respeta inicio impar y una sola actividad por sección.
    @constraint(modelo, inicio_seccion[q in secciones_programables, d in dias, b in 2:2:16], y_seccion[q,d,b] <= y_seccion[q,d,b-1])
    # Cada ventana de cinco contiene a lo sumo cuatro bloques: máximo continuo, no diario.
    @constraint(modelo, maximo_cuatro[q in secciones_programables, d in dias, b in 1:12], sum(y_seccion[q,d,j] for j in b:b+4) <= 4)
    @constraint(modelo, una_actividad[q in secciones_programables, d in dias, b in bloques], y_seccion[q,d,b] <= 1)

    # Celda 17: externos son únicamente ocupación fija, nunca x ni recursos/docentes.
    # El indicador fijo vale uno si existe algún externo de q en el bloque, sin contar filas T/P/L.
    @expression(modelo, ocupacion[q in secciones_malla, d in dias, b in bloques],
        (q in secciones_programables ? y_seccion[q,d,b] : 0) + Int((q,bloque_id[(d,b)]) in ocupacion_fija))
    @constraint(modelo, una_actividad_malla[q in secciones_malla, d in dias, b in bloques], ocupacion[q,d,b] <= 1)
    # p indexa combinaciones de secciones de dos asignaturas, no elecciones globales de la malla.
    combinaciones = [(pareja=p, a=Int(a), b=Int(b)) for p in entrada.parejas for a in p.seccionesA for b in p.seccionesB]
    @variable(modelo, protege[p in eachindex(combinaciones)], Bin)
    # protege[p]=1 impide todo tope entre ambas secciones completas, incluidos sus externos.
    # Con cero no se exige un tope: se deja de certificar esa combinación.
    @constraint(modelo, sin_tope[p in eachindex(combinaciones), d in dias, b in bloques],
        ocupacion[combinaciones[p].a,d,b] + ocupacion[combinaciones[p].b,d,b] <= 2 - protege[p])
    for pareja in entrada.parejas
        if pareja.status == 1
            pares = [p for p in eachindex(combinaciones) if combinaciones[p].pareja.id == pareja.id]
            if !isempty(pares)
                # status=1 exige al menos el 50 % redondeado hacia arriba por pareja de asignaturas.
                # Esta cota no garantiza una elección simultánea compatible de toda la malla.
                @constraint(modelo, sum(protege[p] for p in pares) >= ceil(Int, 0.5 * length(pares)))
            end
        end
    end
    # status entre cero y uno es peso flexible, no una proporción mínima de protección.
    flexibles = [p for p in eachindex(combinaciones) if 0 < combinaciones[p].pareja.status < 1]
    # Un bloque faltante cuesta 1000 unidades de objetivo. Cada combinación flexible no protegida cuesta
    # su status una sola vez, aunque coincida en varios bloques. No es objetivo lexicográfico.
    # La entrada certifica prioridad de carga solo si la cota flexible total es menor que 1000.
    @objective(modelo, Min, 1000 * sum(faltante[r] for r in indices) +
        sum(combinaciones[p].pareja.status * (1 - protege[p]) for p in flexibles))
    return (; modelo, x, faltante, protege, requerimientos, combinaciones, bloque_id)
end
