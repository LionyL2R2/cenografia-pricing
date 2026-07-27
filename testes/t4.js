/* Suíte 4 — migração eager e item sem preço (v5.9.1).
   Cobre: varredura eager no boot com rollback, comparação de total antes/depois
   sobre a varredura completa, import migrando o conteúdo, e item de catálogo
   sem preço (não herda preço do item anterior, não grava zero). */
const criar = require('./harness');
let fails = 0;
const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); if (!c) fails++; };

// ---------- catalogo no estado em que os orcamentos foram feitos ----------
const CAT_ORIG = [
  { nome: 'Trainel', unidade: 'm²', preco: 90 },
  { nome: 'Toten', unidade: 'peça', preco: 850 },
  { nome: 'Stand', unidade: 'peça', preco: 1200 },
  { nome: 'Banner com ilhós', unidade: 'm²', preco: '' }   // catalogado SEM preco
];

// regra do SCHEMA 2, reimplementada para servir de referencia independente
function tItem_v2(l, cat) {
  const n = v => { const x = Number(v); return isFinite(x) ? x : 0; };
  const k = cat.find(x => x.nome === l.item);
  const un = k ? k.unidade : (l.unidade || 'm²');
  return un === 'm²' ? n(l.largura) * n(l.altura) * n(l.qtd) * n(l.valorUnit) : n(l.qtd) * n(l.valorUnit);
}
const orcBase = extra => Object.assign({
  meta: { nome: 'x' }, itensProntos: [], materiais: [], impressao: [], estrutura: [],
  maoObra: { producao: [], montagem: {} },
  logistica: { transporte: {}, locacoes: [] },
  financeiro: { impostoPct: 18.33, margemPct: 25 }
}, extra);

// 12 orcamentos, variando schemaVersion e situacao de unidade
const IP = [
  [{ id: 'a', item: 'Trainel', unidade: 'm²', qtd: 2, largura: 3, altura: 2, valorUnit: 90 }],
  [{ id: 'b', item: 'Toten', unidade: '', qtd: 3, largura: '', altura: '', valorUnit: 850 }],          // sem unidade (v5.1)
  [{ id: 'c', item: 'Stand', unidade: 'm²', qtd: 1, largura: 5, altura: 4, valorUnit: 1200 }],          // linha discorda
  [{ id: 'd', item: 'Sumido', unidade: 'peça', qtd: 4, largura: '', altura: '', valorUnit: 70 }],       // fora do catalogo
  [{ id: 'e', item: '', unidade: '', qtd: 1, largura: 2, altura: 2, valorUnit: 50 }],                   // livre
  [{ id: 'f', item: 'Trainel', unidade: '', qtd: 1, largura: 4, altura: 2.5, valorUnit: 90 },
   { id: 'g', item: 'Toten', unidade: 'm²', qtd: 2, largura: 1, altura: 1, valorUnit: 850 }],           // dois itens, um discordando
  [], []                                                                                                 // orcamentos sem itens prontos
];
const seedBudgets = {};
IP.forEach((linhas, i) => {
  seedBudgets['id' + i] = orcBase({
    schemaVersion: i % 3 === 0 ? undefined : 2,           // alguns sem o campo (v1)
    itensProntos: JSON.parse(JSON.stringify(linhas)),
    materiais: [{ id: 'm', desc: 'MDF', unidade: 'm²', qtd: 2, valorUnit: 100 }],
    snapshot: { id: 'id' + i, nome: 'Orcamento ' + i, salvoEm: 1000 + i, total: 999 }
  });
});
// um registro legado v3/v4 (sem financeiro/materiais/maoObra) — deve ser PULADO
seedBudgets['legado'] = { meta: { nome: 'v4' }, itens: [{ desc: 'A', valor: 1500 }], snapshot: { id: 'legado', nome: 'Legado v4' } };
// um registro que MENTE: diz schema 3 mas as linhas nao tem precoRef
seedBudgets['mentiroso'] = orcBase({
  schemaVersion: 3,
  itensProntos: [{ id: 'z', item: 'Toten', unidade: '', qtd: 2, largura: '', altura: '', valorUnit: 850 }],
  snapshot: { id: 'mentiroso', nome: 'Rotulado errado' }
});
const seedAuto = orcBase({ schemaVersion: 2, itensProntos: [{ id: 'r', item: 'Stand', unidade: 'm²', qtd: 1, largura: 3, altura: 3, valorUnit: 1200 }] });

const SEED = {
  cen_v3_budgets: seedBudgets,
  cen_v3_auto: seedAuto,
  cen_v3_itens: CAT_ORIG,
  cen_v3_opcseed: true,
  cen_v3_seen: true
};

// totais de referencia, calculados com a regra do schema 2 e o catalogo ORIGINAL
const refBudgets = {};
Object.keys(seedBudgets).forEach(id => {
  const r = seedBudgets[id];
  if (!Array.isArray(r.itensProntos)) return;
  refBudgets[id] = r.itensProntos.reduce((a, l) => a + tItem_v2(l, CAT_ORIG), 0);
});
const refAuto = seedAuto.itensProntos.reduce((a, l) => a + tItem_v2(l, CAT_ORIG), 0);

// ================= boot com o seed: a varredura eager roda sozinha =================
const { ctx, K, V, store } = criar(SEED);

ok('APP_VERSION é uma string', typeof K.APP_VERSION === 'string', K.APP_VERSION);
ok('flag de migracao foi marcada', ctx.lsGet(K.LS_INT.mig3, false) === true);
ok('backup pre-migracao foi gravado', !!ctx.lsGet(K.LS_INT.preMig3, null));
const pre = ctx.lsGet(K.LS_INT.preMig3, null);
ok('backup guarda o conteudo ORIGINAL de budgets', pre.budgets === JSON.stringify(seedBudgets));
ok('backup guarda o conteudo ORIGINAL de auto', pre.auto === JSON.stringify(seedAuto));
ok('backup NAO entra nas chaves exportadas', !Object.values(K.LS).includes(K.LS_INT.preMig3) && !Object.values(K.LS).includes(K.LS_INT.mig3));

const depois = ctx.lsGet('cen_v3_budgets', {});
const nMig = Object.keys(depois).filter(id => depois[id].schemaVersion === 3).length;
console.log(`\norcamentos no store: ${Object.keys(depois).length} | migrados p/ schema 3: ${nMig}\n`);
// 10 registros no store: 9 no formato novo (8 + o "mentiroso") + 1 legado v3/v4 pulado
ok('os 9 do formato novo migraram', nMig === 9, { nMig, ids: Object.keys(depois).map(i => [i, depois[i].schemaVersion]) });
ok('registro legado v3/v4 foi PULADO (sem carimbo)', depois.legado.schemaVersion === undefined, depois.legado);
ok('registro legado preservado intacto', JSON.stringify(depois.legado) === JSON.stringify(seedBudgets.legado));

// ---------- O TESTE CENTRAL: nenhum total mudou, na varredura inteira ----------
let divergentes = [];
Object.keys(refBudgets).forEach(id => {
  const t = ctx.subItensProntos(ctx.migrar(depois[id]));
  if (t !== refBudgets[id]) divergentes.push({ id, v2: refBudgets[id], v3: t });
});
ok('varredura eager: NENHUM total mudou (10 orcamentos)', divergentes.length === 0, divergentes);
ok('rascunho tambem migrou', ctx.lsGet('cen_v3_auto', {}).schemaVersion === 3);
ok('rascunho: total inalterado', ctx.subItensProntos(ctx.migrar(ctx.lsGet('cen_v3_auto', {}))) === refAuto);
ok('snapshot preservado na migracao', depois.id0.snapshot && depois.id0.snapshot.nome === 'Orcamento 0', depois.id0.snapshot);
ok('materiais preservados na migracao', depois.id0.materiais.length === 1);

// registro que mentia sobre a versao foi remigrado de verdade
ok('registro rotulado errado foi remigrado', depois.mentiroso.itensProntos[0].unidade === 'peça', depois.mentiroso.itensProntos[0]);
ok('registro rotulado errado ganhou precoRef', depois.mentiroso.itensProntos[0].precoRef === 850, depois.mentiroso.itensProntos[0]);

// ---------- agora o catalogo muda: nada pode mexer nos totais ----------
V.itensCustom = [
  { nome: 'Trainel', unidade: 'peça', preco: 300 },
  { nome: 'Toten', unidade: 'm²', preco: 850 },
  { nome: 'Stand', unidade: 'm²', preco: 1200 }
];
let divergentes2 = [];
Object.keys(refBudgets).forEach(id => {
  const t = ctx.subItensProntos(ctx.migrar(ctx.lsGet('cen_v3_budgets', {})[id]));
  if (t !== refBudgets[id]) divergentes2.push({ id, v2: refBudgets[id], agora: t });
});
ok('apos mudar TODO o catalogo: nenhum total mudou', divergentes2.length === 0, divergentes2);

// ---------- a varredura nao roda duas vezes ----------
const h2 = criar(Object.assign({}, SEED, { cen_v3_budgets: ctx.lsGet('cen_v3_budgets', {}), cen_v3_mig3: true }));
ok('varredura nao repete com a flag marcada', h2.ctx.migrarTudoParaSchema3() === null);

// ---------- rollback: falha no meio restaura tudo e NAO marca a flag ----------
// boot COM a flag: a varredura nao roda e os orcamentos ficam no schema 2 original
const h3 = criar(Object.assign({}, SEED, { cen_v3_mig3: true }));
h3.store.delete('cen_v3_mig3');            // agora destrava, para rodar a varredura na mao
const originalBudgets = h3.store.get('cen_v3_budgets');
ok('cenario de rollback comeca no schema 2', JSON.parse(originalBudgets).id1.schemaVersion === 2);
let n = 0;
const setReal = h3.localStorage.setItem;
h3.localStorage.setItem = (k, v) => { if (k === 'cen_v3_budgets' && ++n >= 1) throw new Error('quota'); setReal(k, v); };
console.log('\n-- erro esperado abaixo --');
const r3 = h3.ctx.migrarTudoParaSchema3();
console.log('-- fim --\n');
h3.localStorage.setItem = setReal;
ok('falha devolve null', r3 === null, r3);
ok('rollback: budgets restaurado byte a byte', h3.store.get('cen_v3_budgets') === originalBudgets);
ok('rollback: flag NAO foi marcada', h3.ctx.lsGet(K.LS_INT.mig3, false) === false, h3.ctx.lsGet(K.LS_INT.mig3, false));

// ---------- import roda as migracoes no conteudo, ignorando o cabecalho ----------
const h4 = criar({ cen_v3_itens: CAT_ORIG, cen_v3_opcseed: true, cen_v3_seen: true, cen_v3_mig3: true });
const payload = {
  app: 'cenografia-pricing', appVersion: '9.9', schemaVersion: 99,   // cabecalho mentiroso
  dados: {
    cen_v3_budgets: { imp: orcBase({ schemaVersion: 2, itensProntos: [{ id: 'i', item: 'Toten', unidade: '', qtd: 2, largura: '', altura: '', valorUnit: 850 }] }) },
    cen_v3_auto: orcBase({ itensProntos: [{ id: 'j', item: 'Stand', unidade: 'm²', qtd: 1, largura: 2, altura: 2, valorUnit: 1200 }] }),
    cen_v3_itens: CAT_ORIG
  }
};
const refImp = payload.dados.cen_v3_budgets.imp.itensProntos.reduce((a, l) => a + tItem_v2(l, CAT_ORIG), 0);
const refImpAuto = payload.dados.cen_v3_auto.itensProntos.reduce((a, l) => a + tItem_v2(l, CAT_ORIG), 0);
h4.ctx.aplicarBackup(payload);
const impB = h4.ctx.lsGet('cen_v3_budgets', {}).imp;
ok('import migrou o orcamento importado', impB.schemaVersion === 3, impB.schemaVersion);
ok('import congelou a unidade', impB.itensProntos[0].unidade === 'peça', impB.itensProntos[0]);
ok('import preservou o total', h4.ctx.subItensProntos(h4.ctx.migrar(impB)) === refImp, { esperado: refImp });
ok('import migrou o rascunho', h4.ctx.lsGet('cen_v3_auto', {}).schemaVersion === 3);
ok('import preservou o total do rascunho', h4.ctx.subItensProntos(h4.ctx.migrar(h4.ctx.lsGet('cen_v3_auto', {}))) === refImpAuto);
ok('import marca a flag de migracao', h4.ctx.lsGet(K.LS_INT.mig3, false) === true);

// ================= ITEM PRONTO SEM PRECO =================
const h5 = criar({ cen_v3_itens: CAT_ORIG, cen_v3_opcseed: true, cen_v3_seen: true, cen_v3_mig3: true });
h5.V.itensCustom = JSON.parse(JSON.stringify(CAT_ORIG));
h5.V.state = h5.ctx.novoEstado();
h5.V.state.itensProntos.push(h5.ctx.novoItemPronto());
const L = h5.V.state.itensProntos[0];

h5.ctx.onItemProntoSel(L.id, { value: 'Stand' });
ok('item COM preco puxa o valor', L.valorUnit === 1200, L.valorUnit);
h5.ctx.onItemProntoSel(L.id, { value: 'Banner com ilhós' });
ok('trocar p/ item SEM preco NAO herda o preco anterior', L.valorUnit === '', L.valorUnit);
ok('nao grava zero como se fosse preco', L.valorUnit !== 0, L.valorUnit);
ok('precoRef fica vazio', L.precoRef === '', L.precoRef);
ok('linha avisa "sem preco no catalogo"', h5.ctx.semPrecoCatalogo(L) === true);
ok('aviso aparece no HTML da linha', h5.ctx.avisoPreco(L).includes('sem preço no catálogo'), h5.ctx.avisoPreco(L));
L.valorUnit = 75;
ok('aviso some quando o usuario preenche', h5.ctx.semPrecoCatalogo(L) === false && h5.ctx.avisoPreco(L) === '');
L.valorUnit = '';
ok('item fora do catalogo nao mostra esse aviso', (() => { const x = Object.assign(h5.ctx.novoItemPronto(), { item: 'Inexistente' }); return h5.ctx.semPrecoCatalogo(x) === false; })());
ok('linha sem item escolhido nao avisa', h5.ctx.semPrecoCatalogo(h5.ctx.novoItemPronto()) === false);
ok('semPreco distingue vazio de zero', h5.ctx.semPreco({ valorUnit: '' }) === true && h5.ctx.semPreco({ valorUnit: 0 }) === false);

console.log(fails ? `\n${fails} FALHA(S)` : '\nTodos os testes passaram.');
process.exit(fails ? 1 : 0);
