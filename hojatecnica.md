# BethBoom — Hoja de Arquitectura Técnica (V1.2 — lista para IA)

> Contexto: Web interna para gestionar apuestas en el servidor de GTA V RP. Este documento está optimizado para que una IA lo use como **contexto persistente** durante el desarrollo.

---

## 0) Alcance y modelo operativo

* **Web interna** para **trabajadores** de BethBoom (no cara al cliente). Sin integración con el juego.
* **Locales**: 1 **Local Principal (HQ)** + **Franquicias** (agregadas/retiradas según RP). Todas las reglas son **globales** y aplican a cualquier nueva franquicia a menos que se parametrice distinto en el mercado.
* **Objetivo**: registrar tickets, calcular pagos, operar caja por trabajador, ajustar cuotas por sesgo, y obtener reportes por sede/trabajador/apostador.
* **Comprobantes**: no se imprimen ni QR. El sistema solo deja **constancia** de lo ocurrido.
* **Seguridad** mínima (juego RP): email+password, sin 2FA ni verificación.

---

## 1) Actores, roles y permisos

**Roles definitivos** (de mayor a menor):

1. **Admin General** (Dueño/s): superusuario(s). Crea/edita/elimina todo. Ajusta parámetros globales. Puede borrar logs. Aprueba cierres de caja.
2. **Trabajador/Vendedor**: abre/cierra su caja (solicita cierre), registra tickets, paga premios.
3. **Auditor General**: solo lectura de todas las sedes, incluidos logs y reportes.
4. **Auditor de Franquicia (opcional)**: solo lectura de **una** franquicia (reportes, mercados, caja, logs de su sede).

> **Identificación / Acceso (sin autenticación clásica)**

* No hay email/contraseña. Cada usuario usa un **AccessCode** (código único) para identificarse.
* Flujo: pantalla de acceso → ingresar **AccessCode** → se crea **sesión firmada** (cookie httpOnly).
* Los **AccessCodes** se gestionan desde **Admin → Usuarios** (crear, revocar, rotar). También se puede **importar/exportar JSON** **solo de usuarios** y sus permisos (no de parámetros).
* Campos de usuario: `display_name`, `rol`, `franquicia_id?`, `access_code` (hash en DB), `estado`.

---

## 2) Reglas de negocio

* **Mercados**

  * Campos: `nombre`, `descripcion` (condición de victoria), `tipo` (POOL|ODDS), `estado` (abierto|suspendido|cerrado), `fee_pct`, `franchise_share_pct` (participación para el dueño de la franquicia), `umbral_recalc_monto` (para ODDS), `franquicia_scope` (GLOBAL|SEDE), `sede_id?`, `starts_at?`, `ends_at?`.
  * **Sin categorías ni imágenes**.
  * Creación/edición: Admin General. Cierre/Suspensión: Admin General. (Sentido común aplicado para excepciones.)
* **Opciones**: mín. 2 por mercado; en **POOL** no tienen cuota; en **ODDS** `cuota_inicial` y `cuota_actual`.
* **Tickets**

  * Moneda: **USD** sin decimales (enteros).
  * **Límites por ticket basados en Rango de Cliente** (ver §2.1): mínimos y máximos se aplican según el rango del **apostador**.
  * Edición/anulación **antes del cierre** del mercado (siempre con motivo y log).
* **Fee**

  * `fee_pct` **global por mercado**, **default 12%** (editable por el creador del mercado).
  * **Participación de franquicia** (`franchise_share_pct`): **editable por convenio** con cada dueño; **default 50%** del fee.
* **Pozo común (POOL)**

  * Pozo neto = `total_apostado * (1 - fee_pct)`.
  * Pago ticket ganador = `Pozo neto * (monto_ticket / suma_montos_ganadores)`.
  * **Redondeo**: hacia abajo a **entero** (sin decimales).
* **Cuotas variables (ODDS)**

  * Ajuste **automático por monto acumulado**: cuando el mercado acumula `umbral_recalc_monto` desde el último recálculo (o apertura), se recalculan cuotas.
  * **Umbral por defecto**: **30 000** (editable por el creador de mercado y rangos superiores).
  * **Límites de cuota**: `min=1.20`, `max=5.00`.
  * **Fórmula recomendada** en §5.3. Sesgo sobre **total histórico**.
* **Caja**

  * **Apertura de caja por Trabajador** → operación → **Solicitud de cierre** → **Aprobación por Admin** (cuadre). Un solo arqueo de caja **de cada vendedor contra los dueños** cuando se solicita.
  * Caja por franquicia y por trabajador (arqueos, saldos, egresos/ingresos).
* **Auditoría**

  * Logs de todas las acciones (quién, cuándo, qué, antes/después, IP/huella). Eliminación manual solo por Admin. **Sin retención automática**.

### 2.1 Rango de Cliente (niveles)

* **Total de 5 rangos**. **Default**: el cliente inicia en **Rango 1** y **sube 1 rango cada 30 apuestas** realizadas (conteo global).
* **Asignación directa**: los dueños pueden promover/degradar manualmente.
* **Visibilidad**: nombres de rangos y condiciones visibles para trabajadores.
* **Nombres y límites por rango (defaults, editables)**:

  * **R1 – Bronce**: mín **1 000** / máx **10 000** USD
  * **R2 – Plata**: mín **1 000** / máx **20 000** USD
  * **R3 – Oro**: mín **1 000** / máx **50 000** USD
  * **R4 – Diamante**: mín **1 000** / máx **100 000** USD
  * **R5 – Super VIP**: mín **1 000** / máx **250 000** USD
* Estos valores son **defaults** y pueden editarse por el **Admin**.

## 3) KPIs del Dashboard (portada)

1. **Hold% global** y por sede.
2. **Volumen apostado** (hoy/7d/30d) global y por sede.
3. **Beneficio neto** (hoy/7d/30d) global y por sede.
4. **Tickets por estado** (activos/cerrados/pagados/anulados) y **promociones de rango** activas.
5. **Top Trabajador** por beneficio neto (7d) y **Top Apostador** por ganancia/pérdida (30d).

--- del Dashboard (portada)

1. **Hold% global** y por sede.
2. **Volumen apostado** (hoy/7d/30d) global y por sede.
3. **Beneficio neto** (hoy/7d/30d) global y por sede.
4. **Tickets por estado** (activos/cerrados/pagados/anulados) y **promociones de rango** activas.
5. **Top Trabajador** por beneficio neto (7d) y **Top Apostador** por ganancia/pérdida (30d).

--- del Dashboard (portada)

1. **Hold% global** (beneficio/venta) y por sede.
2. **Volumen apostado** (hoy, 7d, 30d) global y por sede.
3. **Beneficio neto** (hoy, 7d, 30d) global y por sede.
4. **Tickets**: activos / cerrados / pagados / anulados (hoy).
5. **Top Trabajador** por beneficio neto (7d) y **Top Apostador** por ganancia/pérdida (30d).

---

## 4) Flujos operativos (MVP)

1. **Turno**: Trabajador abre caja → sistema inicia saldo inicial.
2. **Venta**: seleccionar mercado → opción → ingresar monto → validar límites → confirmar ticket → registrar en caja.
3. **Recalc ODDS**: al alcanzar el **umbral de monto** desde el último recálculo, sistema sugiere nuevas cuotas y aplica automáticamente (o manual con toggle global).
4. **Cierre de mercado**: marcar ganador(es) → calcular pagos (POOL u ODDS) → generar lista de tickets ganadores pendientes.
5. **Pago**: Trabajador paga → registra pago → afecta caja.
6. **Cierre de turno**: Trabajador solicita cierre → Manager revisa → confirma cuadre (o registra diferencia).

---

## 5) Modelo de datos (Prisma / SQL)

### 5.1 Entidades

* **User** {id, display_name, rol: ('ADMIN'|'WORKER'|'AUDITOR_GLOBAL'|'AUDITOR_FRANQUICIA'), franquicia_id?, access_code_hash, estado, created_at}
* **Franquicia** {id, nombre, codigo, estado, created_at, franchise_share_pct_default}
* **Mercado** {id, nombre, descripcion, tipo:('POOL'|'ODDS'), estado, fee_pct, franchise_share_pct_override?, umbral_recalc_monto, franquicia_scope:('GLOBAL'|'SEDE'), sede_id?, starts_at?, ends_at?, created_at}
* **Opcion** {id, mercado_id, nombre, cuota_inicial?, cuota_actual?, created_at}
* **Apostador** {id, alias (único), rango:1..5, apuestas_total, created_at}
* **Ticket** {id, mercado_id, opcion_id, franquicia_id, trabajador_id, apostador_id, monto, cuota_fijada?, estado:('ACTIVO'|'ANULADO'|'PAGADO'), created_at}
* **Pago** {id, ticket_id, pagador_id, pagado_at}
* **CajaMovimiento** {id, franquicia_id, trabajador_id?, tipo:('APERTURA'|'INGRESO'|'EGRESO'|'AJUSTE'|'CIERRE'), monto, ref_tipo?, ref_id?, created_at}
* **RankRegla** {id, nombre, orden, min_apuestas_acumuladas, min_monto?, max_monto, activo}
* **OddUpdate** {id, opcion_id, sesgo, antes, despues, motivo, actor_id?, created_at}
* **AuditLog** {id, actor_id, accion, entidad, entidad_id, antes, despues, ip, created_at}

### 5.2 Índices críticos

* `Ticket(mercado_id, estado)`; `Opcion(mercado_id)`; `Apostador(rango)`; `CajaMovimiento(franquicia_id, created_at)`; `AuditLog(created_at)`; `User(rol, franquicia_id)`.

### 5.3 Fórmula de cuotas (ODDS)

* Sesgo por opción = `monto_opcion / monto_total` (sobre **total histórico** del mercado).
* Cuota sugerida = `clamp(base / (k1 + k2*sesgo), min, max)` con `base=2.0`, `k1=0.6`, `k2=0.8`, `min=1.20`, `max=5.00` y `delta_max=0.25` por recálculo.

### 5.4 Pagos (POOL)

* Pozo neto = `sum(montos) * (1 - fee_pct)`; pago por ticket ganador = `Pozo neto * (monto_ticket / suma_montos_ganadores)`; **redondeo a entero hacia abajo**.

## 6) UI/UX (modo oscuro)

* **Acceso por código**: input de AccessCode + selección de franquicia si aplica.
* **Dashboard** (KPIs, alertas de umbral ODDS, sedes con caja en negativo, promociones de rango).
* **Ventas**: búsqueda de mercado → opción → teclado numérico → validaciones por **rango del apostador**.
* **Feedback ODDS**: si al confirmar el ticket cambian las cuotas por recálculo automático, el sistema muestra **banner/toast** de cambio (antes → después) y requiere **clic de confirmación** del vendedor para cerrar el ticket actualizado.
* **Mercados**: lista, crear/editar, suspender, cerrar, historial de cuotas.
* **Pagos**: tickets ganadores pendientes, filtro por sede y por trabajador.
* **Caja**: apertura/cierre por trabajador, arqueo, diferencias, historial.
* **Apostadores**: ficha con **alias único**, **rango**, apuestas acumuladas y botón **Promover/Degradar**.
* **Reportes**: sede, trabajador, apostador; export CSV/JSON.
* **Admin**: sedes (con `franchise_share_pct_default`), **usuarios y AccessCodes** (CRUD + import/export JSON **solo de usuarios**), parámetros globales (fee default, umbral ODDS, delta_max, política de recálculo), limpieza de logs.

--- (modo oscuro)

* **Dashboard** (KPIs, alertas de mercados por cerrar, sedes con caja en negativo, umbrales ODDS alcanzados).
* **Ventas rápidas**: búsqueda de mercado, selección de opción, teclado numérico, validaciones en línea.
* **Mercados**: lista, crear/editar, suspender, cerrar, ver historial de cuotas.
* **Pagos**: tickets ganadores pendientes, filtro por sede y por trabajador.
* **Caja**: apertura/cierre por trabajador, arqueo, diferencias, historial.
* **Reportes**: sede, trabajador, apostador; export CSV/JSON.
* **Admin**: sedes, usuarios, parámetros globales (fee default, franchise_share_pct default, límites, umbral ODDS, delta_max, política de recálculo total vs incremental), limpieza de logs.

---

## 7) Stack técnico (mínimo y entendible)

* **App Full‑stack**: **Next.js 14 (App Router) + TypeScript** con **Server Actions/Route Handlers** (sin backend separado).
* **UI**: TailwindCSS + shadcn/ui. Modo oscuro por defecto.
* **DB**: **Supabase (PostgreSQL)**.
* **ORM**: Prisma.
* **Acceso**: **AccessCode** propio (sin NextAuth). Sesión firmada (jsonwebtoken + cookie httpOnly) con expiración simple.
* **Hosting**: **Vercel** (app) + **Supabase** (DB). Alternativa: Railway (DB) + Vercel si hace falta.
* **Logs**: tabla `AuditLog` en DB.

> Racional: un solo repo, cero servicios extra, IA puede operar todo el ciclo.

---

## 8) Repositorio y flujo GitHub (con forks)

* **Un (1) repo**.
* Branching: `main` (prod), `staging` (pre), `feat/*`.
* Cada dev trabaja en **fork** y abre **PR** al repo principal.
* **PR mínimo**: 1 review + CI (lint, typecheck, build). Squash & merge.

---

## 9) Entornos, CI/CD y configuración

* **Entornos**: Local, Staging, Prod.
* **CI**: GitHub Actions → `pnpm lint` + `pnpm typecheck` + `pnpm build`.
* **CD**: Vercel despliega `staging` y `main` automáticamente. Variables `.env` por entorno (guardadas en Vercel/Supabase).
* **Migraciones**: Prisma Migrate corriendo en deploy (post‑deploy hook) o manual desde CI para `staging/main`.

---

## 10) Testing y calidad (mínimo útil)

* **Unit tests** con Vitest en reglas puras (cálculo de pagos/odds/validaciones).
* **Playwright** (básico) para el flujo de venta y cierre de mercado.
* Lint (ESLint), Prettier, `tsc --noEmit`.

---

## 11) Seeds y datos iniciales

* **Usuarios** (AccessCodes de ejemplo):

  * Admin: `owner-AAAA1111` (rotar luego)
  * Trabajador HQ: `sell-HQ-BBBB2222`
  * Auditor General: `audit-CCCC3333`
* **Franquicias**: `HQ (Principal)` (lista vacía para crear en RP). `franchise_share_pct_default=50%`.
* **Parámetros por defecto**:

  * `fee_pct=12%`.
  * **Rangos**: **Bronce**, **Plata**, **Oro**, **Diamante**, **Super VIP**.
  * `promoción_por_conteo_apuestas=30`.
  * Límites por rango (ver §2.1).
  * ODDS: `umbral_recalc_monto=30 000`, `odds_min=1.20`, `odds_max=5.00`, `delta_max=0.25`.

## 12) Auditoría y logs

* `AuditLog` para todo. **Eliminación manual** solo por Admin. Sin retención automática.

---

* **AuditLog** a nivel de DB para cualquier acción sensible.
* **Eliminación manual** de logs solo por **Admin General** (sin retención automática).

---

## 13) Riesgos y decisiones

* **Caídas de servicio**: aceptadas como parte del RP. Mantener scripts de seed para restaurar rápido.
* **Pagos altos**: **sin doble confirmación** por decisión de negocio.
* **Seguridad baja**: intencional por alcance RP; aún así se almacenan contraseñas con hash.

---

## 14) To‑Do/Decisiones pendientes (mínimas)

* [ ] Confirmar **fee_pct default** (propuesto 12%).
* [ ] Confirmar **franchise_share_pct default** (propuesto 50% del fee para la franquicia).
* [ ] Confirmar **ticket_min/ticket_max** default (propuesto 10 / 10 000 USD).
* [ ] Definir si el **recalc ODDS** es **auto** o **manual con confirmación** (propuesto: **auto**).
* [ ] Definir si el **sesgo** usa **total histórico** (propuesto) o **incremental** desde último recálculo.

---

## 15) Notas para implementación rápida

* Empezar por **DB + Prisma** (migraciones), luego **Auth (NextAuth Credentials)**, después **flujos Caja → Tickets → Cierre → Pagos**. Finalmente **Dashboard** y **Reportes**.
* Plantillas de UI simples (shadcn) + validaciones con Zod.
* Feature flags básicos en `ParametrosGlobales`.

---

## 16) API

* **No se expone API pública**. Todo se resuelve con **Server Actions/Route Handlers** internos de Next.js.

---

## 17) Glosario

* **HQ**: local principal.
* **Franquicia**: sede adicional operada por terceros.
* **Mercado**: evento apostable.
* **Opción**: resultado apostable.
* **Ticket**: apuesta individual.
* **Hold%**: 1 − payout/handle.
* **Caja**: movimientos de dinero RP.
