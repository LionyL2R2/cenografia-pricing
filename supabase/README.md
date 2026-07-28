# Supabase — backend do cenografia-pricing

O app vai de single-file com `localStorage` para multi-tenant: cada usuário entra
com a conta Google e enxerga só os próprios dados. **O app continua single-file** —
sem Next.js, sem build step, sem `package.json`. O Supabase entra por CDN.

Esta pasta é a **fase 1**: schema, RLS e auth. O `index.html` ainda não foi tocado.

| Arquivo | O que é |
|---|---|
| `schema.sql` | tabelas, índices, triggers, RLS e policies. Roda uma vez, é idempotente |
| `testes-rls.sql` | prova que um usuário não enxerga o do outro. Roda quantas vezes quiser |

> **Estado de verificação:** o SQL desta pasta foi escrito e revisado, mas **ainda não
> foi executado** — não há Postgres neste ambiente de desenvolvimento. O primeiro `Run`
> no SQL Editor é o teste de fogo. Se algo quebrar, quebra no passo 3 abaixo, antes de
> qualquer dado real existir.

---

## Passo a passo

### 1 · Criar o projeto no Supabase

1. Entre em <https://supabase.com/dashboard> e clique em **New project**.
2. Preencha:
   - **Name**: `cenografia-pricing`
   - **Database Password**: gere uma forte e **guarde num gerenciador de senhas**. Ela
     não é a chave que o app usa, mas é a única forma de acesso direto ao banco e o
     painel não mostra de novo.
   - **Region**: `South America (São Paulo)` — o app e os usuários estão no Brasil.
3. **Create new project** e espere uns 2 minutos até o provisionamento terminar.

### 2 · Anotar URL e anon key

**Project Settings** (engrenagem) → **API**:

- **Project URL** → `https://xxxxxxxx.supabase.co`
- **Project API keys → `anon` `public`** → um JWT longo começando em `eyJ...`

Em projetos criados recentemente o painel chama isso de **API Keys** e a anon key
aparece como **publishable key** — é a mesma coisa, pode usar.

Guarde os dois: eles vão para o `config.js` no passo 7.

> **Nunca copie a `service_role` key para o app.** Ela ignora RLS por definição e só
> existe para uso em servidor. No navegador ela entrega o banco inteiro para qualquer
> visitante.

### 3 · Rodar o schema

**SQL Editor** → **New query** → cole o conteúdo de `schema.sql` inteiro → **Run**.

Deve terminar em `Success. No rows returned`. Confira em **Table Editor** que
apareceram as 5 tabelas: `perfis`, `clientes`, `itens_catalogo`, `opcoes`,
`orcamentos` — todas com o cadeado de **RLS enabled**.

### 4 · Criar as credenciais no Google Cloud Console

Este é o passo que mais confunde, por causa de dois campos parecidos. A regra:

> O Google **não** aponta para o seu site. O Google aponta para o **Supabase**, e é o
> Supabase que devolve o usuário para o seu site.

1. Abra <https://console.cloud.google.com> e crie (ou selecione) um projeto.
2. **APIs & Services → OAuth consent screen**
   - **User Type**: `External` → **Create**
   - **App name**: `KMF Orçamento` · **User support email**: o seu
   - **Developer contact information**: o seu e-mail → **Save and continue**
   - **Scopes**: não precisa adicionar nada. Os três que o login usa
     (`openid`, `userinfo.email`, `userinfo.profile`) já são padrão → **Save and continue**
   - **Test users**: enquanto o app estiver em `Testing`, **só os e-mails listados aqui
     conseguem logar**. Adicione o seu e o do Silvio. Para liberar geral, volte na
     OAuth consent screen e clique em **Publish app**.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - **Application type**: `Web application`
   - **Name**: `cenografia-pricing web`
   - **Authorized JavaScript origins** — de onde a página é servida:
     ```
     http://localhost:5500
     https://cenografia-pricing.vercel.app
     ```
   - **Authorized redirect URIs** — **só o callback do Supabase**, com o ref do seu
     projeto (o mesmo pedaço da Project URL):
     ```
     https://xxxxxxxx.supabase.co/auth/v1/callback
     ```
   - **Create**. O Google mostra o **Client ID** e o **Client secret** — copie os dois.

Se você usa outra porta no desenvolvimento local (Live Server usa `5500`, `python -m
http.server` usa `8000`), troque o número nas origens. `file://` **não funciona** para
OAuth: sirva o `index.html` por HTTP, nem que seja com um servidor estático de uma linha.

### 5 · Habilitar o provider Google no Supabase

**Authentication** → **Sign In / Providers** (em painéis mais antigos: **Providers**) →
**Google**:

1. Ligue a chave **Enable Sign in with Google**.
2. Cole **Client ID** e **Client Secret** vindos do passo 4.
3. Confira o **Callback URL (for OAuth)** que a tela mostra: tem que ser
   exatamente a URL que você cadastrou no Google. Se não bater, o login falha com
   `redirect_uri_mismatch`.
4. **Save**.

### 6 · Cadastrar as URLs de retorno

**Authentication** → **URL Configuration**:

- **Site URL** — para onde o usuário volta quando o app não pede outra coisa:
  ```
  https://cenografia-pricing.vercel.app
  ```
- **Redirect URLs** — a lista do que é aceito no `redirectTo`. Adicione uma por uma:
  ```
  http://localhost:5500/**
  http://127.0.0.1:5500/**
  https://cenografia-pricing.vercel.app/**
  ```

O `/**` no fim libera qualquer caminho abaixo daquela origem. Sem essas entradas, o
login até acontece mas o Supabase se recusa a devolver o usuário para o app, e a
sessão morre no meio do caminho.

> `localhost` e `127.0.0.1` **não** são a mesma coisa para o navegador. Cadastre os
> dois, ou padronize um e use sempre ele.

### 7 · Configurar o app

Na raiz do repositório:

```powershell
copy config.example.js config.js
```

Preencha `config.js` com a **Project URL** e a **anon key** do passo 2. O arquivo está
no `.gitignore` e não vai para o repositório.

### 8 · Rodar o teste de RLS

**SQL Editor** → **New query** → cole `testes-rls.sql` inteiro → **Run**.

- Sai uma tabela com todas as linhas em `PASS` → isolamento ok.
- Sai um erro vermelho `RLS FUROU — ...` → tem furo, e a mensagem diz qual verificação
  falhou, o que era esperado e o que veio.

O script cria dois usuários fictícios, faz cada um gravar os próprios dados, tenta
todos os cruzamentos (ler, atualizar, apagar e gravar no nome do outro) e termina em
`ROLLBACK` — não sobra nada no banco. Rode de novo sempre que mexer em policy.

---

## Deploy no Vercel — leia antes de publicar

`config.js` está no `.gitignore`, então ele **não sobe no push** e o site publicado
fica sem `SUPABASE_URL`. Isso é consequência direta do requisito de não commitar
chave. Três saídas, da mais simples para a mais trabalhosa:

1. **Commitar o `config.js` mesmo assim.** A anon key é pública por design: ela vai
   embutida no JS que todo visitante baixa, esteja no git ou não. Tirá-la do
   repositório não esconde nada de ninguém — protege apenas contra bots que varrem
   GitHub, e esses acham a chave no site publicado do mesmo jeito. É a opção que a
   maioria dos projetos Supabase de front-end puro adota.
2. **Gerar o `config.js` no deploy.** Em Project Settings → Environment Variables no
   Vercel, crie `SUPABASE_URL` e `SUPABASE_ANON_KEY`, e configure um Build Command que
   escreva o arquivo:
   ```
   node -e "require('fs').writeFileSync('config.js','window.SUPABASE_URL='+JSON.stringify(process.env.SUPABASE_URL)+';window.SUPABASE_ANON_KEY='+JSON.stringify(process.env.SUPABASE_ANON_KEY)+';')"
   ```
   Mantém a chave fora do git, ao custo de introduzir um passo de build — que é
   justamente o que este projeto evita por princípio.
3. **Embutir os valores direto no `index.html`.** Resolve, mas mistura configuração com
   código e obriga a editar o app para trocar de projeto Supabase.

**Recomendação:** opção 1. O ganho de segurança das outras duas é zero, e a 2 quebra a
regra de "sem build step" que sustenta o projeto inteiro. A decisão é sua — nada foi
commitado ainda.

---

## O que o schema garante

**Toda tabela** tem `id`, `user_id`, `created_at` e `updated_at`. Nenhuma tabela tem
dado compartilhado entre usuários.

**RLS ligado em todas**, com uma policy `for all to authenticated`:

```sql
using      (auth.uid() = user_id)   -- quais linhas ele ENXERGA
with check (auth.uid() = user_id)   -- quais linhas ele pode GRAVAR
```

As duas cláusulas são obrigatórias. Só com `using`, um insert conseguiria gravar uma
linha com o `user_id` de outra pessoa: a linha sumiria da vista de quem gravou e
apareceria na do outro. `testes-rls.sql` tem uma verificação dedicada a isso.

**Segunda camada, abaixo do RLS:** `grant` explícito para `authenticated` e `revoke
all` para `anon` nas 5 tabelas. Se um dia alguém escrever uma policy errada, o papel
anônimo ainda esbarra na falta de privilégio antes de chegar na policy.

**`user_id` tem `default auth.uid()`** — o app não precisa mandar o dono em cada
insert, e sem sessão o insert falha no `NOT NULL` em vez de gravar linha órfã.

**`created_at` é imutável.** O trigger reescreve `new.created_at := old.created_at` no
update: nem o app nem um update manual conseguem alterar. `updated_at` é sempre
`now()` do servidor — hora de navegador não é confiável.

**Novo usuário** (trigger em `auth.users`): cria o perfil, já aproveitando nome e
e-mail que vieram do Google, e semeia o catálogo com Trainel, Banner com ilhós, Stand
e Toten (`preco null`), para a conta não abrir vazia.

**`orcamentos.dados`** é `jsonb` com o objeto de estado inteiro, no mesmo formato que o
app grava hoje no `localStorage`. As colunas soltas (`numero`, `nome`, `cliente_nome`,
`data`, `snapshot_total`) existem para listar, buscar e ordenar sem abrir o jsonb —
`dados` continua sendo a fonte da verdade do cálculo.

**`cliente_nome` é denormalizado de propósito.** Se o cliente for apagado, `cliente_id`
vira `null` (`on delete set null`) e o orçamento continua sabendo para quem foi feito.

---

## Pendências conhecidas da fase 1

- **`opcoes` não é semeada.** O trigger de novo usuário semeia só `itens_catalogo`,
  que foi o pedido. Hoje o app semeia também os dropdowns (`OPC_BASE`: Madeira, Placa
  MDF, Metalon, Fita de LED · Marceneiro, Adesivador, Eletricista · Lona, Adesivo).
  Do jeito que está, conta nova abre com os dropdowns vazios. Decidir na fase 2: ou
  semear no trigger, ou deixar o app semear no primeiro login.
- **Sem restrição de duplicata.** O app evita opção repetida comparando sem acento e
  sem caixa (`normNome`). O banco não tem `unique` equivalente — dois registros iguais
  entram sem reclamar. Um índice único funcional resolveria, ao custo de um erro de
  gravação que o app da fase 2 precisaria tratar.
- **Sem `updated_at` vindo do cliente.** Nenhuma coluna registra qual dispositivo
  gravou. Se o mesmo usuário abrir o app em dois navegadores, o último a salvar
  ganha, sem aviso. Só vira problema quando houver uso simultâneo de verdade.
