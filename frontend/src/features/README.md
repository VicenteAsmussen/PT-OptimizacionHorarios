# Funcionalidades del frontend

Este directorio agrupa el código por funcionalidad del sistema. Cada funcionalidad reúne sus páginas y, cuando corresponde, sus componentes propios, acceso a datos, modelos, estilos y pruebas.

## Cómo orientarse

- Las rutas y sus controles de acceso se encuentran en [app/router.tsx](../app/router.tsx).
- Las pantallas y su lógica cercana están en la funcionalidad correspondiente.
- La interfaz compartida está en [components/](../components/), los hooks reutilizables en [hooks/](../hooks/) y el cliente HTTP común en [lib/api.ts](../lib/api.ts).
- Los estilos globales están en [styles/](../styles/) y los recursos estáticos en [assets/](../assets/).

No todas las funcionalidades necesitan la misma estructura interna. La ubicación de sus archivos depende del contenido que realmente tienen.

## Carpetas con implementación

| Carpeta | Contenido principal |
| --- | --- |
| [administracion-periodos/](administracion-periodos/) | Administración de períodos académicos. |
| [asignaturas/](asignaturas/) | Asignaturas y secciones. |
| [auth/](auth/) | Autenticación y página de inicio de sesión. |
| [dashboard/](dashboard/) | Panel de entrada y contexto académico. |
| [disponibilidad/](disponibilidad/) | Registro y consulta de disponibilidad. |
| [horarios-externos/](horarios-externos/) | Flujo de carga y consulta de horarios externos. |
| [mi-horario/](mi-horario/) | Consulta del horario del profesor. |
| [optimizacion/](optimizacion/) | Ejecución y seguimiento del optimizador. |
| [profesores/](profesores/) | Gestión de profesores y su información asociada. |
| [resultados-horarios/](resultados-horarios/) | Consulta y gestión de resultados de planificación. |
| [seguimiento-disponibilidad/](seguimiento-disponibilidad/) | Seguimiento de la disponibilidad docente. |

Las pruebas de cada funcionalidad permanecen junto al código que verifican.

## Carpetas reservadas con descripción

Las siguientes carpetas contienen únicamente un archivo descriptivo, no una implementación propia. Sus descripciones se conservan en las mismas ubicaciones:

- [carreras](carreras/descripcion_carreras.txt).
- [departamentos](departamentos/descripcion_departamentos.txt).
- [horarios](horarios/descripcion_horarios.txt).
- [ofertas](ofertas/descripcion_ofertas.txt).
- [salas](salas/descripcion_salas.txt).
- [semestres](semestres/descripcion_semestres.txt).

Estos conceptos pueden utilizarse en otras funcionalidades aunque aquí no tengan código propio. Las descripciones no deben interpretarse como una lista de trabajo pendiente. Conservar o retirar estas carpetas es una decisión separada de esta guía.
