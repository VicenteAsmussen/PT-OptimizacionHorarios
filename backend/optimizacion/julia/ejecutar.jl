println(stderr, "OPTIMIZACION:CARGA"); flush(stderr)
using JSON3
include("modelo.jl")
include("salida.jl")
include("diagnostico.jl")

# Transporte acotado, sin archivos de entrada/salida ni acceso a base de datos.
# stdin contiene el JSON normalizado por el backend, con un máximo de 8 MiB.
try
    contenido = read(stdin, 8 * 1024 * 1024 + 1)
    length(contenido) <= 8 * 1024 * 1024 || error("Entrada demasiado grande")
    entrada = JSON3.read(String(contenido))
    entrada.version == 1 && entrada.versionModelo == "notebook-v2-1" || error("Versión inválida")
    # Presupuesto máximo en segundos, no espera mínima ni parada al primer candidato factible.
    0 < entrada.parametros.limiteSolverSegundos <= 1800 || error("Límite inválido")
    println(stderr, "OPTIMIZACION:CONSTRUCCION"); flush(stderr)
    nucleo = construir_modelo(entrada)
    configurar_diagnostico(nucleo.modelo)
    optimizar_con_diagnostico!(nucleo.modelo; registroInterno=true)
    # stdout se reserva para la salida estructurada, stderr comunica hitos seguros al backend.
    # Extraer valores no sustituye la validación de restricciones y completitud en TypeScript.
    contenido_salida = JSON3.write(extraer_salida(entrada, nucleo))
    sizeof(contenido_salida) <= 8 * 1024 * 1024 || error("Salida demasiado grande")
    print(stdout, contenido_salida); flush(stdout)
catch
    # No divulgar trazas, rutas ni contenido de la entrada por el canal de control.
    println(stderr, "Error al ejecutar el modelo de optimización.")
    exit(1)
end
