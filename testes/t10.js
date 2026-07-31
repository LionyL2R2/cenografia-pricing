/* Suíte 10 — a fronteira com o banco (fase 2).
   Cobre: paraBanco/doBanco, o par de preço que impede um item "sem preço" de
   virar R$ 0,00 na proposta do cliente, o mapeamento orçamento ⇄ linha, e
   salvoEm vindo de updated_at sem quebrar a ordenação da tela Início. */
const criar = require('./harness');
let falhas = 0;
const ok = (nome, cond, extra) => {
  console.log((cond ? 'PASS  ' : 'FALHA ') + nome + (cond ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) falhas++;
};

const { ctx, K, V } = criar({ cen_v3_seen: true, cen_v3_opcseed: true, cen_v3_mig3: true });
const { paraBanco, doBanco, precoParaBanco, precoDoBanco } = ctx;

/* ============================================================
   1 · paraBanco / doBanco — funções puras, sem DOM e sem rede
   ============================================================ */
ok('paraBanco: string vazia vira null', paraBanco('') === null, paraBanco(''));
ok('paraBanco: só espaços vira null', paraBanco('   ') === null, paraBanco('   '));
ok('paraBanco: null continua null', paraBanco(null) === null);
ok('paraBanco: undefined vira null', paraBanco(undefined) === null);
ok('paraBanco: texto perde os espaços das pontas', paraBanco('  KMF  ') === 'KMF', paraBanco('  KMF  '));
ok('paraBanco: texto normal passa igual', paraBanco('Trainel') === 'Trainel');
ok('paraBanco: número passa como número', paraBanco(90) === 90);
ok('paraBanco: número não-finito vira null', paraBanco(NaN) === null && paraBanco(Infinity) === null);
ok('paraBanco: booleano passa', paraBanco(false) === false && paraBanco(true) === true);

ok('doBanco: null vira string vazia', doBanco(null) === '', doBanco(null));
ok('doBanco: undefined vira string vazia', doBanco(undefined) === '');
ok('doBanco: texto passa igual', doBanco('KMF') === 'KMF');
ok('doBanco: número passa igual', doBanco(0) === 0 && doBanco(90) === 90);
ok('doBanco: string vazia continua string vazia', doBanco('') === '');

/* a ida e volta fecha no formato do APP, não no do banco */
ok('ida e volta de vazio devolve vazio do app', doBanco(paraBanco('')) === '', doBanco(paraBanco('')));
ok('ida e volta de texto preserva o texto', doBanco(paraBanco('Stand')) === 'Stand');

/* A asserção do §3.7 do plano, escrita nominalmente: vazio nunca vira zero.
   `'' == 0` é true em JavaScript, então a comparação tem que ser estrita. */
ok('paraBanco("") NÃO é 0', paraBanco('') !== 0 && !Object.is(paraBanco(''), 0), paraBanco(''));
ok('doBanco(null) NÃO é 0', doBanco(null) !== 0 && !Object.is(doBanco(null), 0), doBanco(null));

/* ============================================================
   2 · O PREÇO — onde errar custa dinheiro de verdade.

   semPreco() trata ''/null como "sem preço": o item sai como `a definir` na
   proposta e NÃO entra no total. Se um vazio voltar do banco como 0, semPreco
   passa a devolver false, o item vira uma linha de R$ 0,00 num documento que
   vai para o cliente, e entra no total como zero.
   ============================================================ */
ok('precoParaBanco: vazio vira null', precoParaBanco('') === null, precoParaBanco(''));
ok('precoParaBanco: null continua null', precoParaBanco(null) === null);
ok('precoParaBanco: zero vira null, nunca zero', precoParaBanco(0) === null, precoParaBanco(0));
ok('precoParaBanco: "0" também vira null', precoParaBanco('0') === null, precoParaBanco('0'));
ok('precoParaBanco: negativo vira null', precoParaBanco(-5) === null);
ok('precoParaBanco: lixo vira null', precoParaBanco('abc') === null);
ok('precoParaBanco: preço real passa como número', precoParaBanco(90) === 90 && precoParaBanco('90') === 90);

ok('precoDoBanco: null vira vazio do app', precoDoBanco(null) === '', precoDoBanco(null));
ok('precoDoBanco: zero do banco vira vazio, não zero', precoDoBanco(0) === '', precoDoBanco(0));
ok('precoDoBanco: preço real volta como número', precoDoBanco(90) === 90 && precoDoBanco('90') === 90);

ok('preço: ida e volta de vazio continua vazio', precoDoBanco(precoParaBanco('')) === '',
  precoDoBanco(precoParaBanco('')));
ok('preço: ida e volta de vazio NÃO vira 0',
  precoDoBanco(precoParaBanco('')) !== 0 && !Object.is(precoDoBanco(precoParaBanco('')), 0));
ok('preço: ida e volta de 90 continua 90', precoDoBanco(precoParaBanco(90)) === 90);

/* o catálogo inteiro dando a volta pelo banco */
const CATALOGO = [
  { nome: 'Trainel', unidade: 'm²', preco: 90 },
  { nome: 'Toten', unidade: 'peça', preco: '' }        // sem preço padrão
];
const linhasCat = CATALOGO.map((it, ordem) => ({
  nome: paraBanco(it.nome), unidade: paraBanco(it.unidade), preco: precoParaBanco(it.preco), ordem
}));
ok('catálogo → banco: item sem preço grava null', linhasCat[1].preco === null, linhasCat[1]);
ok('catálogo → banco: item sem preço NÃO grava 0', linhasCat[1].preco !== 0 && !Object.is(linhasCat[1].preco, 0));
ok('catálogo → banco: item com preço grava o número', linhasCat[0].preco === 90);

const voltaCat = linhasCat.map(r => ctx.normItem({
  nome: doBanco(r.nome), unidade: doBanco(r.unidade), preco: precoDoBanco(r.preco)
}));
ok('banco → catálogo: item sem preço volta vazio', voltaCat[1].preco === '', voltaCat[1]);
ok('banco → catálogo: item sem preço NÃO volta 0', voltaCat[1].preco !== 0 && !Object.is(voltaCat[1].preco, 0));
ok('banco → catálogo: item com preço volta 90', voltaCat[0].preco === 90);
ok('banco → catálogo: precoCatalogo devolve null para item sem preço',
  (V.itensCustom = voltaCat, ctx.precoCatalogo('Toten')) === null, ctx.precoCatalogo('Toten'));
ok('banco → catálogo: precoCatalogo devolve 90 para o item com preço', ctx.precoCatalogo('Trainel') === 90);

/* e o efeito no documento que vai para o cliente */
const semPrecoSt = ctx.novoEstado();
semPrecoSt.meta = { nome: 'P', num: '1', cliente: 'C', data: '2026-05-10', obs: '', validadeDias: 15, responsavel: '' };
semPrecoSt.itensProntos = [
  { id: 'a', item: 'Trainel', unidade: 'm²', qtd: 1, largura: 2, altura: 1, valorUnit: 90, precoRef: 90 },
  { id: 'b', item: 'Toten', unidade: 'peça', qtd: 1, largura: '', altura: '', valorUnit: precoDoBanco(null), precoRef: '' }
];
semPrecoSt.financeiro = { tributacao: '', impostoPct: 10, margemPct: 20 };

ok('a linha que voltou sem preço é reconhecida como sem preço',
  ctx.semPreco(semPrecoSt.itensProntos[1]) === true, semPrecoSt.itensProntos[1]);
ok('a linha sem preço não entra no subtotal de itens prontos',
  ctx.subItensProntos(semPrecoSt) === 180, ctx.subItensProntos(semPrecoSt));

const pv = ctx.propostaValores(semPrecoSt);
const lin = pv.secoes.find(s => s.titulo === 'Itens prontos').linhas;
ok('na proposta a linha sem preço sai como "a definir"', lin[1].semPreco === true && lin[1].valor === null, lin[1]);
ok('a proposta avisa que há item a definir', pv.temSemPreco === true);
ok('o total da proposta não inclui o item sem preço',
  pv.total === K.round2(ctx.resultado(semPrecoSt).preco), [pv.total, ctx.resultado(semPrecoSt).preco]);

/* o contraste que documenta o custo do erro: se o vazio virasse 0, o item
   entraria como linha de R$ 0,00 num documento que vai para o cliente */
const seFosseZero = JSON.parse(JSON.stringify(semPrecoSt));
seFosseZero.itensProntos[1].valorUnit = 0;
ok('CONTRASTE: com 0 no lugar de vazio, o item deixa de ser "sem preço"',
  ctx.semPreco(seFosseZero.itensProntos[1]) === false);
const pvZero = ctx.propostaValores(seFosseZero);
const linZero = pvZero.secoes.find(s => s.titulo === 'Itens prontos').linhas;
ok('CONTRASTE: com 0 ele vira uma linha com valor na proposta do cliente',
  linZero[1].semPreco === false && linZero[1].valor !== null, linZero[1]);

/* ============================================================
   3 · Orçamento ⇄ linha da tabela
   ============================================================ */
const REC = {
  schemaVersion: 3,
  meta: { nome: 'Túnel Sensorial', num: '007/2026', cliente: 'ACME', responsavel: 'Bia',
          data: '2026-05-10', tipoItem: 'Túnel cenográfico', obs: '', validadeDias: 15 },
  itensProntos: [], materiais: [], impressao: [], estrutura: [],
  maoObra: { producao: [], montagem: {} },
  logistica: { transporte: {}, locacoes: [] },
  financeiro: { impostoPct: '', margemPct: '' },
  snapshot: { id: 'x', nome: 'Orçamento do túnel', salvoEm: 5000, total: 1234.5,
              cliente: 'ACME', tipoItem: 'Túnel cenográfico', appVersion: '5.12' }
};
const L = K.dados.paraLinha('11111111-1111-4111-8111-111111111111', REC);

ok('linha: o id vira a PK', L.id === '11111111-1111-4111-8111-111111111111');
ok('linha: nome é o do ORÇAMENTO (snapshot.nome)', L.nome === 'Orçamento do túnel', L.nome);
ok('linha: nome_projeto é o do FORMULÁRIO (meta.nome)', L.nome_projeto === 'Túnel Sensorial', L.nome_projeto);
ok('linha: os dois nomes não foram unificados', L.nome !== L.nome_projeto);
ok('linha: tipo_item tem coluna própria', L.tipo_item === 'Túnel cenográfico');
ok('linha: cliente_nome vem do texto livre', L.cliente_nome === 'ACME');
ok('linha: observação vazia vira null', L.observacoes === null, L.observacoes);
ok('linha: snapshot_total vira número', L.snapshot_total === 1234.5);
ok('linha: schema_version acompanha o registro', L.schema_version === 3);
ok('linha: dados leva o registro inteiro', L.dados === REC && !!L.dados.maoObra);
ok('linha: responsável NÃO virou coluna — fica dentro de dados',
  L.responsavel === undefined && L.dados.meta.responsavel === 'Bia');

const vazio = K.dados.paraLinha('22222222-2222-4222-8222-222222222222', {
  meta: { nome: '', num: '', cliente: '  ', data: '', tipoItem: '', obs: '', validadeDias: '' },
  snapshot: { nome: '', total: '' }
});
ok('linha: todo texto vazio vira null', [vazio.nome, vazio.nome_projeto, vazio.numero, vazio.cliente_nome,
  vazio.data, vazio.tipo_item, vazio.observacoes].every(v => v === null),
  [vazio.nome, vazio.nome_projeto, vazio.numero, vazio.cliente_nome, vazio.data, vazio.tipo_item, vazio.observacoes]);
ok('linha: validade vazia vira null, não 0', vazio.validade_dias === null, vazio.validade_dias);
ok('linha: snapshot_total vazio vira null, não 0',
  vazio.snapshot_total === null && !Object.is(vazio.snapshot_total, 0), vazio.snapshot_total);

/* a volta */
const ROW = {
  id: '33333333-3333-4333-8333-333333333333',
  nome: 'Portal ACME', nome_projeto: 'Portal', tipo_item: null, cliente_nome: null,
  snapshot_total: 900, updated_at: '2026-06-15T12:00:00.000Z',
  dados: { schemaVersion: 3, meta: { nome: 'Portal' }, snapshot: { nome: 'antigo', salvoEm: 1 } }
};
const back = K.dados.deLinha(ROW);
ok('volta: o id da linha vira o id do snapshot', back.snapshot.id === ROW.id);
ok('volta: o nome vem da coluna', back.snapshot.nome === 'Portal ACME', back.snapshot.nome);
ok('volta: coluna null vira string vazia', back.snapshot.tipoItem === '' && back.snapshot.cliente === '',
  [back.snapshot.tipoItem, back.snapshot.cliente]);
ok('volta: total vem de snapshot_total', back.snapshot.total === 900);
ok('volta: salvoEm vem de updated_at, não do que estava gravado',
  back.snapshot.salvoEm === Date.parse('2026-06-15T12:00:00.000Z'), back.snapshot.salvoEm);
ok('volta: o registro em dados é preservado', back.meta.nome === 'Portal' && back.schemaVersion === 3);

const semData = K.dados.deLinha({ id: 'z', dados: { snapshot: { salvoEm: 777 } }, updated_at: null });
ok('volta: sem updated_at, salvoEm cai no que havia', semData.snapshot.salvoEm === 777, semData.snapshot.salvoEm);

/* ============================================================
   4 · A ordenação da tela Início continua por salvoEm — que agora é o
   relógio do SERVIDOR, não o do navegador que salvou.
   ============================================================ */
const linhaBase = (id, nome, iso) => ({
  id, nome, nome_projeto: nome, tipo_item: null, cliente_nome: null,
  snapshot_total: 100, updated_at: iso,
  dados: { schemaVersion: 3, meta: { nome, data: '2026-01-01' },
           itensProntos: [], materiais: [], impressao: [], estrutura: [],
           maoObra: { producao: [], montagem: {} },
           logistica: { transporte: {}, locacoes: [] },
           financeiro: { impostoPct: '', margemPct: '' }, snapshot: {} }
});
V.orcamentos = {
  velho: K.dados.deLinha(linhaBase('velho', 'Velho', '2026-01-01T00:00:00.000Z')),
  novo:  K.dados.deLinha(linhaBase('novo',  'Novo',  '2026-09-09T00:00:00.000Z')),
  meio:  K.dados.deLinha(linhaBase('meio',  'Meio',  '2026-05-05T00:00:00.000Z'))
};
ctx.montarInicio();
ok('tela Início ordena do mais recente para o mais antigo',
  V.inicioLista.map(p => p.nome).join(',') === 'Novo,Meio,Velho', V.inicioLista.map(p => [p.nome, p.salvoEm]));
ok('a data usada na ordenação é a do servidor',
  V.inicioLista[0].salvoEm === Date.parse('2026-09-09T00:00:00.000Z'), V.inicioLista[0].salvoEm);

/* ============================================================
   5 · No harness o modo é LOCAL: nenhuma escrita vai à rede.
   ============================================================ */
ok('usarBanco() é false sem Supabase', ctx.usarBanco() === false);
ok('nenhuma gravação ficou pendente de rede', K.dados.temPendencia() === false, K.dados.pendencias());
ok('uuid tem formato de uuid v4',
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(ctx.uuid()), ctx.uuid());
ok('dois uuid seguidos são diferentes', ctx.uuid() !== ctx.uuid());

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
