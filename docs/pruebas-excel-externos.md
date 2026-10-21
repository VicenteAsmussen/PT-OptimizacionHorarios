# Verificar la importación Excel con PostgreSQL

Desde la raíz del repositorio, con Docker Desktop iniciado en modo Linux:

```powershell
powershell -NoProfile -File scripts/probar-excel-externos.ps1
```

El comando usa el servicio PostgreSQL del `docker-compose.yml` habitual y crea, si no existe, la base `horarios_test` con el usuario restringido `pruebas_horarios`. Espera a que PostgreSQL acepte conexiones TCP, con un máximo de 30 comprobaciones y pausas de un segundo; si no está listo, se detiene sin preparar la base. Después ejecuta las migraciones y pruebas en un contenedor temporal del backend. No requiere instalar Node.js ni pnpm en la máquina anfitriona. El backend debe tener su imagen construida; si todavía no existe, ejecutar primero `docker compose build backend`.

## Qué comprueba

- Identificación de asignaturas por código y profesores por RUT, dentro del alcance autorizado. Sus nombres en el Excel son informativos: pueden estar vacíos o diferir, sin modificar los nombres del catálogo. Las columnas de nombres siguen formando parte del formato común.
- Reemplazo de secciones, cambio de profesor y cupos, creación de ofertas nuevas y eliminación de secciones ausentes.
- Conservación del identificador de las ofertas existentes y de los datos de otras carreras, departamentos y planificaciones.
- Reimportación sin duplicados y aceptación de ofertas de distinta paridad de semestre de malla.
- Errores con asignatura, columna y valor, sin modificar datos cuando el archivo es inválido o no tiene asignaturas pertinentes.
- Rechazo de una planificación publicada.
- Reversión real en PostgreSQL: un trigger de prueba provoca un fallo después de eliminaciones, actualizaciones e inserciones. La huella de todas las filas de las tablas públicas debe quedar idéntica. Las secuencias no se comparan porque PostgreSQL no revierte `nextval`.
- Rechazo de destinos distintos de la base desechable antes de importar la configuración de la aplicación o abrir conexiones.

## Base de pruebas reutilizable

`horarios_db` sigue siendo la base de desarrollo. `horarios_test` es exclusivamente para pruebas automatizadas: sus tablas se vacían y se reconstruyen con fixtures sintéticos en cada prueba. Se conserva en el volumen PostgreSQL habitual para reutilizarla; no debe contener datos que se quieran mantener. El rol de pruebas no es superusuario, no crea bases ni roles y no hereda privilegios de otros roles.

El preparador comprueba propietario, marca de administración y atributos del rol antes de reutilizar una base existente. No borra bases ni cambia contraseñas de roles existentes. Si encuentra una base `horarios_test` ajena o un rol con privilegios inesperados, se detiene sin reiniciar datos. La prueba valida destino y usuario antes de conectarse, comprueba la identidad real y toma un bloqueo exclusivo para impedir dos ejecuciones de este flujo a la vez.

No hay otro archivo Compose por funcionalidad. Para preparar esta misma base para futuras pruebas de otros módulos puede usarse `powershell -NoProfile -File scripts/preparar-base-pruebas.ps1`; ese comando solo prepara la base y el rol, no aplica migraciones ni carga fixtures. Las futuras pruebas que la reinicien deben usar la misma protección y el bloqueo `(18874001, 1)`; las suites antiguas que requieren el seed normal no deben ejecutarse junto con los fixtures mínimos del Excel.

## Resultado y limpieza

Una ejecución correcta muestra `19 passed` y termina con código `0`. Durante la prueba de reversión es normal que PostgreSQL registre el error deliberado `forced external Excel failure after persisted changes`; la suite debe terminar aprobada. Los errores de preparación o de pruebas devuelven código distinto de cero.

Docker elimina el contenedor temporal del backend al terminar. PostgreSQL, el backend habitual, pgAdmin y sus volúmenes siguen funcionando. Los fixtures de la última prueba permanecen en `horarios_test` hasta la próxima ejecución; no se borra la base ni se usa `docker compose down -v`.

Esta prueba llama al servicio real de importación y consulta PostgreSQL sin mocks. No sustituye una prueba HTTP multipart, de interfaz gráfica ni de concurrencia entre procesos.

La suite normal omite estas seis pruebas PostgreSQL cuando no se solicita este entorno explícito mediante `BASE_PRUEBAS_REINICIABLE=yes`. El comando dedicado nunca debe omitirlas ni ejecutarse contra `horarios_db`.
