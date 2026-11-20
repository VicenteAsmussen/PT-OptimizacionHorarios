using JSON3, JuMP, HiGHS

"""Separar el cache y optimize!, con registro interno opcional y sin ampliar plazos."""
# Ejecuta el modelo separando transferencia, resolución y extracción en hitos observables.
function optimizar_con_diagnostico!(modelo, canal::IO=stderr; registroInterno=false)
    println(canal, "OPTIMIZACION:SOLVER"); flush(canal)
    println(canal, "OPTIMIZACION:TRANSFERENCIA"); flush(canal)
    # Sincroniza el modelo almacenado por JuMP con HiGHS antes de medir la llamada de resolución.
    JuMP.MOI.Utilities.attach_optimizer(JuMP.backend(modelo))
    if registroInterno
        configurar_registro_interno(modelo, canal)
    end
    println(canal, "OPTIMIZACION:RESOLUCION"); flush(canal)
    # Incluye compilación, preparación y recuperación interna del adaptador, no es tiempo nativo puro.
    optimize!(modelo)
    println(canal, "OPTIMIZACION:EXTRACCION"); flush(canal)
    return nothing
end

"""Clasificar mensajes nativos en hitos cerrados, sin conservar su texto ni sus valores."""
# Convierte el registro nativo en hitos técnicos sin divulgar la entrada académica.
function crear_observador_registro(canal::IO=stderr)
    emitidos = Set{String}()
    # Comunica una sola vez cada etapa reconocida del proceso de resolución.
    function emitir(hito)
        if hito in emitidos
            return
        end
        push!(emitidos, hito)
        println(canal, "OPTIMIZACION:HIGHS_", hito)
        flush(canal)
    end
    # Reconoce etapas del optimizador sin reenviar los mensajes nativos recibidos.
    function observar(mensaje::AbstractString)::Cint
        try
            sizeof(mensaje) <= 4096 || return Cint(0)
            emitir("INICIO")
            texto = strip(mensaje)
            if startswith(texto, "Presolving model")
                emitir("PREPROCESAMIENTO")
            elseif startswith(texto, "Presolve:") || startswith(texto, "Presolve reductions:")
                emitir("FIN_PREPROCESAMIENTO")
            elseif startswith(texto, "Presolve is switched off")
                emitir("PREPROCESAMIENTO_DESACTIVADO")
            elseif startswith(texto, "Solving MIP model with")
                emitir("BUSQUEDA")
            elseif startswith(texto, "Solving report")
                emitir("INFORME")
            elseif occursin(r"^(?:Status\s+)?Time limit reached\s*$", texto)
                emitir("LIMITE_TIEMPO")
            end
        catch
            # Ninguna excepción ni texto nativo cruza el callback.
        end
        return Cint(0)
    end
    return observar
end

"""Registrar logging y progreso juntos, después de la transferencia al optimizador nativo."""
# Instala observación filtrada conservando el límite efectivo y la seguridad de los canales.
function configurar_registro_interno(modelo, canal::IO=stderr)
    optimizador = nothing
    salida_anterior = nothing
    consola_anterior = nothing
    cambiado = false
    try
        optimizador = JuMP.unsafe_backend(modelo)
        atributo = JuMP.MOI.RawOptimizerAttribute
        salida_anterior = JuMP.MOI.get(optimizador, atributo("output_flag"))
        consola_anterior = JuMP.MOI.get(optimizador, atributo("log_to_console"))
        # Segundos del límite ya transferido a HiGHS, no una ampliación del presupuesto.
        limite = JuMP.MOI.get(optimizador, atributo("time_limit"))
        limite isa Real && isfinite(limite) && 0 < limite <= 1e30 || error("Límite nativo no disponible")
        progreso = crear_observador_progreso(canal; limiteSegundos=limite)
        registro = crear_observador_registro(canal)
        # Comparte un receptor para hitos y muestras sin solicitar interrupciones al optimizador.
        function observar(tipo::Cint, mensaje::Ptr{Cchar}, datos)::Cint
            try
                if tipo == Cint(HiGHS.kHighsCallbackLogging) && mensaje != C_NULL
                    registro(unsafe_string(mensaje))
                elseif tipo == Cint(HiGHS.kHighsCallbackMipInterrupt)
                    progreso(tipo, mensaje, datos)
                end
            catch
                # El callback sustituye la salida nativa, nunca imprime el mensaje recibido.
            end
            return Cint(0)
        end
        cambiado = true
        JuMP.MOI.set(optimizador, HiGHS.CallbackFunction(Cint[
            HiGHS.kHighsCallbackLogging, HiGHS.kHighsCallbackMipInterrupt]), observar)
        # En HiGHS 1.7.2, consola=false también impide recibir registros por callback.
        # El receptor instalado sustituye la escritura a consola y filtra el texto en RAM.
        JuMP.MOI.set(optimizador, atributo("log_to_console"), true)
        JuMP.MOI.set(optimizador, atributo("output_flag"), true)
        println(canal, "OPTIMIZACION:HIGHS_CONFIGURACION ", JSON3.write((limiteSolverSegundos=limite,)))
        flush(canal)
        return true
    catch
        if cambiado
            try
                # Recuperar el silencio antes de reemplazar el callback evita salida nativa en stdout.
                JuMP.MOI.set(optimizador, JuMP.MOI.RawOptimizerAttribute("output_flag"), false)
                JuMP.MOI.set(optimizador, HiGHS.CallbackFunction(Cint[HiGHS.kHighsCallbackMipInterrupt]),
                    crear_observador_progreso(canal; limiteSegundos=JuMP.time_limit_sec(modelo)))
                JuMP.MOI.set(optimizador, JuMP.MOI.RawOptimizerAttribute("log_to_console"), consola_anterior)
                JuMP.MOI.set(optimizador, JuMP.MOI.RawOptimizerAttribute("output_flag"), salida_anterior)
            catch
                # No resolver si no se puede garantizar la restauración del canal de salida.
                error("No se pudo restablecer el canal seguro del optimizador")
            end
        end
        try
            println(canal, "OPTIMIZACION:HIGHS_NO_DISPONIBLE")
            flush(canal)
        catch
        end
        return false
    end
end

"""Observación numérica acotada, sin logs nativos ni cambios en la decisión del solver."""
# Muestrea el avance matemático sin confundir candidatos internos con propuestas completas.
function crear_observador_progreso(canal::IO=stderr; reloj=time_ns, limiteSegundos=nothing)
    # Cadencia mínima en segundos, convertida a nanosegundos para el reloj monotónico.
    # Con 1800 segundos son 30 entre muestras, con tope de 60 y sin renovar los plazos de vigilancia.
    intervalo_segundos = limiteSegundos === nothing ? 5.0 : max(5.0, limiteSegundos / 60)
    intervalo_ns = UInt64(ceil(intervalo_segundos * 1e9))
    ultima_muestra = Ref(UInt64(0))
    emitidas = Ref(0)
    # Representa como ausencia los indicadores del optimizador fuera del rango numérico admitido.
    numero_seguro(valor) = isfinite(valor) && abs(valor) <= 1e30 ? valor : nothing
    # Comunica tiempo, nodos y cotas sin decidir la aceptación académica del horario.
    function observar(::Cint, ::Ptr{Cchar}, datos)::Cint
        # Ninguna excepción ni solicitud de interrupción cruza el callback C.
        try
            ahora = reloj()
            if emitidas[] >= 60 || (emitidas[] > 0 && ahora - ultima_muestra[] < intervalo_ns)
                return Cint(0)
            end
            tiempo = numero_seguro(datos.running_time)
            nodos = datos.mip_node_count
            if tiempo === nothing || tiempo < 0 || nodos < 0 || nodos > 9_007_199_254_740_991
                return Cint(0)
            end
            brecha = numero_seguro(datos.mip_gap)
            # Tiempo interno en segundos y nodos como conteo, objetivo y cota usan unidades del costo.
            # La brecha relativa es adimensional, no porcentaje de horario completo ni tiempo restante.
            muestra = (tiempoSolverSegundos=tiempo, nodos=nodos,
                objetivoCandidato=numero_seguro(datos.mip_primal_bound),
                cotaDual=numero_seguro(datos.mip_dual_bound),
                brechaRelativa=brecha !== nothing && brecha >= 0 ? brecha : nothing)
            # Contar antes de escribir evita reintentos de salida ante un canal cerrado.
            emitidas[] += 1
            ultima_muestra[] = ahora
            println(canal, "OPTIMIZACION:PROGRESO ", JSON3.write(muestra))
            flush(canal)
        catch
            # Diagnóstico opcional: jamás alterar la optimización por un fallo de observación.
        end
        return Cint(0)
    end
    return observar
end

# Habilita progreso opcional sin cambiar restricciones, presupuesto ni criterios de término.
function configurar_diagnostico(modelo, canal::IO=stderr)
    try
        # HiGHS.jl 1.10.0 conserva el callback y su userdata. Siempre devuelve cero.
        JuMP.MOI.set(modelo, HiGHS.CallbackFunction(Cint[HiGHS.kHighsCallbackMipInterrupt]),
            crear_observador_progreso(canal; limiteSegundos=JuMP.time_limit_sec(modelo)))
        return true
    catch
        println(canal, "OPTIMIZACION:PROGRESO_NO_DISPONIBLE")
        flush(canal)
        return false
    end
end
