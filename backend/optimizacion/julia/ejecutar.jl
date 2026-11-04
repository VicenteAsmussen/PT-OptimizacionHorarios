using JSON3
include("modelo.jl")
include("salida.jl")

# Transporte acotado, sin archivos de entrada/salida ni acceso a base de datos.
try
    contenido = read(stdin, 8 * 1024 * 1024 + 1)
    length(contenido) <= 8 * 1024 * 1024 || error("Entrada demasiado grande")
    entrada = JSON3.read(String(contenido))
    entrada.version == 1 && entrada.versionModelo == "notebook-v2-1" || error("Versión inválida")
    0 < entrada.parametros.limiteSolverSegundos <= 300 || error("Límite inválido")
    nucleo = construir_modelo(entrada)
    println(stderr, "OPTIMIZACION:SOLVER"); flush(stderr)
    optimize!(nucleo.modelo)
    println(stderr, "OPTIMIZACION:EXTRACCION"); flush(stderr)
    contenido_salida = JSON3.write(extraer_salida(entrada, nucleo))
    sizeof(contenido_salida) <= 8 * 1024 * 1024 || error("Salida demasiado grande")
    print(stdout, contenido_salida); flush(stdout)
catch
    # No divulgar trazas, rutas ni contenido de la entrada por el canal de control.
    println(stderr, "Error al ejecutar el modelo de optimización.")
    exit(1)
end
