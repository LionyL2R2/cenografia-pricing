/* Suíte 5 — conferência de integridade (v5.9.2).
   Cobre: comparação entre snapshot.total e o total recalculado, tolerância de
   R$ 0,01, detecção do caso de preço herdado, orçamento sem total de referência,
   registro que não recalcula, ordenação e export em CSV. */
const criar = require('./harness');
let falhas = 0;
const ok = (nome, cond, extra) => {
  console.log((cond ? 'PASS  ' : 'FALHA ') + nome + (cond ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) falhas++;
};

const CAT = [
  { nome: 'Trainel', unidade: 'm²', preco: 90 },
  { nome: 'Stand', unidade: 'peça', preco: 1200 },
  { nome: 'Banner com ilhós', unidade: 'm²', preco: '' }
];

const orc = (extra, snapshot) => Object.assign({
  schemaVersion: 3,
  meta: { nome: 'x', data: '2026-05-10' },
  itensProntos: [], materiais: [], impressao: [], estrutura: [],
  maoObra: { producao: [], montagem: {} },
  logistica: { transporte: {}, locacoes: [] },
  financeiro: { impostoPct: '', margemPct: '' },
  snapshot
}, extra);

/* preço de venda com imposto e margem zerados = custo, o que deixa os números
   do teste legíveis sem tirar o gross-up do caminho */
const BOM = orc(
  { materiais: [{ id: 'm', desc: 'MDF', unidade: 'm²', qtd: 2, valorUnit: 100 }] },
  { id: 'bom', nome: 'Bate certo', salvoEm: 5000, total: 200 }
);

/* o caso que a conferência existe para achar: linha gravada com o preço de
   OUTRO item (Trainel a 1200, que é o preço do Stand) */
const HERDADO = orc(
  { itensProntos: [{ id: 'h', item: 'Trainel', unidade: 'm²', qtd: 1, largura: 3, altura: 2, valorUnit: 1200, precoRef: 90 }] },
  { id: 'herdado', nome: 'Preço herdado', salvoEm: 4000, total: 540 }   // 3*2*1*90 = 540 na época
);

const SEM_REF = orc({ materiais: [{ id: 'm', desc: 'X', unidade: 'un', qtd: 1, valorUnit: 50 }] },
  { id: 'semref', nome: 'Sem referência', salvoEm: 3000 });             // snapshot sem total

const CENTAVO = orc({ materiais: [{ id: 'm', desc: 'X', unidade: 'un', qtd: 1, valorUnit: 100 }] },
  { id: 'centavo', nome: 'Um centavo', salvoEm: 2000, total: 100.01 }); // dif = 0,01 → dentro da tolerância

const DOIS = orc({ materiais: [{ id: 'm', desc: 'X', unidade: 'un', qtd: 1, valorUnit: 100 }] },
  { id: 'dois', nome: 'Dois centavos', salvoEm: 1000, total: 100.02 }); // dif = 0,02 → divergente

const SEM_ITEM = orc({ materiais: [{ id: 'm', desc: 'X', unidade: 'un', qtd: 1, valorUnit: 500 }] },
  { id: 'semitem', nome: 'Diverge sem item pronto', salvoEm: 900, total: 300 });

const { ctx, K, V } = criar({
  cen_v3_budgets: { bom: BOM, herdado: HERDADO, semref: SEM_REF, centavo: CENTAVO, dois: DOIS, semitem: SEM_ITEM },
  cen_v3_itens: CAT, cen_v3_opcseed: true, cen_v3_seen: true, cen_v3_mig3: true
});
V.itensCustom = JSON.parse(JSON.stringify(CAT));

const r = ctx.conferirIntegridade();
const por = id => r.find(x => x.id === id);
ok('o resultado também fica guardado para o export', V.ultimaConferencia === r);

ok('conferiu todos os orçamentos salvos', r.length === 6, r.length);

// ---------- comparação ----------
ok('orçamento que bate não é divergente', por('bom').divergente === false, por('bom'));
ok('orçamento que bate tem diferença zero', por('bom').dif === 0, por('bom').dif);
ok('recalculado usa as regras atuais', por('bom').recalculado === 200, por('bom').recalculado);

const h = por('herdado');
ok('preço herdado é detectado como divergente', h.divergente === true, h);
ok('diferença calculada corretamente', h.dif === 6660, { gravado: h.gravado, recalc: h.recalculado, dif: h.dif });
ok('percentual calculado corretamente', Math.round(h.pct) === 1233, h.pct);

// ---------- tolerância de R$ 0,01 ----------
ok('diferença de exatamente R$ 0,01 NÃO é divergência', por('centavo').divergente === false, por('centavo').dif);
ok('diferença de R$ 0,02 É divergência', por('dois').divergente === true, por('dois').dif);

// ---------- sem total de referência ----------
ok('sem snapshot.total: gravado é null', por('semref').gravado === null);
ok('sem snapshot.total: não é marcado divergente', por('semref').divergente === false);
ok('sem snapshot.total: diferença é null', por('semref').dif === null);

// ---------- detalhe das linhas de item pronto ----------
const it = h.itens[0];
ok('detalhe traz o item', it.item === 'Trainel', it);
ok('detalhe traz a unidade', it.unidade === 'm²', it);
ok('detalhe traz o valorUnit', it.valorUnit === 1200, it);
ok('observação aponta divergência com o catálogo', /difere do catálogo/.test(it.obs), it.obs);
ok('divergente sem item pronto tem lista vazia', por('semitem').divergente && por('semitem').itens.length === 0, por('semitem'));

// ---------- observações por situação ----------
const obs = l => ctx.obsLinhaIP(l);
ok('obs: valor igual ao catálogo é vazio', obs({ item: 'Stand', unidade: 'peça', valorUnit: 1200 }) === '', obs({ item: 'Stand', unidade: 'peça', valorUnit: 1200 }));
ok('obs: sem preço', obs({ item: 'Trainel', unidade: 'm²', valorUnit: '' }) === 'sem preço');
ok('obs: fora do catálogo', obs({ item: 'Inexistente', unidade: 'm²', valorUnit: 10 }) === 'fora do catálogo');
ok('obs: catálogo sem preço', obs({ item: 'Banner com ilhós', unidade: 'm²', valorUnit: 40 }) === 'catálogo sem preço');
ok('obs: unidade difere', /unidade difere/.test(obs({ item: 'Stand', unidade: 'm²', valorUnit: 1200 })), obs({ item: 'Stand', unidade: 'm²', valorUnit: 1200 }));

// ---------- ordenação: divergências primeiro ----------
const nDiv = r.filter(x => x.divergente).length;
ok('divergências vêm primeiro', r.slice(0, nDiv).every(x => x.divergente) && r.slice(nDiv).every(x => !x.divergente),
  r.map(x => [x.id, x.divergente]));

// ---------- nada é corrigido automaticamente ----------
const depois = ctx.lsGet('cen_v3_budgets', {});
ok('conferência NÃO altera os orçamentos', JSON.stringify(depois.herdado) === JSON.stringify(HERDADO), depois.herdado);
ok('conferência NÃO altera o total gravado', depois.herdado.snapshot.total === 540);

// ---------- export em CSV ----------
let baixado = null, nomeArq = null;
ctx.Blob = function (p) { baixado = p[0]; };
ctx.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
ctx.document.createElement = () => ({ set download(v) { nomeArq = v; }, get download() { return nomeArq; }, href: '', click() {} });
ctx.exportarConferencia();
ok('CSV gerado com nome de data', /^cenografia-conferencia-\d{4}-\d{2}-\d{2}\.csv$/.test(nomeArq || ''), nomeArq);
ok('CSV tem cabeçalho', /Total gravado;Total recalculado/.test(baixado || ''), (baixado || '').slice(0, 120));
ok('CSV marca o divergente', /DIVERGENTE/.test(baixado || ''));
ok('CSV traz a linha de item pronto do divergente', /Trainel/.test(baixado || ''));
ok('CSV registra a versão do app', new RegExp('KMF Orçamento v' + K.APP_VERSION).test(baixado || ''), (baixado || '').slice(-200));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
