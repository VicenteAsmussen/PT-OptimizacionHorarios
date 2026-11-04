using JuMP, HiGHS

"""Traducción de las celdas 12–17 de Code_v2, sin transporte ni persistencia."""
function construir_modelo(entrada)
    modelo = Model(HiGHS.Optimizer)
    set_silent(modelo)
    set_time_limit_sec(modelo, entrada.parametros.limiteSolverSegundos)
    requerimientos = [(oferta=o, componente=c) for o in entrada.ofertas for c in o.componentes]
    indices = eachindex(requerimientos)
    dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
    bloques = 1:16
    categorias = eachindex(entrada.recursos)
    bloque_id = Dict((String(b.dia), Int(b.numeroBloque)) => Int(b.id) for b in entrada.bloques)
    disponibilidad = Set((Int(d.profesorId), Int(d.bloqueId)) for d in entrada.disponibilidades)
    reservas = Set(Int.(entrada.reservas))
    profesores = unique([Int(r.componente.profesorId) for r in requerimientos])
    secciones_programables = [Int(o.id) for o in entrada.ofertas]
    secciones_malla = unique(vcat(secciones_programables, [Int(e.ofertaId) for e in entrada.externos]))
    ocupacion_fija = Set((Int(e.ofertaId), Int(e.bloqueId)) for e in entrada.externos)

    # Celda 12: dominio factible por capacidad, tipo, disponibilidad y reservas.
    function factible(r, d, b, s)
        requisito = requerimientos[r]
        categoria = entrada.recursos[s]
        tipo = requisito.componente.tipo == "L" ? "Laboratorio" : "Sala"
        return categoria.capacidad >= requisito.oferta.cupos && categoria.tipo == tipo &&
            (Int(requisito.componente.profesorId), bloque_id[(d,b)]) in disponibilidad &&
            !(bloque_id[(d,b)] in reservas)
    end
    @variable(modelo, x[r in indices, d in dias, b in bloques, s in categorias; factible(r,d,b,s)], Bin)
    # Continua por diseño. La igualdad con suma de binarias implica integridad.
    @variable(modelo, 0 <= faltante[r in indices] <= requerimientos[r].componente.horas)
    @constraint(modelo, cobertura[r in indices],
        sum(x[r,d,b,s] for d in dias, b in bloques, s in categorias if haskey(x,(r,d,b,s))) + faltante[r] == requerimientos[r].componente.horas)
    @constraint(modelo, recursos[d in dias, b in bloques, s in categorias],
        sum(x[r,d,b,s] for r in indices if haskey(x,(r,d,b,s))) <= entrada.recursos[s].cantidad)
    @constraint(modelo, docentes[p in profesores, d in dias, b in bloques],
        sum(x[r,d,b,s] for r in indices, s in categorias if requerimientos[r].componente.profesorId == p && haskey(x,(r,d,b,s))) <= 1)

    # Celda 16: z es cero fuera del dominio y y ocupa a lo sumo una categoría.
    @expression(modelo, z[r in indices, d in dias, b in bloques, s in categorias], haskey(x,(r,d,b,s)) ? x[r,d,b,s] : 0)
    @expression(modelo, y[r in indices, d in dias, b in bloques], sum(z[r,d,b,s] for s in categorias))
    @constraint(modelo, una_categoria[r in indices, d in dias, b in bloques], y[r,d,b] <= 1)
    @constraint(modelo, inicio_impar[r in indices, d in dias, b in 2:2:16], y[r,d,b] <= y[r,d,b-1])
    @constraint(modelo, inicio_dos[r in indices, d in dias], y[r,d,1] <= y[r,d,2])
    @constraint(modelo, minimo_dos[r in indices, d in dias, b in 3:2:15], y[r,d,b] - y[r,d,b-1] <= y[r,d,b+1])
    @constraint(modelo, misma_categoria[r in indices, d in dias, b in 1:15, s in categorias],
        z[r,d,b,s] + y[r,d,b+1] - 1 <= z[r,d,b+1,s])
    @expression(modelo, y_seccion[q in secciones_programables, d in dias, b in bloques],
        sum(z[r,d,b,s] for r in indices, s in categorias if requerimientos[r].oferta.id == q))
    @constraint(modelo, inicio_seccion[q in secciones_programables, d in dias, b in 2:2:16], y_seccion[q,d,b] <= y_seccion[q,d,b-1])
    @constraint(modelo, maximo_cuatro[q in secciones_programables, d in dias, b in 1:12], sum(y_seccion[q,d,j] for j in b:b+4) <= 4)
    @constraint(modelo, una_actividad[q in secciones_programables, d in dias, b in bloques], y_seccion[q,d,b] <= 1)

    # Celda 17: externos son únicamente ocupación fija, nunca x ni recursos/docentes.
    @expression(modelo, ocupacion[q in secciones_malla, d in dias, b in bloques],
        (q in secciones_programables ? y_seccion[q,d,b] : 0) + Int((q,bloque_id[(d,b)]) in ocupacion_fija))
    @constraint(modelo, una_actividad_malla[q in secciones_malla, d in dias, b in bloques], ocupacion[q,d,b] <= 1)
    combinaciones = [(pareja=p, a=Int(a), b=Int(b)) for p in entrada.parejas for a in p.seccionesA for b in p.seccionesB]
    @variable(modelo, protege[p in eachindex(combinaciones)], Bin)
    @constraint(modelo, sin_tope[p in eachindex(combinaciones), d in dias, b in bloques],
        ocupacion[combinaciones[p].a,d,b] + ocupacion[combinaciones[p].b,d,b] <= 2 - protege[p])
    for pareja in entrada.parejas
        if pareja.status == 1
            pares = [p for p in eachindex(combinaciones) if combinaciones[p].pareja.id == pareja.id]
            if !isempty(pares)
                @constraint(modelo, sum(protege[p] for p in pares) >= ceil(Int, 0.5 * length(pares)))
            end
        end
    end
    flexibles = [p for p in eachindex(combinaciones) if 0 < combinaciones[p].pareja.status < 1]
    @objective(modelo, Min, 1000 * sum(faltante[r] for r in indices) +
        sum(combinaciones[p].pareja.status * (1 - protege[p]) for p in flexibles))
    return (; modelo, x, faltante, protege, requerimientos, combinaciones, bloque_id)
end
