using Test
include("diagnostico.jl")

# Dos problemas sintéticos pequeños, sin entradas académicas ni acceso a la base de datos.
function modelo_sintetico()
    modelo = Model(HiGHS.Optimizer)
    set_silent(modelo)
    set_time_limit_sec(modelo, 3.0)
    set_optimizer_attribute(modelo, "threads", 1)
    # Solo la prueba desactiva presolve para observar también el callback MIP.
    set_optimizer_attribute(modelo, "presolve", "off")
    @variable(modelo, seleccion[1:4], Bin)
    @constraint(modelo, sum(seleccion) <= 2)
    @objective(modelo, Max, sum([1, 2, 3, 6] .* seleccion))
    return modelo
end

@testset "Transferencia explícita y resolución conservan el resultado" begin
    referencia = modelo_sintetico()
    optimize!(referencia)
    @test termination_status(referencia) == JuMP.MOI.OPTIMAL
    @test objective_value(referencia) == 9.0

    observado = modelo_sintetico()
    canal = IOBuffer()
    @test configurar_diagnostico(observado, canal)
    @test optimizar_con_diagnostico!(observado, canal; registroInterno=true) === nothing
    @test termination_status(observado) == termination_status(referencia)
    @test primal_status(observado) == primal_status(referencia)
    @test objective_value(observado) == objective_value(referencia)
    @test value.(observado[:seleccion]) == value.(referencia[:seleccion])
    @test num_variables(observado) == num_variables(referencia)
    @test num_constraints(observado; count_variable_in_set_constraints=true) ==
        num_constraints(referencia; count_variable_in_set_constraints=true)
    @test time_limit_sec(observado) == time_limit_sec(referencia) == 3.0
    @test get_optimizer_attribute(observado, "threads") == get_optimizer_attribute(referencia, "threads") == 1
    @test JuMP.backend(observado).state == JuMP.MOI.Utilities.ATTACHED_OPTIMIZER

    lineas = split(chomp(String(take!(canal))), '\n')
    hitos = filter(linea -> linea in ["OPTIMIZACION:SOLVER", "OPTIMIZACION:TRANSFERENCIA",
        "OPTIMIZACION:RESOLUCION", "OPTIMIZACION:EXTRACCION"], lineas)
    @test hitos == ["OPTIMIZACION:SOLVER", "OPTIMIZACION:TRANSFERENCIA",
        "OPTIMIZACION:RESOLUCION", "OPTIMIZACION:EXTRACCION"]
    @test JuMP.unsafe_backend(observado).callback_data !== nothing
    configuracion = filter(linea -> startswith(linea, "OPTIMIZACION:HIGHS_CONFIGURACION "), lineas)
    @test length(configuracion) == 1
    limite = JSON3.read(configuracion[1][length("OPTIMIZACION:HIGHS_CONFIGURACION ")+1:end])
    @test Set(keys(limite)) == Set([:limiteSolverSegundos])
    @test limite.limiteSolverSegundos == 3.0
    @test "OPTIMIZACION:HIGHS_INICIO" in lineas
    @test "OPTIMIZACION:HIGHS_BUSQUEDA" in lineas
    @test "OPTIMIZACION:HIGHS_INFORME" in lineas
    @test any(linea -> startswith(linea, "OPTIMIZACION:PROGRESO "), lineas)
    permitidos = Set(["OPTIMIZACION:HIGHS_INICIO", "OPTIMIZACION:HIGHS_PREPROCESAMIENTO",
        "OPTIMIZACION:HIGHS_FIN_PREPROCESAMIENTO", "OPTIMIZACION:HIGHS_PREPROCESAMIENTO_DESACTIVADO",
        "OPTIMIZACION:HIGHS_BUSQUEDA", "OPTIMIZACION:HIGHS_INFORME", "OPTIMIZACION:HIGHS_LIMITE_TIEMPO"])
    @test all(linea -> linea in hitos || linea in permitidos || linea in configuracion ||
        startswith(linea, "OPTIMIZACION:PROGRESO "), lineas)
    @test get_optimizer_attribute(observado, "presolve") == get_optimizer_attribute(referencia, "presolve") == "off"
end
