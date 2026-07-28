-- ============================================================================
-- cenografia-pricing · schema multi-tenant (fase 1)
--
-- Rode este arquivo INTEIRO no SQL Editor do Supabase, uma vez, num projeto
-- novo. É idempotente: rodar de novo não duplica nada e não apaga dados.
--
-- Regra que vale para o arquivo todo: NÃO existe dado compartilhado entre
-- usuários. Toda tabela tem user_id, toda tabela tem RLS ligado, e toda
-- policy é auth.uid() = user_id. Não há policy pública, nem de leitura.
-- ============================================================================

-- gen_random_uuid() vem daqui. No Supabase já vem instalada, mas deixamos
-- explícito para o arquivo rodar sozinho em qualquer Postgres.
create extension if not exists pgcrypto;

-- ============================================================================
-- 1 · CARIMBO DE TEMPO
-- created_at é gravado uma vez e nunca mais muda — nem por UPDATE que tente
-- reescrever a coluna. updated_at é sempre now() no servidor: hora de cliente
-- não é confiável e o app roda em navegador.
-- ============================================================================
create or replace function public.tg_carimbo()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    new.created_at := now();
    new.updated_at := now();
  elsif (tg_op = 'UPDATE') then
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ============================================================================
-- 2 · TABELAS
--
-- user_id tem default auth.uid(): o app não precisa mandar o dono em cada
-- insert, e se não houver sessão o insert falha no NOT NULL em vez de gravar
-- órfão. on delete cascade: apagar a conta apaga tudo que era dela.
-- ============================================================================

-- dados da empresa do próprio usuário ("Meus dados" do app)
create table if not exists public.perfis (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome_empresa  text,
  razao_social  text,
  doc           text,
  telefone      text,
  email         text,
  cidade        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- carteira de clientes do usuário
create table if not exists public.clientes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome          text,
  razao_social  text,
  doc           text,
  telefone      text,
  email         text,
  cidade        text,
  observacoes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- catálogo de itens prontos (nome + unidade + preço padrão)
create table if not exists public.itens_catalogo (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome          text,
  unidade       text,
  preco         numeric,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- listas de dropdown por setor (materiais · producao · impressao)
create table if not exists public.opcoes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  setor         text,
  valor         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- orçamentos. As colunas soltas existem para listar, buscar e ordenar sem
-- abrir o jsonb; `dados` continua sendo a fonte da verdade do cálculo, no
-- mesmo formato que o app já grava hoje no localStorage.
create table if not exists public.orcamentos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero         text,
  nome           text,
  cliente_id     uuid references public.clientes(id) on delete set null,
  -- denormalizado de propósito: se o cliente for apagado, o orçamento continua
  -- sabendo para quem foi feito. cliente_id vira null, cliente_nome fica.
  cliente_nome   text,
  data           date,
  validade_dias  int default 15,
  observacoes    text,
  schema_version int default 3,
  dados          jsonb not null default '{}'::jsonb,
  snapshot_total numeric,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ============================================================================
-- 3 · ÍNDICES
-- Todo SELECT do app passa por user_id (a policy força isso), então o índice
-- por user_id não é opcional — sem ele toda leitura vira seq scan.
-- ============================================================================
create index if not exists perfis_user_id_idx         on public.perfis(user_id);
create index if not exists clientes_user_id_idx       on public.clientes(user_id);
create index if not exists itens_catalogo_user_id_idx on public.itens_catalogo(user_id);
create index if not exists opcoes_user_id_idx         on public.opcoes(user_id);
create index if not exists orcamentos_user_id_idx     on public.orcamentos(user_id);

create index if not exists opcoes_user_setor_idx      on public.opcoes(user_id, setor);
create index if not exists orcamentos_cliente_id_idx  on public.orcamentos(cliente_id);
-- lista da tela Início: mais recentes primeiro, do usuário logado
create index if not exists orcamentos_user_updated_idx on public.orcamentos(user_id, updated_at desc);

-- ============================================================================
-- 4 · TRIGGERS DE CARIMBO
-- ============================================================================
drop trigger if exists carimbo_perfis         on public.perfis;
drop trigger if exists carimbo_clientes       on public.clientes;
drop trigger if exists carimbo_itens_catalogo on public.itens_catalogo;
drop trigger if exists carimbo_opcoes         on public.opcoes;
drop trigger if exists carimbo_orcamentos     on public.orcamentos;

create trigger carimbo_perfis         before insert or update on public.perfis         for each row execute function public.tg_carimbo();
create trigger carimbo_clientes       before insert or update on public.clientes       for each row execute function public.tg_carimbo();
create trigger carimbo_itens_catalogo before insert or update on public.itens_catalogo for each row execute function public.tg_carimbo();
create trigger carimbo_opcoes         before insert or update on public.opcoes         for each row execute function public.tg_carimbo();
create trigger carimbo_orcamentos     before insert or update on public.orcamentos     for each row execute function public.tg_carimbo();

-- ============================================================================
-- 5 · ROW LEVEL SECURITY
--
-- Uma policy por tabela, cobrindo select/insert/update/delete (for all).
--   USING      → quais linhas o usuário ENXERGA (select/update/delete)
--   WITH CHECK → quais linhas ele pode GRAVAR (insert/update)
-- As duas são obrigatórias: só com USING, um insert poderia gravar uma linha
-- com o user_id de outra pessoa — some da vista de quem gravou e aparece na
-- do outro. `to authenticated` deixa o papel anon sem nenhum caminho.
-- ============================================================================
alter table public.perfis         enable row level security;
alter table public.clientes       enable row level security;
alter table public.itens_catalogo enable row level security;
alter table public.opcoes         enable row level security;
alter table public.orcamentos     enable row level security;

drop policy if exists dono_perfis         on public.perfis;
drop policy if exists dono_clientes       on public.clientes;
drop policy if exists dono_itens_catalogo on public.itens_catalogo;
drop policy if exists dono_opcoes         on public.opcoes;
drop policy if exists dono_orcamentos     on public.orcamentos;

create policy dono_perfis on public.perfis
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy dono_clientes on public.clientes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy dono_itens_catalogo on public.itens_catalogo
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy dono_opcoes on public.opcoes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy dono_orcamentos on public.orcamentos
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- 5.1 · PRIVILÉGIOS DE TABELA (segunda camada, abaixo do RLS)
--
-- RLS decide QUAIS LINHAS cada um vê. GRANT decide se o papel pode encostar na
-- tabela. São camadas independentes, e é de propósito: se um dia alguém
-- escrever uma policy errada, o papel anon ainda esbarra na falta de
-- privilégio antes de chegar na policy. O Supabase concede acesso a anon e
-- authenticated por default privileges; aqui a gente diz explicitamente o que
-- quer, em vez de depender do default.
-- ============================================================================
grant select, insert, update, delete on
  public.perfis, public.clientes, public.itens_catalogo, public.opcoes, public.orcamentos
  to authenticated;

revoke all on
  public.perfis, public.clientes, public.itens_catalogo, public.opcoes, public.orcamentos
  from anon;

-- ============================================================================
-- 6 · NOVO USUÁRIO
--
-- Dispara no primeiro login pelo Google. Cria o perfil (já aproveitando nome e
-- e-mail que o Google mandou) e semeia catálogo e dropdowns, para a conta nova
-- não abrir vazia.
--
-- O que é semeado aqui é EXATAMENTE o que o index.html semeia hoje no
-- localStorage (ITENS_PRONTOS e OPC_BASE). Se um dia a lista do app mudar, esta
-- função muda junto — são a mesma decisão de produto em dois lugares.
--
-- security definer porque roda no contexto do Auth, onde auth.uid() ainda é
-- null e as policies barrariam o insert. search_path fixo em public para a
-- função não ser sequestrada por um schema plantado no meio do caminho.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (user_id, nome_empresa, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email
  );

  -- catálogo de itens prontos · espelha ITENS_PRONTOS do index.html
  insert into public.itens_catalogo (user_id, nome, unidade, preco) values
    (new.id, 'Trainel',          'm²',   null),
    (new.id, 'Banner com ilhós', 'm²',   null),
    (new.id, 'Stand',            'peça', null),
    (new.id, 'Toten',            'peça', null);

  -- listas de dropdown · espelha OPC_BASE do index.html
  insert into public.opcoes (user_id, setor, valor) values
    (new.id, 'materiais', 'Madeira'),
    (new.id, 'materiais', 'Placa MDF'),
    (new.id, 'materiais', 'Metalon'),
    (new.id, 'materiais', 'Fita de LED'),
    (new.id, 'producao',  'Marceneiro'),
    (new.id, 'producao',  'Adesivador'),
    (new.id, 'producao',  'Eletricista'),
    (new.id, 'impressao', 'Lona'),
    (new.id, 'impressao', 'Adesivo');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
