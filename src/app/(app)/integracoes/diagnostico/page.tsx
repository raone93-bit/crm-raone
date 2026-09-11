import Link from "next/link";

import { requireRole } from "@/lib/session";
import { getDiagnostics } from "@/server/integrations/diagnostics";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Diagnóstico" };

function Light({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-accent" : "bg-iron"}`} />
      <div>
        <p className="text-sm font-medium">
          {ok ? "🟢" : "🔴"} {label}
        </p>
        <p className="text-xs text-ink-soft">{detail}</p>
      </div>
    </div>
  );
}

export default async function DiagnosticoPage() {
  const user = await requireRole("ADMIN");
  const diags = await getDiagnostics(user.organizationId);

  return (
    <div>
      <PageHeader
        title="Diagnóstico das integrações"
        description="Quatro checagens por canal. Verde = funcionando; vermelho = o erro real."
        action={
          <Link href="/integracoes" className="btn-ghost">
            ← Integrações
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {diags.map((d) => (
          <div key={d.type} className="card p-5">
            <h3 className="font-[family-name:var(--font-display)] font-medium">{d.label}</h3>
            <div className="mt-3 divide-y divide-line">
              <Light ok={d.api.ok} label="API conectada" detail={d.api.detail} />
              <Light ok={d.webhook.ok} label="Webhook recebendo" detail={d.webhook.detail} />
              <Light ok={d.inbound.ok} label="Recebimento" detail={d.inbound.detail} />
              <Light ok={d.outbound.ok} label="Envio" detail={d.outbound.detail} />
            </div>
            {!d.configured ? (
              <p className="mt-3 text-xs text-gold">
                Ainda não configurado. Vá em Integrações e cadastre os ids e o token.
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-ink-soft">
        As checagens olham os últimos 7 dias de eventos e mensagens. &quot;Webhook
        recebendo&quot; fica verde quando chega um evento com assinatura válida;
        &quot;Envio&quot; fica verde quando uma mensagem sai com status SENT/DELIVERED/READ.
      </p>
    </div>
  );
}
