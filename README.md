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
app/dashboard/clientes/page.tsx          → lista + cadastro de clientes, status Ativo/Inativo, histórico de atendimentos
app/dashboard/servicos/page.tsx          → catálogo de produtos e serviços (tipo, duração, custo, preço)
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
lib/permissoes.ts                        → regras de acesso por papel (dono/financeiro/operador)
lib/dre.ts                               → estrutura/labels da DRE (natureza_dre), usada no Plano de Contas e na Fase 3
app/api/usuarios/convidar/route.ts       → POST cria um novo usuário do tenant (só "dono" pode chamar)
app/dashboard/usuarios/page.tsx          → lista a equipe + formulário de convite (só "dono")
app/dashboard/financeiro/fluxo-caixa/page.tsx      → página dedicada do fluxo de caixa (mesmo gráfico do Dashboard)
app/dashboard/financeiro/formas-pagamento/page.tsx → cadastro de formas de pagamento
app/dashboard/financeiro/plano-contas/page.tsx     → cadastro do plano de contas (categorias + linha da DRE)
app/dashboard/financeiro/contas-bancarias/page.tsx → cadastro de contas bancárias e controle de saldo
app/dashboard/sidebar-section.tsx        → seção comprimível da sidebar (usada por "Cadastro de Parceiro" e "Financeiro")
prisma/schema.prisma                     → espelha as tabelas já criadas no Supabase
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

## Módulo Financeiro (aba "Financeiro")

Adicionado em 30/07/2026 (Documento de Modelagem de Banco de Dados v1.2),
por pedido do usuário: uma aba "Financeiro" reunindo Lançamento (Contas a
Pagar/Receber), Fluxo de Caixa, Formas de Pagamento, Plano de Contas, DRE,
Caixa aberto/fechado e Orçamento — junto com controle de acesso por papel.
Combinado com o usuário implementar por fases:

- **Fase 1 (entregue nesta versão):** controle de acesso (usuários com
  papel), Formas de Pagamento, Plano de Contas, reorganização do menu.
- **Fase 2 (próxima):** Caixa com abertura/fechamento (caixa único por
  dia) e Visão de Caixa Mensal/Anual.
- **Fase 3 (depois):** DRE completa (padrão contábil) e Orçamento,
  usando o Plano de Contas já cadastrado nesta fase.

### Controle de acesso (papéis)

Cada usuário (`perfis`) agora tem um `papel`: **dono**, **financeiro** ou
**operador**.

- **Dono** — acesso total, único papel que gerencia usuários (tela
  `/dashboard/usuarios`).
- **Financeiro** — acesso total ao módulo Financeiro (lançar, ver Fluxo
  de Caixa, Plano de Contas, Formas de Pagamento, e nas próximas fases
  DRE/Orçamento), mas não gerencia usuários.
- **Operador** — **não enxerga o módulo Financeiro** (Contas a Pagar/
  Receber, Fornecedores, Plano de Contas, Formas de Pagamento). Continua
  vendo Agenda, Clientes, Serviços e Caixa (atendimentos do dia).

A restrição é aplicada em duas camadas, e a do banco é a que vale de
verdade:

1. **RLS no Supabase** (função `papel_atual()`, migration
   `004_financeiro_fase1.sql`): as políticas de `fornecedores`,
   `contas_pagar`, `contas_receber`, `formas_pagamento` e `plano_contas`
   só permitem leitura/escrita para `papel_atual() in ('dono',
   'financeiro')`. Isso vale mesmo que alguém chame a API do Supabase
   diretamente, sem passar pela interface.
2. **Ocultação de menu/seções na UI** (`lib/permissoes.ts`): usabilidade,
   não segurança — some com os links e cards que o papel não deveria ver.

Atenção para código novo que usa **Prisma** (API Routes e Server
Components, ex.: `app/dashboard/page.tsx`): a conexão via `DATABASE_URL`
**não passa pela RLS**, então o filtro por papel precisa ser feito
manualmente no código (ver `podeVerFinanceiro()` sendo checado antes de
chamar `getFluxoDeCaixa` no Dashboard) — a RLS sozinha não protege quem
acessa via Prisma.

Criar/remover usuário só acontece pela rota `/api/usuarios/convidar`
(usa a service key) — a tabela `perfis` não tem política de `INSERT`
para o navegador de propósito. Não há e-mail transacional configurado:
ao criar um usuário, a tela mostra uma senha temporária uma única vez
para o dono repassar à pessoa; ela pode trocá-la depois pelo "esqueci
minha senha" da tela de login.

### Formas de Pagamento e Plano de Contas

Cadastros-base para os lançamentos financeiros. Já vêm semeados com
valores padrão para um negócio de serviços (salão/estúdio) na migration
`004_financeiro_fase1.sql`:

- **Formas de Pagamento:** Dinheiro, Pix, Cartão de Débito, Cartão de
  Crédito, Boleto, Transferência Bancária.
- **Plano de Contas:** Receita de Serviços, Impostos sobre Serviços
  (Simples Nacional/ISS), Comissões de Profissionais, Produtos e
  Materiais, Aluguel, Água/Luz/Internet, Marketing, Materiais de
  Escritório, Manutenção, Outras Despesas Administrativas, Juros e
  Tarifas Bancárias, Rendimentos Financeiros — cada uma já marcada com a
  linha da DRE a que pertence (`natureza_dre`, ver `lib/dre.ts`), para a
  Fase 3 conseguir montar a DRE automaticamente.

Contas a Pagar e Contas a Receber já têm campos opcionais de categoria
(Plano de Contas) e forma de pagamento — preenchê-los agora é o que vai
alimentar a DRE com dados reais quando a Fase 3 chegar.

### Contas Bancárias

Adicionado em 30/07/2026, também a pedido do usuário: cadastro das contas
de banco do estúdio (nome, banco, agência, número, tipo) com saldo
inicial e saldo atual — para controlar quanto tem em cada conta,
separado de Contas a Pagar/Receber (o que ainda vai sair/entrar) e do
Caixa (caixa físico do dia a dia, Fase 2).

Nesta primeira versão o saldo é atualizado **manualmente** pela própria
tela (botão "Atualizar saldo" em cada linha) — pensado para bater com o
extrato do banco sempre que o usuário quiser. Não há conciliação
automática a partir dos lançamentos de Contas a Pagar/Receber ou do
Caixa ainda; isso fica para uma fase futura, quando fizer sentido
vincular cada lançamento a uma conta bancária específica (a tabela já
foi desenhada pensando nisso, mas essa ligação não existe hoje).

Migration `005_contas_bancarias.sql`, mesmo padrão de RLS por papel das
demais tabelas do Financeiro (só `dono`/`financeiro` leem e escrevem).

### Sidebar comprimível

A partir de 30/07/2026 as seções "Cadastro de Parceiro" e "Financeiro" da
barra lateral começam **fechadas** por padrão e expandem ao clicar no
título — implementado em `app/dashboard/sidebar-section.tsx` (Client
Component com estado local). Se a página atual já está dentro da seção
(ex.: usuário deu refresh numa tela do Financeiro), a seção abre sozinha
para não esconder onde a pessoa está. A seção "Administração" (Usuários)
continua sempre visível normalmente, sem comprimir.

### Cadastro de Parceiro

Adicionado em 30/07/2026 a pedido do usuário: agrupa Fornecedor,
Profissional e Cliente na mesma seção da sidebar, já que os três são
"parceiros" do negócio (quem fornece, quem atende, quem é atendido).
Fornecedor só aparece no menu para `dono`/`financeiro` (mesma regra de
sempre, reforçada por RLS); Profissional e Cliente continuam visíveis
para qualquer papel.

### Produto e Serviço

Também 30/07/2026: a antiga tela "Serviços" virou "Produtos e Serviços".
Em vez de criar uma tabela nova, a tabela `servicos` ganhou a coluna
`tipo` (`'servico'` ou `'produto'`, migration `006`) — as duas coisas
compartilham cadastro (nome, preço, categoria) e Serviço já é referenciado
por Agendamento/Atendimento, então separar em tabelas duplicaria essas
relações sem ganho real agora. Duração e custo de material só aparecem no
formulário quando o tipo é "Serviço". Agenda, Caixa e Precificação
filtram por `tipo = 'servico'` ao listar opções, então produtos não
aparecem como algo agendável/atendível — o cadastro de produto serve por
enquanto só para catálogo e preço.

### Clientes: status e histórico de atendimentos

Cliente ganhou o campo `ativo` (migration `006`, mesmo padrão de
`profissionais.ativo`), com botão Ativar/Desativar na lista — cliente
inativo continua aparecendo no histórico, só some das listas de "cliente
ativo" usadas em Agenda, Caixa e Contas a Receber ao criar um novo
lançamento.

A tela de Clientes também ganhou um botão "Ver histórico" por linha, que
expande a lista de atendimentos daquele cliente (data, profissional que
atendeu, serviço e valor cobrado) — consulta direta em `atendimentos`
com join em `profissionais`/`servicos`, sem precisar de API Route
própria porque essas tabelas já são abertas por RLS a qualquer papel do
tenant.

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
