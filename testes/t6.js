/* Suíte 6 — dados da empresa no cabeçalho do PDF e migração legada de responsavel (v5.10).
   Cobre: blocoEmpresa() com todos os campos, só com nome e sem nenhum campo, regra de
   "nunca rótulo sem valor", normConfig sobre config antigo, round-trip do modal e o
   ramo legado de migrar() preservando meta.responsavel. */
const criar = require('./harness');
let falhas = 0;
const ok = (nome, cond, extra) => {
  console.log((cond ? 'PASS  ' : 'FALHA ') + nome + (cond ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) falhas++;
};

const CHEIO = {
  nome: 'KMF Cenografia',
  razaoSocial: 'KMF Cenografia e Montagens Ltda',
  doc: '12.345.678/0001-90',
  tel: '(11) 90000-0000',
  email: 'contato@kmf.com.br',
  cidade: 'São Paulo · SP'
};

const { ctx, K, V } = criar({ cen_v3_seen: true, cen_v3_opcseed: true, cen_v3_mig3: true });

ok('APP_VERSION foi para a 5.10', K.APP_VERSION === '5.10', K.APP_VERSION);

/* elemento falso mínimo para o que o app toca fora do printArea */
const fake = () => ({
  value: '', textContent: '', innerHTML: '', style: {}, dataset: {},
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
});
const printArea = fake();
ctx.document.getElementById = id => (id === 'printArea' ? printArea : fake());

/* conta quantos <div> do bloco saíram sem conteúdo — é o bug que a suíte guarda */
const vazios = html => (html.match(/<div[^>]*>\s*<\/div>/g) || []).length;
const detDe = html => (html.match(/<div class="emp-det">([\s\S]*?)<\/div>\s*<\/div>$/) || [])[1] || null;

// ---------- 1 · todos os campos preenchidos ----------
const hCheio = ctx.blocoEmpresa(CHEIO);
ok('cheio: nome sai no bloco de destaque',
  /<div class="emp-nome">KMF Cenografia<\/div>/.test(hCheio), hCheio);
ok('cheio: razão social aparece', hCheio.includes('KMF Cenografia e Montagens Ltda'), hCheio);
ok('cheio: CNPJ aparece com rótulo', hCheio.includes('CNPJ/CPF 12.345.678/0001-90'), hCheio);
ok('cheio: telefone aparece', hCheio.includes('(11) 90000-0000'), hCheio);
ok('cheio: e-mail aparece', hCheio.includes('contato@kmf.com.br'), hCheio);
ok('cheio: telefone e e-mail dividem a mesma linha',
  hCheio.includes('<div>(11) 90000-0000 · contato@kmf.com.br</div>'), hCheio);
ok('cheio: cidade aparece', hCheio.includes('São Paulo · SP'), hCheio);
ok('cheio: os detalhes ficam agrupados em emp-det', detDe(hCheio) !== null, hCheio);
ok('cheio: nenhum div vazio', vazios(hCheio) === 0, hCheio);
ok('cheio: quatro linhas de detalhe',
  (detDe(hCheio) || '').split('</div>').filter(s => s.trim()).length === 4, detDe(hCheio));

// ---------- 2 · só o nome ----------
const hSo = ctx.blocoEmpresa({ nome: 'Studio Beta' });
ok('só nome: nome aparece', hSo.includes('<div class="emp-nome">Studio Beta</div>'), hSo);
ok('só nome: bloco de detalhe nem é criado', !hSo.includes('emp-det'), hSo);
ok('só nome: nenhum rótulo órfão', !/CNPJ\/CPF/.test(hSo), hSo);
ok('só nome: nenhum div vazio', vazios(hSo) === 0, hSo);

// ---------- 3 · nenhum campo ----------
for (const [rot, cfg] of [['objeto vazio', {}], ['undefined', undefined], ['null', null], ['tudo em branco', { nome: '', razaoSocial: '', doc: '', tel: '', email: '', cidade: '' }]]) {
  const h = ctx.blocoEmpresa(cfg);
  ok(`vazio (${rot}): cai no nome padrão`, h.includes('<div class="emp-nome">KMF Cenografia</div>'), h);
  ok(`vazio (${rot}): sem bloco de detalhe`, !h.includes('emp-det'), h);
  ok(`vazio (${rot}): nenhum div vazio`, vazios(h) === 0, h);
}
ok('espaço em branco conta como vazio',
  !ctx.blocoEmpresa({ nome: 'X', doc: '   ', tel: '\t', cidade: ' ' }).includes('emp-det'),
  ctx.blocoEmpresa({ nome: 'X', doc: '   ', tel: '\t', cidade: ' ' }));

// ---------- 4 · campos parciais: nunca rótulo com valor vazio ----------
const soTel = ctx.blocoEmpresa({ nome: 'A', tel: '(11) 1111-1111' });
ok('só telefone: sai sem o separador solto', soTel.includes('<div>(11) 1111-1111</div>'), soTel);
ok('só telefone: não sobra "·" órfão', !/·\s*<\/div>|<div>\s*·/.test(soTel), soTel);

const soEmail = ctx.blocoEmpresa({ nome: 'A', email: 'a@b.c' });
ok('só e-mail: sai sem o separador solto', soEmail.includes('<div>a@b.c</div>'), soEmail);

const soDoc = ctx.blocoEmpresa({ nome: 'A', doc: '000' });
ok('só documento: rótulo sai junto do valor', soDoc.includes('<div>CNPJ/CPF 000</div>'), soDoc);
ok('só documento: uma única linha de detalhe',
  (detDe(soDoc) || '').split('</div>').filter(s => s.trim()).length === 1, detDe(soDoc));

const semNome = ctx.blocoEmpresa({ razaoSocial: 'Só a razão Ltda' });
ok('sem nome mas com razão social: nome padrão + razão social',
  semNome.includes('<div class="emp-nome">KMF Cenografia</div>') && semNome.includes('Só a razão Ltda'), semNome);

// ---------- 5 · escape de HTML ----------
const hEsc = ctx.blocoEmpresa({ nome: 'A & <b>B</b>', razaoSocial: '"aspas" & cia' });
/* esc() escapa &, < e " — o > passa, e tudo bem: sem "<" nenhuma tag abre */
ok('nome é escapado', hEsc.includes('A &amp; &lt;b>B&lt;/b>') && !hEsc.includes('<b>B'), hEsc);
ok('razão social é escapada', hEsc.includes('&quot;aspas&quot; &amp; cia'), hEsc);

// ---------- 6 · o PDF inteiro (imprimir) ----------
V.state = ctx.novoEstado();
V.state.meta = { nome: 'Túnel Expo', num: '007/2026', cliente: 'ACME', responsavel: 'Bia', data: '2026-05-10', tipoItem: 'Stand', obs: '' };
V.state.materiais = [{ id: 'm1', desc: 'MDF', unidade: 'm²', qtd: 2, valorUnit: 100 }];

V.config = JSON.parse(JSON.stringify(CHEIO));
ctx.imprimir();
const pdfCheio = printArea.innerHTML;
ok('PDF cheio: razão social impressa', pdfCheio.includes('KMF Cenografia e Montagens Ltda'), pdfCheio.slice(0, 400));
ok('PDF cheio: CNPJ impresso', pdfCheio.includes('CNPJ/CPF 12.345.678/0001-90'));
ok('PDF cheio: telefone impresso', pdfCheio.includes('(11) 90000-0000'));
ok('PDF cheio: e-mail impresso', pdfCheio.includes('contato@kmf.com.br'));
ok('PDF cheio: cidade impressa', pdfCheio.includes('São Paulo · SP'));
ok('PDF cheio: responsável continua no cabeçalho do projeto', pdfCheio.includes('Bia'));
ok('PDF cheio: cliente continua no cabeçalho do projeto', pdfCheio.includes('ACME'));

V.config = ctx.normConfig({ nome: 'Studio Beta' });
ctx.imprimir();
const pdfSo = printArea.innerHTML;
ok('PDF só com nome: nome impresso', pdfSo.includes('<div class="emp-nome">Studio Beta</div>'), pdfSo.slice(0, 400));
ok('PDF só com nome: sem bloco de detalhe', !pdfSo.includes('emp-det'), pdfSo.slice(0, 400));
ok('PDF só com nome: nenhum rótulo órfão no cabeçalho', !/CNPJ\/CPF/.test(pdfSo.slice(0, 600)), pdfSo.slice(0, 600));

V.config = ctx.normConfig({});
ctx.imprimir();
const pdfVazio = printArea.innerHTML;
ok('PDF sem config: cai no nome padrão', pdfVazio.includes('<div class="emp-nome">KMF Cenografia</div>'), pdfVazio.slice(0, 400));
ok('PDF sem config: sem bloco de detalhe', !pdfVazio.includes('emp-det'), pdfVazio.slice(0, 400));
ok('PDF sem config: o resto do relatório continua saindo',
  pdfVazio.includes('Resultado financeiro') && pdfVazio.includes('MDF'), pdfVazio.length);

// ---------- 7 · normConfig sobre dados já gravados ----------
const antigo = ctx.normConfig({ nome: 'X', doc: '1', tel: '2', email: '3', cidade: '4' });   // sem razaoSocial
ok('config antigo ganha razaoSocial vazia', antigo.razaoSocial === '', antigo);
ok('config antigo preserva os demais campos',
  antigo.nome === 'X' && antigo.doc === '1' && antigo.tel === '2' && antigo.email === '3' && antigo.cidade === '4', antigo);
ok('config corrompido vira todos os campos vazios',
  JSON.stringify(ctx.normConfig('lixo')) === JSON.stringify({ nome: '', razaoSocial: '', doc: '', tel: '', email: '', cidade: '' }),
  ctx.normConfig('lixo'));
ok('normConfig força string', ctx.normConfig({ nome: 42, doc: null }).nome === '42' && ctx.normConfig({ nome: 42, doc: null }).doc === '');

// ---------- 8 · round-trip do modal ----------
['c_nome', 'c_razao', 'c_doc', 'c_tel', 'c_email', 'c_cidade'].forEach(id => { ctx[id] = fake(); });
V.config = ctx.normConfig(CHEIO);
ctx.abrirConfig();
ok('abrirConfig preenche a razão social no input', ctx.c_razao.value === CHEIO.razaoSocial, ctx.c_razao.value);
ok('abrirConfig preenche o nome no input', ctx.c_nome.value === CHEIO.nome, ctx.c_nome.value);

ctx.c_razao.value = 'Nova Razão Ltda';
ctx.salvarConfig();
ok('salvarConfig guarda a razão social no state', V.config.razaoSocial === 'Nova Razão Ltda', V.config);
const gravado = ctx.lsGet(K.LS.config, {});
ok('salvarConfig persiste a razão social no localStorage', gravado.razaoSocial === 'Nova Razão Ltda', gravado);
ok('salvarConfig persiste os seis campos',
  ['nome', 'razaoSocial', 'doc', 'tel', 'email', 'cidade'].every(k => k in gravado), Object.keys(gravado));
ok('a razão social salva chega ao PDF', ctx.blocoEmpresa(gravado).includes('Nova Razão Ltda'));

// ---------- 9 · ramo legado de migrar() preserva responsavel ----------
const legado = {
  meta: { nome: 'Obra 2019', num: '042/2019', cliente: 'ACME', responsavel: 'Ana Souza',
          data: '2019-08-01', obs: 'pagamento em 30 dias', avancado: false, margem: 0, impostoPadrao: 0 },
  itens: [{ desc: 'Item A', valor: 1500 }, { desc: 'Item B', valor: 500 }]
};
const ml = ctx.migrar(legado);
ok('legado: responsavel é preservado', ml.meta.responsavel === 'Ana Souza', ml.meta);
ok('legado: cliente continua preservado', ml.meta.cliente === 'ACME', ml.meta);
ok('legado: nome continua preservado', ml.meta.nome === 'Obra 2019', ml.meta);
ok('legado: número continua preservado', ml.meta.num === '042/2019', ml.meta);
ok('legado: observações continuam preservadas', ml.meta.obs === 'pagamento em 30 dias', ml.meta);
ok('legado: total intacto', ctx.custoTotal(ml) === 2000, ctx.custoTotal(ml));
ok('legado: flag migrado continua marcada', ml.migrado === true);

const semResp = ctx.migrar({ meta: { nome: 'sem resp' }, itens: [{ desc: 'A', valor: 10 }] });
ok('legado sem responsavel: campo vira string vazia, não undefined',
  semResp.meta.responsavel === '', semResp.meta);

V.state = ml;
ctx.imprimir();
ok('legado migrado: responsável chega ao PDF', printArea.innerHTML.includes('Ana Souza'), printArea.innerHTML.slice(0, 900));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
