using Test, JuMP, HiGHS
include("modelo.jl")
include("salida.jl")

const dias_prueba = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
const bloques_prueba = [(id=(d-1)*16+b, dia=dia, numeroBloque=b) for (d,dia) in enumerate(dias_prueba) for b in 1:16]
recurso_prueba(; tipo="Sala", cantidad=3) = (id="recurso", edificio="Aislado", tipo, capacidad=60, cantidad, fuente="Entrada sintética")
oferta_prueba(id; codigo="A", seccion=1, horas=2, tipo="T") = (id, asignaturaCodigo=codigo, seccion, cupos=30, semestreMalla=1, esCritica=false, requiereSala=true,
    componentes=[(tipoHoraId=1, tipo, horas, profesorId=id)])
function entrada_prueba(ofertas; disponibles=[(profesorId=o.id,bloqueId=b) for o in ofertas for b in [1,2]],
    recursos=[recurso_prueba()], parejas=[], externos=[], reservas=[])
    return (version=1, versionModelo="notebook-v2-1", revision=repeat("a",64), parametros=(limiteSolverSegundos=300,),
        ofertas, bloques=bloques_prueba, disponibilidades=disponibles, recursos, parejas, externos, reservas)
end
function resolver_prueba(entrada)
    nucleo = construir_modelo(entrada)
    @test time_limit_sec(nucleo.modelo) == 300
    optimize!(nucleo.modelo)
    return extraer_salida(entrada,nucleo)
end

@testset "Carga y recursos sin datos de desarrollo" begin
    entrada = entrada_prueba([oferta_prueba(1)])
    salida = resolver_prueba(entrada)
    @test salida.estado == "optimo"
    @test length(salida.asignaciones) == 2
    @test all(f.horas == 0 for f in salida.faltantes)
    @test salida.objetivo == 0
    sin_recursos = resolver_prueba(entrada_prueba([oferta_prueba(1)]; recursos=[recurso_prueba(cantidad=0)]))
    @test isempty(sin_recursos.asignaciones)
    @test sum(f.horas for f in sin_recursos.faltantes) == 2
    @test sin_recursos.objetivo == 2000
    laboratorio = resolver_prueba(entrada_prueba([oferta_prueba(1,tipo="L")]; recursos=[recurso_prueba(tipo="Laboratorio",cantidad=1)]))
    @test length(laboratorio.asignaciones) == 2
    externa = (ofertaId=99,asignaturaCodigo="EXT",seccion=1,semestreMalla=3,tipoHoraId=1,bloqueId=1)
    con_externo = resolver_prueba(entrada_prueba([oferta_prueba(1)]; recursos=[recurso_prueba(cantidad=1)],externos=[externa]))
    @test length(con_externo.asignaciones) == 2
end

@testset "Pares completos sin selección global" begin
    ofertas = [oferta_prueba(id,codigo=string(Char(65+(id-1)÷2)),seccion=isodd(id) ? 1 : 2) for id in 1:6]
    disponibles = [(profesorId=o.id,bloqueId=b) for o in ofertas for b in (isodd(o.id) ? [1,2] : [17,18])]
    parejas = [(id="AB",asignaturaA="A",asignaturaB="B",status=1,seccionesA=[1,2],seccionesB=[3,4]),
        (id="AC",asignaturaA="A",asignaturaB="C",status=1,seccionesA=[1,2],seccionesB=[5,6]),
        (id="BC",asignaturaA="B",asignaturaB="C",status=1,seccionesA=[3,4],seccionesB=[5,6])]
    salida = resolver_prueba(entrada_prueba(ofertas;disponibles,parejas))
    @test length(salida.asignaciones) == 12
    @test all(f.horas == 0 for f in salida.faltantes)
    for pareja in parejas
        @test count(p->p.parejaId==pareja.id && p.protegida,salida.protecciones) >= 2
    end
    # Tres asignaturas con solo dos patrones horarios, ninguna selección global sin topes.
    @test all(length(unique([a,b,c])) < 3 for a in 1:2 for b in 1:2 for c in 1:2)
end

@testset "Críticas y continuidad con pesos originales" begin
    ofertas = [oferta_prueba(1,codigo="A"),oferta_prueba(2,codigo="B")]
    pareja = (id="critica",asignaturaA="A",asignaturaB="B",status=0.5,seccionesA=[1],seccionesB=[2])
    salida = resolver_prueba(entrada_prueba(ofertas; parejas=[pareja]))
    @test all(f.horas == 0 for f in salida.faltantes)
    @test salida.objetivo == 0.5
    @test !only(salida.protecciones).protegida
    continua = resolver_prueba(entrada_prueba([oferta_prueba(1,horas=6)]; disponibles=[(profesorId=1,bloqueId=b) for b in 1:6]))
    # B1–B3 y B5–B6 son cinco bloques válidos, no un máximo de cuatro al día.
    @test sum(f.horas for f in continua.faltantes) == 1
    ocupados = Set(a.bloqueId for a in continua.asignaciones)
    @test length(ocupados) == 5
    @test all(count(b->b in ocupados,inicio:inicio+4) <= 4 for inicio in 1:12)
    separada = resolver_prueba(entrada_prueba([oferta_prueba(1,horas=6)]; disponibles=[(profesorId=1,bloqueId=b) for b in [1,2,3,4,9,10]]))
    @test all(f.horas == 0 for f in separada.faltantes)
end
