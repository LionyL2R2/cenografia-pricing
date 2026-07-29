-- ============================================================================
-- cenografia-pricing · teste de isolamento do RLS
--
-- COMO RODAR
--   1. Rode o supabase/schema.sql antes, uma vez.
--   2. SQL Editor do Supabase → New query
--   3. Cole este arquivo INTEIRO e clique em Run (uma vez só, o arquivo todo)
--   4. Leia a grade de resultado: toda linha tem que sair com situacao = PASS
--
-- Como ler:
--   · grade com tudo PASS  → isolamento ok
--   · alguma linha FALHA   → tem furo; a linha diz o esperado e o que veio
--   · erro vermelho        → o teste não chegou ao fim; nada foi deixado no banco
--
-- Pode rodar quantas vezes quiser, em sequência: a primeira coisa que o script
-- faz é limpar o que uma execução anterior tenha deixado.
--
-- ----------------------------------------------------------------------------
-- POR QUE ESTE ARQUIVO É ESTRUTURADO ASSIM
--
-- 1) NÃO existe `begin;` / `rollback;` aqui, e isso é deliberado.
--    A versão anterior abria uma transação e criava as tabelas de andaime
--    dentro dela. No psql funciona; no SQL Editor do Supabase, não: os
--    statements podem ser despachados por conexões diferentes do pool, e uma
--    tabela criada em transação AINDA NÃO COMMITADA é invisível para o
--    statement seguinte. O sintoma era exatamente
--        ERROR: 42P01: relation "public._rls_ids" does not exist
--    Sem transação aberta, cada statement é visível para o próximo, esteja o
--    editor mandando tudo junto ou statement a statement.
--
-- 2) O corpo do teste é UM ÚNICO bloco DO.
--    Um statement é atômico por definição: ou roda inteiro, ou o Postgres
--    desfaz tudo sozinho. É isso que substitui o ROLLBACK antigo — se alguma
--    coisa falhar no meio, os usuários fictícios não sobrevivem. E, como é um
--    statement só, não há nada para o editor dividir nem para o pool espalhar.
--
-- 3) O andaime sumiu. Não há mais tabela `_rls_ids` nem função `_rls_checar`:
--    os ids viram variáveis plpgsql e as asserções se acumulam num jsonb
--    dentro do bloco. Sobra uma única tabela, `_rls_resultado`, que existe só
--    para a grade final ter o que exibir — com RLS ligada e sem policy, de
--    modo que o PostgREST não a exponha para ninguém.
--
-- 4) A troca de papel usa set_config(..., false), ou seja, escopo de SESSÃO,
--    e não SET LOCAL. Parece contraintuitivo num teste, e tem motivo:
--    `SET LOCAL` fora de um bloco de transação EXPLÍCITO emite warning e
--    simplesmente não tem efeito. Como aqui não há `begin;` (ver item 1), o
--    papel poderia nunca trocar — e o teste rodaria inteiro como superusuário,
--    que IGNORA RLS, passando com tudo verde e o RLS quebrado.
--    Com escopo de sessão o efeito é garantido, e não vaza:
--      · em caso de erro, o rollback do statement desfaz o GUC junto;
--      · em caso de sucesso, o bloco reseta o papel antes de terminar.
--    As duas asserções GUARDA logo no começo existem exatamente para provar
--    que a troca pegou. Se alguma delas falhar, ignore o resto do resultado.
-- ============================================================================

-- ---------- 1 · limpa o que uma execução anterior tenha deixado ----------
drop table if exists public._rls_resultado;

-- ---------- 2 · tabela só de saída ----------
create table public._rls_resultado (
  ordem    serial primary key,
  situacao text,
  teste    text,
  esperado text,
  obtido   text
);

-- ---------- 3 · ninguém além do dono enxerga nem isto ----------
alter table public._rls_resultado enable row level security;   -- sem policy: PostgREST não expõe
revoke all on public._rls_resultado from anon, authenticated;

-- ---------- 4 · o teste inteiro, em um statement ----------
do $teste$
declare
  v_ana    uuid := gen_random_uuid();
  v_bruno  uuid := gen_random_uuid();
  v_res    jsonb := '[]'::jsonb;
  v_barrou boolean;
  v_tab    text;
  v_n      int;
  v_txt    text;
begin
  -- ==========================================================================
  -- SETUP · dois usuários fictícios (como postgres)
  -- O trigger on_auth_user_created dispara neste insert, então cada um já
  -- nasce com perfil, catálogo e dropdowns — o teste confere isso também.
  -- ==========================================================================
  delete from auth.users where email like '%@teste-rls.local';   -- resto de execução anterior

  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_ana,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ana@teste-rls.local',   '{"provider":"google","providers":["google"]}'::jsonb,
     '{"full_name":"Ana Teste"}'::jsonb,   now(), now()),
    (v_bruno, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'bruno@teste-rls.local', '{"provider":"google","providers":["google"]}'::jsonb,
     '{"full_name":"Bruno Teste"}'::jsonb, now(), now());

  -- ==========================================================================
  -- 1 · O trigger de novo usuário rodou para os dois
  -- ==========================================================================
  v_res := v_res || jsonb_build_object('t','trigger: um perfil por usuário','e','2',
    'o',(select count(*) from public.perfis where user_id in (v_ana, v_bruno))::text);
  v_res := v_res || jsonb_build_object('t','trigger: perfil puxou o nome que veio do Google','e','Ana Teste',
    'o',(select nome_empresa from public.perfis where user_id = v_ana));
  v_res := v_res || jsonb_build_object('t','trigger: perfil puxou o e-mail','e','ana@teste-rls.local',
    'o',(select email from public.perfis where user_id = v_ana));
  v_res := v_res || jsonb_build_object('t','trigger: 4 itens de catálogo por usuário','e','8',
    'o',(select count(*) from public.itens_catalogo where user_id in (v_ana, v_bruno))::text);
  v_res := v_res || jsonb_build_object('t','trigger: catálogo com os nomes certos','e','Banner com ilhós,Stand,Toten,Trainel',
    'o',(select string_agg(distinct nome, ',' order by nome) from public.itens_catalogo where user_id in (v_ana, v_bruno)));
  v_res := v_res || jsonb_build_object('t','trigger: item de m² com a unidade certa','e','m²',
    'o',(select distinct unidade from public.itens_catalogo where nome = 'Trainel' and user_id in (v_ana, v_bruno)));
  v_res := v_res || jsonb_build_object('t','trigger: item de peça com a unidade certa','e','peça',
    'o',(select distinct unidade from public.itens_catalogo where nome = 'Stand' and user_id in (v_ana, v_bruno)));
  v_res := v_res || jsonb_build_object('t','trigger: preço do catálogo nasce nulo','e','0',
    'o',(select count(*) from public.itens_catalogo where user_id in (v_ana, v_bruno) and preco is not null)::text);
  v_res := v_res || jsonb_build_object('t','trigger: 9 opções por usuário','e','18',
    'o',(select count(*) from public.opcoes where user_id in (v_ana, v_bruno))::text);
  v_res := v_res || jsonb_build_object('t','trigger: opções de materiais','e','Fita de LED,Madeira,Metalon,Placa MDF',
    'o',(select string_agg(distinct valor, ',' order by valor) from public.opcoes where setor='materiais' and user_id in (v_ana, v_bruno)));
  v_res := v_res || jsonb_build_object('t','trigger: opções de produção','e','Adesivador,Eletricista,Marceneiro',
    'o',(select string_agg(distinct valor, ',' order by valor) from public.opcoes where setor='producao' and user_id in (v_ana, v_bruno)));
  v_res := v_res || jsonb_build_object('t','trigger: opções de impressão','e','Adesivo,Lona',
    'o',(select string_agg(distinct valor, ',' order by valor) from public.opcoes where setor='impressao' and user_id in (v_ana, v_bruno)));
  v_res := v_res || jsonb_build_object('t','trigger: nenhum setor fora dos três do app','e','0',
    'o',(select count(*) from public.opcoes where user_id in (v_ana, v_bruno) and setor not in ('materiais','producao','impressao'))::text);

  -- ordem das listas · tem que sair do banco na MESMA ordem do index.html
  v_res := v_res || jsonb_build_object('t','ordem: materiais na sequência do OPC_BASE','e','Madeira,Placa MDF,Metalon,Fita de LED',
    'o',(select string_agg(valor, ',' order by ordem) from public.opcoes where setor='materiais' and user_id = v_ana));
  v_res := v_res || jsonb_build_object('t','ordem: producao na sequência do OPC_BASE','e','Marceneiro,Adesivador,Eletricista',
    'o',(select string_agg(valor, ',' order by ordem) from public.opcoes where setor='producao' and user_id = v_ana));
  v_res := v_res || jsonb_build_object('t','ordem: impressao na sequência do OPC_BASE','e','Lona,Adesivo',
    'o',(select string_agg(valor, ',' order by ordem) from public.opcoes where setor='impressao' and user_id = v_ana));
  v_res := v_res || jsonb_build_object('t','ordem: catálogo na sequência do ITENS_PRONTOS','e','Trainel,Banner com ilhós,Stand,Toten',
    'o',(select string_agg(nome, ',' order by ordem) from public.itens_catalogo where user_id = v_ana));
  v_res := v_res || jsonb_build_object('t','ordem: nenhuma posição repetida dentro do mesmo setor','e','0',
    'o',(select count(*) from (select setor, ordem from public.opcoes where user_id = v_ana group by setor, ordem having count(*) > 1) d)::text);

  -- ==========================================================================
  -- 2 · Cada um insere os seus dados, como ele mesmo, passando pela policy
  -- ==========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_ana, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);

  -- GUARDA do próprio teste: se o SET ROLE não pegou, tudo abaixo rodaria como
  -- superusuário e passaria com o RLS quebrado.
  v_res := v_res || jsonb_build_object('t','GUARDA: o papel virou authenticated','e','authenticated','o',current_user::text);
  v_res := v_res || jsonb_build_object('t','GUARDA: auth.uid() é a Ana','e',v_ana::text,'o',auth.uid()::text);

  insert into public.clientes (nome, doc) values ('Cliente da Ana', '111');
  insert into public.opcoes (setor, valor, ordem) values ('materiais', 'Madeira da Ana', 99);
  insert into public.orcamentos (nome, cliente_nome, snapshot_total, dados)
    values ('Orçamento da Ana', 'Cliente da Ana', 1000, '{"schemaVersion":3}'::jsonb);
  v_res := v_res || jsonb_build_object('t','insert sem passar user_id pega o dono pelo default','e','1',
    'o',(select count(*) from public.orcamentos)::text);

  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_bruno, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);

  insert into public.clientes (nome, doc) values ('Cliente do Bruno', '222');
  insert into public.opcoes (setor, valor, ordem) values ('materiais', 'Madeira do Bruno', 99);
  insert into public.orcamentos (nome, cliente_nome, snapshot_total, dados)
    values ('Orçamento do Bruno', 'Cliente do Bruno', 2000, '{"schemaVersion":3}'::jsonb);

  -- ==========================================================================
  -- 3 · SELECT: ninguém enxerga o do outro
  -- ==========================================================================
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ana, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);

  v_res := v_res || jsonb_build_object('t','ana enxerga só o próprio cliente','e','Cliente da Ana',
    'o',(select string_agg(nome, ',' order by nome) from public.clientes));
  v_res := v_res || jsonb_build_object('t','ana enxerga só o próprio orçamento','e','Orçamento da Ana',
    'o',(select string_agg(nome, ',' order by nome) from public.orcamentos));
  v_res := v_res || jsonb_build_object('t','ana enxerga as próprias opções (9 semeadas + 1 criada)','e','10',
    'o',(select count(*) from public.opcoes)::text);
  v_res := v_res || jsonb_build_object('t','ana não enxerga a opção do Bruno','e','0',
    'o',(select count(*) from public.opcoes where valor = 'Madeira do Bruno')::text);
  v_res := v_res || jsonb_build_object('t','ana enxerga só o próprio perfil','e','1',
    'o',(select count(*) from public.perfis)::text);
  v_res := v_res || jsonb_build_object('t','ana enxerga só o próprio catálogo','e','4',
    'o',(select count(*) from public.itens_catalogo)::text);
  v_res := v_res || jsonb_build_object('t','ana não acha o orçamento do Bruno nem filtrando pelo valor','e','0',
    'o',(select count(*) from public.orcamentos where snapshot_total = 2000)::text);

  -- ==========================================================================
  -- 4 · UPDATE e DELETE não alcançam a linha do outro
  -- A linha do outro é invisível, então o comando acerta zero linhas — não dá
  -- erro, simplesmente não encontra nada. É o comportamento correto do RLS.
  -- ==========================================================================
  update public.orcamentos set nome = 'INVADIDO' where snapshot_total = 2000;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('t','ana não dá UPDATE no orçamento do Bruno','e','0','o',v_n::text);

  delete from public.orcamentos where snapshot_total = 2000;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('t','ana não dá DELETE no orçamento do Bruno','e','0','o',v_n::text);

  delete from public.clientes where doc = '222';
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('t','ana não apaga o cliente do Bruno','e','0','o',v_n::text);

  -- ==========================================================================
  -- 4.1 · NORMALIZAÇÃO DE FRONTEIRA ('' → null na gravação)
  --
  -- O app escreve vazio como '', o banco como null. Os triggers de
  -- normalização fecham essa diferença na gravação. O pedaço do `preco` é o
  -- mais importante da suíte inteira: vazio que vire 0 sai como R$ 0,00 na
  -- PROPOSTA DO CLIENTE.
  --
  -- Continua como a Ana. Tudo que é criado aqui é apagado no fim do bloco,
  -- para as contagens seguintes continuarem valendo.
  -- ==========================================================================
  insert into public.clientes (nome, razao_social, doc, telefone, email, cidade, observacoes)
    values ('Normalização', '', '   ', '', '  ', '', '');
  v_res := v_res || jsonb_build_object('t','texto: string vazia vira null','e','0',
    'o',(select count(*) from public.clientes where nome = 'Normalização'
           and (razao_social = '' or doc = '' or telefone = '' or email = '' or cidade = '' or observacoes = ''))::text);
  v_res := v_res || jsonb_build_object('t','texto: só-espaços também vira null','e','6',
    'o',(select (razao_social is null)::int + (doc is null)::int + (telefone is null)::int
              + (email is null)::int + (cidade is null)::int + (observacoes is null)::int
           from public.clientes where nome = 'Normalização')::text);
  v_res := v_res || jsonb_build_object('t','texto: valor de verdade não é tocado','e','Normalização',
    'o',(select nome from public.clientes where nome = 'Normalização'));

  insert into public.orcamentos (nome, numero, nome_projeto, tipo_item, cliente_nome, observacoes, dados)
    values ('Norm Orc', '', '  ', '', '', '', '{}'::jsonb);
  v_res := v_res || jsonb_build_object('t','orçamento: os cinco campos de texto vazios viram null','e','5',
    'o',(select (numero is null)::int + (nome_projeto is null)::int + (tipo_item is null)::int
              + (cliente_nome is null)::int + (observacoes is null)::int
           from public.orcamentos where nome = 'Norm Orc')::text);

  -- as duas colunas novas guardam valor e são independentes
  update public.orcamentos set nome_projeto = 'Túnel Sensorial', tipo_item = 'Túnel cenográfico'
    where nome = 'Norm Orc';
  v_res := v_res || jsonb_build_object('t','nome_projeto guarda meta.nome, separado de snapshot.nome','e','Norm Orc|Túnel Sensorial',
    'o',(select nome || '|' || nome_projeto from public.orcamentos where nome = 'Norm Orc'));
  v_res := v_res || jsonb_build_object('t','tipo_item tem coluna própria, sem abrir o jsonb','e','Túnel cenográfico',
    'o',(select tipo_item from public.orcamentos where nome = 'Norm Orc'));

  -- preço: o caso que imprime R$ 0,00 na proposta do cliente
  insert into public.itens_catalogo (nome, unidade, preco, ordem) values ('Norm Sem Preço', 'm²', null, 90);
  v_res := v_res || jsonb_build_object('t','preço: null continua null, não vira zero','e','null',
    'o',(select coalesce(preco::text, 'null') from public.itens_catalogo where nome = 'Norm Sem Preço'));
  v_res := v_res || jsonb_build_object('t','preço: nenhum item do catálogo tem preço zero','e','0',
    'o',(select count(*) from public.itens_catalogo where preco = 0)::text);

  insert into public.itens_catalogo (nome, unidade, preco, ordem) values ('Norm Com Preço', 'm²', 90, 91);
  v_res := v_res || jsonb_build_object('t','preço: valor real é preservado','e','90',
    'o',(select preco::text from public.itens_catalogo where nome = 'Norm Com Preço'));

  v_barrou := false;
  begin
    insert into public.itens_catalogo (nome, unidade, preco, ordem) values ('Norm Preço Zero', 'm²', 0, 92);
  exception when check_violation then v_barrou := true;
  end;
  v_res := v_res || jsonb_build_object('t','preço: INSERT com zero é rejeitado alto, não vira R$ 0,00','e','true','o',v_barrou::text);

  v_barrou := false;
  begin
    update public.itens_catalogo set preco = 0 where nome = 'Norm Com Preço';
  exception when check_violation then v_barrou := true;
  end;
  v_res := v_res || jsonb_build_object('t','preço: UPDATE para zero também é rejeitado','e','true','o',v_barrou::text);
  v_res := v_res || jsonb_build_object('t','preço: o item continua com o valor que tinha','e','90',
    'o',(select preco::text from public.itens_catalogo where nome = 'Norm Com Preço'));

  -- limpeza do bloco, para as contagens seguintes não mudarem
  delete from public.itens_catalogo where nome like 'Norm %';
  delete from public.orcamentos     where nome = 'Norm Orc';
  delete from public.clientes       where nome = 'Normalização';
  v_res := v_res || jsonb_build_object('t','limpeza: o catálogo da Ana voltou aos 4 semeados','e','4',
    'o',(select count(*) from public.itens_catalogo)::text);
  v_res := v_res || jsonb_build_object('t','limpeza: a Ana voltou a ter 1 orçamento','e','1',
    'o',(select count(*) from public.orcamentos)::text);

  -- ==========================================================================
  -- 5 · WITH CHECK: não dá para gravar linha no nome de outro
  -- É o furo que USING sozinho deixaria passar: a linha sumiria da vista de
  -- quem gravou e apareceria na do outro. Aqui tem que ser REJEITADO, não
  -- apenas invisível.
  -- ==========================================================================
  v_barrou := false;
  begin
    insert into public.orcamentos (user_id, nome, dados) values (v_bruno, 'PLANTADO', '{}'::jsonb);
  exception when insufficient_privilege or check_violation then v_barrou := true;
  end;
  v_res := v_res || jsonb_build_object('t','ana não INSERE orçamento no nome do Bruno','e','true','o',v_barrou::text);

  v_barrou := false;
  begin
    update public.orcamentos set user_id = v_bruno;   -- tentar "doar" a própria linha
  exception when insufficient_privilege or check_violation then v_barrou := true;
  end;
  v_res := v_res || jsonb_build_object('t','ana não TRANSFERE o próprio orçamento para o Bruno','e','true','o',v_barrou::text);

  -- ==========================================================================
  -- 6 · O outro lado continua intacto depois de tudo isso
  -- ==========================================================================
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_bruno, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);

  v_res := v_res || jsonb_build_object('t','bruno enxerga só o próprio cliente','e','Cliente do Bruno',
    'o',(select string_agg(nome, ',' order by nome) from public.clientes));
  v_res := v_res || jsonb_build_object('t','bruno enxerga só o próprio orçamento','e','Orçamento do Bruno',
    'o',(select string_agg(nome, ',' order by nome) from public.orcamentos));
  v_res := v_res || jsonb_build_object('t','bruno enxerga as próprias opções (9 semeadas + 1 criada)','e','10',
    'o',(select count(*) from public.opcoes)::text);
  v_res := v_res || jsonb_build_object('t','bruno não enxerga a opção da Ana','e','0',
    'o',(select count(*) from public.opcoes where valor = 'Madeira da Ana')::text);
  v_res := v_res || jsonb_build_object('t','bruno enxerga só o próprio catálogo','e','4',
    'o',(select count(*) from public.itens_catalogo)::text);
  v_res := v_res || jsonb_build_object('t','o orçamento do Bruno continua intacto','e','Orçamento do Bruno',
    'o',(select nome from public.orcamentos where snapshot_total = 2000));
  v_res := v_res || jsonb_build_object('t','o cliente do Bruno continua lá','e','1',
    'o',(select count(*) from public.clientes)::text);
  v_res := v_res || jsonb_build_object('t','o orçamento do Bruno continua sendo dele','e',v_bruno::text,
    'o',(select user_id::text from public.orcamentos where snapshot_total = 2000));

  -- ==========================================================================
  -- 7 · cliente_nome sobrevive ao cliente ser apagado
  -- ==========================================================================
  update public.orcamentos o set cliente_id = c.id from public.clientes c where c.doc = '222';
  delete from public.clientes where doc = '222';
  v_res := v_res || jsonb_build_object('t','apagar o cliente zera cliente_id','e','0',
    'o',(select count(*) from public.orcamentos where cliente_id is not null)::text);
  v_res := v_res || jsonb_build_object('t','apagar o cliente NÃO apaga o orçamento','e','1',
    'o',(select count(*) from public.orcamentos)::text);
  v_res := v_res || jsonb_build_object('t','apagar o cliente NÃO apaga o nome dele no orçamento','e','Cliente do Bruno',
    'o',(select cliente_nome from public.orcamentos));

  -- ==========================================================================
  -- 8 · Sem sessão (papel anon) não se enxerga nada
  -- Duas camadas podem barrar: a falta de GRANT (erro de privilégio) ou a
  -- ausência de policy para anon (zero linhas). Qualquer uma é PASS — o que
  -- não pode é voltar linha.
  -- ==========================================================================
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claims', '', false);
  perform set_config('role', 'anon', false);

  foreach v_tab in array array['orcamentos','clientes','perfis','itens_catalogo','opcoes'] loop
    begin
      execute format('select count(*) from public.%I', v_tab) into v_n;
      v_txt := case when v_n = 0 then 'sem linhas' else v_n::text || ' linha(s)' end;
    exception when insufficient_privilege then
      v_txt := 'sem linhas';   -- barrado antes mesmo da policy, ainda melhor
    end;
    v_res := v_res || jsonb_build_object('t','anon não enxerga ' || v_tab,'e','sem linhas','o',v_txt);
  end loop;

  perform set_config('role', 'none', false);

  -- ==========================================================================
  -- 9 · Guarda de configuração: tabela nova sem RLS não passa daqui
  -- ==========================================================================
  v_res := v_res || jsonb_build_object('t','RLS ligado nas 5 tabelas','e','5',
    'o',(select count(*) from pg_tables where schemaname='public'
          and tablename in ('perfis','clientes','itens_catalogo','opcoes','orcamentos')
          and rowsecurity = true)::text);
  v_res := v_res || jsonb_build_object('t','uma policy por tabela','e','5',
    'o',(select count(*) from pg_policies where schemaname='public'
          and tablename in ('perfis','clientes','itens_catalogo','opcoes','orcamentos'))::text);
  v_res := v_res || jsonb_build_object('t','nenhuma policy sem WITH CHECK','e','0',
    'o',(select count(*) from pg_policies where schemaname='public'
          and tablename in ('perfis','clientes','itens_catalogo','opcoes','orcamentos')
          and with_check is null)::text);
  v_res := v_res || jsonb_build_object('t','nenhuma policy liberada para anon ou public','e','0',
    'o',(select count(*) from pg_policies where schemaname='public'
          and tablename in ('perfis','clientes','itens_catalogo','opcoes','orcamentos')
          and (roles::text like '%anon%' or roles::text like '%public%'))::text);

  -- ==========================================================================
  -- 10 · Apagar a conta apaga tudo que era dela, e só dela (cascade)
  -- ==========================================================================
  delete from auth.users where id = v_bruno;
  v_res := v_res || jsonb_build_object('t','apagar a conta apaga os orçamentos','e','0',
    'o',(select count(*) from public.orcamentos where user_id = v_bruno)::text);
  v_res := v_res || jsonb_build_object('t','apagar a conta apaga o perfil','e','0',
    'o',(select count(*) from public.perfis where user_id = v_bruno)::text);
  v_res := v_res || jsonb_build_object('t','apagar a conta apaga o catálogo','e','0',
    'o',(select count(*) from public.itens_catalogo where user_id = v_bruno)::text);
  v_res := v_res || jsonb_build_object('t','apagar a conta apaga as opções','e','0',
    'o',(select count(*) from public.opcoes where user_id = v_bruno)::text);
  v_res := v_res || jsonb_build_object('t','apagar a conta do Bruno não encosta na da Ana','e','1',
    'o',(select count(*) from public.orcamentos where user_id = v_ana)::text);

  -- ==========================================================================
  -- LIMPEZA · o teste não deixa nada no banco
  -- Substitui o ROLLBACK da versão anterior. Se o bloco falhar antes daqui, o
  -- Postgres desfaz o statement inteiro e o efeito é o mesmo.
  -- ==========================================================================
  delete from auth.users where id in (v_ana, v_bruno);
  v_res := v_res || jsonb_build_object('t','LIMPEZA: nenhum usuário de teste sobrou','e','0',
    'o',(select count(*) from auth.users where email like '%@teste-rls.local')::text);
  v_res := v_res || jsonb_build_object('t','LIMPEZA: nenhum orçamento de teste sobrou','e','0',
    'o',(select count(*) from public.orcamentos where user_id in (v_ana, v_bruno))::text);
  v_res := v_res || jsonb_build_object('t','LIMPEZA: nenhum perfil de teste sobrou','e','0',
    'o',(select count(*) from public.perfis where user_id in (v_ana, v_bruno))::text);

  -- ==========================================================================
  -- Grava o resultado. Só aqui, e como postgres: assim a tabela de saída não
  -- precisa de grant nenhum para anon nem para authenticated.
  -- ==========================================================================
  insert into public._rls_resultado (situacao, teste, esperado, obtido)
  select case when (e ->> 'e') is not distinct from (e ->> 'o') then 'PASS' else 'FALHA' end,
         e ->> 't', e ->> 'e', e ->> 'o'
    from jsonb_array_elements(v_res) with ordinality as x(e, i)
   order by i;
end;
$teste$;

-- ---------- 5 · o resultado ----------
-- Ordenado com as falhas em cima: se houver furo, ele é a primeira linha.
select situacao, teste, esperado, obtido
  from public._rls_resultado
 order by (situacao = 'FALHA') desc, ordem;
