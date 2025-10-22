CREATE TYPE "CajaLiquidacionTipo" AS ENUM ('BALANCEADO', 'WORKER_OWES', 'HQ_OWES');

ALTER TABLE "CajaSesion"
  ADD COLUMN "capitalPropio" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ventasTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pagosTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "liquidacionTipo" "CajaLiquidacionTipo",
  ADD COLUMN "liquidacionMonto" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reporteCierre" JSONB;

UPDATE "CajaSesion"
SET "capitalPropio" = COALESCE("saldoInicial", 0);

WITH movimientos AS (
  SELECT "cajaSesionId" AS id,
    COALESCE(SUM(CASE WHEN "tipo" = 'INGRESO' THEN "monto" ELSE 0 END), 0) AS ventas,
    COALESCE(SUM(CASE WHEN "tipo" = 'EGRESO' THEN "monto" ELSE 0 END), 0) AS pagos
  FROM "CajaMovimiento"
  WHERE "cajaSesionId" IS NOT NULL
  GROUP BY "cajaSesionId"
)
UPDATE "CajaSesion" cs
SET "ventasTotal" = m.ventas,
    "pagosTotal" = m.pagos
FROM movimientos m
WHERE m.id = cs."id";

UPDATE "CajaSesion"
SET "liquidacionMonto" = CASE
    WHEN "ventasTotal" - "pagosTotal" > "capitalPropio" THEN ("ventasTotal" - "pagosTotal") - "capitalPropio"
    WHEN "pagosTotal" > ("ventasTotal" + "capitalPropio") THEN "pagosTotal" - ("ventasTotal" + "capitalPropio")
    ELSE 0
  END,
    "liquidacionTipo" = CASE
    WHEN "ventasTotal" - "pagosTotal" > "capitalPropio" THEN 'WORKER_OWES'
    WHEN "pagosTotal" > ("ventasTotal" + "capitalPropio") THEN 'HQ_OWES'
    WHEN "estado" = 'CERRADA' THEN 'BALANCEADO'
    ELSE NULL
  END::"CajaLiquidacionTipo"
WHERE "estado" = 'CERRADA';

UPDATE "CajaSesion"
SET "reporteCierre" = jsonb_build_object(
  'capitalPropio', "capitalPropio",
  'ventas', "ventasTotal",
  'pagos', "pagosTotal",
  'saldoDisponible', ("capitalPropio" + "ventasTotal" - "pagosTotal"),
  'liquidacionTipo', "liquidacionTipo",
  'liquidacionMonto', "liquidacionMonto"
)
WHERE "estado" = 'CERRADA';

ALTER TABLE "CajaSesion"
  DROP COLUMN "saldoInicial",
  DROP COLUMN "saldoDeclarado",
  DROP COLUMN "saldoSistema",
  DROP COLUMN "diferencia";
