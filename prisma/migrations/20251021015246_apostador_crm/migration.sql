-- AlterTable
ALTER TABLE "public"."Apostador" ADD COLUMN     "promocionAutomatica" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rangoManualId" TEXT;

-- CreateTable
CREATE TABLE "public"."ApostadorNota" (
    "id" TEXT NOT NULL,
    "apostadorId" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApostadorNota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ApostadorTag" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#a855f7',
    "descripcion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApostadorTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ApostadorTagAssignment" (
    "id" TEXT NOT NULL,
    "apostadorId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApostadorTagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ApostadorPromocionHistorial" (
    "id" TEXT NOT NULL,
    "apostadorId" TEXT NOT NULL,
    "rangoAnteriorId" TEXT,
    "rangoAnteriorNombre" TEXT,
    "rangoNuevoId" TEXT NOT NULL,
    "rangoNuevoNombre" TEXT NOT NULL,
    "motivo" TEXT,
    "triggeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApostadorPromocionHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApostadorTag_nombre_key" ON "public"."ApostadorTag"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ApostadorTagAssignment_apostadorId_tagId_key" ON "public"."ApostadorTagAssignment"("apostadorId", "tagId");

-- AddForeignKey
ALTER TABLE "public"."Apostador" ADD CONSTRAINT "Apostador_rangoManualId_fkey" FOREIGN KEY ("rangoManualId") REFERENCES "public"."RankRegla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApostadorNota" ADD CONSTRAINT "ApostadorNota_apostadorId_fkey" FOREIGN KEY ("apostadorId") REFERENCES "public"."Apostador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApostadorNota" ADD CONSTRAINT "ApostadorNota_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApostadorTagAssignment" ADD CONSTRAINT "ApostadorTagAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApostadorTagAssignment" ADD CONSTRAINT "ApostadorTagAssignment_apostadorId_fkey" FOREIGN KEY ("apostadorId") REFERENCES "public"."Apostador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApostadorTagAssignment" ADD CONSTRAINT "ApostadorTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."ApostadorTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApostadorPromocionHistorial" ADD CONSTRAINT "ApostadorPromocionHistorial_apostadorId_fkey" FOREIGN KEY ("apostadorId") REFERENCES "public"."Apostador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApostadorPromocionHistorial" ADD CONSTRAINT "ApostadorPromocionHistorial_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
