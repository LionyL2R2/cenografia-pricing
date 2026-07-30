/* Suíte 9 — mão de obra sem soma dupla e sugestão de preenchimento (v5.12).
   Cobre: montagem/desmontagem como detalhamento (nunca custo), o caso de
   R$ 800 que virava R$ 1.600, o aviso de detalhamento incoerente, a proposta
   listando montagem sem valor, e a sugestão de valor — catálogo, último uso,
   nada — que nunca entra no total sem clique. */
const criar = require('./harness');
let falhas = 0;
const ok = (nome, cond, extra) => {
  console.log((cond ? 'PASS  ' : 'FALHA ') + nome + (cond ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) falhas++;
};

/* ============================================================
   1 · O BUG: 8 diárias a R$ 100, 4 de montagem e 4 de desmontagem.
   Custo real R$ 800. Até a v5.11 dava R$ 1.600.
   ============================================================ */
const { ctx, K, V } = criar({ cen_v3_seen: true, cen_v3_opcseed: true, cen_v3_mig3: true });

const st = ctx.novoEstado();
st.maoObra.producao = [{ id: 'f1', funcao: 'Montador', diarias: 8, valorDiaria: 100 }];
st.maoObra.montagem = { diariasMontagem: 4, diariasDesmontagem: 4 };
st.financeiro = { tributacao: '', impostoPct: '', margemPct: '' };   // sem gross-up: preço = custo

ok('mão de obra = só as linhas de Produção', ctx.subMaoObra(st) === 800, ctx.subMaoObra(st));
ok('o caso do enunciado dá R$ 800, nunca R$ 1.600', ctx.subMaoObra(st) === 800 && ctx.subMaoObra(st) !== 1600, ctx.subMaoObra(st));
ok('subProducao e subMaoObra são a mesma coisa agora',
  ctx.subProducao(st) === ctx.subMaoObra(st), [ctx.subProducao(st), ctx.subMaoObra(st)]);
ok('custo total não conta montagem duas vezes', ctx.custoTotal(st) === 800, ctx.custoTotal(st));
ok('preço de venda sem imposto/margem = 800', K.round2(ctx.resultado(st).preco) === 800, ctx.resultado(st));

/* mexer nos campos de detalhamento não pode mover um centavo */
const antes = ctx.custoTotal(st);
st.maoObra.montagem = { diariasMontagem: 99, diariasDesmontagem: 99 };
ok('mudar o detalhamento NÃO muda o custo', ctx.custoTotal(st) === antes, [antes, ctx.custoTotal(st)]);
st.maoObra.montagem = { diariasMontagem: 0, diariasDesmontagem: 0 };
ok('zerar o detalhamento também não muda o custo', ctx.custoTotal(st) === antes, ctx.custoTotal(st));

/* campo de valor por diária de montagem não existe mais: se um orçamento antigo
   trouxer valorMontagem, ele é ignorado pelo cálculo */
const legado = ctx.novoEstado();
legado.maoObra.producao = [{ id: 'f1', funcao: 'Montador', diarias: 8, valorDiaria: 100 }];
legado.maoObra.montagem = { diariasMontagem: 4, valorMontagem: 100, diariasDesmontagem: 4, valorDesmontagem: 100 };
ok('valorMontagem de orçamento antigo é ignorado no cálculo', ctx.subMaoObra(legado) === 800, ctx.subMaoObra(legado));

/* e some do modelo pela porta normal de campo desconhecido, sem ser apagado */
console.log('\n-- aviso de _legacy esperado abaixo --');
const migrado = ctx.migrar({
  schemaVersion: 3,
  meta: { nome: 'Antigo', data: '2026-05-10' },
  itensProntos: [], materiais: [], impressao: [], estrutura: [],
  maoObra: { producao: [{ id: 'f1', funcao: 'Montador', diarias: 8, valorDiaria: 100 }],
             montagem: { diariasMontagem: 4, valorMontagem: 100, diariasDesmontagem: 4, valorDesmontagem: 100 } },
  logistica: { transporte: {}, locacoes: [] },
  financeiro: { impostoPct: '', margemPct: '' }
});
console.log('-- fim --\n');
ok('novoEstado não tem mais valorMontagem', ctx.novoEstado().maoObra.montagem.valorMontagem === undefined,
  ctx.novoEstado().maoObra.montagem);
ok('diárias de montagem sobrevivem à migração', migrado.maoObra.montagem.diariasMontagem === 4, migrado.maoObra.montagem);
ok('valorMontagem sai do modelo', migrado.maoObra.montagem.valorMontagem === undefined, migrado.maoObra.montagem);
ok('valorMontagem é PRESERVADO em _legacy, não apagado',
  !!(migrado._legacy && migrado._legacy['maoObra.montagem'] && migrado._legacy['maoObra.montagem'].valorMontagem === 100),
  migrado._legacy);
ok('o total do orçamento migrado é o custo real, não o dobrado',
  ctx.custoTotal(migrado) === 800, ctx.custoTotal(migrado));

/* ============================================================
   2 · Validação visível: detalhar mais diárias do que foram lançadas.
   Avisa, não bloqueia.
   ============================================================ */
const v1 = ctx.novoEstado();
v1.maoObra.producao = [{ id: 'f1', funcao: 'Montador', diarias: 8, valorDiaria: 100 }];
v1.maoObra.montagem = { diariasMontagem: 4, diariasDesmontagem: 4 };
ok('8 lançadas, 8 detalhadas: sem aviso', ctx.detalhamentoExcede(v1) === false);
ok('diariasProducao soma as linhas', ctx.diariasProducao(v1) === 8, ctx.diariasProducao(v1));
ok('diariasDetalhadas soma montagem + desmontagem', ctx.diariasDetalhadas(v1) === 8, ctx.diariasDetalhadas(v1));

v1.maoObra.montagem = { diariasMontagem: 5, diariasDesmontagem: 4 };
ok('9 detalhadas para 8 lançadas: avisa', ctx.detalhamentoExcede(v1) === true);
ok('o aviso não muda o custo', ctx.subMaoObra(v1) === 800, ctx.subMaoObra(v1));

v1.maoObra.montagem = { diariasMontagem: 2, diariasDesmontagem: 1 };
ok('detalhar menos que o lançado é legítimo, sem aviso', ctx.detalhamentoExcede(v1) === false);

v1.maoObra.producao = [{ id: 'f1', funcao: 'A', diarias: 0.5, valorDiaria: 100 }, { id: 'f2', funcao: 'B', diarias: 0.5, valorDiaria: 100 }];
v1.maoObra.montagem = { diariasMontagem: 0.5, diariasDesmontagem: 0.5 };
ok('diária quebrada não dispara falso aviso de arredondamento', ctx.detalhamentoExcede(v1) === false,
  [ctx.diariasProducao(v1), ctx.diariasDetalhadas(v1)]);

/* ============================================================
   3 · A proposta do cliente: montagem aparece como serviço, sem valor.
   ============================================================ */
const prop = ctx.novoEstado();
prop.meta = { nome: 'Projeto', num: '1', cliente: 'ACME', data: '2026-05-10', obs: '', validadeDias: 15, responsavel: '' };
prop.maoObra.producao = [{ id: 'f1', funcao: 'Montador', diarias: 8, valorDiaria: 100 }];
prop.maoObra.montagem = { diariasMontagem: 4, diariasDesmontagem: 4 };
prop.financeiro = { tributacao: '', impostoPct: 10, margemPct: 20 };

const pv = ctx.propostaValores(prop);
const mo = pv.secoes.find(s => s.titulo === 'Mão de obra');
ok('a proposta tem o setor Mão de obra', !!mo, pv.secoes.map(s => s.titulo));
ok('a proposta lista Montagem', mo.linhas.some(l => l.desc === 'Montagem'), mo.linhas.map(l => l.desc));
ok('a proposta lista Desmontagem', mo.linhas.some(l => l.desc === 'Desmontagem'), mo.linhas.map(l => l.desc));

const lMont = mo.linhas.find(l => l.desc === 'Montagem');
ok('a linha de Montagem é marcada como inclusa', lMont.incluso === true, lMont);
ok('a linha de Montagem não tem valor', lMont.valor === null, lMont.valor);
ok('a linha de Montagem não tem custo próprio', lMont.custo === 0, lMont.custo);
ok('a linha de Montagem carrega a quantidade de diárias', lMont.qtd === 4, lMont.qtd);
ok('Montagem NÃO é "a definir" — é serviço incluso', lMont.semPreco === false, lMont);
ok('a proposta não fica marcada como tendo item a definir', pv.temSemPreco === false, pv.temSemPreco);

const r = ctx.resultado(prop);
ok('subtotal de mão de obra na proposta = produção com gross-up',
  Math.abs(mo.subtotal - 800 * (r.preco / r.custo)) < 0.05, [mo.subtotal, 800 * (r.preco / r.custo)]);
ok('o total da proposta fecha com o preço de venda', pv.total === K.round2(r.preco), [pv.total, r.preco]);
ok('a soma das linhas fecha com o total',
  K.round2(pv.secoes.reduce((a, s) => a + s.linhas.reduce((b, l) => b + (l.valor || 0), 0), 0)) === pv.total);

/* o documento é escrito em #printArea: interceptamos só esse id, como a t7 faz */
const fake = () => ({ innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  querySelector: () => fake(), querySelectorAll: () => [], closest: () => fake(),
  focus() {}, click() {}, appendChild() {}, addEventListener() {} });
const printArea = fake();
ctx.document.getElementById = id => (id === 'printArea' ? printArea : fake());
V.state = prop;
ctx.imprimirProposta();
const html = printArea.innerHTML;
ok('o documento imprime "incluso" na linha de montagem', html.includes('incluso'), html.slice(0, 200));
ok('o documento não imprime valor de diária de montagem', !/Valor\/diária/.test(html));
ok('o documento continua sem a palavra custo', !/custo/i.test(html));

/* ============================================================
   4 · SUGESTÃO: catálogo primeiro, depois último uso, senão nada.
   ============================================================ */
const SALVOS = {
  velho: {
    schemaVersion: 3,
    meta: { nome: 'Velho', data: '2026-01-10' },
    itensProntos: [{ id: 'a', item: 'Toten', unidade: 'peça', qtd: 1, valorUnit: 700, precoRef: '' }],
    materiais: [{ id: 'b', desc: 'MDF 18mm', unidade: 'm²', qtd: 1, valorUnit: 80 }],
    impressao: [{ id: 'c', desc: 'Lona', largura: 1, altura: 1, m2: '', qtd: 1, valorM2: 30 }],
    estrutura: [{ id: 'd', desc: 'Box truss', unidade: 'm', qtd: 1, valorUnit: 40 }],
    maoObra: { producao: [{ id: 'e', funcao: 'Marceneiro', diarias: 1, valorDiaria: 250 }], montagem: {} },
    logistica: { transporte: { frete: 500 }, locacoes: [{ id: 'g', equipamento: 'Empilhadeira', qtd: 1, dias: 1, valorDia: 300 }] },
    financeiro: { impostoPct: '', margemPct: '' },
    snapshot: { id: 'velho', nome: 'Velho', salvoEm: 1000, total: 0 }
  },
  novo: {
    schemaVersion: 3,
    meta: { nome: 'Novo', data: '2026-06-10' },
    itensProntos: [],
    materiais: [{ id: 'h', desc: 'MDF 18mm', unidade: 'm²', qtd: 1, valorUnit: 120 }],
    impressao: [], estrutura: [],
    maoObra: { producao: [{ id: 'i', funcao: 'Marceneiro', diarias: 1, valorDiaria: 320 }], montagem: {} },
    logistica: { transporte: { frete: 900 }, locacoes: [] },
    financeiro: { impostoPct: '', margemPct: '' },
    snapshot: { id: 'novo', nome: 'Novo', salvoEm: 9000, total: 0 }
  }
};
const s = criar({
  cen_v3_budgets: SALVOS,
  cen_v3_seen: true, cen_v3_mig3: true, cen_v3_opcseed: true,
  cen_v3_itens: [
    { nome: 'Trainel', unidade: 'm²', preco: 90 },
    { nome: 'Toten', unidade: 'peça', preco: '' }        // no catálogo, mas SEM preço
  ]
});

ok('fonte 1 — item com preço no catálogo sugere o do catálogo',
  s.ctx.sugestaoValor('itensprontos', 'Trainel') === 90, s.ctx.sugestaoValor('itensprontos', 'Trainel'));
ok('fonte 1 tem prioridade sobre o histórico',
  s.ctx.fonteSugestao('itensprontos', 'Trainel') === 'catálogo', s.ctx.fonteSugestao('itensprontos', 'Trainel'));
ok('fonte 2 — item no catálogo SEM preço cai no último valor usado',
  s.ctx.sugestaoValor('itensprontos', 'Toten') === 700, s.ctx.sugestaoValor('itensprontos', 'Toten'));
ok('fonte 2 é rotulada como último uso',
  s.ctx.fonteSugestao('itensprontos', 'Toten') === 'último uso', s.ctx.fonteSugestao('itensprontos', 'Toten'));
ok('fonte 3 — item novo, nunca usado, não sugere nada',
  s.ctx.sugestaoValor('materiais', 'Compensado naval') === null, s.ctx.sugestaoValor('materiais', 'Compensado naval'));
ok('nome vazio nunca sugere', s.ctx.sugestaoValor('materiais', '   ') === null);

/* "último" é o mais recente por salvoEm, não o primeiro que aparecer */
ok('materiais: vence o orçamento mais recente (120, não 80)',
  s.ctx.sugestaoValor('materiais', 'MDF 18mm') === 120, s.ctx.sugestaoValor('materiais', 'MDF 18mm'));
ok('produção: vence o mais recente (320, não 250)',
  s.ctx.sugestaoValor('producao', 'Marceneiro') === 320, s.ctx.sugestaoValor('producao', 'Marceneiro'));
ok('transporte: vence o mais recente (900, não 500)',
  s.ctx.sugestaoValor('transporte', 'frete') === 900, s.ctx.sugestaoValor('transporte', 'frete'));

/* todos os setores pedidos têm sugestão */
ok('impressão sugere por descrição', s.ctx.sugestaoValor('impressao', 'Lona') === 30, s.ctx.sugestaoValor('impressao', 'Lona'));
ok('estrutura sugere por descrição', s.ctx.sugestaoValor('estrutura', 'Box truss') === 40, s.ctx.sugestaoValor('estrutura', 'Box truss'));
ok('locações sugere por equipamento', s.ctx.sugestaoValor('locacoes', 'Empilhadeira') === 300, s.ctx.sugestaoValor('locacoes', 'Empilhadeira'));
ok('a comparação de nome ignora caixa e espaço',
  s.ctx.sugestaoValor('materiais', '  mdf 18MM  ') === 120, s.ctx.sugestaoValor('materiais', '  mdf 18MM  '));
ok('setor não se mistura com setor',
  s.ctx.sugestaoValor('estrutura', 'MDF 18mm') === null, s.ctx.sugestaoValor('estrutura', 'MDF 18mm'));

/* ============================================================
   5 · A sugestão NUNCA entra no total sem clique.
   ============================================================ */
s.V.state = s.ctx.novoEstado();
const linha = s.ctx.novoMaterial();
linha.desc = 'MDF 18mm'; linha.qtd = 2; linha.valorUnit = '';
s.V.state.materiais = [linha];

ok('há sugestão para esta linha', s.ctx.sugestaoValor('materiais', 'MDF 18mm') === 120);
ok('mas o campo continua VAZIO', linha.valorUnit === '', linha.valorUnit);
ok('e o custo do setor é zero — sugestão não é valor', s.ctx.subMateriais(s.V.state) === 0, s.ctx.subMateriais(s.V.state));
ok('o custo total do orçamento é zero', s.ctx.custoTotal(s.V.state) === 0, s.ctx.custoTotal(s.V.state));

/* o placeholder mostra a sugestão; o valor do input segue vazio */
ok('o placeholder carrega a sugestão', s.ctx.phSug('materiais', 'MDF 18mm', '') === '120,00',
  s.ctx.phSug('materiais', 'MDF 18mm', ''));
ok('sem sugestão o placeholder volta a 0,00', s.ctx.phSug('materiais', 'Nada disso', '') === '0,00');
ok('campo preenchido não mostra sugestão no placeholder', s.ctx.phSug('materiais', 'MDF 18mm', 50) === '0,00');

/* o botão só existe com campo vazio */
ok('o link "usar" aparece com campo vazio',
  /usar/.test(s.ctx.botoesSug('materiais', linha.id, 'MDF 18mm', '')), s.ctx.botoesSug('materiais', linha.id, 'MDF 18mm', ''));
ok('digitou por cima e o link some',
  s.ctx.botoesSug('materiais', linha.id, 'MDF 18mm', 50) === '', s.ctx.botoesSug('materiais', linha.id, 'MDF 18mm', 50));
ok('sem sugestão não há link', s.ctx.botoesSug('materiais', linha.id, 'Compensado naval', '') === '');

/* só o clique preenche */
s.ctx.usarSugestao('materiais', linha.id);
ok('depois do clique o valor entra na linha', linha.valorUnit === 120, linha.valorUnit);
ok('e aí sim o custo aparece (2 × 120)', s.ctx.subMateriais(s.V.state) === 240, s.ctx.subMateriais(s.V.state));
ok('preenchido o campo, a sugestão some', s.ctx.botoesSug('materiais', linha.id, 'MDF 18mm', linha.valorUnit) === '');

/* zero gravado no passado não vira sugestão: seria oferecer de graça */
const z = criar({
  cen_v3_seen: true, cen_v3_mig3: true, cen_v3_opcseed: true,
  cen_v3_budgets: {
    zerado: {
      schemaVersion: 3, meta: { nome: 'Z', data: '2026-01-01' },
      itensProntos: [], materiais: [{ id: 'a', desc: 'Brinde', unidade: 'un', qtd: 1, valorUnit: 0 }],
      impressao: [], estrutura: [], maoObra: { producao: [], montagem: {} },
      logistica: { transporte: {}, locacoes: [] }, financeiro: { impostoPct: '', margemPct: '' },
      snapshot: { id: 'zerado', nome: 'Z', salvoEm: 1, total: 0 }
    }
  }
});
ok('valor zero gravado no passado NÃO vira sugestão',
  z.ctx.sugestaoValor('materiais', 'Brinde') === null, z.ctx.sugestaoValor('materiais', 'Brinde'));
ok('item pronto com preço vazio no catálogo não sugere zero',
  s.ctx.sugestaoValor('itensprontos', 'Trainel') !== 0);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
