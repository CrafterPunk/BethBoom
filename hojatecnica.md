# BethBoom â Hoja de Arquitectura TÃ©cnica (V1.2 â lista para IA)

> Contexto: Web interna para gestionar apuestas en el servidor de GTA V RP. Este documento estÃ¡ optimizado para que una IA lo use como **contexto persistente** durante el desarrollo.

---

## 0) Alcance y modelo operativo

* **Web interna** para **trabajadores** de BethBoom (no cara al cliente). Sin integraciÃ³n con el juego.
* **Locales**: 1 **Local Principal (HQ)** + **Franquicias** (agregadas/retiradas segÃºn RP). Todas las reglas son **globales** y aplican a cualquier nueva franquicia a menos que se parametrice distinto en el mercado.
* **Objetivo**: registrar tickets, calcular pagos, operar caja por trabajador, ajustar cuotas por sesgo, y obtener reportes por sede/trabajador/apostador.
* **Comprobantes**: no se imprimen ni QR. El sistema solo deja **constancia** de lo ocurrido.
* **Seguridad** mÃ­nima (juego RP): email+password, sin 2FA ni verificaciÃ³n.

---

## 1) Actores, roles y permisos

**Roles definitivos** (de mayor a menor):

1. **Admin General** (DueÃ±o/s): superusuario(s). Crea/edita/elimina todo. Ajusta parÃ¡metros globales. Puede borrar logs. Aprueba cierres de caja.
2. **Trabajador/Vendedor**: abre/cierra su caja (solicita cierre), registra tickets, paga premios.
3. **Auditor General**: solo lectura de todas las sedes, incluidos logs y reportes.
4. **Auditor de Franquicia (opcional)**: solo lectura de **una** franquicia (reportes, mercados, caja, logs de su sede).

> **IdentificaciÃ³n / Acceso (sin autenticaciÃ³n clÃ¡sica)**

* No hay email/contraseÃ±a. Cada usuario usa un **AccessCode** (cÃ³digo Ãºnico) para identificarse.
* Flujo: pantalla de acceso â ingresar **AccessCode** â se crea **sesiÃ³n firmada** (cookie httpOnly).
* Los **AccessCodes** se gestionan desde **Admin â Usuarios** (crear, revocar, rotar). TambiÃ©n se puede **importar/exportar JSON** **solo de usuarios** y sus permisos (no de parÃ¡metros).
* Campos de usuario: `display_name`, `rol`, `franquicia_id?`, `access_code` (hash en DB), `estado`.

---

## 2) Reglas de negocio

* **Mercados**

  * Campos: `nombre`, `descripcion` (condiciÃ³n de victoria), `tipo` (POOL|ODDS), `estado` (abierto|suspendido|cerrado), `fee_pct`, `franchise_share_pct` (participaciÃ³n para el dueÃ±o de la franquicia), `umbral_recalc_monto` (para ODDS), `franquicia_scope` (GLOBAL|SEDE), `sede_id?`, `starts_at?`, `ends_at?`.
  * **Sin categorÃ­as ni imÃ¡genes**.
  * CreaciÃ³n/ediciÃ³n: Admin General. Cierre/SuspensiÃ³n: Admin General. (Sentido comÃºn aplicado para excepciones.)
* **Opciones**: mÃ­n. 2 por mercado; en **POOL** no tienen cuota; en **ODDS** `cuota_inicial` y `cuota_actual`.
* **Tickets**

  * Moneda: **USD** sin decimales (enteros).
  * **LÃ­mites por ticket basados en Rango de Cliente** (ver Â§2.1): mÃ­nimos y mÃ¡ximos se aplican segÃºn el rango del **apostador**.
  * EdiciÃ³n/anulaciÃ³n **antes del cierre** del mercado (siempre con motivo y log).
* **Fee**

  * `fee_pct` **global por mercado**, **default 12%** (editable por el creador del mercado).
  * **ParticipaciÃ³n de franquicia** (`franchise_share_pct`): **editable por convenio** con cada dueÃ±o; **default 50%** del fee.
* **Pozo comÃºn (POOL)**

  * Pozo neto = `total_apostado * (1 - fee_pct)`.
  * Pago ticket ganador = `Pozo neto * (monto_ticket / suma_montos_ganadores)`.
  * **Redondeo**: hacia abajo a **entero** (sin decimales).
* **Cuotas variables (ODDS)**

  * Ajuste **automÃ¡tico por monto acumulado**: cuando el mercado acumula `umbral_recalc_monto` desde el Ãºltimo recÃ¡lculo (o apertura), se recalculan cuotas.
  * **Umbral por defecto**: **30â¯000** (editable por el creador de mercado y rangos superiores).
  * **LÃ­mites de cuota**: `min=1.20`, `max=5.00`.
  * **FÃ³rmula recomendada** en Â§5.3. Sesgo sobre **total histÃ³rico**.
* **Caja**

  * **Apertura de caja por Trabajador** â operaciÃ³n â **Solicitud de cierre** â **AprobaciÃ³n por Admin** (cuadre). Un solo arqueo de caja **de cada vendedor contra los dueÃ±os** cuando se solicita.
  * Caja por franquicia y por trabajador (arqueos, saldos, egresos/ingresos).
* **AuditorÃ­a**

  * Logs de todas las acciones (quiÃ©n, cuÃ¡ndo, quÃ©, antes/despuÃ©s, IP/huella). EliminaciÃ³n manual solo por Admin. **Sin retenciÃ³n automÃ¡tica**.

### 2.1 Rango de Cliente (niveles)

* **Total de 5 rangos**. **Default**: el cliente inicia en **Rango 1** y **sube 1 rango cada 30 apuestas** realizadas (conteo global).
* **AsignaciÃ³n directa**: los dueÃ±os pueden promover/degradar manualmente.
* **Visibilidad**: nombres de rangos y condiciones visibles para trabajadores.
* **Nombres y lÃ­mites por rango (defaults, editables)**:

  * **R1 â Bronce**: mÃ­n **1â¯000** / mÃ¡x **10â¯000** USD
  * **R2 â Plata**: mÃ­n **1â¯000** / mÃ¡x **20â¯000** USD
  * **R3 â Oro**: mÃ­n **1â¯000** / mÃ¡x **50â¯000** USD
  * **R4 â Diamante**: mÃ­n **1â¯000** / mÃ¡x **100â¯000** USD
  * **R5 â Super VIP**: mÃ­n **1â¯000** / mÃ¡x **250â¯000** USD
* Estos valores son **defaults** y pueden editarse por el **Admin**.

## 3) KPIs del Dashboard (portada)

1. **Hold% global** y por sede.
2. **Volumen apostado** (hoy/7d/30d) global y por sede.
3. **Beneficio neto** (hoy/7d/30d) global y por sede.
4. **Tickets por estado** (activos/cerrados/pagados/anulados) y **promociones de rango** activas.
5. **Top Trabajador** por beneficio neto (7d) y **Top Apostador** por ganancia/pÃ©rdida (30d).

--- del Dashboard (portada)

1. **Hold% global** y por sede.
2. **Volumen apostado** (hoy/7d/30d) global y por sede.
3. **Beneficio neto** (hoy/7d/30d) global y por sede.
4. **Tickets por estado** (activos/cerrados/pagados/anulados) y **promociones de rango** activas.
5. **Top Trabajador** por beneficio neto (7d) y **Top Apostador** por ganancia/pÃ©rdida (30d).

--- del Dashboard (portada)

1. **Hold% global** (beneficio/venta) y por sede.
2. **Volumen apostado** (hoy, 7d, 30d) global y por sede.
3. **Beneficio neto** (hoy, 7d, 30d) global y por sede.
4. **Tickets**: activos / cerrados / pagados / anulados (hoy).
5. **Top Trabajador** por beneficio neto (7d) y **Top Apostador** por ganancia/pÃ©rdida (30d).

---

## 4) Flujos operativos (MVP)

1. **Turno**: Trabajador abre caja â sistema inicia saldo inicial.
2. **Venta**: seleccionar mercado â opciÃ³n â ingresar monto â validar lÃ­mites â confirmar ticket â registrar en caja.
3. **Recalc ODDS**: al alcanzar el **umbral de monto** desde el Ãºltimo recÃ¡lculo, sistema sugiere nuevas cuotas y aplica automÃ¡ticamente (o manual con toggle global).
4. **Cierre de mercado**: marcar ganador(es) â calcular pagos (POOL u ODDS) â generar lista de tickets ganadores pendientes.
5. **Pago**: Trabajador paga â registra pago â afecta caja.
6. **Cierre de turno**: Trabajador solicita cierre â Manager revisa â confirma cuadre (o registra diferencia).

---

## 5) Modelo de datos (Prisma / SQL)

### 5.1 Entidades

* **User** {id, display_name, rol: ('ADMIN'|'WORKER'|'AUDITOR_GLOBAL'|'AUDITOR_FRANQUICIA'), franquicia_id?, access_code_hash, estado, created_at}
* **Franquicia** {id, nombre, codigo, estado, created_at, franchise_share_pct_default}
* **Mercado** {id, nombre, descripcion, tipo:('POOL'|'ODDS'), estado, fee_pct, franchise_share_pct_override?, umbral_recalc_monto, franquicia_scope:('GLOBAL'|'SEDE'), sede_id?, starts_at?, ends_at?, created_at}
* **Opcion** {id, mercado_id, nombre, cuota_inicial?, cuota_actual?, created_at}
* **Apostador** {id, alias (Ãºnico), rango:1..5, apuestas_total, created_at}
* **Ticket** {id, mercado_id, opcion_id, franquicia_id, trabajador_id, apostador_id, monto, cuota_fijada?, estado:('ACTIVO'|'ANULADO'|'PAGADO'), created_at}
* **Pago** {id, ticket_id, pagador_id, pagado_at}
* **CajaMovimiento** {id, franquicia_id, trabajador_id?, tipo:('APERTURA'|'INGRESO'|'EGRESO'|'AJUSTE'|'CIERRE'), monto, ref_tipo?, ref_id?, created_at}
* **RankRegla** {id, nombre, orden, min_apuestas_acumuladas, min_monto?, max_monto, activo}
* **OddUpdate** {id, opcion_id, sesgo, antes, despues, motivo, actor_id?, created_at}
* **AuditLog** {id, actor_id, accion, entidad, entidad_id, antes, despues, ip, created_at}

### 5.2 Ãndices crÃ­ticos

* `Ticket(mercado_id, estado)`; `Opcion(mercado_id)`; `Apostador(rango)`; `CajaMovimiento(franquicia_id, created_at)`; `AuditLog(created_at)`; `User(rol, franquicia_id)`.

### 5.3 FÃ³rmula de cuotas (ODDS)

* Sesgo por opciÃ³n = `monto_opcion / monto_total` (sobre **total histÃ³rico** del mercado).
* Cuota sugerida = `clamp(base / (k1 + k2*sesgo), min, max)` con `base=2.0`, `k1=0.6`, `k2=0.8`, `min=1.20`, `max=5.00` y `delta_max=0.25` por recÃ¡lculo.

### 5.4 Pagos (POOL)

* Pozo neto = `sum(montos) * (1 - fee_pct)`; pago por ticket ganador = `Pozo neto * (monto_ticket / suma_montos_ganadores)`; **redondeo a entero hacia abajo**.

## 6) UI/UX (modo oscuro)

* **Acceso por cÃ³digo**: input de AccessCode + selecciÃ³n de franquicia si aplica.
* **Dashboard**: layout segun rol (dueno, trabajador, auditor) con widgets especificos, KPIs clave, alertas ODDS y accesos rapidos.
* **Ventas**: bÃºsqueda de mercado â opciÃ³n â teclado numÃ©rico â validaciones por **rango del apostador**.
* **Feedback ODDS**: si al confirmar el ticket cambian las cuotas por recÃ¡lculo automÃ¡tico, el sistema muestra **banner/toast** de cambio (antes â despuÃ©s) y requiere **clic de confirmaciÃ³n** del vendedor para cerrar el ticket actualizado.
* **Mercados**: lista, crear/editar, suspender, cerrar, historial de cuotas.
* **Pagos**: tickets ganadores pendientes, filtro por sede y por trabajador.
* **Caja**: apertura/cierre por trabajador, capital propio declarado, control de ventas/pagos, bloqueo por saldo y reporte de liquidacion.
* **Apostadores**: ficha con alias unico, control de rango manual/auto, etiquetado de clientes, notas internas e historial de promociones.
* **Reportes**: sede, trabajador, apostador; export CSV/JSON.
* **Admin**: sedes (con `franchise_share_pct_default`), **usuarios y AccessCodes** (CRUD + import/export JSON **solo de usuarios**), parÃ¡metros globales (fee default, umbral ODDS, delta_max, polÃ­tica de recÃ¡lculo), limpieza de logs.
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
* **Ventas rÃ¡pidas**: bÃºsqueda de mercado, selecciÃ³n de opciÃ³n, teclado numÃ©rico, validaciones en lÃ­nea.
* **Mercados**: lista, crear/editar, suspender, cerrar, ver historial de cuotas.
* **Pagos**: tickets ganadores pendientes, filtro por sede y por trabajador.
* **Caja**: apertura/cierre por trabajador, capital propio declarado, control de ventas/pagos, bloqueo por saldo y reporte de liquidacion.
* **Reportes**: sede, trabajador, apostador; export CSV/JSON.
* **Admin**: sedes, usuarios, parÃ¡metros globales (fee default, franchise_share_pct default, lÃ­mites, umbral ODDS, delta_max, polÃ­tica de recÃ¡lculo total vs incremental), limpieza de logs.

---

## 7) Stack tÃ©cnico (mÃ­nimo y entendible)

* **App Fullâstack**: **Next.js 14 (App Router) + TypeScript** con **Server Actions/Route Handlers** (sin backend separado).
* **UI**: TailwindCSS + shadcn/ui. Modo oscuro por defecto.
* **DB**: **Supabase (PostgreSQL)**.
* **ORM**: Prisma.
* **Acceso**: **AccessCode** propio (sin NextAuth). SesiÃ³n firmada (jsonwebtoken + cookie httpOnly) con expiraciÃ³n simple.
* **Hosting**: **Vercel** (app) + **Supabase** (DB). Alternativa: Railway (DB) + Vercel si hace falta.
* **Logs**: tabla `AuditLog` en DB.

> Racional: un solo repo, cero servicios extra, IA puede operar todo el ciclo.

---

## 8) Repositorio y flujo GitHub (con forks)

* **Un (1) repo**.
* Branching: `main` (prod), `staging` (pre), `feat/*`.
* Cada dev trabaja en **fork** y abre **PR** al repo principal.
* **PR mÃ­nimo**: 1 review + CI (lint, typecheck, build). Squash & merge.

---

## 9) Entornos, CI/CD y configuraciÃ³n

* **Entornos**: Local, Staging, Prod.
* **CI**: GitHub Actions â `pnpm lint` + `pnpm typecheck` + `pnpm build`.
* **CD**: Vercel despliega `staging` y `main` automÃ¡ticamente. Variables `.env` por entorno (guardadas en Vercel/Supabase).
* **Migraciones**: Prisma Migrate corriendo en deploy (postâdeploy hook) o manual desde CI para `staging/main`.

---

## 10) Testing y calidad (mÃ­nimo Ãºtil)

* **Unit tests** con Vitest en reglas puras (cÃ¡lculo de pagos/odds/validaciones).
* **Playwright** (bÃ¡sico) para el flujo de venta y cierre de mercado.
* Lint (ESLint), Prettier, `tsc --noEmit`.

---

## 11) Seeds y datos iniciales

* **Usuarios** (AccessCodes de ejemplo):

  * Admin: `owner-AAAA1111` (rotar luego)
  * Trabajador HQ: `sell-HQ-BBBB2222`
  * Auditor General: `audit-CCCC3333`
* **Franquicias**: `HQ (Principal)` (lista vacÃ­a para crear en RP). `franchise_share_pct_default=50%`.
* **ParÃ¡metros por defecto**:

  * `fee_pct=12%`.
  * **Rangos**: **Bronce**, **Plata**, **Oro**, **Diamante**, **Super VIP**.
  * `promociÃ³n_por_conteo_apuestas=30`.
  * LÃ­mites por rango (ver Â§2.1).
  * ODDS: `umbral_recalc_monto=30â¯000`, `odds_min=1.20`, `odds_max=5.00`, `delta_max=0.25`.

## 12) AuditorÃ­a y logs

* `AuditLog` para todo. **EliminaciÃ³n manual** solo por Admin. Sin retenciÃ³n automÃ¡tica.

---

* **AuditLog** a nivel de DB para cualquier acciÃ³n sensible.
* **EliminaciÃ³n manual** de logs solo por **Admin General** (sin retenciÃ³n automÃ¡tica).

---

## 13) Riesgos y decisiones

* **CaÃ­das de servicio**: aceptadas como parte del RP. Mantener scripts de seed para restaurar rÃ¡pido.
* **Pagos altos**: **sin doble confirmaciÃ³n** por decisiÃ³n de negocio.
* **Seguridad baja**: intencional por alcance RP; aÃºn asÃ­ se almacenan contraseÃ±as con hash.

---

## 14) ToâDo/Decisiones pendientes (mÃ­nimas)

* [ ] Confirmar **fee_pct default** (propuesto 12%).
* [ ] Confirmar **franchise_share_pct default** (propuesto 50% del fee para la franquicia).
* [ ] Confirmar **ticket_min/ticket_max** default (propuesto 10 / 10â¯000 USD).
* [ ] Definir si el **recalc ODDS** es **auto** o **manual con confirmaciÃ³n** (propuesto: **auto**).
* [ ] Definir si el **sesgo** usa **total histÃ³rico** (propuesto) o **incremental** desde Ãºltimo recÃ¡lculo.

---

## 15) Notas para implementaciÃ³n rÃ¡pida

* Empezar por **DB + Prisma** (migraciones), luego **Auth (NextAuth Credentials)**, despuÃ©s **flujos Caja â Tickets â Cierre â Pagos**. Finalmente **Dashboard** y **Reportes**.
* Plantillas de UI simples (shadcn) + validaciones con Zod.
* Feature flags bÃ¡sicos en `ParametrosGlobales`.

---

## 16) API

* **No se expone API pÃºblica**. Todo se resuelve con **Server Actions/Route Handlers** internos de Next.js.

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
* **Build**: se normalizaron archivos `ventas`/layout en UTF-8 + LF, se anadieron `.editorconfig` y `.gitattributes` para forzar codificacion/line endings coherentes y desbloquear el deploy.
* **Caja - aprobaciones**: el cierre recalcula ventas/pagos netos antes de enviarse; el panel de admin refleja la misma liquidacion y el login ya no exhibe AccessCodes de ejemplo.
