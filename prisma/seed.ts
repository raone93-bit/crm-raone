import { PrismaClient, type Language } from "@prisma/client";
import bcrypt from "bcryptjs";

import { DEFAULT_FUNNEL_NAME, DEFAULT_STAGES } from "../src/server/leads/funnel";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = process.env.SEED_PASSWORD ?? "raone123";

async function main() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // ── Organização ────────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: "raone" },
    update: {},
    create: { name: "Raone Rochas Naturais", slug: "raone", country: "BR" },
  });

  // ── Usuários / vendedores ──────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: "admin@raone.com" },
    update: { passwordHash },
    create: {
      organizationId: org.id,
      email: "admin@raone.com",
      name: "Administrador",
      role: "ADMIN",
      passwordHash,
    },
  });

  async function ensureSeller(
    email: string,
    name: string,
    languages: Language[],
    opts: { triage?: boolean } = {},
  ) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: {
        organizationId: org.id,
        email,
        name,
        role: "SELLER",
        passwordHash,
      },
    });
    const seller = await prisma.seller.upsert({
      where: { userId: user.id },
      update: { languages, isTriageQueue: opts.triage ?? false },
      create: {
        organizationId: org.id,
        userId: user.id,
        displayName: name,
        languages,
        isTriageQueue: opts.triage ?? false,
      },
    });
    return { user, seller };
  }

  const rodolfo = await ensureSeller("rodolfo@raone.com", "Rodolfo", ["PT"]);
  const gabriel = await ensureSeller("gabriel@raone.com", "Gabriel", ["ES", "EN"]);
  const triage = await ensureSeller("triagem@raone.com", "Fila de triagem", [], { triage: true });

  // ── Regras de roteamento por idioma (item 12) ──────────────────────────────
  const routing: { language: Language; sellerId: string }[] = [
    { language: "PT", sellerId: rodolfo.seller.id },
    { language: "ES", sellerId: gabriel.seller.id },
    { language: "EN", sellerId: gabriel.seller.id },
  ];
  for (const r of routing) {
    await prisma.routingRule.upsert({
      where: { organizationId_language: { organizationId: org.id, language: r.language } },
      update: { sellerId: r.sellerId, active: true },
      create: { organizationId: org.id, language: r.language, sellerId: r.sellerId },
    });
  }

  // ── Funil ──────────────────────────────────────────────────────────────────
  let funnel = await prisma.funnel.findFirst({
    where: { organizationId: org.id, isDefault: true },
  });
  if (!funnel) {
    funnel = await prisma.funnel.create({
      data: {
        organizationId: org.id,
        name: DEFAULT_FUNNEL_NAME,
        isDefault: true,
        stages: {
          create: DEFAULT_STAGES.map((s) => ({
            name: s.name,
            position: s.position,
            isWon: s.isWon ?? false,
            isLost: s.isLost ?? false,
            probability: s.probability,
          })),
        },
      },
    });
  }
  const stages = await prisma.funnelStage.findMany({
    where: { funnelId: funnel.id },
    orderBy: { position: "asc" },
  });
  const stageByPos = (p: number) => stages.find((s) => s.position === p)!;

  // ── Materiais ──────────────────────────────────────────────────────────────
  const materials = [
    { commercialName: "Taj Mahal", technicalName: "Quartzito", type: "QUARTZITE" as const, origin: "Espírito Santo", color: "Bege dourado" },
    { commercialName: "Super White", technicalName: "Dolomito", type: "DOLOMITE" as const, origin: "Espírito Santo", color: "Branco acinzentado" },
    { commercialName: "Cristallo", technicalName: "Quartzito", type: "QUARTZITE" as const, origin: "Bahia", color: "Branco translúcido" },
    { commercialName: "Preto São Marcos", technicalName: "Granito", type: "GRANITE" as const, origin: "Espírito Santo", color: "Preto" },
  ];
  for (const m of materials) {
    await prisma.material.upsert({
      where: { organizationId_commercialName: { organizationId: org.id, commercialName: m.commercialName } },
      update: {},
      create: { organizationId: org.id, ...m },
    });
  }
  const tajMahal = await prisma.material.findFirst({
    where: { organizationId: org.id, commercialName: "Taj Mahal" },
  });
  const superWhite = await prisma.material.findFirst({
    where: { organizationId: org.id, commercialName: "Super White" },
  });

  // ── Bundles de exemplo ────────────────────────────────────────────────────
  if ((await prisma.bundle.count({ where: { organizationId: org.id } })) === 0) {
    const bundleSeeds = [
      { m: tajMahal, n: "TM-2401", slabs: 7, sqm: 24.5, cm: 3, finish: "POLISHED" as const, loc: "Galpão 1" },
      { m: tajMahal, n: "TM-2402", slabs: 6, sqm: 21.0, cm: 3, finish: "POLISHED" as const, loc: "Galpão 1" },
      { m: tajMahal, n: "TM-2410", slabs: 8, sqm: 28.0, cm: 2, finish: "POLISHED" as const, loc: "Galpão 2" },
      { m: superWhite, n: "SW-1180", slabs: 6, sqm: 20.4, cm: 3, finish: "HONED" as const, loc: "Galpão 2" },
      { m: superWhite, n: "SW-1181", slabs: 7, sqm: 23.1, cm: 2, finish: "POLISHED" as const, loc: "Galpão 3" },
    ];
    for (const b of bundleSeeds) {
      if (!b.m) continue;
      await prisma.bundle.create({
        data: {
          organizationId: org.id,
          materialId: b.m.id,
          bundleNumber: b.n,
          slabCount: b.slabs,
          squareMeters: b.sqm,
          thicknessCm: b.cm,
          finish: b.finish,
          quality: "FIRST",
          location: b.loc,
          status: "AVAILABLE",
        },
      });
    }
  }

  // ── Contatos + leads de exemplo (para os dashboards não nascerem vazios) ────
  const existingLeads = await prisma.lead.count({ where: { organizationId: org.id } });
  if (existingLeads === 0) {
    const samples = [
      {
        name: "John Smith", channel: "INSTAGRAM" as const, language: "EN" as Language,
        country: "US", city: "Miami", market: "USA" as const, seller: gabriel.seller.id,
        stage: 7, score: 87, temperature: "HOT" as const, material: true,
        sqm: 120, thickness: 3, title: "Taj Mahal 3 cm — projeto residencial Miami",
      },
      {
        name: "María González", channel: "WHATSAPP" as const, language: "ES" as Language,
        country: "MX", city: "Monterrey", market: "LATAM" as const, seller: gabriel.seller.id,
        stage: 3, score: 44, temperature: "WARM" as const, material: true,
        sqm: 60, thickness: 2, title: "Cotización Taj Mahal",
      },
      {
        name: "Construtora Alvorada", channel: "WHATSAPP" as const, language: "PT" as Language,
        country: "BR", city: "São Paulo", market: "DOMESTIC" as const, seller: rodolfo.seller.id,
        stage: 5, score: 63, temperature: "QUALIFIED" as const, material: true,
        sqm: 200, thickness: 3, title: "Taj Mahal e Super White — obra Jardins",
      },
      {
        name: "Anonymous IG", channel: "INSTAGRAM" as const, language: "EN" as Language,
        country: null, city: null, market: "OTHER" as const, seller: gabriel.seller.id,
        stage: 2, score: 12, temperature: "COLD" as const, material: false,
        sqm: null, thickness: null, title: "Pediu preço, sem detalhes",
      },
    ];

    for (const s of samples) {
      const contact = await prisma.contact.create({
        data: {
          organizationId: org.id,
          displayName: s.name,
          primaryLanguage: s.language,
          country: s.country ?? undefined,
          city: s.city ?? undefined,
          market: s.market,
          identities: {
            create: {
              organizationId: org.id,
              channel: s.channel,
              externalId: `seed_${s.channel}_${s.name.replace(/\W/g, "").toLowerCase()}`,
              displayName: s.name,
            },
          },
        },
      });

      await prisma.lead.create({
        data: {
          organizationId: org.id,
          contactId: contact.id,
          sellerId: s.seller,
          funnelId: funnel.id,
          stageId: stageByPos(s.stage).id,
          title: s.title,
          sourceType: s.channel === "INSTAGRAM" ? "INSTAGRAM" : "WHATSAPP",
          channel: s.channel,
          language: s.language,
          market: s.market,
          score: s.score,
          temperature: s.temperature,
          intentType: "PRICE",
          materialId: s.material && tajMahal ? tajMahal.id : undefined,
          materialText: s.material ? "Taj Mahal" : undefined,
          squareMeters: s.sqm ?? undefined,
          thicknessCm: s.thickness ?? undefined,
          hasProject: s.market !== "OTHER",
          buyingIntent: s.score > 40,
          lastContactAt: new Date(),
          stageEvents: {
            create: {
              organizationId: org.id,
              toStageId: stageByPos(s.stage).id,
              actorType: "SYSTEM",
              note: "Lead criado pelo seed",
            },
          },
        },
      });
    }
  }

  console.log("Seed concluído.");
  console.log("  Login admin:   admin@raone.com");
  console.log("  Vendedores:    rodolfo@raone.com · gabriel@raone.com");
  console.log(`  Senha padrão:  ${DEFAULT_PASSWORD}  (troque em produção)`);
  console.log(`  Org: ${org.name}  ·  Funil: ${stages.length} etapas  ·  Admin id: ${admin.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
