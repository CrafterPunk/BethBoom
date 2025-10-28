﻿# BethBoom Ã¢Â€Â” Hoja de Arquitectura TÃƒÂ©cnica (V1.2 Ã¢Â€Â” lista para IA)

> Contexto: Web interna para gestionar apuestas en el servidor de GTA V RP. Este documento estÃƒÂ¡ optimizado para que una IA lo use como **contexto persistente** durante el desarrollo.

---

## 0) Alcance y modelo operativo

* **Web interna** para **trabajadores** de BethBoom (no cara al cliente). Sin integraciÃƒÂ³n con el juego.
* **Locales**: 1 **Local Principal (HQ)** + **Franquicias** (agregadas/retiradas segÃƒÂºn RP). Todas las reglas son **globales** y aplican a cualquier nueva franquicia a menos que se parametrice distinto en el mercado.
* **Objetivo**: registrar tickets, calcular pagos, operar caja por trabajador, ajustar cuotas por sesgo, y obtener reportes por sede/trabajador/apostador.
* **Comprobantes**: no se imprimen ni QR. El sistema solo deja **constancia** de lo ocurrido.
* **Seguridad** mÃƒÂ­nima (juego RP): email+password, sin 2FA ni verificaciÃƒÂ³n.

---

## 1) Actores, roles y permisos

**Roles definitivos** (de mayor a menor):

1. **Admin General** (DueÃƒÂ±o/s): superusuario(s). Crea/edita/elimina todo. Ajusta parÃƒÂ¡metros globales. Puede borrar logs. Aprueba cierres de caja.
2. **Trabajador/Vendedor**: abre/cierra su caja (solicita cierre), registra tickets, paga premios.
3. **Auditor General**: solo lectura de todas las sedes, incluidos logs y reportes.
4. **Auditor de Franquicia (opcional)**: solo lectura de **una** franquicia (reportes, mercados, caja, logs de su sede).

> **IdentificaciÃƒÂ³n / Acceso (sin autenticaciÃƒÂ³n clÃƒÂ¡sica)**

* No hay email/contraseÃƒÂ±a. Cada usuario usa un **AccessCode** (cÃƒÂ³digo ÃƒÂºnico) para identificarse.
* Flujo: pantalla de acceso Ã¢Â†Â’ ingresar **AccessCode** Ã¢Â†Â’ se crea **sesiÃƒÂ³n firmada** (cookie httpOnly).
* Los **AccessCodes** se gestionan desde **Admin Ã¢Â†Â’ Usuarios** (crear, revocar, rotar). TambiÃƒÂ©n se puede **importar/exportar JSON** **solo de usuarios** y sus permisos (no de parÃƒÂ¡metros).
* Campos de usuario: `display_name`, `rol`, `franquicia_id?`, `access_code` (hash en DB), `estado`.

---

## 2) Reglas de negocio

* **Mercados**

  * Campos: `nombre`, `descripcion` (condiciÃƒÂ³n de victoria), `tipo` (POOL|ODDS), `estado` (abierto|suspendido|cerrado), `fee_pct`, `franchise_share_pct` (participaciÃƒÂ³n para el dueÃƒÂ±o de la franquicia), `umbral_recalc_monto` (para ODDS), `franquicia_scope` (GLOBAL|SEDE), `sede_id?`, `starts_at?`, `ends_at?`.
  * **Sin categorÃƒÂ­as ni imÃƒÂ¡genes**.
  * CreaciÃƒÂ³n/ediciÃƒÂ³n: Admin General. Cierre/SuspensiÃƒÂ³n: Admin General. (Sentido comÃƒÂºn aplicado para excepciones.)
* **Opciones**: mÃƒÂ­n. 2 por mercado; en **POOL** no tienen cuota; en **ODDS** `cuota_inicial` y `cuota_actual`.
* **Tickets**

  * Moneda: **USD** sin decimales (enteros).
  * **LÃƒÂ­mites por ticket basados en Rango de Cliente** (ver Ã‚Â§2.1): mÃƒÂ­nimos y mÃƒÂ¡ximos se aplican segÃƒÂºn el rango del **apostador**.
  * EdiciÃƒÂ³n/anulaciÃƒÂ³n **antes del cierre** del mercado (siempre con motivo y log).
* **Fee**

  * `fee_pct` **global por mercado**, **default 12%** (editable por el creador del mercado).
  * **ParticipaciÃƒÂ³n de franquicia** (`franchise_share_pct`): **editable por convenio** con cada dueÃƒÂ±o; **default 50%** del fee.
* **Pozo comÃƒÂºn (POOL)**

  * Pozo neto = `total_apostado * (1 - fee_pct)`.
  * Pago ticket ganador = `Pozo neto * (monto_ticket / suma_montos_ganadores)`.
  * **Redondeo**: hacia abajo a **entero** (sin decimales).
* **Cuotas variables (ODDS)**

  * Ajuste **automÃƒÂ¡tico por monto acumulado**: cuando el mercado acumula `umbral_recalc_monto` desde el ÃƒÂºltimo recÃƒÂ¡lculo (o apertura), se recalculan cuotas.
  * **Umbral por defecto**: **30Ã¢Â€Â¯000** (editable por el creador de mercado y rangos superiores).
  * **LÃƒÂ­mites de cuota**: `min=1.20`, `max=5.00`.
  * **FÃƒÂ³rmula recomendada** en Ã‚Â§5.3. Sesgo sobre **total histÃƒÂ³rico**.
* **Caja**

  * **Apertura de caja por Trabajador** Ã¢Â†Â’ operaciÃƒÂ³n Ã¢Â†Â’ **Solicitud de cierre** Ã¢Â†Â’ **AprobaciÃƒÂ³n por Admin** (cuadre). Un solo arqueo de caja **de cada vendedor contra los dueÃƒÂ±os** cuando se solicita.
  * Caja por franquicia y por trabajador (arqueos, saldos, egresos/ingresos).
* **AuditorÃƒÂ­a**

  * Logs de todas las acciones (quiÃƒÂ©n, cuÃƒÂ¡ndo, quÃƒÂ©, antes/despuÃƒÂ©s, IP/huella). EliminaciÃƒÂ³n manual solo por Admin. **Sin retenciÃƒÂ³n automÃƒÂ¡tica**.

### 2.1 Rango de Cliente (niveles)

* **Total de 5 rangos**. **Default**: el cliente inicia en **Rango 1** y **sube 1 rango cada 30 apuestas** realizadas (conteo global).
* **AsignaciÃƒÂ³n directa**: los dueÃƒÂ±os pueden promover/degradar manualmente.
* **Visibilidad**: nombres de rangos y condiciones visibles para trabajadores.
* **Nombres y lÃƒÂ­mites por rango (defaults, editables)**:

  * **R1 Ã¢Â€Â“ Bronce**: mÃƒÂ­n **1Ã¢Â€Â¯000** / mÃƒÂ¡x **10Ã¢Â€Â¯000** USD
  * **R2 Ã¢Â€Â“ Plata**: mÃƒÂ­n **1Ã¢Â€Â¯000** / mÃƒÂ¡x **20Ã¢Â€Â¯000** USD
  * **R3 Ã¢Â€Â“ Oro**: mÃƒÂ­n **1Ã¢Â€Â¯000** / mÃƒÂ¡x **50Ã¢Â€Â¯000** USD
  * **R4 Ã¢Â€Â“ Diamante**: mÃƒÂ­n **1Ã¢Â€Â¯000** / mÃƒÂ¡x **100Ã¢Â€Â¯000** USD
  * **R5 Ã¢Â€Â“ Super VIP**: mÃƒÂ­n **1Ã¢Â€Â¯000** / mÃƒÂ¡x **250Ã¢Â€Â¯000** USD
* Estos valores son **defaults** y pueden editarse por el **Admin**.

## 3) KPIs del Dashboard (portada)

1. **Hold% global** y por sede.
2. **Volumen apostado** (hoy/7d/30d) global y por sede.
3. **Beneficio neto** (hoy/7d/30d) global y por sede.
4. **Tickets por estado** (activos/cerrados/pagados/anulados) y **promociones de rango** activas.
5. **Top Trabajador** por beneficio neto (7d) y **Top Apostador** por ganancia/pÃƒÂ©rdida (30d).

--- del Dashboard (portada)

1. **Hold% global** y por sede.
2. **Volumen apostado** (hoy/7d/30d) global y por sede.
3. **Beneficio neto** (hoy/7d/30d) global y por sede.
4. **Tickets por estado** (activos/cerrados/pagados/anulados) y **promociones de rango** activas.
5. **Top Trabajador** por beneficio neto (7d) y **Top Apostador** por ganancia/pÃƒÂ©rdida (30d).

--- del Dashboard (portada)

1. **Hold% global** (beneficio/venta) y por sede.
2. **Volumen apostado** (hoy, 7d, 30d) global y por sede.
3. **Beneficio neto** (hoy, 7d, 30d) global y por sede.
4. **Tickets**: activos / cerrados / pagados / anulados (hoy).
5. **Top Trabajador** por beneficio neto (7d) y **Top Apostador** por ganancia/pÃƒÂ©rdida (30d).

---

## 4) Flujos operativos (MVP)

1. **Turno**: Trabajador abre caja Ã¢Â†Â’ sistema inicia saldo inicial.
2. **Venta**: seleccionar mercado Ã¢Â†Â’ opciÃƒÂ³n Ã¢Â†Â’ ingresar monto Ã¢Â†Â’ validar lÃƒÂ­mites Ã¢Â†Â’ confirmar ticket Ã¢Â†Â’ registrar en caja.
3. **Recalc ODDS**: al alcanzar el **umbral de monto** desde el ÃƒÂºltimo recÃƒÂ¡lculo, sistema sugiere nuevas cuotas y aplica automÃƒÂ¡ticamente (o manual con toggle global).
4. **Cierre de mercado**: marcar ganador(es) Ã¢Â†Â’ calcular pagos (POOL u ODDS) Ã¢Â†Â’ generar lista de tickets ganadores pendientes.
5. **Pago**: Trabajador paga Ã¢Â†Â’ registra pago Ã¢Â†Â’ afecta caja.
6. **Cierre de turno**: Trabajador solicita cierre Ã¢Â†Â’ Manager revisa Ã¢Â†Â’ confirma cuadre (o registra diferencia).

---

## 5) Modelo de datos (Prisma / SQL)

### 5.1 Entidades

* **User** {id, display_name, rol: ('ADMIN'|'WORKER'|'AUDITOR_GLOBAL'|'AUDITOR_FRANQUICIA'), franquicia_id?, access_code_hash, estado, created_at}
* **Franquicia** {id, nombre, codigo, estado, created_at, franchise_share_pct_default}
* **Mercado** {id, nombre, descripcion, tipo:('POOL'|'ODDS'), estado, fee_pct, franchise_share_pct_override?, umbral_recalc_monto, franquicia_scope:('GLOBAL'|'SEDE'), sede_id?, starts_at?, ends_at?, created_at}
* **Opcion** {id, mercado_id, nombre, cuota_inicial?, cuota_actual?, created_at}
* **Apostador** {id, alias (ÃƒÂºnico), rango:1..5, apuestas_total, created_at}
* **Ticket** {id, mercado_id, opcion_id, franquicia_id, trabajador_id, apostador_id, monto, cuota_fijada?, estado:('ACTIVO'|'ANULADO'|'PAGADO'), created_at}
* **Pago** {id, ticket_id, pagador_id, pagado_at}
* **CajaMovimiento** {id, franquicia_id, trabajador_id?, tipo:('APERTURA'|'INGRESO'|'EGRESO'|'AJUSTE'|'CIERRE'), monto, ref_tipo?, ref_id?, created_at}
* **RankRegla** {id, nombre, orden, min_apuestas_acumuladas, min_monto?, max_monto, activo}
* **OddUpdate** {id, opcion_id, sesgo, antes, despues, motivo, actor_id?, created_at}
* **AuditLog** {id, actor_id, accion, entidad, entidad_id, antes, despues, ip, created_at}

### 5.2 ÃƒÂndices crÃƒÂ­ticos

* `Ticket(mercado_id, estado)`; `Opcion(mercado_id)`; `Apostador(rango)`; `CajaMovimiento(franquicia_id, created_at)`; `AuditLog(created_at)`; `User(rol, franquicia_id)`.

### 5.3 FÃƒÂ³rmula de cuotas (ODDS)

* Sesgo por opciÃƒÂ³n = `monto_opcion / monto_total` (sobre **total histÃƒÂ³rico** del mercado).
* Cuota sugerida = `clamp(base / (k1 + k2*sesgo), min, max)` con `base=2.0`, `k1=0.6`, `k2=0.8`, `min=1.20`, `max=5.00` y `delta_max=0.25` por recÃƒÂ¡lculo.

### 5.4 Pagos (POOL)

* Pozo neto = `sum(montos) * (1 - fee_pct)`; pago por ticket ganador = `Pozo neto * (monto_ticket / suma_montos_ganadores)`; **redondeo a entero hacia abajo**.

## 6) UI/UX (modo oscuro)

* **Acceso por cÃƒÂ³digo**: input de AccessCode + selecciÃƒÂ³n de franquicia si aplica.
* **Dashboard**: layout segun rol (dueno, trabajador, auditor) con widgets especificos, KPIs clave, alertas ODDS y accesos rapidos.
* **Ventas**: bÃƒÂºsqueda de mercado Ã¢Â†Â’ opciÃƒÂ³n Ã¢Â†Â’ teclado numÃƒÂ©rico Ã¢Â†Â’ validaciones por **rango del apostador**.
* **Feedback ODDS**: si al confirmar el ticket cambian las cuotas por recÃƒÂ¡lculo automÃƒÂ¡tico, el sistema muestra **banner/toast** de cambio (antes Ã¢Â†Â’ despuÃƒÂ©s) y requiere **clic de confirmaciÃƒÂ³n** del vendedor para cerrar el ticket actualizado.
* **Mercados**: lista, crear/editar, suspender, cerrar, historial de cuotas.
* **Pagos**: tickets ganadores pendientes, filtro por sede y por trabajador.
* **Caja**: apertura/cierre por trabajador, capital propio declarado, control de ventas/pagos, bloqueo por saldo y reporte de liquidacion.
* **Apostadores**: ficha con alias unico, control de rango manual/auto, etiquetado de clientes, notas internas e historial de promociones.
* **Reportes**: sede, trabajador, apostador; export CSV/JSON.
* **Admin**: sedes (con `franchise_share_pct_default`), **usuarios y AccessCodes** (CRUD + import/export JSON **solo de usuarios**), parÃƒÂ¡metros globales (fee default, umbral ODDS, delta_max, polÃƒÂ­tica de recÃƒÂ¡lculo), limpieza de logs.
### 6.1 Avances implementados (2025-10-21)

* Ruta `/api/events` marcada como `force-dynamic`/`revalidate 0` y runtime Node para evitar timeouts de prerender en Vercel.

* Ventas del dia y pagos se actualizan en vivo gracias a contadores de sesion (ventasCount/pagosCount) que alimentan cash, dashboard y aprobaciones.
* Cierre de caja incluye liquidacion worker_owes/hq_owes con conteos y resumen detallado en eventos.
* Historial de apostadores muestra ultimas apuestas con balance neto y expira tickets no cobrados tras 7 dias (estado VENCIDO).
* Mercados proximos muestran tiempo restante y se cierran automaticamente al vencer, bloqueando nuevas ventas.


* Navegacion lateral filtra modulos por rol y agrega accesos rapidos en la tarjeta del usuario junto con notificaciones en tiempo real.
* Dashboard usa widgets reutilizables y arma layout especifico para admin, trabajador y auditor sin duplicar consultas.
* Flujo de caja usa capital propio declarado, controla ventas/pagos del dia con bloqueo por saldo disponible, calcula liquidacion worker_owes/hq_owes y registra reporte de cierre para aprobacion admin.
* Apostadores permite etiquetar clientes, alternar promocion automatica, registrar notas internas y revisar historial de promociones con accion de eliminar clara.


--- (modo oscuro)

* **Dashboard**: vistas especificas por rol con KPIs, alertas ODDS y seguimiento de cajas.
* **Ventas rÃƒÂ¡pidas**: bÃƒÂºsqueda de mercado, selecciÃƒÂ³n de opciÃƒÂ³n, teclado numÃƒÂ©rico, validaciones en lÃƒÂ­nea.
* **Mercados**: lista, crear/editar, suspender, cerrar, ver historial de cuotas.
* **Pagos**: tickets ganadores pendientes, filtro por sede y por trabajador.
* **Caja**: apertura/cierre por trabajador, capital propio declarado, control de ventas/pagos, bloqueo por saldo y reporte de liquidacion.
* **Reportes**: sede, trabajador, apostador; export CSV/JSON.
* **Admin**: sedes, usuarios, parÃƒÂ¡metros globales (fee default, franchise_share_pct default, lÃƒÂ­mites, umbral ODDS, delta_max, polÃƒÂ­tica de recÃƒÂ¡lculo total vs incremental), limpieza de logs.

---

## 7) Stack tÃƒÂ©cnico (mÃƒÂ­nimo y entendible)

* **App FullÃ¢Â€Â‘stack**: **Next.js 14 (App Router) + TypeScript** con **Server Actions/Route Handlers** (sin backend separado).
* **UI**: TailwindCSS + shadcn/ui. Modo oscuro por defecto.
* **DB**: **Supabase (PostgreSQL)**.
* **ORM**: Prisma.
* **Acceso**: **AccessCode** propio (sin NextAuth). SesiÃƒÂ³n firmada (jsonwebtoken + cookie httpOnly) con expiraciÃƒÂ³n simple.
* **Hosting**: **Vercel** (app) + **Supabase** (DB). Alternativa: Railway (DB) + Vercel si hace falta.
* **Logs**: tabla `AuditLog` en DB.

> Racional: un solo repo, cero servicios extra, IA puede operar todo el ciclo.

---

## 8) Repositorio y flujo GitHub (con forks)

* **Un (1) repo**.
* Branching: `main` (prod), `staging` (pre), `feat/*`.
* Cada dev trabaja en **fork** y abre **PR** al repo principal.
* **PR mÃƒÂ­nimo**: 1 review + CI (lint, typecheck, build). Squash & merge.

---

## 9) Entornos, CI/CD y configuraciÃƒÂ³n

* **Entornos**: Local, Staging, Prod.
* **CI**: GitHub Actions Ã¢Â†Â’ `pnpm lint` + `pnpm typecheck` + `pnpm build`.
* **CD**: Vercel despliega `staging` y `main` automÃƒÂ¡ticamente. Variables `.env` por entorno (guardadas en Vercel/Supabase).
* **Migraciones**: Prisma Migrate corriendo en deploy (postÃ¢Â€Â‘deploy hook) o manual desde CI para `staging/main`.

---

## 10) Testing y calidad (mÃƒÂ­nimo ÃƒÂºtil)

* **Unit tests** con Vitest en reglas puras (cÃƒÂ¡lculo de pagos/odds/validaciones).
* **Playwright** (bÃƒÂ¡sico) para el flujo de venta y cierre de mercado.
* Lint (ESLint), Prettier, `tsc --noEmit`.

---

## 11) Seeds y datos iniciales

* **Usuarios** (AccessCodes de ejemplo):

  * Admin: `owner-AAAA1111` (rotar luego)
  * Trabajador HQ: `sell-HQ-BBBB2222`
  * Auditor General: `audit-CCCC3333`
* **Franquicias**: `HQ (Principal)` (lista vacÃƒÂ­a para crear en RP). `franchise_share_pct_default=50%`.
* **ParÃƒÂ¡metros por defecto**:

  * `fee_pct=12%`.
  * **Rangos**: **Bronce**, **Plata**, **Oro**, **Diamante**, **Super VIP**.
  * `promociÃƒÂ³n_por_conteo_apuestas=30`.
  * LÃƒÂ­mites por rango (ver Ã‚Â§2.1).
  * ODDS: `umbral_recalc_monto=30Ã¢Â€Â¯000`, `odds_min=1.20`, `odds_max=5.00`, `delta_max=0.25`.

## 12) AuditorÃƒÂ­a y logs

* `AuditLog` para todo. **EliminaciÃƒÂ³n manual** solo por Admin. Sin retenciÃƒÂ³n automÃƒÂ¡tica.

---

* **AuditLog** a nivel de DB para cualquier acciÃƒÂ³n sensible.
* **EliminaciÃƒÂ³n manual** de logs solo por **Admin General** (sin retenciÃƒÂ³n automÃƒÂ¡tica).

---

## 13) Riesgos y decisiones

* **CaÃƒÂ­das de servicio**: aceptadas como parte del RP. Mantener scripts de seed para restaurar rÃƒÂ¡pido.
* **Pagos altos**: **sin doble confirmaciÃƒÂ³n** por decisiÃƒÂ³n de negocio.
* **Seguridad baja**: intencional por alcance RP; aÃƒÂºn asÃƒÂ­ se almacenan contraseÃƒÂ±as con hash.

---

## 14) ToÃ¢Â€Â‘Do/Decisiones pendientes (mÃƒÂ­nimas)

* [ ] Confirmar **fee_pct default** (propuesto 12%).
* [ ] Confirmar **franchise_share_pct default** (propuesto 50% del fee para la franquicia).
* [ ] Confirmar **ticket_min/ticket_max** default (propuesto 10 / 10Ã¢Â€Â¯000 USD).
* [ ] Definir si el **recalc ODDS** es **auto** o **manual con confirmaciÃƒÂ³n** (propuesto: **auto**).
* [ ] Definir si el **sesgo** usa **total histÃƒÂ³rico** (propuesto) o **incremental** desde ÃƒÂºltimo recÃƒÂ¡lculo.

---

## 15) Notas para implementaciÃƒÂ³n rÃƒÂ¡pida

* Empezar por **DB + Prisma** (migraciones), luego **Auth (NextAuth Credentials)**, despuÃƒÂ©s **flujos Caja Ã¢Â†Â’ Tickets Ã¢Â†Â’ Cierre Ã¢Â†Â’ Pagos**. Finalmente **Dashboard** y **Reportes**.
* Plantillas de UI simples (shadcn) + validaciones con Zod.
* Feature flags bÃƒÂ¡sicos en `ParametrosGlobales`.

---

## 16) API

* **No se expone API pÃƒÂºblica**. Todo se resuelve con **Server Actions/Route Handlers** internos de Next.js.

---

## 17) Glosario

* **HQ**: local principal.
* **Franquicia**: sede adicional operada por terceros.
* **Mercado**: evento apostable.
* **Opcion**: resultado apostable.
* **Ticket**: apuesta individual.
* **Hold%**: 1 - payout/handle.
* **Caja**: movimientos de dinero RP.

---

## 18) Cambios 2025-10-27 (deploy pendiente)

* **Ticket creado**: mensaje de confirmacion ahora incluye icono para copiar el codigo al portapapeles y dispara toast "Codigo copiado".
* **Montos en USD**: inputs usan mascara con separador de miles y vistas muestran formato consistente (`formatCurrency` centralizado).
* **Landing publica**: nueva ruta de mercados abierta con login compacto, countdown por mercado, estados Abierto/Suspendido y descripcion segun tipo de apuesta (pool vs momios).
* **Buscador de tickets**: disponible en la landing publica; devuelve estado, mercado, montos y payouts potencial/real.
* **Shell autenticado**: agrega enlace "Mercados publicos" para usuarios con sesion iniciada.
* **Mercados**: tarjetas muestran badge con tiempo restante; al quedar en cero pasan a "Suspendido" y solo se listan abiertos/suspendidos para visitantes.
* **Cash - solicitud de cierre**: resumen incluye contadores visuales de tickets y pagos, y mensajes de delta traducidos (enviar a HQ / devolverte / balanceado).
* **Cash - dashboard**: tarjetas de ventas/pagos del dia usan los nuevos contadores y corrigen el calculo (solo tickets del dia con estado valido).
* **Pagos**: al liquidar un ticket ganador se calcula comision 5%, se muestra desglose (payout bruto, comision, total a entregar) y el total neto registrado en caja.
* **Historial de apuestas**: tickets perdedores aparecen como "Perdido" en rojo; pagados permanecen en verde.
* **Toast global**: se incluye `ToastProvider` y hook `useToast` para notificaciones reutilizables en cliente.
