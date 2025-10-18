-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('ADMIN_GENERAL', 'TRABAJADOR', 'AUDITOR_GENERAL', 'AUDITOR_FRANQUICIA');

-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "public"."MercadoTipo" AS ENUM ('POOL', 'ODDS');

-- CreateEnum
CREATE TYPE "public"."MercadoEstado" AS ENUM ('ABIERTO', 'SUSPENDIDO', 'CERRADO');

-- CreateEnum
CREATE TYPE "public"."MercadoScope" AS ENUM ('GLOBAL', 'SEDE');

-- CreateEnum
CREATE TYPE "public"."TicketEstado" AS ENUM ('ACTIVO', 'ANULADO', 'PAGADO');

-- CreateEnum
CREATE TYPE "public"."CajaMovimientoTipo" AS ENUM ('APERTURA', 'INGRESO', 'EGRESO', 'AJUSTE', 'CIERRE');

-- CreateEnum
CREATE TYPE "public"."CajaSesionEstado" AS ENUM ('ABIERTA', 'SOLICITADA', 'CERRADA');

-- CreateTable
CREATE TABLE "public"."Franquicia" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT,
    "franchiseSharePctDefault" DECIMAL(5,2) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Franquicia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL,
    "estado" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "accessCodeHash" TEXT NOT NULL,
    "franquiciaId" TEXT,
    "auditorFranquiciaId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Mercado" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tipo" "public"."MercadoTipo" NOT NULL,
    "estado" "public"."MercadoEstado" NOT NULL DEFAULT 'ABIERTO',
    "feePct" DECIMAL(5,2) NOT NULL DEFAULT 12.00,
    "franchiseSharePct" DECIMAL(5,2) NOT NULL DEFAULT 50.00,
    "umbralRecalcMonto" INTEGER NOT NULL DEFAULT 30000,
    "franquiciaScope" "public"."MercadoScope" NOT NULL DEFAULT 'GLOBAL',
    "sedeId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT,
    "closedAt" TIMESTAMP(3),
    "ganadoraId" TEXT,
    "montoDesdeRecalc" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mercado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Opcion" (
    "id" TEXT NOT NULL,
    "mercadoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cuotaInicial" DECIMAL(6,2),
    "cuotaActual" DECIMAL(6,2),
    "totalApostado" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Apostador" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "rangoId" TEXT NOT NULL,
    "apuestasTotal" INTEGER NOT NULL DEFAULT 0,
    "apuestasAcumuladas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Apostador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RankRegla" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "minApuestasAcumuladas" INTEGER NOT NULL DEFAULT 0,
    "minMonto" INTEGER NOT NULL DEFAULT 1000,
    "maxMonto" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RankRegla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Ticket" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "mercadoId" TEXT NOT NULL,
    "opcionId" TEXT NOT NULL,
    "franquiciaId" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "apostadorId" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "cuotaFijada" DECIMAL(6,2),
    "estado" "public"."TicketEstado" NOT NULL DEFAULT 'ACTIVO',
    "motivoAnulacion" TEXT,
    "anulacionRegistradaPorId" TEXT,
    "anuladoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Pago" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "pagadorId" TEXT NOT NULL,
    "franquiciaId" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "pagadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CajaMovimiento" (
    "id" TEXT NOT NULL,
    "franquiciaId" TEXT NOT NULL,
    "trabajadorId" TEXT,
    "aprobadoPorId" TEXT,
    "cajaSesionId" TEXT,
    "tipo" "public"."CajaMovimientoTipo" NOT NULL,
    "monto" INTEGER NOT NULL,
    "refTipo" TEXT,
    "refId" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CajaMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OddUpdate" (
    "id" TEXT NOT NULL,
    "opcionId" TEXT NOT NULL,
    "sesgo" DECIMAL(6,4) NOT NULL,
    "antes" DECIMAL(6,2),
    "despues" DECIMAL(6,2),
    "motivo" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OddUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ParametroGlobal" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "descripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParametroGlobal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CajaSesion" (
    "id" TEXT NOT NULL,
    "franquiciaId" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "estado" "public"."CajaSesionEstado" NOT NULL DEFAULT 'ABIERTA',
    "saldoInicial" INTEGER NOT NULL,
    "saldoDeclarado" INTEGER,
    "saldoSistema" INTEGER,
    "diferencia" INTEGER,
    "solicitadoAt" TIMESTAMP(3),
    "aprobadoPorId" TEXT,
    "aprobadoAt" TIMESTAMP(3),
    "cerradoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CajaSesion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Franquicia_codigo_key" ON "public"."Franquicia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Mercado_ganadoraId_key" ON "public"."Mercado"("ganadoraId");

-- CreateIndex
CREATE INDEX "Mercado_estado_idx" ON "public"."Mercado"("estado");

-- CreateIndex
CREATE INDEX "Opcion_mercadoId_idx" ON "public"."Opcion"("mercadoId");

-- CreateIndex
CREATE UNIQUE INDEX "Apostador_alias_key" ON "public"."Apostador"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "RankRegla_nombre_key" ON "public"."RankRegla"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "RankRegla_orden_key" ON "public"."RankRegla"("orden");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_codigo_key" ON "public"."Ticket"("codigo");

-- CreateIndex
CREATE INDEX "Ticket_mercadoId_estado_idx" ON "public"."Ticket"("mercadoId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_ticketId_key" ON "public"."Pago"("ticketId");

-- CreateIndex
CREATE INDEX "CajaMovimiento_franquiciaId_createdAt_idx" ON "public"."CajaMovimiento"("franquiciaId", "createdAt");

-- CreateIndex
CREATE INDEX "OddUpdate_opcionId_idx" ON "public"."OddUpdate"("opcionId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ParametroGlobal_clave_key" ON "public"."ParametroGlobal"("clave");

-- CreateIndex
CREATE INDEX "CajaSesion_estado_idx" ON "public"."CajaSesion"("estado");

-- CreateIndex
CREATE INDEX "CajaSesion_trabajadorId_estado_idx" ON "public"."CajaSesion"("trabajadorId", "estado");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_franquiciaId_fkey" FOREIGN KEY ("franquiciaId") REFERENCES "public"."Franquicia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_auditorFranquiciaId_fkey" FOREIGN KEY ("auditorFranquiciaId") REFERENCES "public"."Franquicia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Mercado" ADD CONSTRAINT "Mercado_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "public"."Franquicia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Mercado" ADD CONSTRAINT "Mercado_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Mercado" ADD CONSTRAINT "Mercado_ganadoraId_fkey" FOREIGN KEY ("ganadoraId") REFERENCES "public"."Opcion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Opcion" ADD CONSTRAINT "Opcion_mercadoId_fkey" FOREIGN KEY ("mercadoId") REFERENCES "public"."Mercado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Apostador" ADD CONSTRAINT "Apostador_rangoId_fkey" FOREIGN KEY ("rangoId") REFERENCES "public"."RankRegla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_mercadoId_fkey" FOREIGN KEY ("mercadoId") REFERENCES "public"."Mercado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_opcionId_fkey" FOREIGN KEY ("opcionId") REFERENCES "public"."Opcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_franquiciaId_fkey" FOREIGN KEY ("franquiciaId") REFERENCES "public"."Franquicia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_apostadorId_fkey" FOREIGN KEY ("apostadorId") REFERENCES "public"."Apostador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_anulacionRegistradaPorId_fkey" FOREIGN KEY ("anulacionRegistradaPorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Pago" ADD CONSTRAINT "Pago_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Pago" ADD CONSTRAINT "Pago_pagadorId_fkey" FOREIGN KEY ("pagadorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Pago" ADD CONSTRAINT "Pago_franquiciaId_fkey" FOREIGN KEY ("franquiciaId") REFERENCES "public"."Franquicia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CajaMovimiento" ADD CONSTRAINT "CajaMovimiento_franquiciaId_fkey" FOREIGN KEY ("franquiciaId") REFERENCES "public"."Franquicia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CajaMovimiento" ADD CONSTRAINT "CajaMovimiento_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CajaMovimiento" ADD CONSTRAINT "CajaMovimiento_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CajaMovimiento" ADD CONSTRAINT "CajaMovimiento_cajaSesionId_fkey" FOREIGN KEY ("cajaSesionId") REFERENCES "public"."CajaSesion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OddUpdate" ADD CONSTRAINT "OddUpdate_opcionId_fkey" FOREIGN KEY ("opcionId") REFERENCES "public"."Opcion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OddUpdate" ADD CONSTRAINT "OddUpdate_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CajaSesion" ADD CONSTRAINT "CajaSesion_franquiciaId_fkey" FOREIGN KEY ("franquiciaId") REFERENCES "public"."Franquicia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CajaSesion" ADD CONSTRAINT "CajaSesion_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CajaSesion" ADD CONSTRAINT "CajaSesion_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
