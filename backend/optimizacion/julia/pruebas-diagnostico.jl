using Test
include("diagnostico.jl")

@testset "Diagnóstico sin ejecutar el optimizador" begin
    reloj = Ref(UInt64(0))
    canal = IOBuffer()
    observar = crear_observador_progreso(canal; reloj=() -> reloj[])
    datos = (running_time=1.0, mip_node_count=Int64(2), mip_primal_bound=100.0,
        mip_dual_bound=80.0, mip_gap=0.2)
    tipo = Cint(HiGHS.kHighsCallbackMipInterrupt)
    @test observar(tipo, Ptr{Cchar}(0), datos) == 0
    @test observar(tipo, Ptr{Cchar}(0), datos) == 0
    for i in 1:65
        reloj[] = UInt64(i) * UInt64(5_000_000_000)
        @test observar(tipo, Ptr{Cchar}(0), datos) == 0
    end
    texto = String(take!(canal))
    lineas = split(chomp(texto), '\n')
    @test length(lineas) == 60
    @test sizeof(texto) < 32 * 1024
    prefijo = "OPTIMIZACION:PROGRESO "
    muestra = JSON3.read(lineas[1][length(prefijo)+1:end])
    @test Set(keys(muestra)) == Set([:tiempoSolverSegundos, :nodos, :objetivoCandidato, :cotaDual, :brechaRelativa])
    @test muestra.objetivoCandidato == 100
    @test muestra.brechaRelativa == 0.2

    canal = IOBuffer()
    observar = crear_observador_progreso(canal)
    @test observar(tipo, Ptr{Cchar}(0), merge(datos, (mip_primal_bound=Inf, mip_dual_bound=-Inf, mip_gap=Inf))) == 0
    muestra = JSON3.read(chomp(String(take!(canal)))[length(prefijo)+1:end])
    @test muestra.objetivoCandidato === nothing
    @test muestra.cotaDual === nothing
    @test muestra.brechaRelativa === nothing

    canal = IOBuffer()
    observar = crear_observador_progreso(canal)
    @test observar(tipo, Ptr{Cchar}(0), merge(datos, (running_time=NaN,))) == 0
    @test isempty(take!(canal))
    close(canal)
    @test observar(tipo, Ptr{Cchar}(0), datos) == 0

    # Solo adjuntar el callback al backend vacío, nunca llamar optimize!.
    modelo = Model(HiGHS.Optimizer)
    canal = IOBuffer()
    @test configurar_diagnostico(modelo, canal)
    JuMP.MOI.Utilities.attach_optimizer(JuMP.backend(modelo))
    @test JuMP.unsafe_backend(modelo).callback_data !== nothing
    @test isempty(take!(canal))
end

# Dobles limitados a este tipo de prueba, sin reemplazar métodos del optimizador real.
mutable struct ModeloRegistroSimulado
    salida::Bool
    consola::Bool
    registros::Int
    fallar_restauracion::Bool
    pasos::Vector{Symbol}
end
# Expone solo el doble de registro, sin sustituir el backend de los modelos reales.
JuMP.unsafe_backend(modelo::ModeloRegistroSimulado) = modelo
# Fija un límite sintético para probar la configuración del registro sin resolver un modelo.
JuMP.time_limit_sec(::ModeloRegistroSimulado) = 3.0
# Lee los atributos del doble para comprobar que se conserva la configuración.
function JuMP.MOI.get(modelo::ModeloRegistroSimulado, atributo::JuMP.MOI.RawOptimizerAttribute)
    atributo.name == "output_flag" && return modelo.salida
    atributo.name == "log_to_console" && return modelo.consola
    atributo.name == "time_limit" && return 3.0
    error("Atributo inesperado en el doble")
end
# Registra cambios de silencio y consola, con un fallo opcional para probar una restauración insegura.
function JuMP.MOI.set(modelo::ModeloRegistroSimulado, atributo::JuMP.MOI.RawOptimizerAttribute, valor)
    push!(modelo.pasos, atributo.name == "output_flag" ? :silencio : :consola)
    if atributo.name == "output_flag"
        modelo.fallar_restauracion && error("Fallo simulado al recuperar silencio")
        modelo.salida = valor
    elseif atributo.name == "log_to_console"
        modelo.consola = valor
    end
    return nothing
end
# Provoca el primer fallo de registro y permite observar si la recuperación sigue la secuencia esperada.
function JuMP.MOI.set(modelo::ModeloRegistroSimulado, ::HiGHS.CallbackFunction, observar)
    push!(modelo.pasos, :registro)
    modelo.registros += 1
    modelo.registros == 1 && error("Fallo simulado al registrar logging")
    return nothing
end

@testset "Restauración segura ante un fallo de registro" begin
    modelo = ModeloRegistroSimulado(false, true, 0, false, Symbol[])
    canal = IOBuffer()
    @test !configurar_registro_interno(modelo, canal)
    @test !modelo.salida && modelo.consola
    @test modelo.pasos == [:registro, :silencio, :registro, :consola, :silencio]
    @test String(take!(canal)) == "OPTIMIZACION:HIGHS_NO_DISPONIBLE\n"

    inseguro = ModeloRegistroSimulado(false, true, 0, true, Symbol[])
    @test_throws ErrorException configurar_registro_interno(inseguro, IOBuffer())
    @test inseguro.pasos == [:registro, :silencio]
end

@testset "Registro nativo cerrado, acotado y sin texto libre" begin
    canal = IOBuffer()
    observar = crear_observador_registro(canal)
    mensajes = ["dato privado desconocido", "Presolving model con dato privado",
        "Presolve: reducido", "Presolve is switched off", "Solving MIP model with datos privados",
        "Solving report", "Status            Time limit reached"]
    for _ in 1:2, mensaje in mensajes
        @test observar(mensaje) == Cint(0)
    end
    texto = String(take!(canal))
    @test split(chomp(texto), '\n') == ["OPTIMIZACION:HIGHS_INICIO", "OPTIMIZACION:HIGHS_PREPROCESAMIENTO",
        "OPTIMIZACION:HIGHS_FIN_PREPROCESAMIENTO", "OPTIMIZACION:HIGHS_PREPROCESAMIENTO_DESACTIVADO",
        "OPTIMIZACION:HIGHS_BUSQUEDA", "OPTIMIZACION:HIGHS_INFORME", "OPTIMIZACION:HIGHS_LIMITE_TIEMPO"]
    @test !occursin("privado", texto)
    @test sizeof(texto) < 512
    @test observar("x"^4097) == Cint(0)
    @test isempty(take!(canal))
    close(canal)
    @test crear_observador_registro(canal)("Presolving model") == Cint(0)

    # Un fallo al emitir la configuración restaura silencio y progreso antes de resolver.
    modelo = Model(HiGHS.Optimizer)
    set_silent(modelo)
    set_time_limit_sec(modelo, 3.0)
    @test configurar_diagnostico(modelo, IOBuffer())
    JuMP.MOI.Utilities.attach_optimizer(JuMP.backend(modelo))
    @test !configurar_registro_interno(modelo, canal)
    @test get_optimizer_attribute(modelo, "output_flag") == false
    @test get_optimizer_attribute(modelo, "log_to_console") == true
    @test time_limit_sec(modelo) == 3.0
    @test JuMP.unsafe_backend(modelo).callback_data !== nothing
end

@testset "Cadencia según límite configurado, con máximo de 60 muestras" begin
    # El reloj simulado recorre intervalos y límites históricos sin esperar tiempo real ni ejecutar optimize!.
    for (limite, intervalo) in [(1800.0, 30.0), (900.0, 15.0), (600.0, 10.0), (300.0, 5.0), (nothing, 5.0)]
        modelo = Model(HiGHS.Optimizer)
        if limite !== nothing
            JuMP.set_time_limit_sec(modelo, limite)
        end
        @test JuMP.time_limit_sec(modelo) === limite
        reloj = Ref(UInt64(0))
        canal = IOBuffer()
        observar = crear_observador_progreso(canal; reloj=() -> reloj[],
            limiteSegundos=JuMP.time_limit_sec(modelo))
        tipo = Cint(HiGHS.kHighsCallbackMipInterrupt)
        for i in 0:130
            segundos = i * intervalo / 2
            reloj[] = UInt64(round(segundos * 1e9))
            datos = (running_time=segundos, mip_node_count=Int64(i),
                mip_primal_bound=100.0, mip_dual_bound=80.0, mip_gap=0.2)
            @test observar(tipo, Ptr{Cchar}(0), datos) == Cint(0)
        end
        texto = String(take!(canal))
        lineas = split(chomp(texto), '\n')
        prefijo = "OPTIMIZACION:PROGRESO "
        muestras = [JSON3.read(linea[length(prefijo)+1:end]) for linea in lineas]
        @test length(muestras) == 60
        @test [m.tiempoSolverSegundos for m in muestras] == collect(0:intervalo:59 * intervalo)
        @test sizeof(texto) < 32 * 1024
        @test configurar_diagnostico(modelo, canal)
        JuMP.MOI.Utilities.attach_optimizer(JuMP.backend(modelo))
        @test JuMP.unsafe_backend(modelo).callback_data !== nothing
        @test isempty(take!(canal))
        @test JuMP.time_limit_sec(modelo) === limite
    end
end
