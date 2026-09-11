import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { prisma } from "@/lib/prisma";
import { INCOTERM_LABEL, FINISH_LABEL } from "@/lib/labels";

/** Remove caracteres que as fontes padrão do PDF não suportam. */
function safe(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function money(v: number, currency: string) {
  const n = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency} ${n}`;
}

export async function buildQuotePdf(organizationId: string, quoteId: string): Promise<Uint8Array | null> {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, organizationId },
    include: {
      items: { orderBy: { position: "asc" }, include: { material: true } },
      customer: { include: { contact: true, company: true } },
      project: true,
      owner: true,
      organization: true,
    },
  });
  if (!quote) return null;

  const doc = await PDFDocument.create();
  let page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.13, 0.12);
  const soft = rgb(0.42, 0.45, 0.43);
  const accent = rgb(0.18, 0.43, 0.36);
  const M = 48;
  let y = 800;

  const text = (s: string, x: number, size = 10, f = font, color = ink) =>
    page.drawText(safe(s), { x, y, size, font: f, color });

  // Cabeçalho
  text(quote.organization.name, M, 16, bold);
  text("COTAÇÃO / QUOTATION", 595.28 - M - 150, 12, bold, accent);
  y -= 18;
  text(quote.number, 595.28 - M - 150, 10, font, soft);
  y -= 26;
  page.drawLine({ start: { x: M, y }, end: { x: 595.28 - M, y }, thickness: 1, color: rgb(0.85, 0.83, 0.8) });
  y -= 24;

  // Bloco cliente / condições
  const custName = quote.customer?.company?.name ?? quote.customer?.contact?.displayName ?? quote.customer?.name ?? "-";
  text("CLIENTE", M, 8, bold, soft);
  text("CONDIÇÕES", 320, 8, bold, soft);
  y -= 14;
  text(custName, M, 10);
  text(`Moeda: ${quote.currency}`, 320, 10);
  y -= 14;
  if (quote.project) {
    text(`Projeto: ${quote.project.name}`, M, 10, font, soft);
  }
  if (quote.incoterm) text(`Incoterm: ${INCOTERM_LABEL[quote.incoterm] ?? quote.incoterm}`, 320, 10, font, soft);
  y -= 14;
  if (quote.portOfDestination) text(`Porto destino: ${quote.portOfDestination}`, 320, 10, font, soft);
  y -= 14;
  if (quote.paymentTerms) text(`Pagamento: ${quote.paymentTerms}`, 320, 10, font, soft);
  y -= 14;
  if (quote.validUntil)
    text(`Validade: ${quote.validUntil.toLocaleDateString("pt-BR")}`, 320, 10, font, soft);

  y -= 20;
  page.drawLine({ start: { x: M, y }, end: { x: 595.28 - M, y }, thickness: 0.5, color: rgb(0.85, 0.83, 0.8) });
  y -= 18;

  // Tabela de itens
  text("DESCRIÇÃO", M, 8, bold, soft);
  text("m²", 330, 8, bold, soft);
  text("PREÇO/m²", 385, 8, bold, soft);
  text("TOTAL", 480, 8, bold, soft);
  y -= 16;

  for (const it of quote.items) {
    const desc = [
      it.material?.commercialName ?? it.description,
      it.thicknessCm ? `${it.thicknessCm} cm` : null,
      it.finish ? FINISH_LABEL[it.finish] ?? it.finish : null,
    ]
      .filter(Boolean)
      .join(" · ");
    text(desc, M, 10);
    text(String(it.squareMeters ?? "-"), 330, 10);
    text(money(it.unitPrice, quote.currency), 385, 10);
    text(money(it.lineTotal, quote.currency), 480, 10);
    y -= 16;
    if (y < 120) {
      y = 800;
      page = doc.addPage([595.28, 841.89]);
    }
  }

  y -= 6;
  page.drawLine({ start: { x: 320, y }, end: { x: 595.28 - M, y }, thickness: 0.5, color: rgb(0.85, 0.83, 0.8) });
  y -= 16;
  text("Subtotal", 385, 10, font, soft);
  text(money(quote.subtotal, quote.currency), 480, 10);
  y -= 14;
  if (quote.freightAmount) {
    text("Frete", 385, 10, font, soft);
    text(money(quote.freightAmount, quote.currency), 480, 10);
    y -= 14;
  }
  text("TOTAL", 385, 11, bold);
  text(money(quote.total, quote.currency), 480, 11, bold);

  y -= 30;
  if (quote.notes) {
    text("OBSERVAÇÕES", M, 8, bold, soft);
    y -= 14;
    for (const line of quote.notes.match(/.{1,90}(\s|$)/g) ?? [quote.notes]) {
      text(line.trim(), M, 9, font, soft);
      y -= 12;
    }
  }

  // Rodapé
  page.drawText(
    safe(`${quote.owner?.name ?? ""}  ·  Emitida em ${quote.createdAt.toLocaleDateString("pt-BR")}`),
    { x: M, y: 40, size: 8, font, color: soft },
  );

  return doc.save();
}
