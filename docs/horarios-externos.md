# Importar horarios de otros departamentos

En **Horarios departamentos externos**, el campo **Período actual** se completa automáticamente con la planificación actual disponible y permanece bloqueado: no se puede elegir ni cambiar el período. Seleccione únicamente un departamento externo. Si no existe una planificación actual o hay varias carreras actuales sin un contexto único, se informa y no se elige una carrera arbitrariamente. Los períodos anteriores se consultan en **Asignaturas**. La tabla muestra las asignaturas del catálogo que pertenecen a ese departamento y a la malla de la carrera, junto con su nivel semestral y las secciones que tienen horarios guardados.

Mientras no haya un departamento seleccionado, se muestra un resumen de todos los departamentos externos de la carrera en su período actual: asignaturas con horarios guardados respecto del total de asignaturas de su malla, incluidos los departamentos sin carga. Una asignatura se cuenta una sola vez, aunque tenga varias secciones. Al recargar la página o volver al resumen después de importar, se consulta nuevamente la carga persistida. Si falla la consulta, se informa el error y se ofrece reintentar; no se presenta como un recuento de cero.

## Cobertura requerida

| Estado | Color | Consecuencia al importar |
| --- | --- | --- |
| Asignatura con horarios válidos | Verde | Cumple la cobertura |
| Obligatoria sin horarios | Rojo | Se rechaza todo el archivo |
| Opcional sin horarios | Amarillo | No impide importar |
| Asignatura con datos inválidos | Rojo | Se rechaza todo el archivo, aunque sea opcional |

En un período terminado en `-1`, son obligatorias las asignaturas de niveles impares. En uno terminado en `-2`, son obligatorias las de niveles pares. La regla usa el período actual de la planificación, no la fecha del equipo. Una asignatura cumple la cobertura cuando tiene al menos una sección con una sesión válida; no se exige una cantidad nueva de secciones ni de horas.

## Cargar el archivo

1. Adjunte un `.xlsx` de hasta 10 MB con una sola hoja y el formato común del departamento. Los encabezados se describen en [el README](../README.md).
2. Confirme el reemplazo de la carga del departamento en el período actual de la carrera.
3. Seleccione **Importar horarios** y revise el resultado.

Solo se puede importar en una planificación actual en preparación. El archivo actualiza las secciones coincidentes, crea las nuevas y elimina las ausentes, incluidas las de asignaturas opcionales. Los horarios importados quedan sin sala asignada. No se modifica el catálogo de asignaturas ni los nombres de profesores. Los códigos ajenos al alcance autorizado se ignoran.

Si falta una asignatura obligatoria o cualquier fila pertinente tiene un dato inválido, **no se guarda ninguna fila**. El resultado del archivo identifica las filas válidas como **sin guardar**, muestra los faltantes y detalla asignatura, fila, columna, valor y motivo del error. Corrija el Excel y vuelva a enviarlo. **Consultar carga guardada** permite volver a los datos persistidos sin importar otra vez.

Si se pierde la respuesta de la solicitud, no se puede afirmar que falló la transacción: consulte la carga guardada antes de reintentar. La pantalla vuelve a leer la carga al abrirse y cuando cambia el contexto.

Si falla la consulta de cobertura, la selección de archivo queda deshabilitada y aparece **Reintentar consulta**. El mensaje incluye el estado HTTP cuando el servidor lo devuelve. Un HTTP 404 indica que la consulta no está disponible en el servidor que respondió; compruebe la dirección del backend y que esté ejecutando la versión actualizada antes de reintentar.

## API y verificación

- `GET /api/horarios-asignaturas/excel/externos/cobertura?planificacionSemestreId=…&departamentoId=…`: cobertura persistida, restringida a administradores y secretarias con alcance autorizado.
- `POST /api/horarios-asignaturas/excel/externos/importar?planificacionSemestreId=…&departamentoId=…`: multipart con campo `archivo`. Un rechazo por validación devuelve HTTP 400, `errores` y `data.cobertura`; una importación correcta devuelve HTTP 201 con el resumen.

Las pruebas de persistencia y reversión se ejecutan mediante [la base PostgreSQL de pruebas](pruebas-excel-externos.md), nunca contra la base de desarrollo.
