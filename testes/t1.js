/* Suíte 1 — schema versionado e preservação de campos desconhecidos (v5.7).
   Cobre: carimbo de schemaVersion, cadeia de migrações, _legacy, formato legado v3/v4. */
const { ctx, K } = require('./harness')();
let falhas = 0;
const ok = (nome, cond, extra) => {
  console.log((cond ? 'PASS  ' : 'FALHA ') + nome + (cond ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) falhas++;
};

console.log('APP_VERSION =', K.APP_VERSION, '| SCHEMA_VERSION =', K.SCHEMA_VERSION);
ok('APP_VERSION é uma string', typeof K.APP_VERSION === 'string' && K.APP_VERSION.length > 0, K.APP_VERSION);
ok('novoEstado carrega schemaVersion', ctx.novoEstado().schemaVersion === K.SCHEMA_VERSION);

// ---------- orçamento sem schemaVersion é tratado como v1 e migrado ----------
const antigo = {
  meta: { nome: 'Projeto Antigo', cliente: 'ACME' },
  materiais: [{ id: 'a1', desc: 'MDF', unidade: 'm²', qtd: 4, valorUnit: 100 }],
  impressao: [], estrutura: [], itensProntos: [],
  maoObra: { producao: [], montagem: {} },
  logistica: { transporte: {}, locacoes: [] },
  financeiro: { impostoPct: 18.33, margemPct: 25 }
};
const m1 = ctx.migrar(antigo);
ok('sem schemaVersion é migrado até a versão corrente', m1.schemaVersion === K.SCHEMA_VERSION, m1.schemaVersion);
ok('a cadeia de migrações não altera o custo', ctx.custoTotal(m1) === 400, ctx.custoTotal(m1));
ok('a cadeia de migrações não altera o preço',
  Math.round(ctx.resultado(m1).preco * 100) === Math.round(400 / (1 - 0.1833 - 0.25) * 100), ctx.resultado(m1).preco);
ok('a cadeia de migrações preserva meta', m1.meta.nome === 'Projeto Antigo' && m1.meta.cliente === 'ACME');

// ---------- campos desconhecidos não são mais descartados ----------
console.log('\n-- avisos esperados abaixo --');
const comLixo = JSON.parse(JSON.stringify(antigo));
comLixo.estruturas = [{ id: 'x', desc: 'setor renomeado', qtd: 2, valorUnit: 50 }];
comLixo.campoQualquer = { a: 1 };
comLixo.maoObra.novoSubsetor = [{ id: 'y' }];
comLixo.logistica.armazenagem = 999;
comLixo.materiais = { naoEhArray: true, valor: 42 };
const m2 = ctx.migrar(comLixo);
console.log('-- fim dos avisos --\n');

ok('_legacy existe', !!m2._legacy, m2._legacy);
ok('setor renomeado preservado', !!(m2._legacy.raiz && m2._legacy.raiz.estruturas), m2._legacy.raiz);
ok('campo solto preservado', !!(m2._legacy.raiz && m2._legacy.raiz.campoQualquer));
ok('desconhecido em maoObra preservado', !!(m2._legacy.maoObra && m2._legacy.maoObra.novoSubsetor), m2._legacy.maoObra);
ok('desconhecido em logistica preservado', m2._legacy.logistica && m2._legacy.logistica.armazenagem === 999, m2._legacy.logistica);
ok('lista com tipo errado preservada', m2._legacy.materiais && m2._legacy.materiais.valor === 42, m2._legacy.materiais);
ok('lista com tipo errado vira [] no state', Array.isArray(m2.materiais) && m2.materiais.length === 0);

const roundTrip = ctx.normalizarNovo(JSON.parse(JSON.stringify(m2)));
ok('_legacy sobrevive ao round-trip salvar/carregar',
  !!(roundTrip._legacy && roundTrip._legacy.raiz && roundTrip._legacy.raiz.estruturas), roundTrip._legacy);

// ---------- schema mais novo que o app não é destruído ----------
const futuro = JSON.parse(JSON.stringify(antigo));
futuro.schemaVersion = 99;
const m3 = ctx.migrar(futuro);
ok('schema futuro mantém a versão declarada', m3.schemaVersion === 99, m3.schemaVersion);
ok('schema futuro mantém os dados', ctx.custoTotal(m3) === 400, ctx.custoTotal(m3));

// ---------- formato legado v3/v4 (tabela plana) ----------
const legado = {
  meta: { nome: 'v4', avancado: false, margem: 0, impostoPadrao: 0 },
  itens: [{ desc: 'Item A', valor: 1500 }, { desc: 'Item B', valor: 500 }]
};
const m4 = ctx.migrar(legado);
ok('legado v4 vira linhas de materiais', m4.materiais.length === 2, m4.materiais);
ok('legado v4 preserva o total', ctx.custoTotal(m4) === 2000, ctx.custoTotal(m4));
ok('legado v4 recebe o schemaVersion corrente', m4.schemaVersion === K.SCHEMA_VERSION, m4.schemaVersion);
ok('legado v4 marca a flag migrado', m4.migrado === true);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
