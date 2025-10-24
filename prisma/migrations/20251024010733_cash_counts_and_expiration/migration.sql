-- AlterEnum
ALTER TYPE "public"."TicketEstado" ADD VALUE 'VENCIDO';

-- AlterTable
ALTER TABLE "public"."CajaSesion" ADD COLUMN     "pagosCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ventasCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."Ticket" ADD COLUMN     "venceAt" TIMESTAMP(3);
