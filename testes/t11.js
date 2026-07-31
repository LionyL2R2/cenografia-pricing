/* Suíte 11 — onboarding por conta e o banner de exemplo (fase 2 · bug D).
   Cobre: o orçamento de exemplo aparecendo uma vez só, a marca de onboarding
   saindo do navegador para a conta, e o banner de exemplo que ficava na tela
   depois de abrir um orçamento salvo. */
const criar = require('./harness');
let falhas = 0;
const ok = (nome, cond, extra) => {
  console.log((cond ? 'PASS  ' : 'FALHA ') + nome + (cond ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) falhas++;
};

/* elemento com classList DE VERDADE, para dar pra ver se o banner está na tela */
function elObservavel() {
  const classes = new Set();
  return {
    innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c),
      toggle: (c, on) => { if (on === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c); } else if (on) classes.add(c); else classes.delete(c); },
      contains: c => classes.has(c)
    },
    querySelector: () => elObservavel(), querySelectorAll: () => [], closest: () => elObservavel(),
    focus() {}, click() {}, appendChild() {}, addEventListener() {}
  };
}
/* faz getElementById devolver o MESMO objeto para os ids que o teste observa */
function espionar(ctx, ids) {
  const reais = {};
  ids.forEach(id => { reais[id] = elObservavel(); });
  const anterior = ctx.document.getElementById;
  ctx.document.getElementById = id => (reais[id] || anterior(id));
  return reais;
}

const ORC = {
  schemaVersion: 3,
  meta: { nome: 'Salvo', num: '', cliente: '', responsavel: '', data: '2026-05-10', tipoItem: '', obs: '', validadeDias: 15 },
  itensProntos: [], materiais: [{ id: 'm', desc: 'MDF', unidade: 'm²', qtd: 1, valorUnit: 100 }],
  impressao: [], estrutura: [],
  maoObra: { producao: [], montagem: {} },
  logistica: { transporte: {}, locacoes: [] },
  financeiro: { tributacao: '', impostoPct: '', margemPct: '' },
  snapshot: { id: 'orc1', nome: 'Orçamento salvo', salvoEm: 5000, total: 100 }
};

/* ============================================================
   1 · PRIMEIRO ACESSO: sem marca de onboarding, o exemplo aparece.
   ============================================================ */
const novo = criar({ cen_v3_opcseed: true, cen_v3_mig3: true });   // sem cen_v3_seen

ok('primeiro acesso: o exemplo foi montado', novo.V.state.meta.nome === 'Túnel Sensorial Expo', novo.V.state.meta.nome);
ok('primeiro acesso: o banner de exemplo está ligado', novo.V.ehExemplo === true, novo.V.ehExemplo);
ok('primeiro acesso: a marca de onboarding ficou gravada', novo.V.onboardingVisto === true, novo.V.onboardingVisto);
ok('no modo local a marca continua sendo a chave deste navegador',
  novo.K.store.ler('cen_v3_seen', false) === true, novo.K.store.ler('cen_v3_seen', false));

/* ============================================================
   2 · SEGUNDO ACESSO: com a marca, nada de exemplo.
   ============================================================ */
const volta = criar({ cen_v3_seen: true, cen_v3_opcseed: true, cen_v3_mig3: true });
ok('segundo acesso: nenhum exemplo é montado', volta.V.state.meta.nome === '', volta.V.state.meta.nome);
ok('segundo acesso: o banner de exemplo fica desligado', volta.V.ehExemplo === false, volta.V.ehExemplo);
ok('segundo acesso: a marca continua marcada', volta.V.onboardingVisto === true);

/* a marca é lida da coleção em memória, não do localStorage direto — é isso que
   permite ela vir de uma coluna de `perfis` no modo banco, sem tocar em init() */
const comRascunho = criar({ cen_v3_seen: true, cen_v3_opcseed: true, cen_v3_mig3: true,
  cen_v3_auto: { schemaVersion: 3, meta: { nome: 'Rascunho em aberto', data: '2026-05-10' },
                 itensProntos: [], materiais: [], impressao: [], estrutura: [],
                 maoObra: { producao: [], montagem: {} },
                 logistica: { transporte: {}, locacoes: [] },
                 financeiro: { impostoPct: '', margemPct: '' } } });
ok('rascunho restaurado não liga o banner de exemplo', comRascunho.V.ehExemplo === false, comRascunho.V.ehExemplo);
ok('rascunho restaurado continua sendo restaurado', comRascunho.V.state.meta.nome === 'Rascunho em aberto');
ok('o rascunho continua sendo local — não virou coleção de servidor',
  comRascunho.K.CHAVES_LOCAIS.indexOf(comRascunho.K.LS.auto) >= 0, comRascunho.K.CHAVES_LOCAIS);
ok('a marca de onboarding SAIU das chaves locais',
  comRascunho.K.CHAVES_LOCAIS.indexOf(comRascunho.K.LS.seen) < 0, comRascunho.K.CHAVES_LOCAIS);

/* ============================================================
   3 · BUG D — o banner de exemplo ficava na tela ao abrir um orçamento salvo.
   ============================================================ */
const d = criar({ cen_v3_opcseed: true, cen_v3_mig3: true });   // primeiro acesso: exemplo na tela
const els = espionar(d.ctx, ['bannerExemplo', 'bannerMigrado']);
d.V.orcamentos = { orc1: ORC };
d.ctx.render();

ok('cenário: o banner de exemplo está visível antes de abrir', els.bannerExemplo.classList.contains('show') === true);
ok('cenário: o state é o do exemplo', d.V.state.meta.nome === 'Túnel Sensorial Expo');

d.ctx.carregarOrcamento('orc1');
ok('BUG D: abrir um orçamento salvo APAGA o banner de exemplo',
  els.bannerExemplo.classList.contains('show') === false, els.bannerExemplo.classList.contains('show'));
ok('BUG D: o orçamento salvo foi mesmo aberto', d.V.state.meta.nome === 'Salvo', d.V.state.meta.nome);
ok('BUG D: o estado do banner acompanhou', d.V.ehExemplo === false);

/* o mesmo pelo caminho de "+ Novo orçamento", que já funcionava — e continua */
d.V.ehExemplo = true; d.ctx.render();
ok('cenário: banner ligado de novo', els.bannerExemplo.classList.contains('show') === true);
d.ctx.novoOrcamento();
ok('novo orçamento também apaga o banner', els.bannerExemplo.classList.contains('show') === false);
ok('novo orçamento zera o estado do banner', d.V.ehExemplo === false);

/* a correção de fundo: quem manda no banner é o render(), não cada chamador.
   Qualquer caminho que troque o state e renderize fica correto de graça. */
d.V.ehExemplo = true; d.ctx.render();
ok('render liga o banner quando ehExemplo é true', els.bannerExemplo.classList.contains('show') === true);
d.V.ehExemplo = false; d.ctx.render();
ok('render desliga o banner quando ehExemplo é false', els.bannerExemplo.classList.contains('show') === false);
ok('o banner de exemplo não depende do banner de migração',
  els.bannerMigrado.classList.contains('show') === false, els.bannerMigrado.classList.contains('show'));

/* o exemplo não é um orçamento salvo: montá-lo não pode criar linha nenhuma */
ok('o exemplo não vira orçamento salvo', Object.keys(d.V.orcamentos).join(',') === 'orc1', Object.keys(d.V.orcamentos));

/* ============================================================
   4 · A marca no backup: continua no arquivo, mas vem da memória.
   ============================================================ */
const bk = criar({ cen_v3_seen: true, cen_v3_opcseed: true, cen_v3_mig3: true });
bk.V.onboardingVisto = true;
bk.V.orcamentos = { orc1: ORC };

let arquivo = null;
bk.ctx.Blob = function (p) { arquivo = p[0]; };
bk.ctx.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
bk.ctx.document.createElement = () => ({ download: '', href: '', click() {} });
bk.ctx.exportarBackup();
const pay = JSON.parse(arquivo);

ok('o arquivo continua trazendo as 7 chaves',
  Object.keys(bk.K.LS).map(k => bk.K.LS[k]).every(c => c in pay.dados), Object.keys(pay.dados));
ok('a marca de onboarding vai no arquivo', pay.dados.cen_v3_seen === true, pay.dados.cen_v3_seen);

/* e volta: importar um backup de quem nunca viu o onboarding devolve a marca */
bk.ctx.location = { reload: () => {} };
bk.ctx.aplicarBackup({ app: 'cenografia-pricing', dados: { cen_v3_budgets: {}, cen_v3_seen: false } });
ok('import restaura a marca vinda do arquivo', bk.V.onboardingVisto === false, bk.V.onboardingVisto);
ok('no modo local o import persiste a marca',
  bk.K.store.ler('cen_v3_seen', null) === false, bk.K.store.ler('cen_v3_seen', null));

/* ============================================================
   5 · A porta única de gravação da marca.
   ============================================================ */
const g = criar({ cen_v3_seen: true, cen_v3_opcseed: true, cen_v3_mig3: true });
g.K.dados.salvarOnboarding(false);
ok('salvarOnboarding(false) atualiza a memória', g.V.onboardingVisto === false);
ok('salvarOnboarding(false) persiste no modo local', g.K.store.ler('cen_v3_seen', null) === false);
g.K.dados.salvarOnboarding(true);
ok('salvarOnboarding(true) atualiza a memória', g.V.onboardingVisto === true);
ok('salvarOnboarding(true) persiste no modo local', g.K.store.ler('cen_v3_seen', null) === true);
ok('nada disso encostou em rede', g.K.dados.temPendencia() === false, g.K.dados.pendencias());

/* ============================================================
   6 · Banco sem a migração aplicada: degrada, não quebra.
   Enquanto o `alter table` do schema.sql não rodar, a coluna não existe. O app
   volta a usar a flag do navegador em vez de encher a tela de erro — e passa a
   valer por conta sozinho assim que a coluna aparecer.
   ============================================================ */
const semColuna = criar({ cen_v3_seen: true, cen_v3_opcseed: true, cen_v3_mig3: true });
ok('por padrão o app assume que a coluna existe', semColuna.V.onboardingNoBanco === true);
semColuna.V.onboardingNoBanco = false;
semColuna.K.dados.salvarOnboarding(true);
ok('sem a coluna, a marca cai na chave local', semColuna.K.store.ler('cen_v3_seen', null) === true);
ok('sem a coluna, nada fica pendente de rede', semColuna.K.dados.temPendencia() === false,
  semColuna.K.dados.pendencias());
ok('sem a coluna, a memória continua correta', semColuna.V.onboardingVisto === true);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
