import { Prisma, PrismaClient, UserRole, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ACCESS_CODES: Array<{ displayName: string; code: string; role: UserRole }> = [
  { displayName: "Dueno General", code: "owner-AAAA1111", role: UserRole.ADMIN_GENERAL },
  { displayName: "Vendedor HQ", code: "sell-HQ-BBBB2222", role: UserRole.TRABAJADOR },
  { displayName: "Auditor General", code: "audit-CCCC3333", role: UserRole.AUDITOR_GENERAL },
  { displayName: "Market Maker HQ", code: "maker-DDDD3333", role: UserRole.MARKET_MAKER },
];

const RANKS: Array<{ orden: number; nombre: string; maxMonto: number }> = [
  { orden: 1, nombre: "Bronce", maxMonto: 10_000 },
  { orden: 2, nombre: "Plata", maxMonto: 20_000 },
  { orden: 3, nombre: "Oro", maxMonto: 50_000 },
  { orden: 4, nombre: "Diamante", maxMonto: 100_000 },
  { orden: 5, nombre: "Super VIP", maxMonto: 250_000 },
];

const TAGS: Array<{ nombre: string; color: string; descripcion?: string }> = [
  { nombre: "VIP", color: "#f97316", descripcion: "Clientes VIP con beneficios especiales" },
  { nombre: "Seguimiento", color: "#facc15", descripcion: "Requiere seguimiento manual" },
  { nombre: "Bloqueo Parcial", color: "#ef4444", descripcion: "Validar identidad antes de vender" },
];

const GLOBAL_PARAMS: Array<{ clave: string; valor: Prisma.InputJsonValue; descripcion?: string }> = [
  {
    clave: "fee_pct_default",
    valor: { value: 12 },
    descripcion: "Porcentaje de fee por defecto para mercados",
  },
  {
    clave: "franchise_share_pct_default",
    valor: { value: 50 },
    descripcion: "Participacion default de franquicias sobre el fee",
  },
  {
    clave: "odds_thresholds",
    valor: { umbralMonto: 30_000, min: 1.2, max: 5.0, deltaMax: 0.25 },
    descripcion: "Parametros globales de ODDS",
  },
  {
    clave: "promocion_apuestas",
    valor: { conteo: 30 },
    descripcion: "Apuestas necesarias para promocionar rango automaticamente",
  },
  {
    clave: "odds_policy",
    valor: { tipo: "TOTAL_HISTORICO", recalculo: "AUTO" },
    descripcion: "Politica de recalculo de ODDS",
  },
];

async function seedFranquiciaHQ() {
  return prisma.franquicia.upsert({
    where: { codigo: "HQ" },
    update: {
      nombre: "HQ Principal",
      franchiseSharePctDefault: 50,
      activa: true,
    },
    create: {
      codigo: "HQ",
      nombre: "HQ Principal",
      franchiseSharePctDefault: 50,
      activa: true,
    },
  });
}

async function seedRanks() {
  for (const rank of RANKS) {
    await prisma.rankRegla.upsert({
      where: { orden: rank.orden },
      update: {
        nombre: rank.nombre,
        maxMonto: rank.maxMonto,
        activo: true,
      },
      create: {
        nombre: rank.nombre,
        orden: rank.orden,
        maxMonto: rank.maxMonto,
      },
    });
  }
}

async function seedTags() {
  for (const tag of TAGS) {
    await prisma.apostadorTag.upsert({
      where: { nombre: tag.nombre },
      update: {
        color: tag.color,
        descripcion: tag.descripcion,
        activa: true,
      },
      create: {
        nombre: tag.nombre,
        color: tag.color,
        descripcion: tag.descripcion,
      },
    });
  }
}

async function seedParametros() {
  for (const param of GLOBAL_PARAMS) {
    await prisma.parametroGlobal.upsert({
      where: { clave: param.clave },
      update: {
        valor: param.valor,
        descripcion: param.descripcion,
      },
      create: {
        clave: param.clave,
        valor: param.valor,
        descripcion: param.descripcion,
      },
    });
  }
}

function hashAccessCode(code: string, pepper: string) {
  return bcrypt.hashSync(`${pepper}${code}`, 10);
}

async function seedUsers(franquiciaId: string) {
  const pepper = process.env.ACCESS_CODE_PEPPER ?? "bethboom-pepper";

  for (const seedUser of ACCESS_CODES) {
    const accessCodeHash = hashAccessCode(seedUser.code, pepper);
    const baseData = {
      displayName: seedUser.displayName,
      role: seedUser.role,
      estado: UserStatus.ACTIVE,
      accessCodeHash,
      franquiciaId:
        seedUser.role === UserRole.TRABAJADOR || seedUser.role === UserRole.MARKET_MAKER
          ? franquiciaId
          : undefined,
    };

    const existing = await prisma.user.findFirst({
      where: { displayName: seedUser.displayName },
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: baseData,
      });
    } else {
      await prisma.user.create({ data: baseData });
    }
  }
}

async function main() {
  const franquiciaHQ = await seedFranquiciaHQ();
  await seedRanks();
  await seedTags();
  await seedParametros();
  await seedUsers(franquiciaHQ.id);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Error al ejecutar seeds", error);
    await prisma.$disconnect();
    process.exit(1);
  });
