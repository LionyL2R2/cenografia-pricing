/* Suíte 12 — lixeira de orçamentos (fase 2).
   Cobre: excluir vira soft delete, o apagado some de TODAS as listagens (com
   varredura que prova que nenhuma ficou de fora), restaurar devolve o total
   intacto, apagar de vez remove mesmo, e o backup preserva a lixeira. */
const criar = require('./harness');
let falhas = 0;
const ok = (nome, cond, extra) => {
  console.log((cond ? 'PASS  ' : 'FALHA ') + nome + (cond ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) falhas++;
};

const orc = (id, nome, valor, salvoEm) => ({
  schemaVersion: 3,
  meta: { nome, num: '', cliente: 'Cliente ' + nome, responsavel: '', data: '2026-05-10', tipoItem: '', obs: '', validadeDias: 15 },
  itensProntos: [], materiais: [{ id: 'm1', desc: 'MDF ' + nome, unidade: 'm²', qtd: 1, valorUnit: valor }],
  impressao: [], estrutura: [],
  maoObra: { producao: [{ id: 'f1', funcao: 'Marceneiro ' + nome, diarias: 1, valorDiaria: valor }], montagem: {} },
  logistica: { transporte: { frete: valor }, locacoes: [{ id: 'l1', equipamento: 'Grua ' + nome, qtd: 1, dias: 1, valorDia: valor }] },
  financeiro: { tributacao: '', impostoPct: '', margemPct: '' },
  snapshot: { id, nome, salvoEm, total: valor * 3, cliente: 'Cliente ' + nome, tipoItem: '' }
});

const SEED = {
  cen_v3_seen: true, cen_v3_opcseed: true, cen_v3_mig3: true,
  cen_v3_budgets: { fica: orc('fica', 'Fica', 100, 9000), vai: orc('vai', 'Vai', 700, 8000) }
};

const { ctx, K, V } = criar(SEED);

/* ============================================================
   1 · Excluir é soft delete: a linha continua, com data de exclusão.
   ============================================================ */
ok('os dois começam ativos', Object.keys(V.orcamentos).sort().join(',') === 'fica,vai', Object.keys(V.orcamentos));
ok('a lixeira começa vazia', Object.keys(V.orcamentosApagados).length === 0, V.orcamentosApagados);

const totalAntes = ctx.custoTotal(ctx.migrar(V.orcamentos.vai));
K.dados.excluirOrcamento('vai');

ok('o excluído saiu dos ativos', V.orcamentos.vai === undefined, Object.keys(V.orcamentos));
ok('o excluído está na lixeira', !!V.orcamentosApagados.vai, Object.keys(V.orcamentosApagados));
ok('ganhou data de exclusão', Number(V.orcamentosApagados.vai.snapshot.deletedEm) > 0,
  V.orcamentosApagados.vai.snapshot.deletedEm);
ok('o conteúdo do orçamento ficou intacto',
  ctx.custoTotal(ctx.migrar(V.orcamentosApagados.vai)) === totalAntes,
  [totalAntes, ctx.custoTotal(ctx.migrar(V.orcamentosApagados.vai))]);
ok('nada foi apagado do armazenamento — a linha continua lá',
  !!K.store.ler('cen_v3_budgets', {}).vai, Object.keys(K.store.ler('cen_v3_budgets', {})));
ok('e a linha gravada carrega a data de exclusão',
  Number(K.store.ler('cen_v3_budgets', {}).vai.snapshot.deletedEm) > 0);

/* ============================================================
   2 · O APAGADO SOME DE TODAS AS LISTAGENS.

   A varredura abaixo é o coração desta suíte. Não basta testar as listagens que
   eu lembrei de mudar — o risco é justamente a que ninguém lembrou. Um orçamento
   apagado sugerindo preço numa proposta nova é o vazamento que ninguém nota.
   ============================================================ */
ctx.montarInicio();
ok('tela Início não lista o apagado',
  V.inicioLista.every(p => p.id !== 'vai'), V.inicioLista.map(p => p.id));
ok('tela Início continua listando o ativo', V.inicioLista.some(p => p.id === 'fica'), V.inicioLista.map(p => p.id));

const sel = { innerHTML: '' };
const criarReal = ctx.document.getElementById;
ctx.document.getElementById = id => (id === 'loadSel' ? sel : criarReal(id));
ctx.montarLoadSel();
ctx.document.getElementById = criarReal;
ok('select "Abrir…" não oferece o apagado', sel.innerHTML.indexOf('Vai') < 0, sel.innerHTML);
ok('select "Abrir…" continua oferecendo o ativo', sel.innerHTML.indexOf('Fica') >= 0, sel.innerHTML);

ok('busca por nome não acha o apagado',
  V.inicioLista.filter(p => ctx.normNome(p.nome).includes('vai')).length === 0, V.inicioLista.map(p => p.nome));

const conf = ctx.conferirIntegridade();
ok('conferência de integridade ignora o apagado',
  conf.every(l => l.id !== 'vai'), conf.map(l => l.id));
ok('conferência continua conferindo o ativo', conf.some(l => l.id === 'fica'), conf.map(l => l.id));

ok('validação de nome único ignora o apagado — o nome fica livre de novo',
  ctx.nomeColide('Vai', null) === false);
ok('validação de nome único continua pegando o ativo', ctx.nomeColide('Fica', null) === true);

/* o motor de sugestão: o apagado tinha valores MUITO diferentes do ativo, então
   se ele vazar a sugestão devolve o número errado, não "algum número" */
ok('sugestão de material não lê o apagado',
  ctx.sugestaoValor('materiais', 'MDF Vai') === null, ctx.sugestaoValor('materiais', 'MDF Vai'));
ok('sugestão de mão de obra não lê o apagado',
  ctx.sugestaoValor('producao', 'Marceneiro Vai') === null, ctx.sugestaoValor('producao', 'Marceneiro Vai'));
ok('sugestão de locação não lê o apagado',
  ctx.sugestaoValor('locacoes', 'Grua Vai') === null, ctx.sugestaoValor('locacoes', 'Grua Vai'));
ok('sugestão de transporte não pega o frete do apagado',
  ctx.sugestaoValor('transporte', 'frete') === 100, ctx.sugestaoValor('transporte', 'frete'));
ok('sugestão continua lendo o ativo', ctx.sugestaoValor('materiais', 'MDF Fica') === 100);

ok('o card de backup conta só os ativos',
  ctx.admCardBackup().indexOf('<b>1</b> orçamento') >= 0, ctx.admCardBackup().slice(0, 400));

/* VARREDURA: nenhum nome, cliente ou descrição do apagado pode aparecer em
   NENHUMA superfície de listagem. Se alguém acrescentar uma listagem nova e
   esquecer, esta asserção não pega — mas as de cima pegam o que existe hoje,
   e o desenho (dois mapas separados) é o que impede o esquecimento. */
const superficies = {
  'tela Início': JSON.stringify(V.inicioLista),
  'select Abrir': sel.innerHTML,
  'conferência': JSON.stringify(conf),
  'card de backup': ctx.admCardBackup()
};
Object.keys(superficies).forEach(nome => {
  ok(`"${nome}" não menciona o orçamento apagado`,
    superficies[nome].indexOf('Vai') < 0, superficies[nome].slice(0, 220));
});

/* e a prova estrutural: quem lê `orcamentos` NÃO ENXERGA a lixeira */
ok('os dois mapas são disjuntos',
  Object.keys(V.orcamentos).every(id => V.orcamentosApagados[id] === undefined));
ok('o apagado não está no mapa de ativos, por construção', V.orcamentos.vai === undefined);

/* ============================================================
   3 · Restaurar devolve o orçamento com o total intacto.
   ============================================================ */
K.dados.restaurarOrcamento('vai');
ok('restaurado voltou para os ativos', !!V.orcamentos.vai, Object.keys(V.orcamentos));
ok('restaurado saiu da lixeira', V.orcamentosApagados.vai === undefined, Object.keys(V.orcamentosApagados));
ok('a data de exclusão foi limpa', V.orcamentos.vai.snapshot.deletedEm === undefined,
  V.orcamentos.vai.snapshot);
ok('o TOTAL voltou intacto', ctx.custoTotal(ctx.migrar(V.orcamentos.vai)) === totalAntes,
  [totalAntes, ctx.custoTotal(ctx.migrar(V.orcamentos.vai))]);
ok('o snapshot.total voltou intacto', V.orcamentos.vai.snapshot.total === 2100, V.orcamentos.vai.snapshot.total);

ctx.montarInicio();
ok('restaurado volta a aparecer na tela Início', V.inicioLista.some(p => p.id === 'vai'), V.inicioLista.map(p => p.id));
ok('restaurado volta a colidir por nome', ctx.nomeColide('Vai', null) === true);
ok('restaurado volta a alimentar a sugestão',
  ctx.sugestaoValor('materiais', 'MDF Vai') === 700, ctx.sugestaoValor('materiais', 'MDF Vai'));

/* ============================================================
   4 · Apagar de vez: aí sim a linha some.
   ============================================================ */
K.dados.excluirOrcamento('vai');
ok('de volta para a lixeira', !!V.orcamentosApagados.vai);
K.dados.apagarDeVez('vai');
ok('apagar de vez tira da lixeira', V.orcamentosApagados.vai === undefined, Object.keys(V.orcamentosApagados));
ok('apagar de vez não devolve para os ativos', V.orcamentos.vai === undefined, Object.keys(V.orcamentos));
ok('apagar de vez remove do armazenamento',
  K.store.ler('cen_v3_budgets', {}).vai === undefined, Object.keys(K.store.ler('cen_v3_budgets', {})));
ok('o ativo sobreviveu a tudo', !!K.store.ler('cen_v3_budgets', {}).fica);
ok('apagar de vez em id inexistente não quebra', K.dados.apagarDeVez('nao-existe') === true);
ok('restaurar id inexistente não quebra', K.dados.restaurarOrcamento('nao-existe') === true);
ok('excluir id inexistente não quebra', K.dados.excluirOrcamento('nao-existe') === true);

/* ============================================================
   5 · Backup: exporta a lixeira, importa a lixeira.
   ============================================================ */
const bk = criar(SEED);
bk.K.dados.excluirOrcamento('vai');
const quandoApagou = Number(bk.V.orcamentosApagados.vai.snapshot.deletedEm);

let arquivo = null;
bk.ctx.Blob = function (p) { arquivo = p[0]; };
bk.ctx.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
bk.ctx.document.createElement = () => ({ download: '', href: '', click() {} });
bk.ctx.exportarBackup();
const pay = JSON.parse(arquivo);

ok('o export inclui o orçamento apagado', !!pay.dados.cen_v3_budgets.vai, Object.keys(pay.dados.cen_v3_budgets));
ok('o export inclui também o ativo', !!pay.dados.cen_v3_budgets.fica);
ok('o export preserva a data de exclusão',
  pay.dados.cen_v3_budgets.vai.snapshot.deletedEm === quandoApagou,
  [pay.dados.cen_v3_budgets.vai.snapshot.deletedEm, quandoApagou]);
ok('o ativo do arquivo continua sem data de exclusão',
  pay.dados.cen_v3_budgets.fica.snapshot.deletedEm === undefined);
const resumo = bk.ctx.resumoBackup(pay);
ok('o resumo do backup conta os ativos separado', resumo.orc === 1, resumo);
ok('e conta a lixeira à parte, para quem vai substituir tudo saber o que entra',
  resumo.orcApagados === 1, resumo);
ok('os nomes do resumo são só os ativos', resumo.nomes.join(',') === 'Fica', resumo.nomes);

/* a volta: importar num app limpo devolve o estado como estava */
const imp = criar({ cen_v3_seen: true, cen_v3_opcseed: true, cen_v3_mig3: true });
imp.ctx.location = { reload: () => {} };
imp.ctx.aplicarBackup(pay);
ok('import devolve o ativo para os ativos', !!imp.V.orcamentos.fica, Object.keys(imp.V.orcamentos));
ok('import devolve o apagado para a LIXEIRA, não para a lista',
  !!imp.V.orcamentosApagados.vai && imp.V.orcamentos.vai === undefined,
  { ativos: Object.keys(imp.V.orcamentos), lixeira: Object.keys(imp.V.orcamentosApagados) });
ok('import preserva a data de exclusão',
  Number(imp.V.orcamentosApagados.vai.snapshot.deletedEm) === quandoApagou,
  [imp.V.orcamentosApagados.vai.snapshot.deletedEm, quandoApagou]);
imp.ctx.montarInicio();
ok('depois do import o apagado continua fora da tela Início',
  imp.V.inicioLista.every(p => p.id !== 'vai'), imp.V.inicioLista.map(p => p.id));
ok('depois do import o apagado continua fora da sugestão',
  imp.ctx.sugestaoValor('materiais', 'MDF Vai') === null);

/* ============================================================
   6 · A fronteira com o banco: deleted_at ⇄ deletedEm.
   ============================================================ */
const comData = K.dados.paraLinha('11111111-1111-4111-8111-111111111111',
  { meta: {}, snapshot: { nome: 'X', deletedEm: Date.parse('2026-06-15T12:00:00.000Z') } });
ok('linha: deletedEm vira deleted_at em ISO',
  comData.deleted_at === '2026-06-15T12:00:00.000Z', comData.deleted_at);
const semData = K.dados.paraLinha('22222222-2222-4222-8222-222222222222', { meta: {}, snapshot: { nome: 'Y' } });
ok('linha: ativo grava deleted_at null', semData.deleted_at === null, semData.deleted_at);

const voltaApagado = K.dados.deLinha({ id: 'z', nome: 'Z', updated_at: '2026-06-01T00:00:00.000Z',
  deleted_at: '2026-06-15T12:00:00.000Z', dados: { snapshot: {} } });
ok('volta: deleted_at vira deletedEm em epoch',
  voltaApagado.snapshot.deletedEm === Date.parse('2026-06-15T12:00:00.000Z'), voltaApagado.snapshot.deletedEm);
const voltaAtivo = K.dados.deLinha({ id: 'z', nome: 'Z', updated_at: '2026-06-01T00:00:00.000Z',
  deleted_at: null, dados: { snapshot: { deletedEm: 12345 } } });
ok('volta: a COLUNA manda — linha ativa limpa um deletedEm velho do jsonb',
  voltaAtivo.snapshot.deletedEm === undefined, voltaAtivo.snapshot);

/* ============================================================
   7 · Banco sem a coluna: degrada, e degrada para o lado seguro.

   Sem `deleted_at` a lixeira não tem onde existir. O perigo aqui não é a lixeira
   ficar indisponível — é o campo entrar no payload e derrubar TODA gravação de
   orçamento, não só a exclusão. E é apagar de verdade "para resolver", que seria
   destruir o orçamento justamente para compensar a falta da rede de proteção.
   ============================================================ */
ok('por padrão o app assume que a coluna existe', V.lixeiraNoBanco === true);

V.lixeiraNoBanco = false;
const semColuna = K.dados.paraLinha('33333333-3333-4333-8333-333333333333',
  { meta: {}, snapshot: { nome: 'W', deletedEm: 999 } });
ok('sem a coluna, deleted_at SAI do payload — a gravação continua funcionando',
  !('deleted_at' in semColuna), Object.keys(semColuna));
ok('e o resto do payload continua completo',
  semColuna.nome === 'W' && semColuna.id === '33333333-3333-4333-8333-333333333333', semColuna);

V.lixeiraNoBanco = true;
const comColuna = K.dados.paraLinha('44444444-4444-4444-8444-444444444444', { meta: {}, snapshot: { nome: 'W' } });
ok('com a coluna, deleted_at volta ao payload', 'deleted_at' in comColuna, Object.keys(comColuna));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
