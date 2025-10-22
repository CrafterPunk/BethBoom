"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  CajaMovimientoTipo,
  CajaSesionEstado,
  MercadoEstado,
  MercadoScope,
  MercadoTipo,
  Prisma,
  UserRole,
} from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import { isAmountWithinRank } from "@/lib/business/ranks";
import prisma from "@/lib/prisma";
import { buildAppEvent, emitAppEvent } from "@/lib/events";
import {
  applyDeltaCap,
  calculateSesgo,
  calculateSuggestedOdd,
  clamp,
} from "@/lib/business/odds";

const ticketSchema = z.object({
  marketId: z.string().uuid(),
  optionId: z.string().uuid(),
  alias: z.string().min(3).max(60),
  monto: z.number().int().positive(),
  confirm: z.boolean().optional(),
  expectedUpdates: z
    .array(
      z.object({
        optionId: z.string().uuid(),
        before: z.number(),
        after: z.number(),
      }),
    )
    .optional(),
});

type OddsUpdate = {
  optionId: string;
  nombre: string;
  before: number;
  after: number;
};

type TicketSuccess = {
  status: "success";
  message: string;
  data: {
    ticketId: string;
    codigo: string;
    cuota: number | null;
    monto: number;
    alias: string;
  };
};

type TicketNeedsConfirmation = {
  status: "needs-confirmation";
  message: string;
  updates: OddsUpdate[];
};

type TicketError = {
  status: "error";
  message: string;
};

export type TicketActionResponse = TicketSuccess | TicketNeedsConfirmation | TicketError;

type MarketWithOptions = Prisma.MercadoGetPayload<{
  include: { opciones: true };
}>;

const ODDS_TOLERANCE = 0.0001;

function normalizeAlias(alias: string) {
  return alias.trim().toUpperCase();
}

function generateTicketCode() {
  const now = new Date();
  const stamp =
    now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    String(now.getUTCDate()).padStart(2, "0") +
    String(now.getUTCHours()).padStart(2, "0") +
    String(now.getUTCMinutes()).padStart(2, "0") +
    String(now.getUTCSeconds()).padStart(2, "0");
  const random = Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, "0");
  return `BB-${stamp}-${random}`;
}

function evaluateOddsRecalc(
  market: MarketWithOptions,
  selectedOptionId: string,
  monto: number,
) {
  if (market.tipo !== MercadoTipo.ODDS) {
    return {
      triggered: false,
      updates: [] as OddsUpdate[],
      remainder: market.montoDesdeRecalc,
      newOddsMap: new Map<string, number>(),
      sesgoMap: new Map<string, number>(),
    };
  }

  const currentSince = market.montoDesdeRecalc + monto;
  if (currentSince < market.umbralRecalcMonto) {
    return {
      triggered: false,
      updates: [] as OddsUpdate[],
      remainder: currentSince,
      newOddsMap: new Map<string, number>(),
      sesgoMap: new Map<string, number>(),
    };
  }

  const totals = new Map<string, number>();
  let totalHandle = 0;

  market.opciones.forEach((option) => {
    const base = option.totalApostado + (option.id === selectedOptionId ? monto : 0);
    totals.set(option.id, base);
    totalHandle += base;
  });

  if (totalHandle <= 0) {
    totalHandle = 1;
  }

  const updates: OddsUpdate[] = [];
  const newOddsMap = new Map<string, number>();
  const sesgoMap = new Map<string, number>();

  market.opciones.forEach((option) => {
    const before = Number(option.cuotaActual ?? option.cuotaInicial ?? 2);
    const sesgo = calculateSesgo(totals.get(option.id) ?? 0, totalHandle);
    const suggested = calculateSuggestedOdd(sesgo);
    const after = applyDeltaCap(before, suggested);

    sesgoMap.set(option.id, sesgo);
    newOddsMap.set(option.id, after);

    if (Math.abs(after - before) > ODDS_TOLERANCE) {
      updates.push({
        optionId: option.id,
        nombre: option.nombre,
        before: Number(before.toFixed(2)),
        after: Number(after.toFixed(2)),
      });
    }
  });

  const threshold = market.umbralRecalcMonto;
  const remainder = currentSince % threshold;

  return {
    triggered: true,
    updates,
    remainder,
    newOddsMap,
    sesgoMap,
  };
}

function compareUpdates(
  expected: Array<{ optionId: string; before: number; after: number }>,
  actual: OddsUpdate[],
) {
  if (expected.length !== actual.length) return false;
  const sortedExpected = [...expected].sort((x, y) => x.optionId.localeCompare(y.optionId));
  const sortedActual = [...actual]
    .map((item) => ({ optionId: item.optionId, before: item.before, after: item.after }))
    .sort((x, y) => x.optionId.localeCompare(y.optionId));

  for (let i = 0; i < sortedExpected.length; i += 1) {
    if (sortedExpected[i].optionId !== sortedActual[i].optionId) return false;
    if (Math.abs(sortedExpected[i].before - sortedActual[i].before) > ODDS_TOLERANCE) return false;
    if (Math.abs(sortedExpected[i].after - sortedActual[i].after) > ODDS_TOLERANCE) return false;
  }

  return true;
}

async function getPromotionThreshold() {
  const param = await prisma.parametroGlobal.findUnique({ where: { clave: "promocion_apuestas" } });
  const value = typeof param?.valor === "object" && param?.valor !== null ? (param.valor as { conteo?: number }).conteo : undefined;
  return value ?? 30;
}

async function getRankRules() {
  return prisma.rankRegla.findMany({ orderBy: { orden: "asc" } });
}

export async function createTicketAction(input: unknown): Promise<TicketActionResponse> {
  const session = await requireSession();
  if (session.role !== UserRole.TRABAJADOR && session.role !== UserRole.ADMIN_GENERAL) {
    return { status: "error", message: "No autorizado para registrar tickets" };
  }

  const parsed = ticketSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues.map((issue) => issue.message).join(" | "),
    };
  }

  const { marketId, optionId } = parsed.data;
  const monto = parsed.data.monto;
  const alias = normalizeAlias(parsed.data.alias);
  const confirm = parsed.data.confirm ?? false;
  const expectedUpdates = parsed.data.expectedUpdates ?? [];

  const market = await prisma.mercado.findUnique({
    where: { id: marketId },
    include: {
      opciones: true,
      sede: true,
    },
  });

  if (!market) {
    return { status: "error", message: "Mercado no encontrado" };
  }

  if (market.estado !== MercadoEstado.ABIERTO) {
    return { status: "error", message: "El mercado no esta disponible para ventas" };
  }

  const option = market.opciones.find((item) => item.id === optionId);
  if (!option) {
    return { status: "error", message: "La opcion no pertenece al mercado" };
  }

  if (market.tipo === MercadoTipo.ODDS && option.cuotaActual === null && option.cuotaInicial === null) {
    return { status: "error", message: "La opcion no tiene cuota configurada" };
  }


  const activeCajaSesion = await prisma.cajaSesion.findFirst({
    where: {
      trabajadorId: session.userId,
      estado: CajaSesionEstado.ABIERTA,
    },
  });

  if (!activeCajaSesion) {
    return { status: "error", message: "Debes abrir tu caja antes de vender" };
  }

  const franchiseForTicket = activeCajaSesion.franquiciaId;

  if (!franchiseForTicket) {
    return { status: "error", message: "No se pudo determinar la franquicia para la caja activa" };
  }

  if (market.franquiciaScope === MercadoScope.SEDE && market.sedeId && market.sedeId !== franchiseForTicket) {
    return { status: "error", message: "Este mercado pertenece a otra sede" };
  }

  const evaluation = evaluateOddsRecalc(market, optionId, monto);
  const requiresConfirmation = market.tipo === MercadoTipo.ODDS && evaluation.triggered && evaluation.updates.length > 0;

  if (requiresConfirmation && !confirm) {
    return {
      status: "needs-confirmation",
      message: "Las cuotas se recalcularan. Confirma para continuar.",
      updates: evaluation.updates,
    };
  }

  if (requiresConfirmation && confirm && !compareUpdates(expectedUpdates, evaluation.updates)) {
    return {
      status: "needs-confirmation",
      message: "Las cuotas cambiaron nuevamente. Revisa los nuevos valores.",
      updates: evaluation.updates,
    };
  }

  const promotionThreshold = await getPromotionThreshold();
  const rankRules = await getRankRules();
  const defaultRank = rankRules[0];

  if (!defaultRank) {
    return { status: "error", message: "No hay reglas de rango configuradas" };
  }


  try {
    const { result, oddsNotification } = await prisma.$transaction(async (tx) => {
      let notification: { marketId: string; marketName: string } | null = null;
      const freshMarket = await tx.mercado.findUnique({
        where: { id: marketId },
        include: { opciones: true },
      });

      if (!freshMarket) {
        throw new Error("MARKET_MISSING");
      }

      if (freshMarket.estado !== MercadoEstado.ABIERTO) {
        throw new Error("MARKET_CLOSED");
      }

      const cajaSesion = await tx.cajaSesion.findUnique({
        where: { id: activeCajaSesion.id },
      });

      if (!cajaSesion || cajaSesion.estado !== CajaSesionEstado.ABIERTA) {
        throw new Error("CAJA_SESSION_MISSING");
      }

      if (cajaSesion.franquiciaId !== franchiseForTicket) {
        throw new Error("CAJA_SESSION_MISSING");
      }

      const freshOption = freshMarket.opciones.find((item) => item.id === optionId);
      if (!freshOption) {
        throw new Error("OPTION_MISSING");
      }

      const freshEvaluation = evaluateOddsRecalc(freshMarket, optionId, monto);
      if (freshEvaluation.triggered) {
        notification = { marketId: freshMarket.id, marketName: freshMarket.nombre };
      }

      if (requiresConfirmation && !compareUpdates(freshEvaluation.updates, evaluation.updates)) {
        throw new Error("ODDS_CHANGED");
      }

      const rankMap = new Map(rankRules.map((rule) => [rule.id, rule]));

      let apostador = await tx.apostador.findUnique({
        where: { alias },
        include: { rango: true },
      });

      if (!apostador) {
        apostador = await tx.apostador.create({
          data: {
            alias,
            rangoId: defaultRank.id,
          },
          include: { rango: true },
        });
      }

      const currentRank = apostador.rango ?? rankMap.get(apostador.rangoId);
      if (!currentRank) {
        throw new Error("RANK_NOT_FOUND");
      }

      if (!isAmountWithinRank(currentRank, monto)) {
        throw new Error(
          `El monto debe estar entre ${currentRank.minMonto.toLocaleString()} y ${currentRank.maxMonto.toLocaleString()} USD para el rango ${currentRank.nombre}`,
        );
      }

      let cuotaTicket: number | null = null;
      const updatedOdds: Array<{ id: string; value: number }> = [];
      const sesgoMap = freshEvaluation.sesgoMap;

      if (freshMarket.tipo === MercadoTipo.ODDS) {
        cuotaTicket = freshEvaluation.newOddsMap.get(optionId) ?? Number(freshOption.cuotaActual ?? freshOption.cuotaInicial ?? 2);

        if (freshEvaluation.triggered && freshEvaluation.updates.length > 0) {
          freshEvaluation.updates.forEach((update) => {
            const current = freshMarket.opciones.find((item) => item.id === update.optionId);
            const currentOdd = Number(current?.cuotaActual ?? current?.cuotaInicial ?? 2);
            if (Math.abs(currentOdd - update.before) > ODDS_TOLERANCE) {
              throw new Error("ODDS_CHANGED");
            }
            updatedOdds.push({ id: update.optionId, value: update.after });
          });
        }
      }

      if (freshMarket.tipo === MercadoTipo.ODDS && cuotaTicket) {
        cuotaTicket = Number(clamp(cuotaTicket, 1.2, 5).toFixed(2));
      }
      const nextMontoDesdeRecalcRaw =
        freshMarket.tipo === MercadoTipo.ODDS
          ? freshEvaluation.remainder
          : freshMarket.montoDesdeRecalc + monto;

      const nextMontoDesdeRecalc = Math.max(0, Math.floor(nextMontoDesdeRecalcRaw));

      await tx.mercado.update({
        where: { id: marketId },
        data: { montoDesdeRecalc: nextMontoDesdeRecalc },
      });


      if (freshMarket.tipo === MercadoTipo.ODDS && freshEvaluation.triggered && updatedOdds.length > 0) {
        await Promise.all(
          updatedOdds.map((item) =>
            tx.opcion.update({
              where: { id: item.id },
              data: { cuotaActual: new Prisma.Decimal(item.value) },
            }),
          ),
        );

        await Promise.all(
          freshEvaluation.updates.map((update) =>
            tx.oddUpdate.create({
              data: {
                opcionId: update.optionId,
                sesgo: new Prisma.Decimal(sesgoMap.get(update.optionId) ?? 0),
                antes: new Prisma.Decimal(update.before),
                despues: new Prisma.Decimal(update.after),
                motivo: "AUTO_REC",
                actorId: session.userId,
              },
            }),
          ),
        );
      }

      await tx.opcion.update({
        where: { id: optionId },
        data: {
          totalApostado: { increment: monto },
          ...(freshMarket.tipo === MercadoTipo.ODDS && freshEvaluation.triggered && updatedOdds.length > 0
            ? { cuotaActual: new Prisma.Decimal(freshEvaluation.newOddsMap.get(optionId) ?? cuotaTicket ?? 0) }
            : {}),
        },
      });

      const shouldAutoPromote = apostador.promocionAutomatica;
      let nextRankId = apostador.rangoId;
      let promotionTriggered = false;
      let remainingApuestas = apostador.apuestasAcumuladas + 1;

      if (shouldAutoPromote) {
        const promotionCycles = promotionThreshold > 0 ? Math.floor((apostador.apuestasAcumuladas + 1) / promotionThreshold) : 0;
        remainingApuestas = promotionThreshold > 0 ? (apostador.apuestasAcumuladas + 1) % promotionThreshold : apostador.apuestasAcumuladas + 1;

        if (promotionCycles > 0) {
          const currentIndex = rankRules.findIndex((rule) => rule.id === apostador.rangoId);
          let targetIndex = currentIndex;
          for (let i = 0; i < promotionCycles; i += 1) {
            if (targetIndex + 1 < rankRules.length) {
              targetIndex += 1;
              remainingApuestas = promotionThreshold > 0 ? 0 : remainingApuestas;
            }
          }
          const candidateRankId = rankRules[targetIndex]?.id ?? apostador.rangoId;
          if (candidateRankId !== apostador.rangoId) {
            nextRankId = candidateRankId;
            promotionTriggered = true;
          }
        }
      }

      const updatedApostador = await tx.apostador.update({
        where: { id: apostador.id },
        data: {
          apuestasTotal: { increment: 1 },
          apuestasAcumuladas: shouldAutoPromote
            ? remainingApuestas
            : apostador.apuestasAcumuladas + 1,
          rangoId: nextRankId,
          ...(shouldAutoPromote ? { rangoManualId: null } : {}),
        },
        include: { rango: true },
      });

      if (promotionTriggered) {
        await tx.apostadorPromocionHistorial.create({
          data: {
            apostadorId: apostador.id,
            rangoAnteriorId: apostador.rangoId,
            rangoAnteriorNombre: apostador.rango?.nombre ?? rankMap.get(apostador.rangoId)?.nombre ?? null,
            rangoNuevoId: updatedApostador.rangoId,
            rangoNuevoNombre: updatedApostador.rango?.nombre ?? rankMap.get(updatedApostador.rangoId)?.nombre ?? "",
            motivo: "auto_promotion",
            triggeredById: session.userId,
          },
        });

        await tx.cajaSesion.update({
        where: { id: cajaSesion.id },
        data: {
          ventasTotal: { increment: monto },
        },
      });

      await tx.auditLog.create({
          data: {
            actorId: session.userId,
            accion: "UPDATE",
            entidad: "Apostador",
            entidadId: apostador.id,
            antes: {
              rangoId: apostador.rangoId,
              apuestasAcumuladas: apostador.apuestasAcumuladas,
            },
            despues: {
              rangoId: updatedApostador.rangoId,
              apuestasAcumuladas: updatedApostador.apuestasAcumuladas,
            },
          },
        });
      }

      const codigo = generateTicketCode();

      const ticket = await tx.ticket.create({
        data: {
          codigo,
          mercadoId: marketId,
          opcionId: optionId,
          franquiciaId: franchiseForTicket,
          trabajadorId: session.userId,
          apostadorId: updatedApostador.id,
          monto,
          cuotaFijada:
            freshMarket.tipo === MercadoTipo.ODDS && cuotaTicket !== null
              ? new Prisma.Decimal(Number(cuotaTicket.toFixed(2)))
              : null,
        },
      });

      await tx.cajaMovimiento.create({
        data: {
          franquiciaId: franchiseForTicket,
          trabajadorId: session.userId,
          cajaSesionId: cajaSesion.id,
          tipo: CajaMovimientoTipo.INGRESO,
          monto,
          refTipo: "TICKET",
          refId: ticket.id,
          notas: `Venta ticket ${codigo}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          accion: "CREATE",
          entidad: "Ticket",
          entidadId: ticket.id,
          antes: Prisma.JsonNull,
          despues: {
            codigo,
            monto,
          mercadoId: marketId,
          opcionId: optionId,
            alias,
            cuota: cuotaTicket,
          },
        },
      });

      return {
        result: {
          ticket,
          cuotaTicket,
          apostador: updatedApostador,
        },
        oddsNotification: notification,
      };
    });

    if (oddsNotification) {
      emitAppEvent(
        buildAppEvent({
          type: "MARKET_ODDS_THRESHOLD",
          message: `Mercado ${oddsNotification.marketName} recalculo cuotas automaticamente`,
          payload: { marketId: oddsNotification.marketId },
        }),
      );
    }

    revalidatePath("/ventas");
    revalidatePath("/markets");

    return {
      status: "success",
      message: "Ticket registrado",
      data: {
        ticketId: result.ticket.id,
        codigo: result.ticket.codigo,
        cuota: result.cuotaTicket ?? null,
        monto,
        alias,
      },
    } satisfies TicketSuccess;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "MARKET_MISSING") {
        return { status: "error", message: "Mercado no encontrado" };
      }
      if (error.message === "MARKET_CLOSED") {
        return { status: "error", message: "El mercado ya no esta disponible" };
      }
      if (error.message === "OPTION_MISSING") {
        return { status: "error", message: "La opcion seleccionada no esta disponible" };
      }
      if (error.message === "RANK_NOT_FOUND") {
        return { status: "error", message: "No se pudo determinar el rango del apostador" };
      }
      if (error.message === "MARKET_FRANQUICIA_MISMATCH") {
        return { status: "error", message: "Este mercado pertenece a otra sede" };
      }
      if (error.message === "CAJA_SESSION_MISSING") {
        return { status: "error", message: "Tu caja activa ya no esta disponible. Abre una nueva caja." };
      }
      if (error.message.includes("El monto debe estar entre")) {
        return { status: "error", message: error.message };
      }
      if (error.message === "ODDS_CHANGED") {
        const latestMarket = await prisma.mercado.findUnique({
          where: { id: marketId },
          include: { opciones: true },
        });
        if (latestMarket) {
          const latestEvaluation = evaluateOddsRecalc(latestMarket, optionId, monto);
          if (latestEvaluation.updates.length > 0) {
            return {
              status: "needs-confirmation",
              message: "Las cuotas cambiaron durante el proceso. Revisa nuevamente.",
              updates: latestEvaluation.updates,
            } satisfies TicketNeedsConfirmation;
          }
        }
        return {
          status: "error",
          message: "Las cuotas cambiaron. Intenta nuevamente.",
        } satisfies TicketError;
      }
      if (error.message.startsWith("El monto debe estar")) {
        return { status: "error", message: error.message };
      }
    }

    console.error("Error creando ticket", error);
    return { status: "error", message: "No se pudo registrar el ticket" } satisfies TicketError;
  }
}






















