# Verificar la importación Excel con PostgreSQL

Con Docker Desktop en modo Linux, ejecuta desde la raíz del repositorio:

```powershell
powershell -NoProfile -File scripts/probar-excel-externos.ps1
```

No necesitas Node.js ni pnpm en tu equipo. Si aún no está construida la imagen del backend, ejecuta primero `docker compose build backend`.

El script usa PostgreSQL del Compose habitual y prepara `horarios_test` con el usuario restringido `pruebas_horarios`. Espera conexiones TCP hasta 30 veces, con pausas de un segundo. Si el servidor no está listo, se detiene sin preparar la base. Después aplica migraciones y ejecuta las pruebas en un contenedor temporal.

## Qué comprueba

- Asignaturas por código y profesores por RUT, dentro del alcance autorizado. Las columnas de nombres siguen siendo necesarias, pero sus valores son informativos y no cambian el catálogo.
- Creación, actualización y eliminación de secciones, incluidos profesor y cupos, sin duplicados al reimportar. Los identificadores existentes y los datos de otras carreras, departamentos y períodos se conservan.
- Cobertura por período, con niveles impares obligatorios en `-1` y pares en `-2`. Se aceptan niveles de otra paridad y faltantes opcionales. Los obligatorios faltantes rechazan el archivo. También se comprueba la consulta de cobertura guardada.
- Rechazo de archivos inválidos, sin asignaturas pertinentes o dirigidos a una planificación publicada, sin modificar datos. Los errores identifican asignatura, columna y valor.
- Reversión real ante un fallo provocado después de insertar, actualizar y eliminar. La huella de todas las filas públicas debe conservarse. No se comparan secuencias, PostgreSQL no revierte `nextval`.
- Rechazo de una base no autorizada antes de cargar la configuración o abrir conexiones.

## Base de pruebas reutilizable

**Nunca uses `horarios_db` para estas pruebas.** `horarios_test` se conserva en el volumen habitual, pero sus tablas se vacían y cargan con datos sintéticos en cada caso. No guardes allí información que quieras conservar. Su usuario no es superusuario, no crea bases ni roles y no hereda privilegios.

Antes de reutilizarla, el preparador verifica propietario, marca de administración y privilegios del rol. Si no coinciden, se detiene sin reiniciar datos. No borra bases ni cambia contraseñas existentes. La prueba valida destino y usuario antes de conectarse, confirma la identidad real y toma un bloqueo exclusivo.

Para preparar solo la base y el rol, sin migraciones ni datos, usa `powershell -NoProfile -File scripts/preparar-base-pruebas.ps1`. Otros módulos deben reutilizar esta protección y el bloqueo `(18874001, 1)`, no necesitan otro Compose. No ejecutes suites que requieren la carga inicial habitual junto con los datos mínimos de Excel.

## Resultado y limpieza

Una ejecución correcta termina con código `0`. El mensaje `forced external Excel failure after persisted changes` es esperado en la prueba de reversión, pero la prueba debe aprobar. Cualquier fallo de preparación o prueba devuelve otro código.

Al terminar se elimina solo el contenedor temporal. Los servicios habituales y volúmenes siguen funcionando, y los datos de la última prueba quedan en `horarios_test` hasta la siguiente ejecución. No se borra la base ni se usa `docker compose down -v`.

Se comprueba el servicio real y PostgreSQL, sin simulaciones. Esto no prueba la carga HTTP multipart, la interfaz ni la concurrencia entre procesos.

Estas pruebas de Excel se omiten sin `BASE_PRUEBAS_REINICIABLE=yes`. El comando dedicado debe ejecutarlas siempre sobre la base de pruebas, nunca sobre `horarios_db`. Esto no implica que las demás pruebas de la suite estén aisladas de la base configurada.
