# CRM Raone

CRM comercial para exportação de rochas naturais. Recebe conversas de WhatsApp,
Instagram e Messenger, identifica intenção comercial, qualifica com IA, roteia por
idioma e leva o lead até a venda e a logística de exportação.

**As 7 fases do plano estão codadas.** A Fase 3 (canais da Meta) fica em
"config pendente" até você ter o app da Meta + App Review; tudo o mais funciona
— a IA (Fase 4) roda sem chave via heurística e liga com `ANTHROPIC_API_KEY`.

> **Arquitetura completa e plano de fases:** ver o documento de arquitetura
> (artefato) que acompanha o projeto.

## Stack

Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL · Auth.js v5 · Tailwind CSS ·
Vitest. Deploy na Vercel, banco no Neon.

## Estado atual

| Fase | Escopo | Estado |
|---|---|---|
| 0 | Fundação: schema, autenticação, RBAC, shell, CI, testes obrigatórios | ✅ |
| 1 | Núcleo comercial: contatos, leads, clientes, empresas, funil, dashboards | ✅ |
| 2 | Central de conversas: inbox 3 colunas, pipeline de ingestão, resposta pelo CRM, simulador | ✅ |
| 3 | Integrações Meta: webhooks (verificação + assinatura + idempotência + fila), adapters, envio real, telas de Integrações e Diagnóstico | ✅ estrutura pronta — falta credenciais/App Review |
| 4 | IA de qualificação: `LLMProvider` + Claude, idioma/intenção/extração/score/resumo/resposta sugerida, fallback determinístico, guardrail anti-invenção | ✅ (roda sem chave via heurística; com `ANTHROPIC_API_KEY` usa Claude) |
| 5 | Catálogo (materiais, blocos, bundles), estoque + consulta de disponibilidade, projetos, cotações com PDF, pedidos + pagamentos | ✅ |
| 6 | Exportação: embarques com máquina de estados de 11 etapas, booking/armador/navio, containers, checklist de documentos, ETD/ETA, consignee/notify/forwarder/despachante | ✅ |
| 7 | Relatórios (por vendedor/canal/idioma/mercado/material, conversão, ticket, tempos de ciclo, motivos de perda) + reativação automática de leads parados | ✅ |

## Rodar localmente (precisa de Node 20+)

```bash
npm install                         # gera o package-lock.json (commite depois)
cp .env.example .env.local          # preencha DATABASE_URL, DIRECT_URL e AUTH_SECRET
npx prisma db push                  # cria o schema no banco (sem migrações ainda)
npm run db:seed                     # cria org, vendedores, funil, dados de exemplo
npm run dev
```

Login de exemplo (criado pelo seed): `admin@raone.com` / `raone123`
(defina `SEED_PASSWORD` para outra senha; **troque em produção**).

Sem Node instalado? Vá direto para o deploy — a Vercel roda o build.

> **Migrações:** até a Fase 5 o schema é aplicado com `prisma db push` (rápido,
> sem histórico). Ao estabilizar, rode `prisma migrate dev --name init` uma vez,
> commite `prisma/migrations/` e troque o `buildCommand` do `vercel.json` para
> `prisma migrate deploy`.

## Testes obrigatórios (item 50)

```bash
npm test
```

`tests/mandatory.test.ts` cobre os 7 testes do briefing (idioma → vendedor,
elogio não cria lead, não duplicar contato, comentário comercial cria lead,
intenção sem dados cria lead sem inventar). Rodam em CI a cada push.

## Deploy na Vercel + Neon

1. **Banco (Neon):** crie um projeto Postgres. Copie a *connection string* com
   pool (`...-pooler...`) para `DATABASE_URL` e a direta para `DIRECT_URL`.
2. **Vercel:** importe o repositório. Em *Settings → Environment Variables*,
   configure no mínimo:
   - `DATABASE_URL`, `DIRECT_URL`
   - `AUTH_SECRET` (`openssl rand -base64 32`)
   - `CRON_SECRET`
3. O `buildCommand` (em `vercel.json`) roda `prisma db push` no build — o schema
   é criado/atualizado no primeiro deploy.
4. Após o primeiro deploy, rode o seed uma vez apontando para o banco de produção:
   `DATABASE_URL="<string do Neon>" DIRECT_URL="<string direta>" npx prisma db seed`
5. O domínio HTTPS da Vercel será usado nos webhooks da Meta (Fase 3).

## Estrutura

```
prisma/schema.prisma          modelo de dados (todas as fases)
src/app/(auth)/login          autenticação
src/app/(app)/*               telas do CRM
src/app/(app)/conversas       inbox de 3 colunas + simulador de entrada (admin)
src/app/api/webhooks/*        entrada dos canais Meta (Fase 3)
src/app/api/cron/*            fila e follow-ups
src/server/conversations/ingest.ts   PIPELINE de ingestão de mensagem (o coração)
src/server/leads/*            idioma, intenção, roteamento, score, dedupe, extração
src/lib/{rbac,tenant,session,prisma}.ts
tests/                        testes obrigatórios + unitários
```

## Pipeline de ingestão

`src/server/conversations/ingest.ts` — `ingestInboundMessage()` — é o ponto único
por onde toda mensagem entra: webhook da Meta (Fase 3), simulador (admin), ou
criação manual. Faz: resolve/cria contato (com dedupe) → resolve conversa →
idempotência → grava mensagem → qualifica (idioma + intenção + extração) →
cria/atualiza lead e roteia por idioma → atualiza a conversa → registra na timeline.

**Sem intenção comercial, nenhum lead é criado** — só o registro da conversa.

Enquanto não há canal conectado, a resposta escrita no CRM fica com status
`QUEUED` ("na fila"). Nada é enviado para lugar nenhum. A Fase 3 liga o envio real.

Para testar agora: **Conversas → (admin) Simulador de entrada**.

## IA de qualificação (Fase 4)

`src/server/ai/` — interface `LLMProvider` (`provider.ts`), implementação Claude
(`anthropic.ts`, forced tool use, modelo padrão `claude-haiku-4-5`), OpenAI
alternativa (`openai.ts`), e o orquestrador `analyze.ts` que junta IA + heurística.

- **Sem `ANTHROPIC_API_KEY`:** o pipeline usa só a heurística determinística de
  `src/server/leads/` — funciona, sem custo, sem resumo/resposta sugerida.
- **Com a chave:** cada mensagem recebida é analisada (idioma, intenção comercial,
  extração, score, resumo, resposta sugerida). O resultado fica em `ai_analyses`
  (com tokens e custo estimado, visível em **Configurações → IA**).
- **Guardrail (item 40):** a IA nunca afirma preço, estoque ou prazo. Se a resposta
  sugerida contém um valor específico e não há cotação real, ela é descartada.
- **Fallback:** qualquer erro da IA → volta para a heurística, sem travar a ingestão.
- Trocar de provedor: `AI_PROVIDER=openai` + `OPENAI_API_KEY`.

Custo: com Haiku 4.5, ~US$ 0,001–0,003 por mensagem analisada.

## Catálogo, estoque e venda (Fase 5)

- **Produtos** — materiais com blocos e bundles vinculados; status por bundle
  (disponível / reservado / vendido / em produção).
- **Estoque** — bundles agregados por material × espessura × acabamento, e a
  **consulta de disponibilidade** (`src/server/catalog/availability.ts`) — a mesma
  função que a IA usa para responder "Do you have Taj Mahal 3 cm?" com dados reais.
- **Projetos** — obra, material previsto, prazo, probabilidade; liga leads e cotações.
- **Cotações** — itens com m² × preço/m², subtotal + frete, Incoterm, validade.
  Fluxo: rascunho → enviada → aprovada → **converter em pedido** (reserva os
  bundles cotados, cria o cliente, move o lead para "Pedido confirmado").
  **PDF** gerado em `/api/cotacoes/[id]/pdf` (pdf-lib, sem browser).
- **Pedidos** — nascem da cotação; status, parcelas de pagamento, gancho de logística.

## Exportação (Fase 6)

`src/server/shipments/` — o embarque abre a partir de um pedido de exportação
(`market != DOMESTIC`) e cria o checklist padrão de documentos (Commercial Invoice,
Packing List, BL, ISF, Certificado de Origem, Seguro).

- **Máquina de estados** de 11 etapas: pedido confirmado → aguardando booking →
  booking confirmado → aguardando vazio → vazio agendado → container carregado →
  gate in → em trânsito → chegada → documentação → concluído. Avançar o embarque
  sincroniza o status do pedido nos marcos (READY / SHIPPED / DELIVERED).
- Booking, armador, navio, depot, portos, ETD/ETA, BL (nº e tipo), ISF, consignee,
  notify party, freight forwarder, despachante.
- Containers (nº, lacre, tipo, peso).
- Cada documento tem status: pendente → em elaboração → pronto → enviado.

## Relatórios e reativação (Fase 7)

- **Relatórios** (admin/gerente) — leads por vendedor / canal / idioma / mercado /
  material, conversão, cotações e pedidos com valor, ticket médio, tempo médio até
  cotação e até venda, motivos de perda. Filtro de período (7d / 30d / 90d / ano).
- **Reativação automática** — `src/server/reactivation.ts`, rodada pelo cron diário
  (`/api/cron/follow-ups`): cria tarefa de follow-up quando uma cotação enviada fica
  sem resposta do cliente por 5+ dias, ou quando um lead morno/quente passa 10+ dias
  sem contato. **Nunca envia mensagem automática** — só recomenda a ação (item 41).
  Configurável: `REACTIVATION_QUOTE_DAYS`, `REACTIVATION_NO_CONTACT_DAYS`.

## Ligar os canais da Meta (Fase 3)

A estrutura está pronta: `src/server/channels/*` (adapters WhatsApp / Instagram /
Messenger), `src/app/api/webhooks/{whatsapp,instagram,facebook}` (verificação
`hub.challenge`, validação de `X-Hub-Signature-256`, gravação idempotente em
`webhook_events`, processamento assíncrono via `after()` + cron), envio real em
`src/server/channels/outbound.ts`, e as telas **Integrações** e
**Integrações → Diagnóstico** (admin).

O que falta é externo à aplicação:

1. **App da Meta** (tipo Business) + **Business verificado**.
2. **WhatsApp:** WABA + número dedicado (não pode estar no app WhatsApp comum) +
   aprovação do display name. Token de System User permanente.
3. **Instagram:** conta profissional vinculada a uma Página + **App Review** das
   permissões de mensagens.
4. **Facebook:** Página + **App Review** das permissões de mensagens.
5. Variáveis: `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_VERSION`,
   `CHANNEL_TOKEN_ENCRYPTION_KEY`.
6. No painel da Meta, cadastrar a **URL do webhook** (mostrada na tela Integrações,
   ex.: `https://<dominio>/api/webhooks/whatsapp`) com o mesmo verify token.
7. Na tela **Integrações**, cadastrar Phone Number ID / Page ID / IG Account ID e
   colar o access token — o CRM testa a conexão na hora e mostra o erro real se
   falhar.

Antes disso, o painel mostra cada canal como **config pendente** — nunca como
conectado. Nenhum envio é simulado.

## Segurança

- Tokens de canal nunca no frontend — cifrados em repouso (`CHANNEL_TOKEN_ENCRYPTION_KEY`).
- Todo acesso a dados é escopado por `organizationId` (`src/lib/tenant.ts`).
- Vendedor só vê os próprios leads; gerente e admin veem todos.
- Webhooks validam `X-Hub-Signature-256` (App Secret) e são idempotentes
  (`webhook_events` único por hash do corpo + `messages.externalMessageId` único).
- Access tokens de canal cifrados com AES-256-GCM (`src/server/crypto/tokens.ts`),
  nunca retornados ao frontend (a UI só vê `••••1234`).
