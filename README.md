# Gestão Simples

MVP completo do Gestão Simples (Documento de Visão do Produto v2.0, Seção
6): Agenda, Clientes, Serviços, Profissionais, Precificação e Caixa, com
Dashboard mostrando faturamento do mês, comissões a repassar e
atendimentos do dia. Construído em Next.js + Prisma, para rodar 100%
grátis no Vercel usando o banco do Supabase já criado.

## Estrutura

```
app/login/page.tsx                       → tela de login (e-mail/senha)
app/dashboard/layout.tsx                 → navegação + proteção de sessão
app/dashboard/page.tsx                   → indicadores (faturamento, comissões, atendimentos do dia)
app/dashboard/agenda/page.tsx            → agenda do dia + criar agendamento
app/dashboard/clientes/page.tsx          → lista + cadastro de clientes
app/dashboard/servicos/page.tsx          → catálogo de serviços (duração, custo, preço)
app/dashboard/profissionais/page.tsx     → equipe + percentual de comissão
app/dashboard/precificacao/page.tsx      → configuração + calculadora de preço sugerido
app/dashboard/caixa/page.tsx             → lançamento de atendimentos (agendados e avulsos)
app/dashboard/fornecedores/page.tsx      → cadastro de fornecedores (nome, telefone, e-mail, CNPJ)
app/dashboard/contas-a-pagar/page.tsx    → lançamento, status (A Pagar/Paga/Vencida) e visão de atraso por fornecedor
app/dashboard/contas-a-receber/page.tsx  → lançamento, status (A Receber/Recebida/Vencida) e visão de atraso por cliente
app/dashboard/fluxo-caixa-chart.tsx      → gráfico (recharts) do fluxo de caixa projetado, usado no Dashboard
middleware.ts                            → redireciona para /login sem sessão
lib/supabase/client.ts                   → cliente Supabase para o navegador
lib/supabase/server.ts                   → cliente Supabase para Server Components
lib/tenant.ts                            → descobre o tenant_id do usuário logado (necessário em todo insert)
app/api/precificacao/calcular/route.ts   → POST cálculo de preço sugerido
app/api/caixa/atendimentos/route.ts      → POST registro de atendimento (split de comissão)
app/api/caixa/resumo/route.ts            → GET resumo de caixa por período
lib/caixa.ts                             → agregação do resumo de caixa (usada pela API Route e pelo Dashboard)
lib/fluxoCaixa.ts                        → agregação de Contas a Pagar/Receber em aberto por faixa de vencimento (usada pelo Dashboard)
lib/prisma.ts                            → conexão única com o banco (API Routes)
lib/auth.ts                              → valida o login nas API Routes e descobre o tenant
lib/precificacao.ts                      → fórmula de precificação
prisma/schema.prisma                     → espelha as 11 tabelas já criadas no Supabase
```

## Contas a Pagar / Contas a Receber

Módulo adicionado em 30/07/2026, separado do Caixa: o Caixa assume que o
atendimento foi pago na hora (dinheiro/pix/cartão à vista); Contas a Pagar
e Contas a Receber existem para dinheiro que ainda vai sair/entrar (fiado,
parcelado, boleto a vencer) — não há geração automática de conta a receber
a partir de um atendimento do Caixa.

"Vencida" nunca é um status gravado no banco: é sempre calculado comparando
`data_vencimento` com a data de hoje (ver `diasDeAtraso` nas duas telas e a
constraint check no lugar da migration). Isso evita depender de um job
diário para manter o status atualizado.

A migration `003_contas_pagar_receber.sql` cria as tabelas `fornecedores`,
`contas_pagar` e `contas_receber`, seguindo o mesmo padrão de RLS por
`tenant_id` das tabelas anteriores — aplique-a no SQL Editor do Supabase
como as demais.

O login, a agenda, os clientes, os serviços, os profissionais e a
configuração de precificação falam **direto com o Supabase** (via
PostgREST, protegido por Row-Level Security) — não passam pelas API
Routes. Só a parte financeira sensível (cálculo de preço sugerido e
fechamento de caixa com split de comissão) passa pelas API Routes, porque
envolve cálculo que não pode ficar exposto/alterável no navegador
(decisão registrada na Documentação da API v1.0, Seção 6).

Atenção — `tenant_id` em todo INSERT feito pelo navegador: a migration não
define valor automático para `tenant_id` nas tabelas de negócio (a RLS só
**exige**, via `with check`, que o valor gravado seja o do tenant atual —
não o preenche sozinha). Por isso toda tela que cria um registro (Agenda,
Clientes, Serviços, Profissionais, Precificação) busca o tenant_id com
`lib/tenant.ts` antes de inserir. Ao criar uma nova tela com escrita direta
no Supabase, sempre inclua esse passo.

Importante: as API Routes usam a conexão direta ao banco (`DATABASE_URL`),
que **não passa pela Row-Level Security**. Por isso todo filtro por
`tenant_id` é feito manualmente no código — não remova esses filtros ao
editar as rotas.

## Passo a passo para colocar no ar

### 1. Subir o código no GitHub
Crie um repositório novo (pode ser privado) no GitHub e suba esta pasta
inteira para ele. Se nunca fez isso, o próprio GitHub tem um botão
"Upload files" que aceita arrastar a pasta pelo navegador — não precisa
usar linha de comando.

### 2. Pegar as credenciais do Supabase
No painel do seu projeto Supabase ("Gestão Simples"):

- **Project Settings → Database → Connection string**
  - Copie a versão **"Transaction" (porta 6543, com pgbouncer)** → isso é o `DATABASE_URL`.
  - Copie a versão **"Session" (porta 5432)** → isso é o `DIRECT_URL`.
  - Em ambas, troque `[SUA-SENHA]` pela senha do banco que você definiu ao criar o projeto.
- **Project Settings → API Keys**
  - Copie o **Project URL** → isso é o `SUPABASE_URL`.
  - Copie a **secret key** (começa com `sb_secret_...`) → isso é o `SUPABASE_SECRET_KEY`.
  - Copie também a **publishable key** (começa com `sb_publishable_...`) → isso é o `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Essa é segura para expor no navegador, diferente da secret key.
  - O mesmo Project URL do passo acima serve também para `NEXT_PUBLIC_SUPABASE_URL`.
  - Não use o "Legacy JWT Secret" — esse projeto já usa as JWT Signing Keys novas, e a validação é feita chamando o próprio Supabase, não com um segredo fixo.

### 3. Criar o projeto na Vercel
1. Entre em vercel.com com sua conta (pode logar com GitHub).
2. "Add New" → "Project" → selecione o repositório que você acabou de subir.
3. Em "Environment Variables", adicione as seis variáveis do passo 2:
   `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Clique em "Deploy".

Pronto: a Vercel vai instalar as dependências, gerar o Prisma Client e
publicar o site. As rotas ficam disponíveis em
`https://SEU-PROJETO.vercel.app/api/...`.

**Atenção (já registrado no Documento de Arquitetura Técnica):** o plano
Hobby da Vercel proíbe uso comercial. Isso é só para validar a solução;
no primeiro cliente pagante, migrar para um plano pago da Vercel.

### 4. Rodar localmente (opcional, para testar antes de publicar)
Pré-requisito: Node.js instalado no computador.

```
cd gestao-simples-app
cp .env.example .env        # depois edite o .env com os valores reais
npm install
npm run dev
```

Abra `http://localhost:3000` para confirmar que subiu.

## Testando uma rota rapidamente

Depois de publicado, com um token de um usuário logado (`SEU_TOKEN`):

```
curl -X POST https://SEU-PROJETO.vercel.app/api/precificacao/calcular \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"servico_id": "ID-DE-UM-SERVICO"}'
```

Se retornar `PARAMETROS_NAO_CONFIGURADOS`, é porque a tabela
`parametros_precificacao` do tenant ainda não tem uma linha — isso é
esperado até você cadastrar os parâmetros (custo fixo mensal, horas
produtivas, imposto, margem) pelo menos uma vez.
