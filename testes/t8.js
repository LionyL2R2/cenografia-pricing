/* Suíte 8 — o app não abre sem login (fase 2).
   Cobre: a marca do harness é a única porta de bypass; sem ela e sem Supabase o
   app fica fechado, não revela conteúdo nenhum, não roda o boot e não escreve no
   localStorage; e a tela de erro oferece tentar de novo. */
const criar = require('./harness');
let falhas = 0;
const ok = (nome, cond, extra) => {
  console.log((cond ? 'PASS  ' : 'FALHA ') + nome + (cond ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) falhas++;
};

/* Um orçamento salvo qualquer. Existe para provar que ter dado no localStorage
   não é o que faz o app abrir: sem login, este orçamento não vira tela. */
const SEED = {
  cen_v3_budgets: {
    a1: {
      schemaVersion: 3,
      meta: { nome: 'Sigiloso', data: '2026-05-10' },
      itensProntos: [], materiais: [], impressao: [], estrutura: [],
      maoObra: { producao: [], montagem: {} },
      logistica: { transporte: {}, locacoes: [] },
      financeiro: { impostoPct: '', margemPct: '' },
      snapshot: { id: 'a1', nome: 'Sigiloso', salvoEm: 5000, total: 200 }
    }
  },
  cen_v3_seen: true,
  cen_v3_config: { nome: 'KMF', razaoSocial: '', doc: '', tel: '', email: '', cidade: '' }
};

/* ============================================================
   1 · NAVEGADOR REAL sem Supabase — o caso que a correção existe para fechar.
   Nenhuma marca de teste, nenhum window.supabase, nenhum config.js.
   ============================================================ */
const real = criar(SEED, { semMarcaDeTeste: true });

ok('sem a marca do harness, MODO_TESTE é false', real.K.MODO_TESTE === false, real.K.MODO_TESTE);
ok('sem CDN nem config, db é null', real.K.db === null, real.K.db);
ok('o boot NÃO rodou init()', real.V.appBootado === false, real.V.appBootado);
ok('o gate ficou no estado de erro', real.V.gateEstado === 'erro', real.V.gateEstado);
ok('o body NÃO recebeu app-pronto (o .wrap continua display:none)',
  real.document.body.classList.contains('app-pronto') === false);
ok('não há sessão', real.V.sessaoAtual === null, real.V.sessaoAtual);

/* O app fechado não pode ter mexido em nada: sem boot não roda migração, não
   semeia catálogo, não marca onboarding. O localStorage tem que estar do jeito
   que o seed deixou — nem uma chave a mais. */
const chavesDepois = Array.from(real.store.keys()).sort();
ok('nenhuma chave nova no localStorage', chavesDepois.join(',') === Object.keys(SEED).sort().join(','), chavesDepois);
ok('o catálogo não foi semeado (migrarOpcoes não rodou)', real.store.has('cen_v3_opcseed') === false);
ok('a varredura eager não rodou (sem flag mig3)', real.store.has('cen_v3_mig3') === false);
ok('o orçamento do seed ficou intocado',
  real.store.get('cen_v3_budgets') === JSON.stringify(SEED.cen_v3_budgets));

/* Nada do conteúdo foi montado: o state segue o estado virgem de novoEstado(),
   sem o material que o init() empurra e sem o orçamento de exemplo. */
ok('state continua virgem — nenhum material montado', real.V.state.materiais.length === 0, real.V.state.materiais);
ok('state continua virgem — nenhum item pronto montado', real.V.state.itensProntos.length === 0, real.V.state.itensProntos);
ok('state continua virgem — nome do projeto vazio', real.V.state.meta.nome === '', real.V.state.meta.nome);
ok('nenhuma opção de dropdown carregada em memória',
  real.V.opcoesCustom.materiais.length === 0 && real.V.opcoesCustom.producao.length === 0 && real.V.opcoesCustom.impressao.length === 0,
  real.V.opcoesCustom);
ok('nenhum item de catálogo carregado em memória', real.V.itensCustom.length === 0, real.V.itensCustom);
/* Os dados da empresa eram lidos no TOPO do script, na avaliação do arquivo: sem
   login, sem dono, e mesmo assim já estavam na memória do navegador. Hoje quem lê
   é hidratarMemoria(), dentro de init(), que não roda sem sessão. */
ok('dados da empresa NÃO entram na memória sem sessão',
  real.V.config.nome === '' && real.V.config.email === '', real.V.config);

/* O login não funciona sem cliente: clicar no botão não pode explodir nem abrir
   o app por outro caminho. */
real.ctx.entrarComGoogle();
ok('entrarComGoogle() sem db não abre o app', real.V.appBootado === false && real.V.gateEstado === 'erro',
  { bootado: real.V.appBootado, gate: real.V.gateEstado });
real.ctx.sairDaConta();
ok('sairDaConta() sem db não quebra', true);

/* A saída oferecida é recarregar, não entrar assim mesmo. */
let recarregou = false;
real.ctx.location = { reload: () => { recarregou = true; } };
real.ctx.tentarDeNovo();
ok('"Tentar de novo" recarrega a página', recarregou === true);

/* ============================================================
   2 · O bypass é a MARCA, não a ausência de config.
   ============================================================ */
const teste = criar(SEED);

ok('com a marca do harness, MODO_TESTE é true', teste.K.MODO_TESTE === true, teste.K.MODO_TESTE);
ok('no harness o app sobe', teste.V.appBootado === true, teste.V.appBootado);
ok('no harness o gate fica no estado de app', teste.V.gateEstado === 'app', teste.V.gateEstado);
ok('no harness o body recebe app-pronto', teste.document.body.classList.contains('app-pronto') === true);
ok('no harness o init() rodou de verdade — catálogo semeado', teste.store.has('cen_v3_opcseed') === true);
ok('no harness o init() rodou de verdade — opções em memória', teste.V.opcoesCustom.materiais.length > 0,
  teste.V.opcoesCustom.materiais);

/* As duas execuções leem o MESMO index.html e recebem o MESMO seed. A única
   diferença entre app aberto e app fechado é a marca — que nenhum navegador tem. */
ok('mesma página, mesmo seed: só a marca separa aberto de fechado',
  teste.V.appBootado !== real.V.appBootado && teste.K.MODO_TESTE !== real.K.MODO_TESTE);

/* ============================================================
   3 · O bypass não é alcançável por acidente.
   ============================================================ */
const marcaErrada = criar(SEED, { semMarcaDeTeste: true });
marcaErrada.ctx.__CEN_HARNESS_DE_TESTE__ = true;   // tarde demais: MODO_TESTE já foi resolvido no boot
ok('definir a marca depois do boot não abre o app retroativamente',
  marcaErrada.V.appBootado === false && marcaErrada.V.gateEstado === 'erro',
  { bootado: marcaErrada.V.appBootado, gate: marcaErrada.V.gateEstado });

/* ============================================================
   4 · CHAVE POR USUÁRIO — dois logins no mesmo navegador não se cruzam.
   O RLS não alcança o localStorage: sem prefixo, o usuário B abre a tela Início
   e vê os orçamentos do usuário A. É o único furo de confidencialidade que o
   login sozinho não fecha.
   ============================================================ */
const ns = criar({ cen_v3_seen: true, cen_v3_opcseed: true, cen_v3_mig3: true });

ok('sem usuário, a chave não ganha prefixo (é o caso do harness)',
  ns.K.store.chave('cen_v3_budgets') === 'cen_v3_budgets', ns.K.store.chave('cen_v3_budgets'));
ns.K.store.usuario('u-aaa');
ok('com usuário, a chave ganha o uid',
  ns.K.store.chave('cen_v3_budgets') === 'cen_v3_u-aaa_budgets', ns.K.store.chave('cen_v3_budgets'));
ok('chave fora do padrão cen_v3_ não é prefixada',
  ns.K.store.chave('outra_coisa') === 'outra_coisa', ns.K.store.chave('outra_coisa'));
ok('store sabe dizer de quem são as chaves', ns.K.store.donoAtual() === 'u-aaa', ns.K.store.donoAtual());

/* O isolamento de verdade: grava com um uid, lê com outro. */
ns.store.clear();
ns.K.store.usuario('');
ns.K.store.gravar('cen_v3_budgets', { orfao: 'de ninguém' });   // dado sem dono, como o que já existe hoje
ns.K.store.usuario('u-aaa');
ok('usuário logado NÃO enxerga a chave sem prefixo (nada é adotado)',
  ns.K.store.ler('cen_v3_budgets', null) === null, ns.K.store.ler('cen_v3_budgets', null));

ns.K.store.gravar('cen_v3_budgets', { de: 'aaa' });
ns.K.store.usuario('u-bbb');
ok('usuário B não enxerga o orçamento de A',
  ns.K.store.ler('cen_v3_budgets', null) === null, ns.K.store.ler('cen_v3_budgets', null));
ns.K.store.gravar('cen_v3_budgets', { de: 'bbb' });
ns.K.store.usuario('u-aaa');
ok('A continua vendo o próprio orçamento, intacto',
  ns.K.store.ler('cen_v3_budgets', {}).de === 'aaa', ns.K.store.ler('cen_v3_budgets', {}));

const fisicas = Array.from(ns.store.keys()).sort();
ok('as três formas coexistem fisicamente, sem se sobrescrever',
  fisicas.join(',') === 'cen_v3_budgets,cen_v3_u-aaa_budgets,cen_v3_u-bbb_budgets', fisicas);
ok('a chave órfã continua órfã — nenhuma migração de adoção aconteceu',
  ns.store.get('cen_v3_budgets') === JSON.stringify({ orfao: 'de ninguém' }), ns.store.get('cen_v3_budgets'));

/* Os acessos crus (rollback, export) não passam pelo store, mas a CHAVE passa:
   é o que garante que o rollback restaure o namespace certo. */
ok('store.chave traduz também as chaves de controle interno',
  ns.K.store.chave(ns.K.LS_INT.preMig3) === 'cen_v3_u-aaa_backup_pre_mig3', ns.K.store.chave(ns.K.LS_INT.preMig3));

/* ============================================================
   5 · O ARQUIVO de backup continua sem prefixo.
   O backup é do usuário, não do uid dele: um arquivo exportado tem que poder ser
   lido de volta. A tradução acontece nas duas fronteiras, nunca no arquivo.
   ============================================================ */
const bkp = criar({ cen_v3_seen: true, cen_v3_opcseed: true, cen_v3_mig3: true });
bkp.K.store.usuario('u-ccc');
/* as coleções vêm da memória — é ela a fonte de verdade nos dois modos */
bkp.V.orcamentos = { p1: { snapshot: { id: 'p1', nome: 'Stand', total: 100 } } };
bkp.V.config = bkp.ctx.normConfig({ nome: 'KMF' });

let arquivo = null;
bkp.ctx.Blob = function (partes) { arquivo = partes[0]; };
bkp.ctx.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
bkp.ctx.document.createElement = () => ({ download: '', href: '', click() {} });
bkp.ctx.exportarBackup();
const pay = JSON.parse(arquivo);

ok('o arquivo grava a chave sem prefixo', 'cen_v3_budgets' in pay.dados, Object.keys(pay.dados));
ok('nenhuma chave do arquivo carrega o uid',
  Object.keys(pay.dados).every(k => k.indexOf('u-ccc') < 0), Object.keys(pay.dados));
ok('o conteúdo exportado é o do usuário logado',
  !!(pay.dados['cen_v3_budgets'] && pay.dados['cen_v3_budgets'].p1), pay.dados['cen_v3_budgets']);

/* e a volta: um arquivo sem prefixo entra no namespace de quem está logado */
bkp.ctx.location = { reload: () => {} };
bkp.ctx.aplicarBackup({ dados: { cen_v3_budgets: { p2: { snapshot: { id: 'p2', nome: 'Toten' } } } } });
ok('o import grava no namespace do usuário, não na chave crua',
  !!bkp.store.get('cen_v3_u-ccc_budgets') && bkp.store.get('cen_v3_u-ccc_budgets').indexOf('p2') >= 0,
  bkp.store.get('cen_v3_u-ccc_budgets'));
ok('o import não escreveu na chave sem prefixo',
  bkp.store.has('cen_v3_budgets') === false, Array.from(bkp.store.keys()));

/* ============================================================
   6 · A tag do supabase-js continua compatível com o recorte do harness.
   É o risco 6.1 do PLANO-FASE-2: um type="module" ou um script externo depois do
   inline derrubaria todas as outras suítes de uma vez, e o sintoma seria confuso.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const abre = '<' + 'script>';
const fecha = '<' + '/script>';
const recorte = html.slice(html.indexOf(abre) + abre.length, html.lastIndexOf(fecha));

ok('há exatamente uma tag de abertura sem atributos', (html.split(abre).length - 1) === 1);
ok('nenhum script é type="module"', /<script[^>]*type\s*=\s*["']module["']/.test(html) === false);
ok('todo script externo vem antes do inline',
  html.lastIndexOf('<script src') < html.indexOf(abre));
ok('o recorte do harness não contém tag de script', /<\/?script/.test(recorte) === false);
ok('o recorte começa no JS do app', recorte.trimStart().startsWith('/*'), recorte.slice(0, 40));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
