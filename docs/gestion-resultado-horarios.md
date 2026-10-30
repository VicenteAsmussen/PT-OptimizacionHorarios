# Secretary timetable results API

Use `/api/resultados-horarios` to review an existing timetable, request rooms, relocate managed classes and publish a proposal. This backend does not run the mathematical model or create a manual scheduling screen.

## Lifecycle

Preparation and model execution remain separate. This API edits only the **current proposal**. Published results can be read and exported, but not moved, imported or reopened through this workflow. Existing administrative maintenance is not a secretary publication substitute.

All routes require authentication and the `secretaria` or `admin` role. Secretary scope comes from the authenticated career; clients cannot select a different career. Filters change presentation, never validation scope.

## Routes

| Method | Route after `/api/resultados-horarios` | Input | Outcome |
|---|---|---|---|
| GET | `/:id` | Optional `semestreMalla` query | Planning, revision, blocks, declared availability, grouped sessions and planning-wide pending count |
| POST | `/:id/validar-movimiento` | Movement body | Nonmutating destination validation with structured problems |
| POST | `/:id/movimientos` | Same movement body | Revalidate and save one confirmed group atomically |
| GET | `/:id/salas/exportar` | Optional `soloPendientes=true` | Room-request XLSX; room cells intentionally blank |
| POST | `/:id/salas/importar` | Multipart `archivo` and `revision` | Validate the entire response and save its room assignments atomically |
| GET | `/:id/validacion-publicacion` | None | Publication readiness, problems and current revision |
| POST | `/:id/publicar` | `{ "revision": "<current SHA-256>" }` | Validate under the planning lock and publish |

Success uses `{ "status": "success", "data": ... }`. Invalid/stale writes return HTTP 409; malformed input returns 400; inaccessible planning returns 404. Preview returns HTTP 200 with `data.valido: false` and `data.problemas` for an invalid destination. Color is a frontend concern: availability is green, invalid proposed destinations red, always accompanied by text.

### Movement body

```json
{
  "revision": "<64 lowercase hexadecimal characters from the latest read>",
  "idsHorarios": [100, 101],
  "bloqueInicioId": 25
}
```

The read revision covers the complete planning context, including availability and management/room requirements. A changed context invalidates confirmation. Preview is informational: saving always validates again inside one transaction.

Sessions are derived using the existing institutional continuity rules, including the ten-minute break after a pair of blocks. IDs do not establish chronological order. Whole-session selection is the frontend default; the API accepts a consecutive group from one session when:

- At least two blocks move together, and the destination fits the entire group on one day.
- Every remaining segment has at least two blocks, or nothing remains.
- Every destination block is within the professor's declared availability.
- There are no professor, room or curriculum-level conflicts anywhere in the planning.

A two- or three-block session therefore moves whole; four blocks can split into two plus two. Total teaching load, record IDs, offer, teaching type and room assignment are preserved. Any failed operation rolls back. Imported external classes remain fixed, but participate in conflict detection. The same curriculum level cannot overlap even across different sections. Resource conflicts are planning-local; this API does not introduce cross-career resource coordination.

## Room requests

The existing room spreadsheet layout and session grouping are reused. Requests contain only managed teaching sessions that require a room:

- `asignaturas.requiereSala` is a subject-level boolean, default `true`.
- Professional Practices I/II (`620449`, `620456`) and Degree Project (`620477`) are explicitly exempt in the migration/seed. Preliminary Project (`620472`) is not exempt.
- Laboratory teaching sessions are excluded independently; other teaching types in the same subject remain eligible.
- External-department sessions are not included.

Session room states are `asignada`, `pendiente`, `noRequiere`, `laboratorio` or `externa`. Excluded sessions never count as room pending. There is no duplicated persisted status: eligibility and actual room assignments determine the state.

`soloPendientes=true` exports whole eligible sessions with at least one unassigned block, not isolated missing blocks. The existing five-session-per-row limit remains; exceeding it is an explicit error, never silent truncation.

### Import response

Submit one `.xlsx` file in `archivo`, maximum 10 MB, and the revision corresponding to the proposal being answered. The response must match the existing subject, section, teaching type, day and time:

| Room cell | Proposal-response behavior |
|---|---|
| Recognized room code | Assign that room to all blocks of the identified session |
| `SIN SALA` | Explicitly leave the session without a room |
| Blank | Preserve existing assignments; do not erase them |
| Session omitted | Leave the session unchanged |
| Unknown room or invalid session key | Reject the entire response with row/column errors |

All changed and unchanged sessions participate in final room-occupancy validation. Room swaps release changed assignments as one batch before applying the validated final state. The planning remains locked through import validation and persistence. Refresh the results after import to obtain the new revision and overall pending count; import counts concern sessions processed in the file.

The older preparation Excel endpoints remain available. Their blank-cell clearing contract is unchanged, and `SIN SALA` remains an unrecognized room there; do not use them for proposal-response handling.

## Publication

Publication validates the complete planning, without applying the display filter:

1. Required blocks per offer/teaching type match the curriculum workload; mandatory subjects of the period have an offer.
2. No simultaneous classes share a professor, room or curriculum level.
3. Every managed class is within declared professor availability. No declaration means unavailable, not unrestricted. Fixed external imports are not assigned an invented availability declaration.
4. Every eligible session has its required room. Subject exemptions, laboratories and external sessions do not block for room absence.

These are defensive proposal checks, not mathematical-model execution validation. Publishing uses the same career-before-planning lock order as existing preparation writes. A stale revision or rejected check changes neither timetable nor planning state.

## Migration and verification

Migration `0016_asignaturas_requiere_sala.sql` adds the room requirement and exempts the three explicit codes. The operator applied only `0016` to the local development database after creating a verified backup. Post-migration checks verified the migration ledger, room-requirement flags and preservation of prior public-table row counts and hashes. The verified backup was retained outside the repository. Other environments must apply the migration before using this backend.

Focused checks from `backend/`:

```sh
pnpm exec vitest run tests/asignaturas-requiere-sala.test.ts tests/resultados-horarios-http.test.ts tests/resultados-horarios.repository.test.ts
pnpm exec tsc --noEmit
```

HTTP tests exercise the real routes/controllers/services with isolated in-memory persistence. SQL-proxy tests inspect lock order, whole-group writes and failure propagation; they do not replace PostgreSQL integration testing.

Separate verification against a disposable PostgreSQL database produced 23 passing scenario outcomes, including actual rollback after a forced write failure, competing requests using the same revision, room swaps under unique constraints, state/scope checks and publication validation. This verifies the backend workflow, not frontend integration or mathematical-model execution. Never point test commands at an ordinary populated development database.
