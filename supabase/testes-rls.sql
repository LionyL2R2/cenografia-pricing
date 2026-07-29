-- ============================================================================
-- cenografia-pricing · teste de isolamento do RLS
--
-- COMO RODAR
--   1. Rode o supabase/schema.sql antes, uma vez.
--   2. SQL Editor do Supabase → New query
--   3. Cole este arquivo INTEIRO e clique em Run
--   4. Leia a tabela de resultado: toda linha tem que sair com situacao = PASS
--
-- Como ler:
--   · tabela com tudo PASS      → isolamento ok
--   · erro vermelho "RLS FUROU" → tem furo, a mensagem diz qual verificação
--     falhou, o que era esperado e o que veio
--
-- O script inteiro roda em uma transação e termina em ROLLBACK: os dois
-- usuários fictícios, os dados deles e as tabelas de andaime somem no fim.
-- Não sobra lixo e dá para rodar quantas vezes quiser. Se alguma verificação
-- falhar, a exceção aborta a transação — o rollback acontece do mesmo jeito,
-- mas aí a tabela de resultado não chega a ser exibida: leia o texto do erro.
--
-- POR QUE NÃO BASTA RODAR UM SELECT NO EDITOR: o SQL Editor conecta como
-- superusuário, e superusuário IGNORA RLS. Este script troca o papel para
-- `authenticated` e injeta o claim `sub` do JWT — é de lá que auth.uid() lê. É
-- assim que a policy passa a valer, igual ao que acontece no navegador.
--
-- Duas escolhas de implementação, ambas para o teste não mentir:
--   · o SET ROLE é sempre inline, nunca dentro de função: SET LOCAL dentro de
--     função tem regra de escopo própria na saída, e um teste que silenciosamente
--     rodasse como superusuário passaria com o RLS quebrado;
--   · as tabelas de andaime ficam em `public` e não são TEMPORARY, porque o
--     papel `authenticated` precisa enxergá-las depois do SET ROLE e o schema
--     temporário pertence ao postgres. Elas somem no ROLLBACK.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Andaime
-- ----------------------------------------------------------------------------
create table public._rls_ids (apelido text primary key, id uuid not null, claims text);
create table public._rls_res (
  ordem    serial primary key,
  teste    text,
  esperado text,
  obtido   text,
  situacao text
);

grant select on public._rls_ids to authenticated, anon;
grant select, insert on public._rls_res to authenticated, anon;
grant usage, select on sequence public._rls_res_ordem_seq to authenticated, anon;

-- registra uma verificação. Compara como texto e com IS NOT DISTINCT FROM,
-- para NULL contar como valor em vez de envenenar a comparação.
create function public._rls_checar(p_teste text, p_esperado text, p_obtido text)
returns void language plpgsql as $$
begin
  insert into public._rls_res (teste, esperado, obtido, situacao)
  values (p_teste, p_esperado, p_obtido,
          case when p_esperado is not distinct from p_obtido then 'PASS' else 'FALHA' end);
end;
$$;

-- ----------------------------------------------------------------------------
-- Dois usuários fictícios. O trigger on_auth_user_created dispara neste insert,
-- então cada um já nasce com perfil e catálogo — o teste confere isso também.
-- ----------------------------------------------------------------------------
insert into public._rls_ids (apelido, id) values ('ana', gen_random_uuid()), ('bruno', gen_random_uuid());
update public._rls_ids
   set claims = json_build_object('sub', id, 'role', 'authenticated')::text;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id,
       '00000000-0000-0000-0000-000000000000',
       'authenticated',
       'authenticated',
       apelido || '@teste-rls.local',
       '{"provider":"google","providers":["google"]}'::jsonb,
       jsonb_build_object('full_name', initcap(apelido) || ' Teste'),
       now(), now()
from public._rls_ids;

-- ============================================================================
-- 1 · O trigger de novo usuário rodou para os dois
-- ============================================================================
select public._rls_checar('trigger: um perfil por usuário', '2',
  (select count(*) from public.perfis where user_id in (select id from public._rls_ids))::text);
select public._rls_checar('trigger: perfil puxou o nome que veio do Google', 'Ana Teste',
  (select nome_empresa from public.perfis where user_id = (select id from public._rls_ids where apelido = 'ana')));
select public._rls_checar('trigger: perfil puxou o e-mail', 'ana@teste-rls.local',
  (select email from public.perfis where user_id = (select id from public._rls_ids where apelido = 'ana')));
select public._rls_checar('trigger: 4 itens de catálogo por usuário', '8',
  (select count(*) from public.itens_catalogo where user_id in (select id from public._rls_ids))::text);
select public._rls_checar('trigger: catálogo com os nomes certos', 'Banner com ilhós,Stand,Toten,Trainel',
  (select string_agg(distinct nome, ',' order by nome) from public.itens_catalogo where user_id in (select id from public._rls_ids)));
select public._rls_checar('trigger: item de m² com a unidade certa', 'm²',
  (select distinct unidade from public.itens_catalogo where nome = 'Trainel' and user_id in (select id from public._rls_ids)));
select public._rls_checar('trigger: item de peça com a unidade certa', 'peça',
  (select distinct unidade from public.itens_catalogo where nome = 'Stand' and user_id in (select id from public._rls_ids)));
select public._rls_checar('trigger: preço do catálogo nasce nulo', '0',
  (select count(*) from public.itens_catalogo where user_id in (select id from public._rls_ids) and preco is not null)::text);

-- dropdowns semeados · tem que bater com OPC_BASE do index.html, item a item
select public._rls_checar('trigger: 9 opções por usuário', '18',
  (select count(*) from public.opcoes where user_id in (select id from public._rls_ids))::text);
select public._rls_checar('trigger: opções de materiais', 'Fita de LED,Madeira,Metalon,Placa MDF',
  (select string_agg(distinct valor, ',' order by valor) from public.opcoes
    where setor = 'materiais' and user_id in (select id from public._rls_ids)));
select public._rls_checar('trigger: opções de produção', 'Adesivador,Eletricista,Marceneiro',
  (select string_agg(distinct valor, ',' order by valor) from public.opcoes
    where setor = 'producao' and user_id in (select id from public._rls_ids)));
select public._rls_checar('trigger: opções de impressão', 'Adesivo,Lona',
  (select string_agg(distinct valor, ',' order by valor) from public.opcoes
    where setor = 'impressao' and user_id in (select id from public._rls_ids)));
select public._rls_checar('trigger: nenhum setor fora dos três do app', '0',
  (select count(*) from public.opcoes
    where user_id in (select id from public._rls_ids)
      and setor not in ('materiais','producao','impressao'))::text);

-- ordem das listas · tem que sair do banco na MESMA ordem do index.html
select public._rls_checar('ordem: materiais na sequência do OPC_BASE', 'Madeira,Placa MDF,Metalon,Fita de LED',
  (select string_agg(valor, ',' order by ordem) from public.opcoes
    where setor = 'materiais' and user_id = (select id from public._rls_ids where apelido = 'ana')));
select public._rls_checar('ordem: producao na sequência do OPC_BASE', 'Marceneiro,Adesivador,Eletricista',
  (select string_agg(valor, ',' order by ordem) from public.opcoes
    where setor = 'producao' and user_id = (select id from public._rls_ids where apelido = 'ana')));
select public._rls_checar('ordem: impressao na sequência do OPC_BASE', 'Lona,Adesivo',
  (select string_agg(valor, ',' order by ordem) from public.opcoes
    where setor = 'impressao' and user_id = (select id from public._rls_ids where apelido = 'ana')));
select public._rls_checar('ordem: catálogo na sequência do ITENS_PRONTOS', 'Trainel,Banner com ilhós,Stand,Toten',
  (select string_agg(nome, ',' order by ordem) from public.itens_catalogo
    where user_id = (select id from public._rls_ids where apelido = 'ana')));
select public._rls_checar('ordem: nenhuma posição repetida dentro do mesmo setor', '0',
  (select count(*) from (
     select setor, ordem from public.opcoes
      where user_id = (select id from public._rls_ids where apelido = 'ana')
      group by setor, ordem having count(*) > 1) d)::text);

-- ============================================================================
-- 2 · Cada um insere os seus dados, como ele mesmo, passando pela policy
-- ============================================================================
select set_config('request.jwt.claims', (select claims from public._rls_ids where apelido = 'ana'), true);
set local role authenticated;

  insert into public.clientes (nome, doc) values ('Cliente da Ana', '111');
  insert into public.opcoes (setor, valor) values ('materiais', 'Madeira da Ana');
  insert into public.orcamentos (nome, cliente_nome, snapshot_total, dados)
    values ('Orçamento da Ana', 'Cliente da Ana', 1000, '{"schemaVersion":3}'::jsonb);
  select public._rls_checar('insert sem passar user_id pega o dono pelo default', '1',
    (select count(*) from public.orcamentos)::text);

reset role;

select set_config('request.jwt.claims', (select claims from public._rls_ids where apelido = 'bruno'), true);
set local role authenticated;

  insert into public.clientes (nome, doc) values ('Cliente do Bruno', '222');
  insert into public.opcoes (setor, valor) values ('materiais', 'Madeira do Bruno');
  insert into public.orcamentos (nome, cliente_nome, snapshot_total, dados)
    values ('Orçamento do Bruno', 'Cliente do Bruno', 2000, '{"schemaVersion":3}'::jsonb);

reset role;

-- ============================================================================
-- 0 · Guarda do próprio teste
-- Se o SET ROLE não estiver pegando, tudo abaixo rodaria como superusuário e
-- passaria com o RLS quebrado. Esta verificação existe para o teste não mentir.
-- ============================================================================
select set_config('request.jwt.claims', (select claims from public._rls_ids where apelido = 'ana'), true);
set local role authenticated;

  select public._rls_checar('GUARDA: o papel virou authenticated', 'authenticated', current_user::text);
  select public._rls_checar('GUARDA: auth.uid() é a Ana',
    (select id::text from public._rls_ids where apelido = 'ana'), auth.uid()::text);

-- ============================================================================
-- 3 · SELECT: ninguém enxerga o do outro
-- ============================================================================
  select public._rls_checar('ana enxerga só o próprio cliente',   'Cliente da Ana',   (select string_agg(nome, ',' order by nome) from public.clientes));
  select public._rls_checar('ana enxerga só o próprio orçamento', 'Orçamento da Ana', (select string_agg(nome, ',' order by nome) from public.orcamentos));
  select public._rls_checar('ana enxerga as próprias opções (9 semeadas + 1 criada)', '10',
    (select count(*) from public.opcoes)::text);
  select public._rls_checar('ana não enxerga a opção do Bruno', '0',
    (select count(*) from public.opcoes where valor = 'Madeira do Bruno')::text);
  select public._rls_checar('ana enxerga só o próprio perfil',    '1', (select count(*) from public.perfis)::text);
  select public._rls_checar('ana enxerga só o próprio catálogo',  '4', (select count(*) from public.itens_catalogo)::text);
  select public._rls_checar('ana não acha o orçamento do Bruno nem filtrando pelo valor', '0',
    (select count(*) from public.orcamentos where snapshot_total = 2000)::text);

-- ============================================================================
-- 4 · UPDATE e DELETE não alcançam a linha do outro
-- A linha do outro é invisível, então o comando acerta zero linhas — não dá
-- erro, simplesmente não encontra nada. É o comportamento correto do RLS.
-- ============================================================================
  with alvo as (update public.orcamentos set nome = 'INVADIDO' where snapshot_total = 2000 returning 1)
    select public._rls_checar('ana não dá UPDATE no orçamento do Bruno', '0', (select count(*) from alvo)::text);
  with alvo as (delete from public.orcamentos where snapshot_total = 2000 returning 1)
    select public._rls_checar('ana não dá DELETE no orçamento do Bruno', '0', (select count(*) from alvo)::text);
  with alvo as (delete from public.clientes where doc = '222' returning 1)
    select public._rls_checar('ana não apaga o cliente do Bruno', '0', (select count(*) from alvo)::text);

-- ============================================================================
-- 4.1 · NORMALIZAÇÃO DE FRONTEIRA ('' → null na gravação)
--
-- O app escreve vazio como '', o banco como null. Os triggers de normalização
-- fecham essa diferença na gravação. Este bloco prova que nenhum caminho
-- escapa — e o pedaço do `preco` é o mais importante da suíte inteira.
--
-- Continua rodando como a Ana. Tudo que é criado aqui é apagado no fim do
-- bloco, para as contagens das seções seguintes continuarem valendo.
-- ============================================================================

  -- ---------- texto: '' e só-espaços viram null ----------
  insert into public.clientes (nome, razao_social, doc, telefone, email, cidade, observacoes)
    values ('Normalização', '', '   ', '', '  ', '', '');
  select public._rls_checar('texto: string vazia vira null', '0',
    (select count(*) from public.clientes
      where nome = 'Normalização'
        and (razao_social = '' or doc = '' or telefone = '' or email = '' or cidade = '' or observacoes = ''))::text);
  select public._rls_checar('texto: só-espaços também vira null', '6',
    (select (razao_social is null)::int + (doc is null)::int + (telefone is null)::int
          + (email is null)::int + (cidade is null)::int + (observacoes is null)::int
       from public.clientes where nome = 'Normalização')::text);
  select public._rls_checar('texto: valor de verdade não é tocado', 'Normalização',
    (select nome from public.clientes where nome = 'Normalização'));

  insert into public.orcamentos (nome, numero, nome_projeto, tipo_item, cliente_nome, observacoes, dados)
    values ('Norm Orc', '', '  ', '', '', '', '{}'::jsonb);
  select public._rls_checar('orçamento: os cinco campos de texto vazios viram null', '5',
    (select (numero is null)::int + (nome_projeto is null)::int + (tipo_item is null)::int
          + (cliente_nome is null)::int + (observacoes is null)::int
       from public.orcamentos where nome = 'Norm Orc')::text);

  -- ---------- as duas colunas novas de orcamentos existem e guardam valor ----------
  update public.orcamentos set nome_projeto = 'Túnel Sensorial', tipo_item = 'Túnel cenográfico'
    where nome = 'Norm Orc';
  select public._rls_checar('nome_projeto guarda meta.nome, separado de snapshot.nome', 'Norm Orc|Túnel Sensorial',
    (select nome || '|' || nome_projeto from public.orcamentos where nome = 'Norm Orc'));
  select public._rls_checar('tipo_item tem coluna própria, sem abrir o jsonb', 'Túnel cenográfico',
    (select tipo_item from public.orcamentos where nome = 'Norm Orc'));

  -- ---------- preço: o caso que imprime R$ 0,00 na proposta do cliente ----------
  -- "sem preço" tem que ser null. Se virar 0, o item sai como R$ 0,00 num
  -- documento que vai para o cliente — o app estaria oferecendo de graça.
  insert into public.itens_catalogo (nome, unidade, preco, ordem)
    values ('Norm Sem Preço', 'm²', null, 90);
  select public._rls_checar('preço: null continua null, não vira zero', 'null',
    (select coalesce(preco::text, 'null') from public.itens_catalogo where nome = 'Norm Sem Preço'));
  select public._rls_checar('preço: nenhum item do catálogo tem preço zero', '0',
    (select count(*) from public.itens_catalogo where preco = 0)::text);

  insert into public.itens_catalogo (nome, unidade, preco, ordem)
    values ('Norm Com Preço', 'm²', 90, 91);
  select public._rls_checar('preço: valor real é preservado', '90',
    (select preco::text from public.itens_catalogo where nome = 'Norm Com Preço'));

do $$
declare v_barrou boolean := false;
begin
  begin
    insert into public.itens_catalogo (nome, unidade, preco, ordem)
      values ('Norm Preço Zero', 'm²', 0, 92);
  exception when check_violation then
    v_barrou := true;
  end;
  perform public._rls_checar('preço: INSERT com zero é rejeitado alto, não vira R$ 0,00', 'true', v_barrou::text);
end;
$$;

do $$
declare v_barrou boolean := false;
begin
  begin
    update public.itens_catalogo set preco = 0 where nome = 'Norm Com Preço';
  exception when check_violation then
    v_barrou := true;
  end;
  perform public._rls_checar('preço: UPDATE para zero também é rejeitado', 'true', v_barrou::text);
end;
$$;

  select public._rls_checar('preço: o item continua com o valor que tinha', '90',
    (select preco::text from public.itens_catalogo where nome = 'Norm Com Preço'));

  -- limpeza do bloco, para as contagens seguintes não mudarem
  delete from public.itens_catalogo where nome like 'Norm %';
  delete from public.orcamentos where nome = 'Norm Orc';
  delete from public.clientes  where nome = 'Normalização';
  select public._rls_checar('limpeza: o catálogo da Ana voltou aos 4 semeados', '4',
    (select count(*) from public.itens_catalogo)::text);
  select public._rls_checar('limpeza: a Ana voltou a ter 1 orçamento', '1',
    (select count(*) from public.orcamentos)::text);

-- ============================================================================
-- 5 · WITH CHECK: não dá para gravar linha no nome de outro
--
-- É o furo que USING sozinho deixaria passar: a linha sumiria da vista de quem
-- gravou e apareceria na do outro. Aqui a gravação tem que ser REJEITADA, não
-- apenas invisível. O papel continua sendo o da Ana, definido acima.
-- ============================================================================
do $$
declare v_bruno uuid; v_barrou boolean := false;
begin
  select id into v_bruno from public._rls_ids where apelido = 'bruno';
  begin
    insert into public.orcamentos (user_id, nome, dados) values (v_bruno, 'PLANTADO', '{}'::jsonb);
  exception when insufficient_privilege or check_violation then
    v_barrou := true;
  end;
  perform public._rls_checar('ana não INSERE orçamento no nome do Bruno', 'true', v_barrou::text);
end;
$$;

do $$
declare v_bruno uuid; v_barrou boolean := false;
begin
  select id into v_bruno from public._rls_ids where apelido = 'bruno';
  begin
    update public.orcamentos set user_id = v_bruno;    -- tentar "doar" a própria linha
  exception when insufficient_privilege or check_violation then
    v_barrou := true;
  end;
  perform public._rls_checar('ana não TRANSFERE o próprio orçamento para o Bruno', 'true', v_barrou::text);
end;
$$;

reset role;

-- ---------- o outro lado continua intacto depois de tudo isso ----------
select set_config('request.jwt.claims', (select claims from public._rls_ids where apelido = 'bruno'), true);
set local role authenticated;

  select public._rls_checar('bruno enxerga só o próprio cliente',   'Cliente do Bruno',   (select string_agg(nome, ',' order by nome) from public.clientes));
  select public._rls_checar('bruno enxerga só o próprio orçamento', 'Orçamento do Bruno', (select string_agg(nome, ',' order by nome) from public.orcamentos));
  select public._rls_checar('bruno enxerga as próprias opções (9 semeadas + 1 criada)', '10',
    (select count(*) from public.opcoes)::text);
  select public._rls_checar('bruno não enxerga a opção da Ana', '0',
    (select count(*) from public.opcoes where valor = 'Madeira da Ana')::text);
  select public._rls_checar('bruno enxerga só o próprio catálogo',  '4', (select count(*) from public.itens_catalogo)::text);
  select public._rls_checar('o orçamento do Bruno continua intacto', 'Orçamento do Bruno',
    (select nome from public.orcamentos where snapshot_total = 2000));
  select public._rls_checar('o cliente do Bruno continua lá', '1', (select count(*) from public.clientes)::text);
  select public._rls_checar('o orçamento do Bruno continua sendo dele',
    (select id::text from public._rls_ids where apelido = 'bruno'),
    (select user_id::text from public.orcamentos where snapshot_total = 2000));

-- ============================================================================
-- 8 · cliente_nome sobrevive ao cliente ser apagado
-- ============================================================================
  update public.orcamentos o set cliente_id = c.id from public.clientes c where c.doc = '222';
  delete from public.clientes where doc = '222';
  select public._rls_checar('apagar o cliente zera cliente_id', '0',
    (select count(*) from public.orcamentos where cliente_id is not null)::text);
  select public._rls_checar('apagar o cliente NÃO apaga o orçamento', '1',
    (select count(*) from public.orcamentos)::text);
  select public._rls_checar('apagar o cliente NÃO apaga o nome dele no orçamento', 'Cliente do Bruno',
    (select cliente_nome from public.orcamentos));

reset role;

-- ============================================================================
-- 6 · Sem sessão (papel anon) não se enxerga nada
--
-- Duas camadas podem barrar: a falta de GRANT (erro de privilégio) ou a
-- ausência de policy para anon (zero linhas). Qualquer uma das duas é PASS —
-- o que não pode é voltar linha.
-- ============================================================================
do $$
declare
  v_tabelas text[] := array['orcamentos','clientes','perfis','itens_catalogo','opcoes'];
  v_tab text; v_n int; v_situacao text;
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  foreach v_tab in array v_tabelas loop
    begin
      execute format('select count(*) from public.%I', v_tab) into v_n;
      v_situacao := case when v_n = 0 then 'sem linhas' else v_n::text || ' linha(s)' end;
    exception when insufficient_privilege then
      v_situacao := 'sem linhas';   -- barrado antes mesmo da policy, ainda melhor
    end;
    perform public._rls_checar('anon não enxerga ' || v_tab, 'sem linhas', v_situacao);
  end loop;
  execute 'reset role';
end;
$$;

reset role;

-- ============================================================================
-- 7 · Guarda de configuração: tabela nova sem RLS não passa daqui
-- ============================================================================
select public._rls_checar('RLS ligado nas 5 tabelas', '5',
  (select count(*) from pg_tables
    where schemaname = 'public'
      and tablename in ('perfis','clientes','itens_catalogo','opcoes','orcamentos')
      and rowsecurity = true)::text);
select public._rls_checar('uma policy por tabela', '5',
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('perfis','clientes','itens_catalogo','opcoes','orcamentos'))::text);
select public._rls_checar('nenhuma policy sem WITH CHECK', '0',
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('perfis','clientes','itens_catalogo','opcoes','orcamentos')
      and with_check is null)::text);
select public._rls_checar('nenhuma policy liberada para anon ou public', '0',
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('perfis','clientes','itens_catalogo','opcoes','orcamentos')
      and (roles::text like '%anon%' or roles::text like '%public%'))::text);

-- ============================================================================
-- 9 · Apagar a conta apaga tudo que era dela, e só dela (cascade)
-- ============================================================================
delete from auth.users where id = (select id from public._rls_ids where apelido = 'bruno');
select public._rls_checar('apagar a conta apaga os orçamentos', '0',
  (select count(*) from public.orcamentos where user_id = (select id from public._rls_ids where apelido = 'bruno'))::text);
select public._rls_checar('apagar a conta apaga o perfil', '0',
  (select count(*) from public.perfis where user_id = (select id from public._rls_ids where apelido = 'bruno'))::text);
select public._rls_checar('apagar a conta apaga o catálogo', '0',
  (select count(*) from public.itens_catalogo where user_id = (select id from public._rls_ids where apelido = 'bruno'))::text);
select public._rls_checar('apagar a conta do Bruno não encosta na da Ana', '1',
  (select count(*) from public.orcamentos where user_id = (select id from public._rls_ids where apelido = 'ana'))::text);

-- ============================================================================
-- RESULTADO
-- ============================================================================
do $$
declare v_falhas int; v_detalhe text;
begin
  select count(*), string_agg(teste || ' (esperado "' || coalesce(esperado,'∅') || '", veio "' || coalesce(obtido,'∅') || '")', ' · ')
    into v_falhas, v_detalhe
    from public._rls_res where situacao = 'FALHA';
  if v_falhas > 0 then
    raise exception 'RLS FUROU — % verificação(ões) falharam: %', v_falhas, v_detalhe;
  end if;
end;
$$;

select situacao, teste, esperado, obtido from public._rls_res order by ordem;

rollback;
