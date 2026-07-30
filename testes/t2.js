/* Suíte 2 — backup, quota e fuso horário (v5.8).
   Cobre: hoje() local, store.gravar devolvendo true/false, export das 7 chaves,
   validação do arquivo de backup, resumo, e import substituindo tudo. */

/* O teste de data local só tem sentido num fuso onde local != UTC — num
   ambiente em UTC (o CI, por exemplo) o bug que ele cobre é invisível.
   O fuso é fixado aqui, antes de qualquer Date ser criada, para o resultado
   não depender da máquina que roda a suíte. */
process.env.TZ = 'America/Sao_Paulo';

const { ctx, K, store } = require('./harness')();
let fails = 0;
const ok = (n, c, x) => { console.log((c ? 'PASS  ' : 'FALHA ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); if (!c) fails++; };

ok('APP_VERSION é uma string', typeof K.APP_VERSION==='string', K.APP_VERSION);

// ---------- hoje() usa data LOCAL, nao UTC ----------
/* guarda: se o Node parar de respeitar process.env.TZ em runtime, o teste abaixo
   viraria um falso PASS silencioso. Melhor falhar aqui, alto e claro. */
ok('fuso do teste fixado em America/Sao_Paulo (UTC-3)',
  new Date('2026-07-27T23:30:00-03:00').getDate() === 27,
  { TZ: process.env.TZ, offsetMin: new Date().getTimezoneOffset() });

const d = new Date();
const esperado = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
ok('hoje() = data local', ctx.hoje() === esperado, { got: ctx.hoje(), esperado, utc: new Date().toISOString().slice(0, 10) });

// simula 23h no fuso do Brasil: UTC ja virou o dia, local nao
const RealDate = Date;
const fixa = new RealDate('2026-07-27T23:30:00-03:00');
global.__fake = fixa;
ctx.Date = class extends RealDate { constructor(...a) { return a.length ? new RealDate(...a) : new RealDate(fixa); } static now() { return fixa.getTime(); } };
const vmHoje = ctx.hoje();
ctx.Date = RealDate;
ok('23h30 BRT continua sendo 27/07 (UTC diria 28)', vmHoje === '2026-07-27', { local: vmHoje, utc: fixa.toISOString().slice(0, 10) });

// ---------- store.gravar devolve true/false ----------
ok('store.gravar devolve true quando grava', K.store.gravar('teste_ok', { a: 1 }) === true);
ok('valor gravado e legivel', K.store.ler('teste_ok', null).a === 1);

// quota estourada -> false, sem engolir
const setItemReal = ctx.localStorage.setItem;
ctx.localStorage.setItem = () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; };
console.log('\n-- erro esperado abaixo --');
const r = K.store.gravar('teste_quota', { b: 2 });
console.log('-- fim --\n');
ok('store.gravar devolve false quando a quota estoura', r === false, r);
ctx.localStorage.setItem = setItemReal;

// ---------- export ----------
store.clear();
K.store.gravar('cen_v3_budgets', { id1: { snapshot: { id: 'id1', nome: 'Stand Expo', total: 5000 } }, id2: { snapshot: { id: 'id2', nome: 'Portal ACME', total: 900 } } });
K.store.gravar('cen_v3_itens', [{ nome: 'Trainel', unidade: 'm²' }, { nome: 'Toten', unidade: 'peça' }]);
K.store.gravar('cen_v3_opcoes', { materiais: ['Madeira', 'MDF'], producao: ['Marceneiro'], impressao: [] });
K.store.gravar('cen_v3_config', { nome: 'KMF Cenografia', doc: '', tel: '', email: '', cidade: '' });
K.store.gravar('cen_v3_auto', { meta: { nome: 'rascunho' } });
K.store.gravar('cen_v3_seen', true);

let baixado = null;
ctx.Blob = function (partes) { baixado = partes[0]; };
ctx.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => { } };
let nomeArquivo = null;
const criarReal = ctx.document.createElement;
ctx.document.createElement = () => ({ set download(v) { nomeArquivo = v; }, get download() { return nomeArquivo; }, href: '', click() { } });
ctx.exportarBackup();
ctx.document.createElement = criarReal;

ok('nome do arquivo correto', nomeArquivo === `cenografia-backup-${esperado}.json`, nomeArquivo);
const pay = JSON.parse(baixado);
ok('payload identifica o app', pay.app === 'cenografia-pricing');
ok('payload traz appVersion', pay.appVersion === K.APP_VERSION, pay.appVersion);
ok('payload traz schemaVersion', pay.schemaVersion === K.SCHEMA_VERSION);
ok('payload traz data', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(pay.exportadoEm || ''), pay.exportadoEm);
const chaves = Object.keys(K.LS).map(k => K.LS[k]);
ok('exporta as 7 chaves', chaves.length === 7 && chaves.every(c => c in pay.dados), { chaves, tem: Object.keys(pay.dados) });
ok('conteudo dos orcamentos preservado', Object.keys(pay.dados.cen_v3_budgets).length === 2);

// ---------- resumo ----------
const res = ctx.resumoBackup(pay);
ok('resumo conta orcamentos', res.orc === 2, res);
ok('resumo conta itens prontos', res.itens === 2, res);
ok('resumo conta opcoes', res.opcoes === 3, res);
ok('resumo detecta rascunho', res.rascunho === true);
ok('resumo pega os nomes', res.nomes.includes('Stand Expo') && res.nomes.includes('Portal ACME'), res.nomes);

// ---------- validacao ----------
ok('backup valido passa', ctx.validarBackup(pay).ok === true);
ok('rejeita nao-objeto', ctx.validarBackup('abc').ok === false);
ok('rejeita null', ctx.validarBackup(null).ok === false);
ok('rejeita array', ctx.validarBackup([1, 2]).ok === false);
ok('rejeita outro app', ctx.validarBackup({ app: 'outra-coisa', dados: {} }).ok === false);
ok('rejeita sem bloco dados', ctx.validarBackup({ app: 'cenografia-pricing' }).ok === false);
ok('rejeita dados sem chave conhecida', ctx.validarBackup({ dados: { foo: 1 } }).ok === false);
ok('rejeita budgets corrompido', ctx.validarBackup({ dados: { cen_v3_budgets: [1, 2, 3] } }).ok === false);
ok('aceita backup parcial', ctx.validarBackup({ dados: { cen_v3_budgets: {} } }).ok === true);

// ---------- import substitui TUDO ----------
store.clear();
K.store.gravar('cen_v3_budgets', { antigo: { snapshot: { id: 'antigo', nome: 'Some' } } });
K.store.gravar('cen_v3_config', { nome: 'Empresa Velha' });
K.store.gravar('cen_v3_seen', true);
let recarregou = false;
ctx.location = { reload: () => { recarregou = true; } };
ctx.aplicarBackup(pay);
ok('orcamentos substituidos', Object.keys(K.store.ler('cen_v3_budgets', {})).join(',') === 'id1,id2', K.store.ler('cen_v3_budgets', {}));
ok('orcamento antigo sumiu', !K.store.ler('cen_v3_budgets', {}).antigo);
ok('config substituida', K.store.ler('cen_v3_config', {}).nome === 'KMF Cenografia');

// chave ausente no backup e REMOVIDA, nao mantida
store.clear();
K.store.gravar('cen_v3_budgets', { x: {} });
K.store.gravar('cen_v3_config', { nome: 'Deve Sumir' });
ctx.aplicarBackup({ app: 'cenografia-pricing', dados: { cen_v3_budgets: { novo: { snapshot: { nome: 'N' } } } } });
ok('chave ausente no backup e removida', ctx.localStorage.getItem('cen_v3_config') === null, ctx.localStorage.getItem('cen_v3_config'));
ok('chave presente foi aplicada', !!K.store.ler('cen_v3_budgets', {}).novo);

setTimeout(() => {
  ok('import dispara reload', recarregou === true);
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTodos os testes passaram.');
  process.exit(fails ? 1 : 0);
}, 900);
