/* Harness de teste do cenografia-pricing.
 *
 * Carrega o JavaScript real do index.html dentro de um DOM falso e devolve o
 * contexto para o teste manipular. Não há framework, não há dependência: só o
 * módulo `vm` que vem com o Node.
 *
 *   const criar = require('./harness');
 *   const { ctx, K, V, store } = criar(seedOpcional);
 *
 * - `seed`  objeto {chave: valor} gravado no localStorage ANTES do script rodar.
 *           É o que permite testar o boot (migração eager, onboarding etc).
 * - `ctx`   funções do app (declarações `function` viram propriedade do contexto).
 * - `K`     constantes de topo (APP_VERSION, SCHEMA_VERSION, LS, LS_INT…).
 * - `V`     getters/setters das variáveis `let` de topo (state, itensCustom…).
 * - `store` o Map por trás do localStorage falso, para inspeção direta.
 *
 * Nem `const` nem `let` de topo viram propriedade do contexto de um script `vm`
 * — só `function` e `var`. Por isso o epílogo no fim deste arquivo os exporta
 * explicitamente em `K` e `V`.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP = path.join(__dirname, '..', 'index.html');

/* elemento DOM permissivo: qualquer propriedade existe, qualquer método é no-op */
function fakeEl(tag) {
  const alvo = {
    tagName: tag, value: '', textContent: '', innerHTML: '',
    style: {}, dataset: {}, disabled: false, checked: false, files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
  };
  return new Proxy(alvo, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'closest' || k === 'querySelector') return () => fakeEl('div');
      if (k === 'querySelectorAll') return () => [];
      if (typeof k === 'symbol') return undefined;
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

/* ids usados como global implícita pelo app (p_nome.value, f_imposto.value…).
   Só nomes nesse formato viram elemento falso — o resto vira undefined, senão
   um erro de digitação no teste passa despercebido. */
const PARECE_ID = /^[a-z]{1,6}_[a-z0-9_]+$/i;

module.exports = function criar(seed) {
  const html = fs.readFileSync(APP, 'utf8');
  const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

  const store = new Map();
  if (seed) {
    for (const [k, v] of Object.entries(seed)) {
      store.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
  }

  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    clear: () => store.clear(),
    key: i => Array.from(store.keys())[i],
    get length() { return store.size; }
  };

  const document = {
    getElementById: () => fakeEl('div'),
    querySelector: () => fakeEl('div'),
    querySelectorAll: () => [],
    createElement: tag => fakeEl(tag),
    addEventListener: () => {}
  };

  const sandbox = {
    document, localStorage, console,
    window: { print: () => {}, addEventListener: () => {} },
    location: { reload: () => {} },
    alert: () => {}, confirm: () => true, prompt: () => null,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Blob: function () {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    FileReader: function () {},
    Date, Math, JSON, Number, String, Object, Array, Boolean,
    isFinite, isNaN, parseInt, parseFloat, RegExp, Set, Map, Error
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const ctx = vm.createContext(new Proxy(sandbox, {
    has: () => true,
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      if (PARECE_ID.test(k)) return fakeEl('input');
      return undefined;
    }
  }));

  const epilogo = `
;globalThis.__k = (function(){
  var o = {};
  try { o.APP_VERSION = APP_VERSION; } catch(e){}
  try { o.SCHEMA_VERSION = SCHEMA_VERSION; } catch(e){}
  try { o.migrations = migrations; } catch(e){}
  try { o.TRIB = TRIB; } catch(e){}
  try { o.LS = LS; } catch(e){}
  try { o.LS_INT = LS_INT; } catch(e){}
  try { o.UNID_IP = UNID_IP; } catch(e){}
  try { o.ITENS_PRONTOS = ITENS_PRONTOS; } catch(e){}
  try { o.OPC_BASE = OPC_BASE; } catch(e){}
  return o;
})();
globalThis.__v = {
  get state(){ return state; },               set state(v){ state = v; },
  get itensCustom(){ return itensCustom; },   set itensCustom(v){ itensCustom = v; },
  get opcoesCustom(){ return opcoesCustom; }, set opcoesCustom(v){ opcoesCustom = v; },
  get config(){ return config; },             set config(v){ config = v; },
  get ultimaConferencia(){ return ultimaConferencia; }
};
`;

  vm.runInContext(js + epilogo, ctx, { filename: 'index.html' });
  return { ctx, K: sandbox.__k, V: sandbox.__v, localStorage, store };
};
