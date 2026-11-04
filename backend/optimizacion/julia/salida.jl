function extraer_salida(entrada, nucleo)
    modelo = nucleo.modelo
    terminacion = termination_status(modelo)
    estado = terminacion == JuMP.MOI.OPTIMAL ? "optimo" : terminacion == JuMP.MOI.TIME_LIMIT ? "limite_tiempo" :
        terminacion == JuMP.MOI.INFEASIBLE ? "infactible" : has_values(modelo) ? "factible" : "sin_solucion"
    asignaciones = []
    faltantes = []
    protecciones = []
    objetivo = nothing
    if has_values(modelo) && primal_status(modelo) == JuMP.MOI.FEASIBLE_POINT
        for (r,d,b,s) in eachindex(nucleo.x)
            if value(nucleo.x[r,d,b,s]) > 0.5
                requisito = nucleo.requerimientos[r]
                push!(asignaciones, (; ofertaId=Int(requisito.oferta.id), tipoHoraId=Int(requisito.componente.tipoHoraId),
                    bloqueId=nucleo.bloque_id[(d,b)], categoriaId=String(entrada.recursos[s].id)))
            end
        end
        for r in eachindex(nucleo.requerimientos)
            requisito = nucleo.requerimientos[r]
            push!(faltantes, (; ofertaId=Int(requisito.oferta.id), tipoHoraId=Int(requisito.componente.tipoHoraId), horas=round(Int,value(nucleo.faltante[r]))))
        end
        for p in eachindex(nucleo.combinaciones)
            combinacion = nucleo.combinaciones[p]
            push!(protecciones, (; parejaId=String(combinacion.pareja.id), ofertaAId=combinacion.a,
                ofertaBId=combinacion.b, protegida=value(nucleo.protege[p]) > 0.5))
        end
        objetivo = objective_value(modelo)
    end
    return (; version=1, revision=String(entrada.revision), estado, asignaciones, faltantes, protecciones, objetivo)
end
