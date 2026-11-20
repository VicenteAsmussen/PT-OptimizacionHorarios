# Devuelve asignaciones, carga pendiente y protecciones con las identidades de la entrada.
function extraer_salida(entrada, nucleo)
    modelo = nucleo.modelo
    terminacion = termination_status(modelo)
    # El motivo de término no acredita completitud: TIME_LIMIT puede tener o no solución.
    # «optimo» se refiere a la suma ponderada, que permite carga faltante con penalización.
    estado = terminacion == JuMP.MOI.OPTIMAL ? "optimo" : terminacion == JuMP.MOI.TIME_LIMIT ? "limite_tiempo" :
        terminacion == JuMP.MOI.INFEASIBLE ? "infactible" : has_values(modelo) ? "factible" : "sin_solucion"
    asignaciones = []
    faltantes = []
    protecciones = []
    objetivo = nothing
    # Solo un punto primal factible habilita valores, en otro caso se devuelven listas vacías y null.
    if has_values(modelo) && primal_status(modelo) == JuMP.MOI.FEASIBLE_POINT
        # Los índices dispersos (r,d,b,s) vuelven a oferta, componente, bloque y categoría abstracta.
        # El umbral 0.5 interpreta binarias, no asigna sala física ni incorpora horarios externos.
        for (r,d,b,s) in eachindex(nucleo.x)
            if value(nucleo.x[r,d,b,s]) > 0.5
                requisito = nucleo.requerimientos[r]
                push!(asignaciones, (; ofertaId=Int(requisito.oferta.id), tipoHoraId=Int(requisito.componente.tipoHoraId),
                    bloqueId=nucleo.bloque_id[(d,b)], categoriaId=String(entrada.recursos[s].id)))
            end
        end
        # Se declara cada faltante, incluso cero, en bloques académicos.
        # La cobertura con carga entera y binarias justifica el redondeo a entero.
        for r in eachindex(nucleo.requerimientos)
            requisito = nucleo.requerimientos[r]
            push!(faltantes, (; ofertaId=Int(requisito.oferta.id), tipoHoraId=Int(requisito.componente.tipoHoraId), horas=round(Int,value(nucleo.faltante[r]))))
        end
        # Se informa toda combinación, no solo las protegidas, falso no demuestra que exista tope.
        for p in eachindex(nucleo.combinaciones)
            combinacion = nucleo.combinaciones[p]
            push!(protecciones, (; parejaId=String(combinacion.pareja.id), ofertaAId=combinacion.a,
                ofertaBId=combinacion.b, protegida=value(nucleo.protege[p]) > 0.5))
        end
        objetivo = objective_value(modelo)
    end
    # La revisión vincula esta respuesta al JSON de entrada, no certifica que la base siga vigente.
    return (; version=1, revision=String(entrada.revision), estado, asignaciones, faltantes, protecciones, objetivo)
end
