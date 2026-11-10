# Utilidades del backend

Este directorio reúne utilidades transversales y funciones de apoyo específicas del dominio. Incluye clases de error, normalización, cálculos y transformaciones de datos, además del grupo especializado de Excel.

## Dónde encontrar cada tema

| Qué buscar | Archivos o directorio |
| --- | --- |
| Errores tipados | [errors.ts](errors.ts). |
| Tokens y contraseñas | [jwt.ts](jwt.ts) y [password.ts](password.ts). |
| Normalización y validación de RUT | [rut.ts](rut.ts). |
| Alcance y compatibilidad académica | [alcance-carrera.ts](alcance-carrera.ts), [compatibilidad-academica.ts](compatibilidad-academica.ts) y [compatibilidad-salas.ts](compatibilidad-salas.ts). |
| Bloques reservados y cobertura externa | [bloques-reservados.ts](bloques-reservados.ts) y [cobertura-externos.ts](cobertura-externos.ts). |
| Apoyo a ejecuciones y resultados de planificación | [optimizacion-ejecuciones.ts](optimizacion-ejecuciones.ts) y [resultados-horarios.ts](resultados-horarios.ts). |
| Procesamiento de archivos Excel | [excel/](excel/). |
| Apagado controlado | [apagado.ts](apagado.ts). |

Las filas son una orientación de lectura, no subcarpetas adicionales.

## Grupo de Excel

- [excel-comun.ts](excel/excel-comun.ts) contiene normalizaciones compartidas.
- [excel-salas.ts](excel/excel-salas.ts) contiene el formato de salas y funciones de texto, días, horarios y sesiones.
- [excel-horarios-externos.ts](excel/excel-horarios-externos.ts) contiene el importador de horarios externos.

## Relación con las demás carpetas

La ubicación bajo `utils` no garantiza que una función sea pura o independiente del dominio. Por ejemplo, el importador de horarios externos depende del [repositorio de horarios](../repositories/horarios.repository.ts).

Para seguir una operación completa, también corresponde revisar [services/](../services/) y [repositories/](../repositories/). La integración del proceso de optimización y su contrato se encuentran en [optimizacion/](../optimizacion/).
