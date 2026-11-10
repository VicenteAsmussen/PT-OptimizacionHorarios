# Funcionalidades del frontend

Este directorio agrupa el código por funcionalidad del sistema. Cada funcionalidad reúne sus páginas y, cuando corresponde, sus componentes propios, acceso a datos, modelos, estilos y pruebas.

## Cómo orientarse

- Las rutas y sus controles de acceso se encuentran en [app/router.tsx](../app/router.tsx).
- Las pantallas y su lógica cercana están en la funcionalidad correspondiente.
- La interfaz compartida está en [components/](../components/), los hooks reutilizables en [hooks/](../hooks/) y el cliente HTTP común en [lib/api.ts](../lib/api.ts).
- El orden de los períodos, la selección inicial y el estado de sus secciones se reúnen en [lib/periodos.ts](../lib/periodos.ts).
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

## Descripciones de la estructura inicial

La estructura inicial incluía seis carpetas que solo contenían una descripción y no tenían código propio. Se retiraron para que este directorio muestre las funcionalidades con implementación. Sus textos se conservan aquí:

| Concepto | Descripción original |
| --- | --- |
| `carreras` | Funcionalidad relacionada con carreras, alcance académico y configuración asociada. |
| `departamentos` | Funcionalidad relacionada con departamentos académicos y su relación con carreras. |
| `horarios` | Funcionalidad relacionada con generación, revisión, importación, exportación y publicación de horarios. |
| `ofertas` | Funcionalidad relacionada con ofertas de asignaturas, secciones, cupos y carga docente. |
| `salas` | Funcionalidad relacionada con salas, capacidades, tipos y gestión de espacios físicos. |
| `semestres` | Funcionalidad relacionada con semestres académicos, estados y configuración temporal del sistema. |

Estos conceptos pueden utilizarse en otras funcionalidades sin tener una carpeta propia. Las descripciones son referencias de la estructura inicial, no una lista de trabajo pendiente.

### Subcarpetas sin implementación

También se retiraron las subcarpetas `components/` de `auth/` y `dashboard/`, que solo contenían un archivo descriptivo. Sus textos se conservan aquí, sin modificar la implementación de ambas funcionalidades:

| Subcarpeta retirada | Descripción original |
| --- | --- |
| `auth/components/` | Componentes específicos del módulo de autenticación. |
| `dashboard/components/` | Componentes específicos usados dentro del dashboard. |

Esta referencia no exige recrear esas subcarpetas. Una funcionalidad puede incorporar componentes propios cuando su implementación lo necesite.
