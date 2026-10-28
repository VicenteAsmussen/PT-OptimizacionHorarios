# Administer one career's period

Administrators can open **Administración de períodos** from the application navigation. Select a career and a period explicitly; matching period codes in other careers are never included.

## Create a period

In **Administración de períodos**, select the career in the title card. Below it, **Seleccionar período a editar** and **Crear período** appear side by side (stacked on narrow screens). Leave the period selection empty to enter a code such as `2027-1` under **Crear período**. Selecting an existing period immediately clears the creation code, dims and disables creation and shows management below; choose **Selecciona un período** to clear that selection and enter a new code. The career catalog includes careers that do not yet have periods; no career is chosen automatically. **Se creará como actual.** appears next to the create button, which remains disabled until a catalog career and an exact six-character ASCII code are valid. Only administrators can access this page.

The career selector remains native. Each option in the custom period selector shows its state as a gray text badge and, only for the current period, a separate blue **Actual** badge. Options belong only to the selected career. Open with Enter, Space or an arrow key; use arrows, Home and End to navigate, then Enter or Space to choose. Escape, Tab and outside clicks dismiss without selecting. Focus stays on the combobox during navigation; Tab and outside clicks allow focus to leave normally. The scrollable list keeps the active option visible, and selection is disabled throughout mutations and their refreshes.

While creation is pending, selection, state changes and resets are blocked; existing maintenance commands likewise block creation. After success the page refreshes all periods, removes the previous current marker and selects the created period. If that refresh fails, the confirmed creation remains selected with a success notice and a separate refresh error. **Actualizar períodos** retries only the read, never creation. Creation errors preserve the entered code and selected career; there are no automatic POST retries.

Creation, current marking, deletion, state changes and resets each report one success or error through the shared notification helper, without duplicate inline mutation banners. Shared success, error and warning notices expire after five seconds and retain their close button and explicit dismissal support. Selection, disabled/ineligible actions and validation-prevented submissions are silent. Initial/background read failures remain inline with retry, without notifications; a failed read after a confirmed mutation does not turn its success into an action error. Unconfirmed maintenance outcomes still warn to inspect refreshed data before retrying.

For manual testing, hypothetical valid codes are `2098-1`, `2098-2` and `2099-1` for either career; `2098-3` is invalid. These are suggestions, not created fixtures or verified database vacancies. The same code may be used in different careers, but not twice in one career.

Only administrators can create periods with `POST /api/planificaciones-semestres`:

```json
{ "carreraId": 1, "codigo": "2027-1" }
```

`codigo` must match `AAAA-1` or `AAAA-2` using four ASCII digits. Codes are unique within each career; different careers can use the same code. The server always creates the period with `actual: true` and `estadoPlanificacion: "preparacion"`, returning 201 and the new planning in `data`. For compatibility, explicit `actual: true` is accepted; `actual: false`, state fields and unknown properties are rejected with 400.

The transaction locks the selected career and checks whether that career/code already exists before any writes. A duplicate returns 409 with `Período existente`, displayed once by the existing action notification; current flags, states and dependent data stay unchanged. This check does not rely on a driver's constraint name or error wrapping. The narrow known career/code constraint-error translation remains as insertion race protection; unrelated storage errors still return 500, never a duplicate message.

Otherwise, creation unmarks that career's previous current period and inserts the new one. Previous states and all offers, assignments, availability and schedules remain unchanged; no data is copied. Other careers are unaffected and may use the same code. An insertion failure rolls back the previous current flag. A missing career returns 404.

Generic `PATCH /api/planificaciones-semestres/:id` is also administrator-only. Current-only updates (`actual: true` or `false`) are allowed in every state. Code renaming remains preparation-only, including when sent together with `actual`. It does not accept state changes or career transfers. Secretary read access remains career-scoped. Future secretary state changes through the optimizer are a separate workflow, not permission to create periods or use administrator maintenance commands.

The optimizer and its future secretary state-transition flow remain outside this feature.

## Mark current or delete an empty period

Select an existing period and choose **Marcar como actual** in its management card. **Cambiar estado**, the current-period action and **Eliminar período** share one right-aligned row that wraps on narrow screens; the state button still submits its separate state form. An already-current period instead shows the disabled **Es actual** button. This works in Preparación, Propuesta and Publicado without changing state or dependent data. The transaction locks the career before the period and unmarks only that career's other periods. All current badges refresh while the selected period remains selected. Ordinary offer, availability and schedule editing still requires a current period in preparation.

**Eliminar período** requires Preparación and zero offers across **all** departments, including external and unrelated departments. Teacher availability does not block deletion: the existing database foreign key deletes it in cascade. No offers or schedules are cleaned up to make deletion eligible; schedules require an offer in the same period. Type the exact displayed period code and press **Confirmar eliminación**. The server revalidates code, identity, state and offer absence under the same career-then-period lock order as other writers. A stale code or ineligible period returns 409 without changes; a missing target returns 404.

Deletion is irreversible. Deleting the current period does **not** mark a replacement current. The deleted period is removed locally, period selection is cleared, and the career stays selected; other current flags remain unchanged. A failed refresh after confirmed deletion or current marking offers **Actualizar períodos**, which retries GET only, never the mutation. All mutations and their refreshes share one synchronous lock, released even if deletion unmounts the management panel. New operations invalidate old summaries and confirmations.

## Reset data

Below selection/creation, the selected period has its state/current/deletion management card and **Reiniciar datos** with the selected-career badge. There is no additional scope selector. A two-step guide, **1. Reiniciar horarios → 2. Reiniciar ofertas**, explains the order for the same group (managed or external). Schedule actions appear before offer actions:

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

All maintenance endpoints and generic planning POST/PATCH/DELETE endpoints require authentication and the `admin` role. Secretary/professor mutations are rejected before repository execution. Generic planning GET endpoints preserve their existing role and career access rules.

| Method | Endpoint | Input |
| --- | --- | --- |
| GET | `/api/administracion-periodos/:id/resumen` | Query `alcance=gestionadas`, `alcance=externas` or `alcance=todas`; returns selected planning, counts and `huella` with `Cache-Control: no-store` |
| POST | `/api/administracion-periodos/:id/reiniciar` | `{ "alcance": "gestionadas", "objetivo": "ofertas", "confirmacion": "2026-2", "huella": "<summary SHA-256>" }`; `objetivo` also accepts `horarios` |
| PATCH | `/api/administracion-periodos/:id/estado` | `{ "estadoAnterior": "publicado", "estadoPlanificacion": "preparacion" }` |
| PATCH | `/api/planificaciones-semestres/:id` | `{ "actual": true }` marks current without changing state; code updates remain preparation-only |
| DELETE | `/api/planificaciones-semestres/:id` | `{ "confirmacion": "2026-2" }`; 200 with the deleted planning in `data`, only in preparation with zero offers |

The API retains `todas` for compatibility and the whole-period schedule count; the page exposes only the four managed/external actions. POST accepts the same three scope tokens as GET.

`:id` identifies exactly one career's planning, not a shared period code. Invalid inputs return 400, missing authentication 401, unauthorized roles 403, missing planning 404, and stale confirmation/state 409. Successful commands return 200 with the resulting data/deletion counts. Deletes run atomically in dependency order; career-then-planning locks coordinate them with ordinary writes.

## Verification

Offline HTTP, SQL-shape and simulated-transaction checks: from `backend`, run `node node_modules/vitest/vitest.mjs run tests/semestres.test.ts tests/semestres-horarios.test.ts tests/planificacion-escritura.test.ts`. Checks cover creation defaults/validation, stored duplicates through the real HTTP/service/repository path with simulated storage, exact duplicate messages, post-lock reads before writes, narrow nested/cyclic driver-error handling, unrelated 500 failures, role enforcement, all-state current-only updates, preparation-only metadata, career isolation, offerless deletion, locked-row confirmation/state revalidation, and simulated rollback. Availability cascade is modeled from the existing FK, not executed against a database. These checks do not establish the cause of a reported live 500 or prove real PostgreSQL concurrency or rollback.

Frontend checks, from `frontend`: `node ../backend/node_modules/tsx/dist/cli.mjs --test src/features/administracion-periodos/administracion-periodos.test.mjs src/features/administracion-periodos/creacion-periodos.test.mjs src/features/administracion-periodos/vista-periodo.test.mjs src/features/administracion-periodos/selector-periodo.test.mjs src/lib/notificaciones.test.mjs src/features/profesores/notificaciones.test.mjs`. Tests exercise element handlers with simulated hooks/effects, SSR and simulated document events (not a mounted browser DOM), including empty-career planning lists, split-card structure/CSS, per-option badges, combobox keyboard/selection semantics, dismissal, focus/scroll calls, selection locks, code clearing, exact deletion confirmation, duplicate submission, single action notifications, silent reads/validation, shared locks through refresh/unmount, and GET-only recovery after successful mutations. Notification checks inspect actual finite options passed to Sonner, not elapsed browser time. Existing rendered tests retain the four reset actions and state-transition gates. Browser accessibility, focus, layout and automatic-expiry observation remain separate.

Full frontend verification also requires the installed runners `node node_modules/typescript/bin/tsc` and `node node_modules/vite/bin/vite.js build`. At the latest verification checkpoint these failed because React declarations and the Vite React plugin were missing; do not treat focused tests as full build proof or install/repair dependencies without authorization.

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
