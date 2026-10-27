# Administer one career's period

Administrators can open **Administración de períodos** from the application navigation. Select a career and a period explicitly; matching period codes in other careers are never included.

## Reset data

The page has three cards: career/period selection with a short introduction, period state with its current-state badge, and **Reiniciar datos** with the selected-career badge. There is no additional scope selector. A two-step guide, **1. Reiniciar horarios → 2. Reiniciar ofertas**, explains the order for the same group (managed or external). Schedule actions appear before offer actions:

| Operation | Deleted | Preserved |
| --- | --- | --- |
| Reiniciar horarios gestionados | Managed schedule blocks, including their room associations | All sections/teacher assignments and external schedules |
| Reiniciar horarios externos | External schedule blocks, including their room associations | All sections/teacher assignments and managed schedules |
| Reiniciar ofertas gestionadas | Managed sections and teacher assignments, only after their schedules were reset | External offers/schedules, period, catalogs and teacher availability |
| Reiniciar ofertas externas | External sections and teacher assignments, only after their schedules were reset | Managed offers/schedules, period, catalogs and teacher availability |

Managed scope follows `carrera_departamento.es_gestionado=true` for the selected career; external scope requires an explicit `false` relationship. Departments without a relationship are not silently treated as external. Neither classification uses course-code prefixes. Non-current periods may also be selected. Resets never change the period state or which period is current.

Always reset schedules **before** resetting their offers. The page disables offer reset while schedules remain in that scope, and the API rechecks under lock, returning 409 without deleting anything. Schedules in the other scope do not block the reset. Refresh and confirm the new snapshot after resetting schedules.

Type the exact period code to confirm the displayed operation. Deletion is irreversible through the application: take an appropriate backup before using it on important data. A summary fingerprint is revalidated inside the transaction; changed data or scope requires a new preview and confirmation. After a lost response, inspect the refreshed summary before considering another operation. There is no automatic mutation retry.

## Change state

Select **Preparación**, **Propuesta** or **Publicado**, then press **Cambiar estado**. Returning to **Preparación** requires that no **managed** schedule blocks remain in the selected career's period. External schedules may remain and are preserved. The API uses the same managed-department classification as reset previews, inside the career/period locking transaction, and returns 409 without mutation if managed schedules remain. Schedules belonging to other periods or careers do not block it. State always applies to the whole selected planning.

The administrator flow is based on **managed schedules**, not on offer counts or external schedules alone:

| Selected period data | Available states |
| --- | --- |
| Empty, offers only, or external offers/schedules only | Preparación |
| At least one managed schedule | Propuesta and Publicado; the administrator may switch freely between them |

Both **Propuesta** and **Publicado** are rejected with 409 if the selected career/period has no managed schedules. Other careers/periods do not satisfy this requirement. The API recomputes it under the same career/period locks used by reset operations; preview counts are informational. Existing external offers and schedules remain unchanged throughout state transitions.

This administrator page does **not** require full teaching-load coverage or assigned rooms before publishing. A future, separate secretary page may require rooms for theoretical/practical classes; that flow is not implemented here and does not grant secretary access to these maintenance commands.

State commands do not generate/delete schedules, choose the current period, or modify external imports. Reset commands do not implicitly change state; after clearing managed schedules, select Preparación. Ordinary editing still requires a current period in preparation. Returning to preparation keeps the period selectable for assigned teachers but replaces their calendar with a preparation notice and denies schedule reads; proposal and published states make their own schedule available under the existing access rules.

## API

All maintenance endpoints require authentication and the `admin` role. Secretary/professor access is rejected before repository execution. Existing generic planning endpoints retain their original restrictions.

| Method | Endpoint | Input |
| --- | --- | --- |
| GET | `/api/administracion-periodos/:id/resumen` | Query `alcance=gestionadas`, `alcance=externas` or `alcance=todas`; returns selected planning, counts and `huella` with `Cache-Control: no-store` |
| POST | `/api/administracion-periodos/:id/reiniciar` | `{ "alcance": "gestionadas", "objetivo": "ofertas", "confirmacion": "2026-2", "huella": "<summary SHA-256>" }`; `objetivo` also accepts `horarios` |
| PATCH | `/api/administracion-periodos/:id/estado` | `{ "estadoAnterior": "publicado", "estadoPlanificacion": "preparacion" }` |

The API retains `todas` for compatibility and the whole-period schedule count; the page exposes only the four managed/external actions. POST accepts the same three scope tokens as GET.

`:id` identifies exactly one career's planning, not a shared period code. Invalid inputs return 400, missing authentication 401, unauthorized roles 403, missing planning 404, and stale confirmation/state 409. Successful commands return 200 with the resulting data/deletion counts. Deletes run atomically in dependency order; career-then-planning locks coordinate them with ordinary writes.

## Verification

Offline HTTP checks: from `backend`, run `pnpm exec vitest run tests/administracion-periodos.test.ts tests/semestres.test.ts tests/planificacion-escritura.test.ts`.

PostgreSQL checks use **only** the dedicated `horarios_test` database and `pruebas_horarios` role. The test validates the raw environment before opening connections, verifies database/user identity, obtains the shared test-harness advisory lock and resets only synthetic fixtures. Never point it at development or production data.

From the repository root in PowerShell, prepare the existing isolated harness, then run:

```powershell
powershell -NoProfile -File scripts/preparar-base-pruebas.ps1
if ($LASTEXITCODE -eq 0) {
  docker compose run --rm --no-deps `
    -e NODE_ENV=test -e BASE_PRUEBAS_REINICIABLE=yes `
    -e DATABASE_URL=postgres://pruebas_horarios:pruebas_horarios@postgres:5432/horarios_test `
    backend pnpm exec vitest run tests/integracion/administracion-periodos.postgres.test.ts
}
```

The integration suite covers all API scopes, both reset operations, state transitions with and without schedules, real role enforcement, stale confirmations, cross-career/period preservation, concurrent resets and transaction rollback after a late deletion failure. Rendered frontend tests cover the four explicit action bindings and period-code confirmation. Manual browser inspection remains a separate check.
