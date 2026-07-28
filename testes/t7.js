/* Suíte 7 — PDF de proposta para o cliente final (v5.11).
   Cobre: o que a proposta NUNCA pode conter (custo, imposto, margem, "Uso interno"),
   a igualdade entre o total da proposta e o preço de venda do relatório interno, o
   gross-up linha a linha, o resíduo de arredondamento, a validade e as guardas. */
const criar = require('./harness');
let falhas = 0;
const ok = (nome, cond, extra) => {
  console.log((cond ? 'PASS  ' : 'FALHA ') + nome + (cond ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) falhas++;
};

const { ctx, K, V } = criar({ cen_v3_seen: true, cen_v3_opcseed: true, cen_v3_mig3: true });

ok('VALIDADE_PADRAO é 15', K.VALIDADE_PADRAO === 15 && ctx.validadeDias({}) === 15, K.VALIDADE_PADRAO);

const fake = () => ({
  value: '', textContent: '', innerHTML: '', style: {}, dataset: {},
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
});
const printArea = fake();
ctx.document.getElementById = id => (id === 'printArea' ? printArea : fake());

let toasts = [];
ctx.toast = msg => { toasts.push(msg); };

/* orçamento com TODOS os setores preenchidos — é o que dá confiança de que nenhum
   caminho de renderização vaza custo */
function orcamentoCompleto() {
  const st = ctx.novoEstado();
  st.meta = {
    nome: 'Túnel Sensorial', num: '007/2026', cliente: 'ACME Eventos',
    responsavel: 'Bia', data: '2026-05-10', tipoItem: 'Túnel cenográfico',
    obs: 'Prazo de 20 dias após aprovação.', validadeDias: 15
  };
  st.itensProntos = [
    { id: 'i1', item: 'Trainel', unidade: 'm²', qtd: 2, largura: 3, altura: 2, valorUnit: 90, precoRef: 90 },
    { id: 'i2', item: 'Stand', unidade: 'peça', qtd: 1, largura: '', altura: '', valorUnit: 1200, precoRef: 1200 }
  ];
  st.materiais = [{ id: 'm1', desc: 'MDF 18mm', unidade: 'm²', qtd: 4, valorUnit: 100 }];
  st.impressao = [{ id: 'p1', desc: 'Lona frontlight', largura: 3, altura: 2, m2: '', qtd: 2, valorM2: 45 }];
  st.estrutura = [{ id: 'e1', desc: 'Box truss Q30', unidade: 'm', qtd: 10, valorUnit: 55 }];
  st.maoObra.producao = [{ id: 'f1', funcao: 'Marceneiro', diarias: 3, valorDiaria: 320 }];
  st.maoObra.montagem = { diariasMontagem: 2, valorMontagem: 400, diariasDesmontagem: 1, valorDesmontagem: 400 };
  st.logistica.transporte = { frete: 900, combustivel: 250, pedagio: 80, estacionamento: '', hospedagem: '', alimentacao: 180, outros: '' };
  st.logistica.locacoes = [{ id: 'l1', equipamento: 'Gerador 15kVA', qtd: 1, dias: 3, valorDia: 300 }];
  st.financeiro = { tributacao: 'servico', impostoPct: 18.33, margemPct: 25 };
  return st;
}

V.config = ctx.normConfig({
  nome: 'KMF Cenografia', razaoSocial: 'KMF Cenografia Ltda', doc: '12.345.678/0001-90',
  tel: '(11) 90000-0000', email: 'contato@kmf.com.br', cidade: 'São Paulo · SP'
});

V.state = orcamentoCompleto();
ctx.imprimirProposta();
const prop = printArea.innerHTML;
ok('a proposta foi gerada', prop.length > 500, prop.length);

// ---------- 1 · o que a proposta NUNCA pode conter ----------
/* as fixtures desta suíte não usam nenhuma dessas palavras em descrição ou
   observação, então qualquer ocorrência veio do gerador do documento */
const PROIBIDO = ['custo', 'Custo', 'margem', 'Margem', 'lucro', 'Lucro',
                  'imposto', 'Imposto', 'tributa', 'Uso interno', 'uso interno',
                  'Valor unit', 'Valor/m²', 'Valor/diária', 'p-uso', 'gross'];
PROIBIDO.forEach(termo => {
  ok(`proposta não contém "${termo}"`, !prop.includes(termo),
    prop.slice(Math.max(0, prop.indexOf(termo) - 90), prop.indexOf(termo) + 90));
});
ok('proposta não contém "custo" em nenhuma caixa', !/custo/i.test(prop));
ok('proposta não contém "imposto" em nenhuma caixa', !/imposto/i.test(prop));
ok('proposta não contém "margem" em nenhuma caixa', !/margem/i.test(prop));
ok('proposta não contém "uso interno" em nenhuma caixa', !/uso\s+interno/i.test(prop));
ok('proposta não traz o percentual de imposto', !prop.includes('18,33') && !prop.includes('18.33'), prop);
ok('proposta não traz o percentual de margem', !prop.includes('25%'), prop);

/* os valores de CUSTO não podem aparecer: 100,00 é o valor unitário do MDF e
   R$ 400,00 o custo total de materiais */
const r = ctx.resultado(V.state);
ok('proposta não traz o custo total', !prop.includes(K.fmt(r.custo)), K.fmt(r.custo));
ok('proposta não traz o valor do imposto', !prop.includes(K.fmt(r.imposto)), K.fmt(r.imposto));
ok('proposta não traz o valor do lucro', !prop.includes(K.fmt(r.lucro)), K.fmt(r.lucro));
ok('proposta não traz o subtotal de custo de materiais',
  !prop.includes(K.fmt(ctx.subMateriais(V.state))), K.fmt(ctx.subMateriais(V.state)));

// ---------- 2 · o que a proposta PRECISA conter ----------
ok('proposta traz o bloco da empresa completo',
  prop.includes('KMF Cenografia Ltda') && prop.includes('CNPJ/CPF 12.345.678/0001-90') &&
  prop.includes('(11) 90000-0000 · contato@kmf.com.br') && prop.includes('São Paulo · SP'), prop.slice(0, 700));
ok('proposta traz o cliente', prop.includes('ACME Eventos'));
ok('proposta traz o número', prop.includes('007/2026'));
ok('proposta traz a data', prop.includes('10/05/2026'));
ok('proposta traz as observações', prop.includes('Prazo de 20 dias após aprovação.'));
ok('proposta traz o preço de venda como total', prop.includes(K.fmt(r.preco)), K.fmt(r.preco));
ok('proposta NÃO carimba responsável (é dado interno)', !prop.includes('Bia'), prop);
ok('proposta carimba a versão do app no rodapé',
  prop.includes('KMF Orçamento v' + K.APP_VERSION), prop.slice(-300));

['Itens prontos', 'Materiais', 'Impressão', 'Estrutura', 'Mão de obra', 'Logística'].forEach(sec => {
  ok(`proposta tem o setor ${sec}`, prop.includes(`>${sec}</td>`), sec);
  ok(`proposta tem o subtotal de ${sec}`, prop.includes(`Subtotal ${sec}`), sec);
});
['Trainel', 'Stand', 'MDF 18mm', 'Lona frontlight', 'Box truss Q30', 'Marceneiro',
 'Montagem', 'Desmontagem', 'Frete / caminhão', 'Combustível', 'Pedágio',
 'Alimentação', 'Gerador 15kVA'].forEach(desc => {
  ok(`proposta lista "${desc}"`, prop.includes(desc), desc);
});
ok('proposta reusa o CSS do relatório interno (.p-tab/.p-sec/.p-subtot/.p-tot)',
  prop.includes('class="p-tab"') && prop.includes('class="p-sec"') &&
  prop.includes('class="p-subtot"') && prop.includes('class="p-tot"'));

// ---------- 3 · totais batem com o relatório interno ----------
const p = ctx.propostaValores(V.state);
ok('total da proposta === preço de venda do relatório interno',
  p.total === K.round2(r.preco), { proposta: p.total, interno: K.round2(r.preco) });
ok('soma dos subtotais dos setores === total',
  K.round2(p.secoes.reduce((a, s) => a + s.subtotal, 0)) === p.total,
  p.secoes.map(s => [s.titulo, s.subtotal]));
ok('soma das linhas === total',
  K.round2(p.secoes.reduce((a, s) => a + s.linhas.reduce((b, l) => b + (l.valor || 0), 0), 0)) === p.total);
ok('total da proposta é MAIOR que o custo (gross-up aplicado)', p.total > r.custo, { total: p.total, custo: r.custo });
ok('total === custo + imposto + lucro',
  Math.abs(p.total - (r.custo + r.imposto + r.lucro)) < 0.02, { total: p.total, soma: r.custo + r.imposto + r.lucro });

/* cada linha carrega a mesma proporção: valor de venda / custo da linha = fator */
const fator = r.preco / r.custo;
const linhas = p.secoes.flatMap(s => s.linhas).filter(l => !l.semPreco);
ok('todas as linhas usam o mesmo fator de gross-up',
  linhas.every(l => l.custo === 0 || Math.abs(l.valor / l.custo - fator) < 0.001),
  linhas.map(l => [l.desc, l.custo, l.valor]));
ok('nenhuma linha da proposta é igual ao seu custo',
  linhas.filter(l => l.custo > 0).every(l => l.valor > l.custo),
  linhas.map(l => [l.desc, l.custo, l.valor]));

/* o subtotal de cada setor é o subtotal de custo daquele setor com gross-up */
const porSetor = { 'Materiais': ctx.subMateriais, 'Impressão': ctx.subImpressao, 'Estrutura': ctx.subEstrutura };
Object.entries(porSetor).forEach(([titulo, fn]) => {
  const sec = p.secoes.find(s => s.titulo === titulo);
  ok(`subtotal de ${titulo} = custo do setor × fator`,
    Math.abs(sec.subtotal - fn(V.state) * fator) < 0.05, { proposta: sec.subtotal, esperado: fn(V.state) * fator });
});

// ---------- 4 · resíduo de arredondamento ----------
/* valores escolhidos para o gross-up cair em dízima: 3 linhas de 33,33 e imposto
   e margem quebrados. Sem redistribuir o resíduo, a soma erra o total por centavos. */
const quebrado = ctx.novoEstado();
quebrado.materiais = [
  { id: 'a', desc: 'A', unidade: 'un', qtd: 1, valorUnit: 33.33 },
  { id: 'b', desc: 'B', unidade: 'un', qtd: 1, valorUnit: 33.33 },
  { id: 'c', desc: 'C', unidade: 'un', qtd: 1, valorUnit: 33.34 }
];
quebrado.financeiro = { tributacao: '', impostoPct: 13.33, margemPct: 27 };
const pq = ctx.propostaValores(quebrado);
const rq = ctx.resultado(quebrado);
ok('caso com dízima: soma das linhas fecha no total exato',
  K.round2(pq.secoes[0].linhas.reduce((a, l) => a + l.valor, 0)) === pq.total,
  pq.secoes[0].linhas.map(l => l.valor));
ok('caso com dízima: total === preço de venda',
  pq.total === K.round2(rq.preco), { proposta: pq.total, interno: K.round2(rq.preco) });

// ---------- 5 · validade ----------
ok('validade padrão quando o campo está em branco', ctx.validadeDias({ validadeDias: '' }) === 15);
ok('validade padrão quando o campo é null', ctx.validadeDias({ validadeDias: null }) === 15);
ok('validade padrão quando o campo é lixo', ctx.validadeDias({ validadeDias: 'abc' }) === 15);
ok('validade respeita o valor do usuário', ctx.validadeDias({ validadeDias: 30 }) === 30);
ok('validade aceita zero', ctx.validadeDias({ validadeDias: 0 }) === 0);

ok('soma de dias simples', ctx.somarDias('2026-05-10', 15) === '2026-05-25', ctx.somarDias('2026-05-10', 15));
ok('soma de dias vira o mês', ctx.somarDias('2026-05-25', 15) === '2026-06-09', ctx.somarDias('2026-05-25', 15));
ok('soma de dias vira o ano', ctx.somarDias('2026-12-20', 15) === '2027-01-04', ctx.somarDias('2026-12-20', 15));
ok('soma de dias em ano bissexto', ctx.somarDias('2028-02-20', 10) === '2028-03-01', ctx.somarDias('2028-02-20', 10));
ok('soma de dias em ano não bissexto', ctx.somarDias('2026-02-20', 10) === '2026-03-02', ctx.somarDias('2026-02-20', 10));
ok('data inválida devolve vazio', ctx.somarDias('', 15) === '' && ctx.somarDias('10/05/2026', 15) === '');
ok('validadeAte usa data + dias', ctx.validadeAte({ data: '2026-05-10', validadeDias: 15 }) === '2026-05-25');
ok('validadeAte com 0 dias não tem prazo', ctx.validadeAte({ data: '2026-05-10', validadeDias: 0 }) === '');
ok('validadeAte sem data cai em hoje', ctx.validadeAte({ data: '', validadeDias: 15 }) === ctx.somarDias(ctx.hoje(), 15));

ok('proposta imprime o prazo de validade', prop.includes('Proposta válida até 25/05/2026'), prop.slice(-400));

V.state = orcamentoCompleto();
V.state.meta.validadeDias = 30;
ctx.imprimirProposta();
ok('validade de 30 dias imprime a data certa',
  printArea.innerHTML.includes('Proposta válida até 09/06/2026'), printArea.innerHTML.slice(-400));

V.state = orcamentoCompleto();
V.state.meta.validadeDias = 0;
ctx.imprimirProposta();
ok('validade zerada omite a linha de prazo',
  !printArea.innerHTML.includes('Proposta válida'), printArea.innerHTML.slice(-400));

V.state = orcamentoCompleto();
V.state.meta.validadeDias = '';
ctx.imprimirProposta();
ok('validade em branco cai no padrão de 15 dias',
  printArea.innerHTML.includes('Proposta válida até 25/05/2026'), printArea.innerHTML.slice(-400));

// ---------- 6 · o novo campo no state ----------
const novo = ctx.novoEstado();
ok('novoEstado nasce com validade 15', novo.meta.validadeDias === 15, novo.meta);
/* orçamento salvo antes da v5.11 não tem o campo: normalizarNovo devolve o padrão */
const semCampo = JSON.parse(JSON.stringify(orcamentoCompleto()));
delete semCampo.meta.validadeDias;
ok('orçamento salvo sem o campo ganha o padrão',
  ctx.migrar(semCampo).meta.validadeDias === 15, ctx.migrar(semCampo).meta);
ok('orçamento salvo com o campo preserva o valor',
  ctx.migrar(Object.assign(JSON.parse(JSON.stringify(orcamentoCompleto())), { meta: Object.assign({}, orcamentoCompleto().meta, { validadeDias: 45 }) })).meta.validadeDias === 45);

// ---------- 7 · guardas: nunca imprimir proposta zerada ----------
toasts = [];
V.state = ctx.novoEstado();
printArea.innerHTML = 'INTOCADO';
ctx.imprimirProposta();
ok('orçamento vazio não gera proposta', printArea.innerHTML === 'INTOCADO', printArea.innerHTML.slice(0, 120));
ok('orçamento vazio avisa o usuário', /Nada para enviar/.test(toasts.join('|')), toasts);

toasts = [];
const invalido = orcamentoCompleto();
invalido.financeiro = { tributacao: '', impostoPct: 60, margemPct: 45 };
V.state = invalido;
printArea.innerHTML = 'INTOCADO';
ctx.imprimirProposta();
ok('imposto + margem >= 100% não gera proposta', printArea.innerHTML === 'INTOCADO', printArea.innerHTML.slice(0, 120));
ok('imposto + margem >= 100% avisa o usuário', /100%/.test(toasts.join('|')), toasts);

// ---------- 8 · item sem preço ----------
const comSemPreco = orcamentoCompleto();
comSemPreco.itensProntos.push({ id: 'i3', item: 'Banner', unidade: 'm²', qtd: 1, largura: 2, altura: 1, valorUnit: '', precoRef: '' });
V.state = comSemPreco;
ctx.imprimirProposta();
const propSP = printArea.innerHTML;
ok('item sem preço sai como "a definir", não como R$ 0,00',
  propSP.includes('a definir') && propSP.includes('Banner'), propSP.slice(propSP.indexOf('Banner') - 60, propSP.indexOf('Banner') + 200));
ok('item sem preço não vaza a expressão interna "sem preço"',
  !/sem\s+preço/.test(propSP.replace(/a definir/g, '')), propSP);
const pSP = ctx.propostaValores(comSemPreco);
ok('item sem preço não muda o total', pSP.total === K.round2(ctx.resultado(comSemPreco).preco), pSP.total);
ok('item sem preço é sinalizado no objeto', pSP.temSemPreco === true);

// ---------- 9 · o relatório interno continua exatamente como era ----------
V.state = orcamentoCompleto();
ctx.imprimir();
const interno = printArea.innerHTML;
ok('relatório interno mantém o carimbo "Uso interno"', interno.includes('Uso interno'), interno.slice(0, 700));
ok('relatório interno mantém o custo total', interno.includes('Custo total') && interno.includes(K.fmt(r.custo)));
ok('relatório interno mantém impostos e margem',
  interno.includes('Impostos (18,33%)') && interno.includes('Margem / lucro (25%)'), interno.slice(-900));
ok('relatório interno mantém o aviso de não enviar ao cliente',
  interno.includes('não enviar ao cliente'), interno.slice(-500));
ok('relatório interno mantém o preço de venda', interno.includes('Preço de venda') && interno.includes(K.fmt(r.preco)));
ok('relatório interno mantém o responsável', interno.includes('Bia'));
ok('os dois documentos mostram o MESMO preço final',
  interno.includes(K.fmt(r.preco)) && prop.includes(K.fmt(r.preco)), K.fmt(r.preco));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
