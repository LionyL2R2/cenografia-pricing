/* Suíte 3 — orçamentos auto-contidos (v5.9).
   Cobre: migração 2->3 preservando totais, congelamento de unidade na linha,
   imunidade a mudanças no catálogo, aviso de divergência de preço e dropdowns. */
const { ctx, K, V, store } = require('./harness')();
let fails = 0;
const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); if (!c) fails++; };
const setCatalogo = arr => { V.itensCustom = JSON.parse(JSON.stringify(arr)); };

ok('APP_VERSION é uma string', typeof K.APP_VERSION==='string', K.APP_VERSION);
ok('SCHEMA_VERSION e 3', K.SCHEMA_VERSION === 3, K.SCHEMA_VERSION);

// catalogo global no momento em que os orcamentos "foram feitos"
const CATALOGO = [
  { nome: 'Trainel', unidade: 'm²', preco: 90 },
  { nome: 'Toten', unidade: 'peça', preco: 850 },
  { nome: 'Stand', unidade: 'peça', preco: 1200 }
];
setCatalogo(CATALOGO);
ok('harness controla o catalogo', ctx.itensProntosAll().length === 3, ctx.itensProntosAll());

// ---------- calculo do SCHEMA 2 (regra antiga), para comparar ----------
function ipUnidade_v2(l) { const k = CATALOGO.find(x => x.nome === l.item); return k ? k.unidade : (l.unidade || 'm²'); }
function tItem_v2(l) {
  const n = v => { const x = Number(v); return isFinite(x) ? x : 0; };
  return ipUnidade_v2(l) === 'm²' ? n(l.largura) * n(l.altura) * n(l.qtd) * n(l.valorUnit) : n(l.qtd) * n(l.valorUnit);
}

const LINHAS = [
  { id: 'a', item: 'Trainel', unidade: 'm²', qtd: 2, largura: 3, altura: 2, valorUnit: 90 },
  { id: 'b', item: 'Toten', unidade: '', qtd: 3, largura: '', altura: '', valorUnit: 850 },
  { id: 'c', item: 'Stand', unidade: 'm²', qtd: 1, largura: 5, altura: 4, valorUnit: 1200 },
  { id: 'd', item: 'Removido', unidade: 'peça', qtd: 4, largura: '', altura: '', valorUnit: 70 },
  { id: 'e', item: '', unidade: '', qtd: 1, largura: 2, altura: 2, valorUnit: 50 }
];
const orcamento = {
  schemaVersion: 2,
  meta: { nome: 'Teste' }, itensProntos: JSON.parse(JSON.stringify(LINHAS)),
  materiais: [], impressao: [], estrutura: [],
  maoObra: { producao: [], montagem: {} },
  logistica: { transporte: {}, locacoes: [] },
  financeiro: { impostoPct: 18.33, margemPct: 25 }
};

const totalV2 = LINHAS.reduce((a, l) => a + tItem_v2(l), 0);
const st = ctx.migrar(orcamento);
const totalV3 = ctx.subItensProntos(st);
console.log(`\ntotal schema 2 = ${totalV2}  |  total apos migracao 2->3 = ${totalV3}\n`);
ok('migracao 2->3 nao altera o total', totalV2 === totalV3, { totalV2, totalV3 });
ok('schemaVersion virou 3', st.schemaVersion === 3, st.schemaVersion);

LINHAS.forEach((orig, i) => {
  const nv = st.itensProntos[i];
  ok(`linha ${orig.id}: total identico`, tItem_v2(orig) === ctx.tItem(nv), { v2: tItem_v2(orig), v3: ctx.tItem(nv), nv });
  ok(`linha ${orig.id}: unidade congelada = ${ipUnidade_v2(orig)}`, nv.unidade === ipUnidade_v2(orig), nv.unidade);
});
ok('linha b (sem unidade) virou peca', st.itensProntos[1].unidade === 'peça', st.itensProntos[1]);
ok('linha c (linha discordava do catalogo) virou peca', st.itensProntos[2].unidade === 'peça', st.itensProntos[2]);
ok('linha d (fora do catalogo) manteve peca', st.itensProntos[3].unidade === 'peça', st.itensProntos[3]);
ok('precoRef carimbado com o preco do catalogo', st.itensProntos[0].precoRef === 90, st.itensProntos[0]);
ok('precoRef vazio p/ item fora do catalogo', st.itensProntos[3].precoRef === '', st.itensProntos[3]);
ok('migracao nao dispara aviso falso', st.itensProntos.every(l => ctx.catalogoDivergiu(l) === null),
  st.itensProntos.map(l => ({ item: l.item, precoRef: l.precoRef, div: ctx.catalogoDivergiu(l) })));

// ---------- O PONTO CENTRAL: mexer no catalogo nao muda orcamento salvo ----------
const antes = ctx.subItensProntos(st);
setCatalogo([
  { nome: 'Trainel', unidade: 'peça', preco: 120 },   // unidade E preco mudados
  { nome: 'Toten', unidade: 'm²', preco: 850 },       // unidade mudada
  { nome: 'Stand', unidade: 'peça', preco: 1500 }     // preco mudado
]);
ok('trocar UNIDADE no catalogo nao muda o total salvo', antes === ctx.subItensProntos(st), { antes, depois: ctx.subItensProntos(st) });
const recarregado = ctx.migrar(JSON.parse(JSON.stringify(st)));
ok('recarregar apos mudanca de catalogo nao muda o total', ctx.subItensProntos(recarregado) === antes, ctx.subItensProntos(recarregado));
ok('remover o item do catalogo nao muda o total', (() => { setCatalogo([]); const t = ctx.subItensProntos(ctx.migrar(JSON.parse(JSON.stringify(st)))); setCatalogo([{ nome: 'Trainel', unidade: 'peça', preco: 120 }, { nome: 'Toten', unidade: 'm²', preco: 850 }, { nome: 'Stand', unidade: 'peça', preco: 1500 }]); return t === antes; })());

// ---------- aviso de divergencia de PRECO ----------
const lTrainel = st.itensProntos[0];
ok('divergencia detectada (90 -> 120)', ctx.catalogoDivergiu(lTrainel) === 120, ctx.catalogoDivergiu(lTrainel));
ok('linha nao mudou sozinha', lTrainel.valorUnit === 90, lTrainel.valorUnit);
ok('total ainda nao mudou', ctx.subItensProntos(st) === antes);
ok('sem divergencia quando o preco nao mudou', ctx.catalogoDivergiu(st.itensProntos[1]) === null);
ok('item fora do catalogo nao avisa', ctx.catalogoDivergiu(st.itensProntos[3]) === null);

// atualizar so por acao explicita do usuario
V.state = st;
ctx.usarPrecoCatalogo('a');
ok('usarPrecoCatalogo aplica o preco novo', lTrainel.valorUnit === 120, lTrainel.valorUnit);
ok('usarPrecoCatalogo zera a divergencia', ctx.catalogoDivergiu(lTrainel) === null, lTrainel);
ok('total muda so depois do clique', ctx.subItensProntos(st) !== antes);

// ---------- escolher item do catalogo copia nome+unidade+preco ----------
V.state = ctx.novoEstado();
V.state.itensProntos.push(ctx.novoItemPronto());
const nv = V.state.itensProntos[0];
ctx.onItemProntoSel(nv.id, { value: 'Stand' });
ok('copiou o nome', nv.item === 'Stand', nv);
ok('copiou a unidade', nv.unidade === 'peça', nv);
ok('copiou o preco', nv.valorUnit === 1500, nv);
ok('gravou precoRef', nv.precoRef === 1500, nv);
ok('linha nova nao diverge', ctx.catalogoDivergiu(nv) === null);

// ---------- opcoes de dropdown: texto na linha, nao referencia ----------
V.opcoesCustom = { materiais: ['Madeira', 'Placa MDF'], producao: [], impressao: [] };
const c1 = ctx.descCell('materiais', 'x1', 'desc', 'Compensado naval');
ok('texto fora da lista vira opcao propria', c1.includes('fora da lista'), c1.slice(0, 300));
ok('texto fora da lista fica selecionado', /value="Compensado naval" selected/.test(c1), c1.slice(0, 300));
ok('input de texto livre comeca escondido', /class="desc-outros"[^>]*style="display:none"/.test(c1), c1.slice(-300));
const c2 = ctx.descCell('materiais', 'x1', 'desc', 'Madeira');
ok('texto na lista seleciona normal', /value="Madeira" selected/.test(c2) && !c2.includes('fora da lista'));

// ---------- coletarOpcoes: sem duplicata por caixa, e grava preco no catalogo ----------
V.opcoesCustom = { materiais: ['Madeira'], producao: [], impressao: [] };
setCatalogo([]);
V.state = ctx.novoEstado();
V.state.materiais.push(Object.assign(ctx.novoMaterial(), { desc: 'madeira' }));
V.state.itensProntos.push(Object.assign(ctx.novoItemPronto(), { item: 'Painel LED', unidade: 'peça', qtd: 1, valorUnit: 430 }));
ctx.coletarOpcoes();
ok('nao duplica Madeira/madeira', V.opcoesCustom.materiais.length === 1, V.opcoesCustom.materiais);
ok('item novo entra no catalogo com preco', V.itensCustom.length === 1 && V.itensCustom[0].preco === 430, V.itensCustom);
ok('linha ganha precoRef ao virar catalogo', V.state.itensProntos[0].precoRef === 430, V.state.itensProntos[0]);

console.log(fails ? `\n${fails} FALHA(S)` : '\nTodos os testes passaram.');
process.exit(fails ? 1 : 0);
