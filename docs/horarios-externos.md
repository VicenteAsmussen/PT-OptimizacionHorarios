# Importar horarios de otros departamentos

**Horarios departamentos externos** es exclusivo de secretaría: el administrador no ve el enlace ni puede acceder por URL directa o por la API. El período actual se completa automáticamente y no se puede cambiar. Elige un departamento para ver sus asignaturas de la malla, nivel y secciones con horarios guardados. Si no hay una planificación actual o no se puede determinar una sola carrera, la página lo informa sin elegir por su cuenta. Los períodos anteriores se consultan en **Asignaturas**.

Sin un departamento seleccionado, aparece el resumen de cobertura de todos los departamentos externos, incluidos los que no tienen carga. Cuenta asignaturas con horarios respecto del total de la malla, no secciones. El resumen se actualiza al recargar o volver después de importar. Si falla la consulta, muestra un error y permite reintentar, no presenta un cero como resultado.

## Cobertura requerida

| Estado | Color | Consecuencia al importar |
| --- | --- | --- |
| Asignatura con horarios válidos | Verde | Cumple la cobertura |
| Obligatoria sin horarios | Rojo | Se rechaza todo el archivo |
| Opcional sin horarios | Amarillo | No impide importar |
| Asignatura con datos inválidos | Rojo | Se rechaza todo el archivo, aunque sea opcional |

En períodos `-1` son obligatorios los niveles impares, en `-2`, los pares. Se usa el período de la planificación, no la fecha del equipo. Basta una sección con una sesión válida para cubrir una asignatura, sin exigir más secciones u horas.

## Cargar el archivo

1. Adjunta un `.xlsx` de una sola hoja, de hasta 10 MB y con los encabezados del [README](../README.md).
2. Confirma el reemplazo de la carga del departamento para la carrera y período actuales.
3. Pulsa **Importar horarios** y revisa el resultado.

Solo se importa en una planificación actual en preparación. El archivo reemplaza la carga: actualiza secciones coincidentes, crea nuevas y elimina las ausentes, también las opcionales. Los horarios quedan sin sala. No cambia el catálogo ni los nombres de profesores, y se ignoran códigos fuera del alcance autorizado.

Si falta una asignatura obligatoria o hay datos inválidos en una fila pertinente, **no se guarda nada**. El resultado marca las filas válidas como **sin guardar** y detalla faltantes y errores por asignatura, fila, columna, valor y motivo. Corrige el archivo y vuelve a enviarlo. Usa **Consultar carga guardada** para revisar lo que ya existe sin importar de nuevo.

Si se pierde la respuesta, consulta la carga guardada antes de reintentar, el servidor pudo haber completado la importación. La pantalla vuelve a consultar los datos al abrirse o cambiar de contexto.

Si falla la consulta de cobertura, se bloquea la selección de archivo y aparece **Reintentar consulta**, con el estado HTTP cuando está disponible. Ante un 404, comprueba la dirección y versión del backend antes de reintentar.

## API y verificación

- `GET /api/horarios-asignaturas/excel/externos/cobertura?planificacionSemestreId=…&departamentoId=…`: cobertura persistida, exclusiva de secretaría dentro de su carrera autorizada. Otros roles reciben HTTP 403 antes de consultar datos.
- `POST /api/horarios-asignaturas/excel/externos/importar?planificacionSemestreId=…&departamentoId=…`: envío multipart con campo `archivo`, exclusivo de secretaría y su carrera. Otros roles reciben HTTP 403 antes de procesar el archivo. Devuelve HTTP 400 con `errores` y `data.cobertura` si falla la validación, o HTTP 201 con el resumen si se importa.

El administrador conserva los reinicios de datos externos en **Administración de períodos**. Esta restricción no modifica los permisos existentes del Excel de salas.

Las pruebas de persistencia y reversión se ejecutan mediante [la base PostgreSQL de pruebas](pruebas-excel-externos.md), nunca contra la base de desarrollo.
