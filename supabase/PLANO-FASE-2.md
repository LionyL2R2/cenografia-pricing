# Plano da fase 2 — ligar o app no Supabase

Levantamento sobre o `index.html` da **v5.11** (2746 linhas, commit `7f51858`).
Documento de planejamento: **nenhuma linha de código foi escrita nesta etapa.**

A fase 1 entregou schema, RLS e auth. Esta fase liga o app. A restrição que manda em
tudo: **continua single-file, sem build step, sem `package.json`** — o Supabase entra
por CDN e a suíte de 344 asserções tem que passar em cada commit do caminho.

---

## 1 · Inventário de `lsGet` / `lsSet`

`lsGet` (`:914`) e `lsSet` (`:918`) são as duas únicas portas de entrada do
`localStorage` — fora cinco acessos diretos, listados no fim. Toda a fase 2 passa por
elas.

### 1.1 Leituras (`lsGet`) — 21 pontos

| Linha | Chave | O que lê | Dentro de |
|---|---|---|---|
| 857 | `cen_v3_config` | dados da empresa → variável global `config` | inicialização de topo |
| 862 | `cen_v3_opcoes` | listas de dropdown → `opcoesCustom` | inicialização de topo |
| 869 | `cen_v3_itens` | catálogo → `itensCustom` | inicialização de topo |
| 875 | `cen_v3_opcseed` | flag: as listas-base já foram semeadas? | `migrarOpcoes()` |
| 1129 | `cen_v3_mig3` | flag: varredura eager já rodou? | `migrarTudoParaSchema3()` |
| 1144 | `cen_v3_budgets` | todos os orçamentos, para migrar em lote | `migrarTudoParaSchema3()` |
| 1155 | `cen_v3_auto` | rascunho, para migrar | `migrarTudoParaSchema3()` |
| 1704 | `cen_v3_budgets` | todos, para detectar nome repetido | `nomeColide()` |
| 1714 | `cen_v3_budgets` | todos, para gravar um por cima | `persistirProjeto()` |
| 1719 | `cen_v3_budgets` | todos, para saber se o projeto já existe | `salvarOrcamento()` |
| 1736 | `cen_v3_budgets` | todos, para abrir um pelo id | `carregarOrcamento()` |
| 1743 | `cen_v3_budgets` | todos, para montar o `<select>` "Abrir…" | `montarLoadSel()` |
| 1831 | `cen_v3_budgets` | todos, para montar a grade da tela Início | `montarInicio()` |
| 1885 | `cen_v3_budgets` | todos, para achar o original a duplicar | `duplicarProjeto()` |
| 1893 | `cen_v3_budgets` | todos, de novo, dentro do callback do modal | `duplicarProjeto()` |
| 1900 | `cen_v3_budgets` | todos, para apagar um | `excluirProjeto()` |
| 1981 | `cen_v3_budgets` | todos, só para **contar** e exibir no card | `admCardBackup()` |
| 2211 | `cen_v3_budgets` | todos, para recalcular e comparar | `conferirIntegridade()` |
| 2716 | `cen_v3_budgets` | todos, para migrar chave-nome → chave-id | `migrarBudgets()` |
| 2738 | `cen_v3_seen` | flag: onboarding já foi visto? | `init()` |
| 2739 | `cen_v3_auto` | rascunho, para restaurar a sessão | `init()` |

> **13 dos 21 leem `cen_v3_budgets` inteiro.** É a chave quente, e a única coleção que
> o app **não** mantém em memória — `config`, `opcoesCustom`, `itensCustom` e `state`
> são lidos uma vez e viram variável global. Esse desequilíbrio é o que define a
> estratégia de cache da seção 4.

### 1.2 Escritas (`lsSet`) — 20 pontos

| Linha | Chave | O que grava | Dentro de |
|---|---|---|---|
| 881 | `cen_v3_opcoes` · `cen_v3_itens` · `cen_v3_opcseed` | listas semeadas + flag (3 escritas) | `migrarOpcoes()` |
| 1137 | `cen_v3_backup_pre_mig3` | cópia byte-exata antes da varredura | `migrarTudoParaSchema3()` |
| 1153 | `cen_v3_budgets` | todos migrados para o schema 3 | `migrarTudoParaSchema3()` |
| 1157 | `cen_v3_auto` | rascunho migrado | `migrarTudoParaSchema3()` |
| 1160 | `cen_v3_mig3` | flag da varredura | `migrarTudoParaSchema3()` |
| 1675 | `cen_v3_auto` | **o `state` inteiro**, debounce de 350 ms | `autosave()` |
| 1694 | `cen_v3_opcoes` · `cen_v3_itens` | opções novas digitadas em "Outros" | `coletarOpcoes()` |
| 1714 | `cen_v3_budgets` | o mapa inteiro, com um projeto atualizado | `persistirProjeto()` |
| 1764 | `cen_v3_config` | dados da empresa | `salvarConfig()` |
| 1893 | `cen_v3_budgets` | o mapa inteiro, com a cópia | `duplicarProjeto()` |
| 1900 | `cen_v3_budgets` | o mapa inteiro, sem o excluído | `excluirProjeto()` |
| 1998 | `cen_v3_opcoes` · `cen_v3_itens` | listas editadas no painel admin | `admAplicar()` |
| 2175 | **todas as 7** | conteúdo do arquivo de backup (loop) | `aplicarBackup()` |
| 2179 | `cen_v3_mig3` | marca que o import já veio migrado | `aplicarBackup()` |
| 2726 | `cen_v3_budgets` | mapa reindexado por id | `migrarBudgets()` |
| 2740 | `cen_v3_seen` | marca o onboarding como visto | `init()` |

> **Toda escrita em `cen_v3_budgets` reescreve o mapa inteiro.** Salvar um orçamento
> regrava todos. Isso é irrelevante no `localStorage` e é **inaceitável** contra o
> banco: vira N `UPDATE`s por clique. A fase 2 precisa quebrar isso em escrita por
> linha, e é a mudança semântica mais profunda de todo o plano.

### 1.3 Acessos diretos ao `localStorage` — 5 pontos

Não passam por `lsGet`/`lsSet` e por isso escapam de qualquer troca de camada feita só
nelas. Todos existem por um motivo específico:

| Linha | O quê | Por que é direto |
|---|---|---|
| 1134-1135 | `getItem` de `budgets` e `auto` | precisa da **string crua**, byte a byte, para o rollback |
| 1172-1173 | `setItem`/`removeItem` no rollback | restaura a string original sem passar por `JSON.parse` |
| 2054 | `getItem` no export de backup | idem: exporta o que está gravado, não o que foi reinterpretado |
| 2174 | `removeItem` no import | chave ausente no arquivo tem que **sumir**, não virar `null` |
| 2180 | `removeItem` do backup pré-migração | limpeza |

---

## 2 · Árvore de propagação do `async`

Hoje **tudo é síncrono**. `lsGet` devolve valor; `lsSet` devolve `true`/`false`. A
pergunta que importa não é "o que vira `async`", é **"onde o `async` pode parar"**.

### 2.1 A fronteira natural

O app já separa cálculo de armazenamento melhor do que parece:

- `resultado()`, `custoTotal()`, `sub*()`, `tItem()`… são **puras** sobre `state`;
- `render()` lê `state`, `opcoesCustom`, `itensCustom`, `config` — **tudo em memória**;
- `imprimir()`, `imprimirProposta()`, `exportCSV()` idem;
- nenhuma dessas funções chama `lsGet`.

**Consequência: nada do cálculo, do render ou dos relatórios precisa virar `async`.**
Se as coleções estiverem em memória antes do primeiro `render()`, a camada de UI segue
100% síncrona — e as 344 asserções da suíte continuam válidas sem reescrita.

O único obstáculo é `cen_v3_budgets`, lido sob demanda em 13 lugares. **Cacheá-lo em
memória elimina a propagação de `async` de quase toda a árvore.**

### 2.2 Árvore de quem chama quem (leituras de `budgets`)

```
nomeColide (:1704)
├── validarNomeModal ...................... oninput do campo, A CADA TECLA  ⚠
│   ├── pedirNome
│   └── confirmarNomeModal
└── proximoNomeLivre ── duplicarProjeto ... onclick

persistirProjeto (:1714)
├── salvarOrcamento ....................... onclick "Salvar orçamento"
└── callback do modal de nome

salvarOrcamento (:1719) .................... onclick
carregarOrcamento (:1736)
├── onchange do <select> "Abrir…"
└── abrirProjeto ── onclick do card

montarLoadSel (:1743)
├── init
├── persistirProjeto
├── duplicarProjeto (callback)
└── excluirProjeto (callback)

montarInicio (:1831)
├── irPara('inicio') ...................... clique na aba
├── duplicarProjeto (callback)
└── excluirProjeto (callback)

duplicarProjeto (:1885, :1893) ............. onclick
excluirProjeto (:1900) ..................... onclick
admCardBackup (:1981) ── montarConfig ── irPara('config') / admAplicar
conferirIntegridade (:2211) ................ onclick
migrarBudgets (:2716) ── init
```

### 2.3 Onde o `async` doeria de verdade

| Ponto | Por que é problema |
|---|---|
| **`validarNomeModal` (:1780)** | roda no `oninput`, **a cada tecla**. Com `await`, teclas rápidas geram respostas fora de ordem e o erro "nome já existe" pisca errado. É o pior lugar da árvore para colocar rede. |
| **`render()` (:1305)** | chamado de ~20 lugares, sempre síncrono, inclusive dentro de `admAplicar` e `coletarOpcoes`. Se virar `async`, contamina tudo. |
| **`init()` (:2730)** | IIFE síncrona. Vira `async` — é o **único** lugar onde isso é natural e desejável. |
| **`novoOrcamento` (:1747)** | usa `confirm()` nativo, bloqueante. Já é bug **J** conhecido; misturar com `await` piora. |
| **`autosave()` (:1675)** | debounce de 350 ms. Contra o banco viraria uma escrita a cada 350 ms de digitação. Precisa de **dois** debounces: local 350 ms, rede 2–3 s. |
| **callbacks de modal** | `pedirNome(…, onOk)` e `confirmar(…, onOk)` recebem callback síncrono. Se `onOk` virar `async`, ninguém espera a promise e o erro some. |

### 2.4 Decisão

> **O `async` para em duas funções: `init()` e uma camada `db.*` nova.**
> Todo o resto — render, cálculo, relatórios, validação de modal — continua síncrono,
> lendo memória. Escrita é *fire-and-forget* numa fila, com aviso visual quando falha,
> exatamente como `lsSet` já faz hoje com `avisoSalvar()` (`:920`).

---

## 3 · Mapeamento localStorage → Supabase

### 3.1 `cen_v3_config` → `perfis`

| Campo do app | Coluna | Situação |
|---|---|---|
| `nome` | `nome_empresa` | ✅ |
| `razaoSocial` | `razao_social` | ✅ |
| `doc` | `doc` | ✅ |
| `tel` | `telefone` | ✅ |
| `email` | `email` | ✅ |
| `cidade` | `cidade` | ✅ |

Único mapeamento **completo**. Uma linha por usuário, criada pelo trigger.

### 3.2 `cen_v3_itens` → `itens_catalogo`

| Campo | Coluna | Situação |
|---|---|---|
| `nome` | `nome` | ✅ |
| `unidade` | `unidade` | ✅ |
| `preco` | `preco` | ⚠️ **`''` no app, `null` no banco.** `semPreco()` (`:1366`) testa `''`/`null`, mas `normItem()` (`:865`) grava `''`. Precisa de conversão explícita nos dois sentidos, ou "sem preço" vira `0` e o app passa a vender de graça. |
| *(ordem do array)* | — | ❌ **sem coluna `ordem`.** O painel admin lista na ordem do array; o banco devolve sem ordem garantida. A lista vai reembaralhar a cada login. |

### 3.3 `cen_v3_opcoes` → `opcoes`

| Campo | Coluna | Situação |
|---|---|---|
| chave do objeto (`materiais`/`producao`/`impressao`) | `setor` | ✅ |
| cada string do array | `valor` | ✅ |
| *(ordem do array)* | — | ❌ **sem coluna `ordem`**, mesmo problema do catálogo |

Estrutura muda de **3 arrays** para **N linhas**. `opcoesDe(sec)` (`:870`) e
`admAplicar` (`:1998`) precisam montar/desmontar essa forma.

### 3.4 `cen_v3_budgets[id]` → `orcamentos`

O registro tem duas partes: o `state` do orçamento e o `snapshot` de listagem.

| Campo | Coluna | Situação |
|---|---|---|
| chave do mapa (`id`) | `id` | ✅ vira o uuid da linha |
| `snapshot.nome` | `nome` | ⚠️ **conflito de nomes**, ver abaixo |
| `meta.num` | `numero` | ✅ |
| `meta.data` | `data` | ✅ |
| `meta.validadeDias` | `validade_dias` | ✅ |
| `meta.obs` | `observacoes` | ✅ |
| `meta.cliente` (texto livre) | `cliente_nome` | ✅ |
| — | `cliente_id` | ⚠️ **sem origem.** O app não tem cadastro de cliente; `meta.cliente` é texto solto. A coluna e a FK existem, mas nada as preenche. |
| `schemaVersion` | `schema_version` | ✅ |
| `snapshot.total` | `snapshot_total` | ✅ |
| `snapshot.salvoEm` (epoch ms) | `updated_at` | ⚠️ tipo diferente (`number` → `timestamptz`). Toda ordenação por `salvoEm` (`:1744`, `:1843`) muda de fonte. |
| **o `state` inteiro** | `dados` (jsonb) | ✅ |
| `_projId` | *(é o `id` da linha)* | ✅ deixa de existir como campo |
| `meta.nome` | — | ❌ **sem coluna própria** — colide com `snapshot.nome` |
| `meta.responsavel` | — | ❌ **sem coluna.** Fica só dentro de `dados`. Não dá para listar nem filtrar por responsável. |
| `meta.tipoItem` / `snapshot.tipoItem` | — | ❌ **sem coluna, e é exibido na tela Início** (`:1828`, `:1865`). Ou vira coluna, ou toda listagem passa a abrir o jsonb. |
| `snapshot.appVersion` | — | ❌ **sem coluna.** Perde-se a rastreabilidade de qual versão gravou. |
| `migrado` (flag de banner) | — | dentro de `dados`, ok |
| `_legacy` | — | dentro de `dados`, ok |

> **O conflito de nomes é o achado mais importante desta seção.** O app tem **dois**
> nomes diferentes: `meta.nome` ("Nome do projeto", campo do formulário) e
> `snapshot.nome` (nome do orçamento, escolhido no modal de salvar, com validação de
> unicidade em `nomeColide`). `nomeDe()` (`:1700`) prefere o `snapshot`. Eles podem
> divergir: `salvarOrcamento` grava um `snapshot.nome` sem tocar em `meta.nome`.
> A tabela tem **uma** coluna `nome`. Decidir: adicionar `nome_projeto`, ou aceitar que
> os dois passam a ser o mesmo campo — o que muda comportamento visível.

### 3.5 Sem equivalente nenhum no schema

| Chave | O que é | Encaminhamento proposto |
|---|---|---|
| **`cen_v3_auto`** | **o rascunho** — `state` inteiro, salvo a cada 350 ms | ❌ **não tem tabela.** É a maior lacuna. Ver 3.6. |
| `cen_v3_seen` | onboarding já visto | vira coluna `onboarding_visto boolean` em `perfis` |
| `cen_v3_opcseed` | listas-base já semeadas | **fica obsoleta** — o trigger semeia no servidor |
| `cen_v3_mig3` | varredura eager já rodou | continua local; só existe por causa de dado legado |
| `cen_v3_backup_pre_mig3` | backup pré-varredura | continua local |

### 3.6 O rascunho: a decisão que falta

`autosave()` grava o `state` inteiro a cada 350 ms para o trabalho não se perder num
F5. Não é um orçamento salvo — não tem nome, não aparece em lista, não tem unicidade.

Três caminhos, e **a recomendação é o terceiro**:

1. **Linha em `orcamentos` com flag `rascunho`** — polui a listagem, exige filtro em
   toda query, e o `NOT NULL` de `nome` não se aplica a rascunho.
2. **Tabela `rascunhos` própria** (uma linha por usuário) — limpo, mas exige migração
   de schema na fase 2 e mais uma rota de escrita quente.
3. **Continuar só no `localStorage`, namespaced por usuário.** ✅ O rascunho é, por
   natureza, estado de *uma sessão neste navegador*. Sincronizá-lo a cada 350 ms é
   caro e, com dois dispositivos abertos, ativamente nocivo — um sobrescreveria o
   outro no meio da digitação. Custo aceito e explícito: **rascunho não trafega entre
   dispositivos**; o que trafega é o que foi salvo.

---

## 4 · Estratégia de cache

> **Cache-first com espelho local e fila de escrita.**
> O Supabase é a fonte de verdade. O `localStorage` vira **espelho** do que veio do
> servidor. A memória é o que a UI lê. Nenhuma leitura de UI espera rede.

### 4.1 Leitura

1. **Boot (0 ms).** Hidrata `config`, `opcoesCustom`, `itensCustom` e o novo
   `budgetsCache` a partir do espelho no `localStorage` — síncrono, como hoje.
   `render()` roda e a tela aparece completa, **inclusive offline**.
2. **Boot (+rede).** `init()` (agora `async`) busca as 4 coleções no Supabase. Se algo
   mudou, atualiza memória → espelho → `render()`. O usuário vê a tela pronta e, se
   houver diferença, ela se atualiza sozinha.
3. **Depois disso, nenhuma leitura vai à rede.** Todas as 13 chamadas de
   `lsGet(LS.budgets)` viram leitura de `budgetsCache`, síncrona.

### 4.2 Escrita

Toda mutação segue **três passos síncronos e um assíncrono**:

```
memória  →  espelho localStorage  →  fila  ⇢  Supabase
```

- os três primeiros são síncronos: a UI responde na hora e o dado sobrevive a um F5
  mesmo sem rede;
- a fila é uma lista de operações (`{tabela, op, id, payload, tentativas}`) **gravada
  no próprio `localStorage`**, para sobreviver a fechar o navegador;
- um worker drena a fila: sucesso → remove; falha de rede → backoff e tenta de novo;
  falha de RLS/validação → para, marca o item e **mostra aviso**, reusando o padrão de
  `avisoSalvar()` (`:920`), que já existe e já é testado.

**Escrita por linha, não por mapa.** `persistirProjeto` deixa de reescrever
`cen_v3_budgets` inteiro e passa a enfileirar um `upsert` de **uma** linha. É a
mudança que evita N `UPDATE`s por clique.

**Dois debounces.** `autosave()` mantém 350 ms para o espelho local; a sincronização de
orçamento salvo usa 2–3 s. Digitação contínua não vira tráfego.

### 4.3 Namespace por usuário — obrigatório

Hoje as chaves são globais (`cen_v3_budgets`). Com login, **dois usuários no mesmo
navegador compartilhariam o espelho** — um veria os orçamentos do outro na tela Início,
sem nenhuma proteção, porque o RLS não alcança o `localStorage`.

Todas as chaves passam a ser `cen_v3_<user_id>_<coleção>`, e o logout limpa as do
usuário que saiu. **É requisito de segurança, não de organização.**

### 4.4 Conflito entre dispositivos

Último a escrever ganha, por `updated_at`. Antes de aplicar um `upsert` enfileirado, o
worker compara o `updated_at` do servidor com o que o espelho tinha ao enfileirar; se o
servidor for mais novo, **não sobrescreve em silêncio** — mostra aviso oferecendo
recarregar. Não é merge, e não precisa ser: é um usuário só, com dois dispositivos, e a
perda silenciosa é o que não pode acontecer.

---

## 5 · Ordem de execução

Onze etapas. Cada uma é um commit, com a suíte passando. As etapas **1 a 3 não
encostam no Supabase** — são preparação pura e reduzem o tamanho do salto.

| # | Etapa | O que muda | Como testar |
|---|---|---|---|
| **1** | **Camada `store`** | `lsGet`/`lsSet` viram detalhe interno de um objeto `store` com API própria. Comportamento idêntico. | Suíte inteira verde sem alteração. Nova `t8`: `store` lê e grava o que `lsGet`/`lsSet` liam. |
| **2** | **`budgetsCache` em memória** | as 13 leituras de `cen_v3_budgets` passam a ler o cache; escrita atualiza cache **e** espelho | `t8`: cache coerente após salvar, duplicar, excluir, importar. **Esta é a etapa que destrava a fase 2** — depois dela quase nada precisa de `async`. |
| **3** | **Chaves namespaced** | `cen_v3_<uid>_*`, com `uid = 'local'` enquanto não há login | `t8`: com `uid` diferente, os dados não se cruzam |
| **4** | **SDK por CDN + `config.js`** | dois `<script>` **antes** do inline (ver risco 6.1). Cria `db` (cliente ou `null`) | Suíte verde: sem `window.supabase`, `db` é `null` e o app roda 100% local |
| **5** | **Tela de login** | gate de tela cheia, botão Google, `signOut`. Com `db === null`, entra direto em modo local | Suíte verde (harness cai no modo local). Manual: login, logout, sessão expirada |
| **6** | **Leitura remota de `perfis`** | menor coleção, um registro. Hidrata `config` do servidor | Manual: dois navegadores, mesmo usuário |
| **7** | **Leitura remota de `opcoes` + `itens_catalogo`** | resolve `''` ↔ `null` e a ordem (§3.2/3.3) | `t8` sobre as funções puras de conversão |
| **8** | **Escrita com fila** | fila persistida + worker + aviso de falha | `t8`: fila enfileira, drena, faz backoff, sobrevive a reload |
| **9** | **`orcamentos`: leitura e escrita** | a etapa grande. Escrita por linha. Resolve os gaps do §3.4 | `t8` + **`t3`/`t4`/`t5` continuam sendo a rede de segurança**: nenhum total pode mudar |
| **10** | **Rascunho e onboarding** | `auto` fica local (§3.6); `seen` vai para `perfis` | Manual: F5 no meio da digitação, offline |
| **11** | **Backup/import** | export continua o mesmo arquivo; import passa a empurrar para o servidor | `t2` continua verde; manual: importar com 2 dispositivos |

Ordem defensável: **do menor risco para o maior**. As três primeiras são refatoração
mecânica com a suíte inteira como rede. A 9 é a única realmente perigosa, e chega
depois de todo o resto estar provado.

---

## 6 · Riscos

### 6.1 O harness quebra fácil — risco mais alto do plano

`testes/harness.js:53` extrai o JS assim:

```js
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
```

Três formas de quebrar as 344 asserções de uma vez:

- **`<script type="module">`** → `indexOf('<script>')` não acha mais nada. **Proibido.**
  Usar o build UMD do `supabase-js`, com `<script src=…>` clássico.
- **script externo depois do inline** → `lastIndexOf('</script>')` pega o fechamento
  errado e o corte sai truncado. **Todo `<script src>` vai antes do inline.**
- **`import`/`await` no topo do script** → o `vm` do harness não executa módulo.

Mitigação: as etapas 1–3 não tocam em tag nenhuma; a etapa 4 muda as tags e roda a
suíte antes de qualquer outra coisa.

### 6.2 O que a suíte cobre e o que não cobre

**Cobre** (e continua sendo a rede de segurança): migrações de schema, totais antes e
depois, auto-contenção de linha, conferência de integridade, backup/import, quota,
fuso, PDF e proposta. Nada disso deveria mudar na fase 2 — se mudar, é bug.

**Não cobre nada disto** — todo item abaixo é **teste manual obrigatório**:

| Área | Por quê |
|---|---|
| rede, latência, timeout | harness não tem `fetch` |
| auth, sessão, token expirado | não há `window.supabase` |
| RLS de verdade | é `supabase/testes-rls.sql`, roda no SQL Editor |
| offline / reconexão | sem `navigator.onLine` |
| conflito entre dispositivos | exige dois navegadores |
| fila persistida entre reloads | harness não recarrega página |
| dois usuários no mesmo navegador | o furo do §4.3 |
| `@media print` | já era manual desde a v5.11 |

### 6.3 O que quebra se não for tratado

| Risco | Onde | Consequência |
|---|---|---|
| **`''` vs `null` no preço** | §3.2 | item "sem preço" vira R$ 0,00 na proposta do cliente. **Pior defeito possível.** `t4` cobre o comportamento local e vai pegar isso — se a conversão passar por lá. |
| **Ordem das listas** | §3.2/3.3 | dropdowns reembaralham a cada login. Cosmético, mas irrita todo dia. |
| **Dois nomes, uma coluna** | §3.4 | orçamento salvo pode aparecer com o nome errado na lista |
| **`tipoItem` sem coluna** | §3.4 | tela Início perde informação, ou passa a abrir jsonb para listar |
| **Escrita do mapa inteiro** | §1.2 | N `UPDATE`s por clique se a etapa 9 não quebrar em escrita por linha |
| **`validarNomeModal` async** | §2.3 | validação pisca errado ao digitar rápido |
| **Espelho compartilhado** | §4.3 | **um usuário vê dados do outro**. É o único risco de segurança da lista. |
| **`autosave` contra a rede** | §2.3 | escrita a cada 350 ms de digitação |
| **Migração eager sem dado legado** | `:1128` | não há dado legado no Supabase; a varredura só faz sentido sobre o espelho local. Manter, mas com escopo claro. |

### 6.4 O que **não** muda

Cálculo, gross-up, PDF interno, proposta, CSV, conferência de integridade e todas as
migrações de schema. São puros sobre `state` e não encostam em storage. Se algum deles
mudar de comportamento na fase 2, é regressão — e a suíte pega.

---

## 7 · Login e o que acontece antes dele

### 7.1 Antes de logar

**Gate de tela cheia.** O `.wrap` inteiro fica oculto; nenhuma coleção é carregada;
nenhum `render()` roda. Sem sessão, o app não tem o que mostrar — e não deve mostrar
o espelho local, que pode ser de outro usuário (§4.3).

A tela traz: a marca KMF já existente, uma frase do que o app é, e **um** botão —
*Entrar com Google*. Sem cadastro, sem senha, sem "esqueci minha senha": o provider é
o único caminho.

### 7.2 O fluxo

```
[Gate]  Entrar com Google
   ↓    signInWithOAuth({ provider:'google', redirectTo: <origem atual> })
[Google]  escolhe a conta
   ↓    volta em /auth/v1/callback → app com a sessão
[App]   uid conhecido → hidrata do espelho (instantâneo) → render()
   ↓                  → busca no Supabase → atualiza se mudou
[Pronto]
```

`redirectTo` é a origem atual, e é por isso que `localhost:5500`, `127.0.0.1:5500` e
`cenografia-pricing.vercel.app` estão nas **Redirect URLs** do Supabase (fase 1). Falta
alguma → login completa e a volta falha.

### 7.3 Estados que precisam de tratamento explícito

| Estado | Comportamento |
|---|---|
| **`db === null`** (sem `config.js`, CDN bloqueado, harness) | modo local puro, banner discreto: "rodando offline, os dados ficam só neste navegador". **É isso que mantém a suíte verde.** |
| **Sessão expira em uso** | não desloga no meio do trabalho. A fila segura as escritas, aparece aviso "sessão expirada, entre de novo"; ao reentrar, a fila drena. Perder trabalho digitado por token expirado é inaceitável. |
| **Login com conta diferente** | o espelho da conta anterior é limpo antes de hidratar. Sem isso, §4.3 acontece. |
| **Logout** | limpa espelho e memória, volta ao gate. Se a fila não estiver vazia, avisa antes: "há alterações não enviadas". |
| **Offline no boot, com sessão válida** | entra e trabalha com o espelho; badge de "offline"; sincroniza ao voltar. |
| **Primeiro login** | o trigger já criou perfil, catálogo e dropdowns (fase 1). O app encontra tudo pronto — o onboarding com orçamento de exemplo (`:2740`) deve rodar **uma vez por conta**, não por navegador. |

### 7.4 Detalhe que muda a percepção de velocidade

O gate só aparece se **não houver sessão**. Com sessão válida em cache, o app pinta a
tela do espelho local **antes** de qualquer resposta de rede. Na prática, continua
abrindo tão rápido quanto hoje — que é o único jeito de essa migração não parecer uma
piora para quem usa.
