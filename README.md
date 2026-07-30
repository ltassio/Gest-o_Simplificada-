# Gestão Simples — API Routes

Backend das rotas financeiras descritas na **Documentação da API v1.0**
(Drive/Notion do projeto): cálculo de preço sugerido, registro de
atendimentos (com split de comissão) e resumo de caixa. Construído em
Next.js (API Routes) + Prisma, para rodar 100% grátis no Vercel usando o
banco do Supabase já criado.

## Estrutura

```
app/api/precificacao/calcular/route.ts   → POST cálculo de preço sugerido
app/api/caixa/atendimentos/route.ts      → POST registro de atendimento
app/api/caixa/resumo/route.ts            → GET resumo de caixa por período
lib/prisma.ts                            → conexão única com o banco
lib/auth.ts                              → valida o login do usuário e descobre o tenant
lib/precificacao.ts                      → fórmula de precificação
prisma/schema.prisma                     → espelha as 8 tabelas já criadas no Supabase
```

Importante: estas rotas usam a conexão direta ao banco (`DATABASE_URL`),
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
  - Não use o "Legacy JWT Secret" — esse projeto já usa as JWT Signing Keys novas, e a validação é feita chamando o próprio Supabase, não com um segredo fixo.

### 3. Criar o projeto na Vercel
1. Entre em vercel.com com sua conta (pode logar com GitHub).
2. "Add New" → "Project" → selecione o repositório que você acabou de subir.
3. Em "Environment Variables", adicione as quatro variáveis do passo 2:
   `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
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
