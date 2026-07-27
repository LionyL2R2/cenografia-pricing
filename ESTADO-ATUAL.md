# Estado atual do app — v5.6

Mapeamento do `index.html` como está em produção (`cenografia-pricing.vercel.app`).
Documento de referência para qualquer alteração futura. **Nenhum código foi alterado nesta etapa.**

Data do mapeamento: 27/07/2026 · commit `f514075`.

---

## 1. Versão

| Onde | Valor |
|---|---|
| Git (último commit) | `f514075` — "v5.6 - PDF agora e relatorio interno completo (setores, linhas, subtotais, financeiro)" |
| Dentro do `index.html` | **não existe** — nenhuma constante, comentário ou texto de versão |
| Tags git | nenhuma |

**A versão só existe na mensagem de commit.** O app não expõe versão em lugar nenhum, então:

- o Silvio não tem como dizer qual versão está rodando;
- se o navegador servir uma cópia em cache, não há como perceber;
- ao receber um relato de bug, não dá para saber a versão de origem.

Histórico de versões relevante:

```
f514075 v5.6 - PDF vira relatório interno completo
85fb451 v5.5 - aba Configurações (listas globais)
d202197 v5.4 - salvar por cima sem duplicar, nome único, busca, confirmação ao excluir
3e6341b v5.3 - itens prontos e impressão calculam m² por dimensão
ae617d7 v5.2 - itens prontos: opção "Outros (digitar)" com unidade própria
4c35ab9 v5.1 - itens prontos + dropdowns de descrição
8a6a14a v5.0 - novo modelo de entrada por setores (cards recolhíveis)  ← quebra de modelo
e410dd9 v4.4 - rebrand KMF
de5fd83 v4.0 - planilha simples de itens + modo avançado          ← modelo antigo
```

Arquivo: 1.858 linhas, ~112 KB, único (HTML + CSS + JS inline). Sem build, sem dependências, sem backend. Única requisição externa: Google Fonts (Inter).

---

## 2. Telas / abas

Três telas, controladas por `irPara(tela)` (linha 1435). Mostrar/esconder `div`s — não há rota, hash ou histórico.

### 2.1 Início (`#telaInicio`)

Montada por `montarInicio()` + `renderProjGrid()`.

- **Card "Continuar de onde parei"** — aparece se o rascunho atual tem nome, cliente ou custo > 0. Clique volta para o Orçamento.
- **Busca** (`#projBusca`) — filtra por nome ou cliente, normalizado (`normNome`: trim + lowercase). Só aparece se houver ao menos um orçamento salvo.
- **Grid de projetos salvos** — um card por orçamento em `cen_v3_budgets`, ordenado por `snapshot.salvoEm` decrescente. Mostra nome, cliente, tipo de item, data, preço de venda. Ações: **Abrir**, **Duplicar** (sugere `Nome (1)`, `Nome (2)`…), **Excluir** (modal de confirmação).

### 2.2 Orçamento atual (`#telaOrcamento`) — tela principal

Sete cards recolhíveis (`toggleSec`), na ordem:

| # | Card | `data-sec` | Conteúdo |
|---|---|---|---|
| 1 | Dados do projeto | `dados` | metadados; sem subtotal |
| 2 | Itens prontos | `itensprontos` | tabela; badge com subtotal |
| 3 | Materiais | `materiais` | tabela; badge |
| 4 | Impressão | `impressao` | tabela; badge |
| 5 | Estrutura | `estrutura` | tabela; badge |
| 6 | Mão de obra | `maoobra` | subtabela Produção + 4 campos de montagem/desmontagem; badge |
| 7 | Logística e locações | `logistica` | 7 campos de transporte + subtabela de locações; badge |
| 8 | Parâmetros financeiros | `financeiro` | 2 presets de tributação + imposto% + margem%; sem badge |

Abaixo dos cards:

- **Faixa "Preço de venda"** — preço, custo total, impostos (com %), lucro estimado.
- **Composição do orçamento** — barra empilhada custo/imposto/lucro + barras horizontais de custo por setor.
- **Ações**: `Relatório interno (PDF)` (`imprimir()`) e `Exportar interno (CSV)` (`exportCSV()`).

Banners condicionais: `#bannerExemplo` (orçamento de demonstração), `#bannerMigrado` (veio do formato antigo), `#avisoGuard` (imposto% + margem% ≥ 100%).

Header (fixo nas três telas): **Meus dados** (modal), **Salvar orçamento**, dropdown **Abrir…**, **+ Novo orçamento**.

### 2.3 Configurações (`#telaConfig`) — painel admin

Montada por `montarConfig()`. Detalhada na seção 6.

### 2.4 Modais

| Modal | Função |
|---|---|
| `#modalConfig` | "Meus dados" — dados da empresa |
| `#modalNome` | nome ao salvar/duplicar, com validação de unicidade |
| `#modalConfirm` | confirmação genérica sim/não (`confirmar()`) |

---

## 3. Modelo de dados

### 3.1 Estado completo (`novoEstado()`, linha 778)

```js
{
  meta: { nome, num, cliente, responsavel, data, tipoItem, obs },
  itensProntos: [],
  materiais:    [],
  impressao:    [],
  estrutura:    [],
  maoObra: {
    producao: [],
    montagem: { diariasMontagem, valorMontagem, diariasDesmontagem, valorDesmontagem }
  },
  logistica: {
    transporte: { frete, combustivel, pedagio, estacionamento, hospedagem, alimentacao, outros },
    locacoes: []
  },
  financeiro: { tributacao, impostoPct, margemPct },
  migrado: false,
  _projId: "<id>"   // só quando o orçamento já foi salvo
}
```

`meta.data` é armazenada em **ISO** (`aaaa-mm-dd`) e exibida em **BR** (`dd/mm/aaaa`) via `isoToBr`/`brToIso`.

### 3.2 Setores e campos de linha

| Setor | Factory | Campos | Fórmula do total |
|---|---|---|---|
| **Itens prontos** | `novoItemPronto()` | `id, item, unidade, qtd, largura, altura, valorUnit` (+ `_outros`, flag de UI) | m²: `largura×altura×qtd×valorUnit` · peça: `qtd×valorUnit` |
| **Materiais** | `novoMaterial()` | `id, desc, unidade, qtd, valorUnit` | `qtd × valorUnit` |
| **Impressão** | `novaImpressao()` | `id, desc, largura, altura, m2, qtd, valorM2` | `m² × qtd × valorM2`, onde m² = `largura×altura` (ou o campo `m2` legado se não houver dimensão) |
| **Estrutura** | `novaEstrutura()` | `id, desc, unidade, qtd, valorUnit` | `qtd × valorUnit` |
| **Produção** (dentro de Mão de obra) | `novaFuncao()` | `id, funcao, diarias, valorDiaria` | `diarias × valorDiaria` |
| **Locações** (dentro de Logística) | `novaLocacao()` | `id, equipamento, qtd, dias, valorDia` | `qtd × dias × valorDia` |

Montagem/desmontagem e transporte **não são listas** — são campos fixos no objeto do setor.

`id` = `Math.random().toString(36).slice(2,9)` (7 caracteres). Não é criptográfico e **pode colidir**.

### 3.3 Unidades

```js
UNID_MAT = ['m²','m','peça','kg','m³','l','un']   // Materiais
UNID_EST = ['m','peça','kg','conjunto','un']       // Estrutura
UNID_IP  = ['m²','peça']                            // Itens prontos (só estas duas)
```

**A unidade só tem efeito de cálculo em Itens prontos** (`m²` liga o cálculo por dimensão). Em Materiais e Estrutura ela é puramente um rótulo: escolher `m²` num material **não** faz o app calcular área — o total continua `qtd × valorUnit`.

### 3.4 Listas globais (fora do orçamento)

```js
OPC_BASE = {
  materiais: ['Madeira','Placa MDF','Metalon','Fita de LED'],
  producao:  ['Marceneiro','Adesivador','Eletricista'],
  impressao: ['Lona','Adesivo']
}
ITENS_PRONTOS = [
  {nome:'Trainel', unidade:'m²'}, {nome:'Banner com ilhós', unidade:'m²'},
  {nome:'Stand', unidade:'peça'}, {nome:'Toten', unidade:'peça'}
]
```

Estas constantes são **sementes**: `migrarOpcoes()` (linha 768) copia tudo para o localStorage na primeira execução e grava a flag `cen_v3_opcseed`. A partir daí o localStorage é a fonte única e as constantes ficam inertes — inclusive se o usuário apagar todas as opções, elas **não voltam**.

**Estrutura e Locações não têm lista global** — descrição é sempre texto livre e não aparecem no painel admin.

### 3.5 Cálculo de custo e preço

```
custoTotal = itensProntos + materiais + impressão + estrutura + mãoDeObra + logística
```

Ver `custoTotal()` (linha 878) e `resultado()` (linha 880).

---

## 4. Schema do localStorage

Sete chaves. **Todas com prefixo `cen_v3_`, apesar do app estar na v5.6** — o prefixo nunca foi atualizado e mudá-lo agora apagaria todos os dados do Silvio.

| Chave | Constante | Formato | Conteúdo |
|---|---|---|---|
| `cen_v3_auto` | `LS.auto` | objeto `state` | Rascunho atual. Gravado por `autosave()` com debounce de 350 ms a cada `recalc()`. Inclui `_projId`. |
| `cen_v3_budgets` | `LS.budgets` | `{ [id]: state + snapshot }` | Orçamentos salvos. Chave = ID gerado por `uid()`. |
| `cen_v3_config` | `LS.config` | `{nome, doc, tel, email, cidade}` | "Meus dados" da empresa. |
| `cen_v3_seen` | `LS.seen` | `true` | Onboarding visto — controla se o orçamento de exemplo é carregado. |
| `cen_v3_opcoes` | `LS.opcoes` | `{materiais:[], producao:[], impressao:[]}` | Listas de descrição dos dropdowns. |
| `cen_v3_itens` | `LS.itens` | `[{nome, unidade}]` | Itens prontos globais. `unidade` ∈ `m²` \| `peça`. |
| `cen_v3_opcseed` | `LS.opcSeed` | `true` | Flag one-shot de semeadura. |

### 4.1 Estrutura do `snapshot` (dentro de `cen_v3_budgets[id]`)

```js
snapshot = { id, nome, salvoEm: <timestamp ms>, total: <preço de venda>, cliente, tipoItem }
```

O nome do orçamento vive em `snapshot.nome` (**não** em `meta.nome` — são independentes e podem divergir). `snapshot.total` é um valor congelado no momento do salvamento, usado para o card da tela Início sem precisar recalcular.

### 4.2 Camadas de migração já existentes

O app já carrega três migrações. Toda mudança de schema tem que conviver com elas:

1. **`migrarBudgets()`** (linha 1831) — converte `cen_v3_budgets` do formato antigo (chave = nome do orçamento) para chave = ID único.
2. **`migrarOpcoes()`** (linha 768) — semeia as listas globais uma única vez.
3. **`migrar(raw)` / `normalizarNovo(raw)`** (linhas 896 / 915) — normaliza um orçamento carregado. Se o registro **não** tem `financeiro`, `materiais` ou `maoObra`, é tratado como legado v3/v4 (tabela plana `itens` ou `secoes`), recalculado com as alíquotas antigas `LEG_TAX` e despejado inteiro no setor **Materiais** com `unidade:'un'`, `qtd:1`, imposto e margem zerados — para que o custo migrado bata com o total anterior. Marca `migrado:true`.

### 4.3 O que morre se o schema mudar

| Mudança | Consequência |
|---|---|
| Renomear o prefixo `cen_v3_` | **Perda total** — rascunho, todos os orçamentos salvos, dados da empresa e listas globais. Não há import/export para recuperar. |
| Renomear um setor (ex.: `estrutura` → `estruturas`) | `normalizarNovo` só copia arrays cujo nome ele conhece. O setor antigo é **descartado em silêncio** ao abrir um orçamento salvo. Sem aviso e sem erro. |
| Renomear um campo de linha (`valorUnit`, `valorM2`, `diarias`…) | `Object.assign(factory(), l)` preserva a chave antiga como campo órfão, mas o campo novo fica no default (vazio) → **a linha zera** e o total do orçamento cai sem aviso. |
| Trocar `meta.data` de ISO para outro formato | `isoToBr` devolve a string crua; `brToIso` rejeita e a data para de ser salva. |
| Mudar `snapshot` | Há fallback para `meta.*` em `montarInicio` e `nomeDe`, mas **`snapshot.total` sem fallback recalcula via `totalDe()`** — se o modelo de cálculo mudar junto, os valores dos cards da tela Início mudam retroativamente. |
| Alterar a estrutura de `cen_v3_itens` (itens prontos) | Ver seção 9 — muda o **total de orçamentos já salvos**. |
| Estourar a quota do localStorage | `lsSet` engole a exceção (`catch(e){}`): o salvamento falha **sem nenhum aviso** e o usuário só percebe ao recarregar. |

**Não existe backup, export nem import do localStorage.** Limpar dados do navegador, trocar de máquina, usar aba anônima ou trocar de navegador = perda de 100% dos orçamentos. Este é o risco mais alto do app hoje.

---

## 5. Lógica tributária

### 5.1 Onde ficam as alíquotas

**Duas tabelas coexistem no arquivo:**

```js
// linha 727 — modelo atual, valores em pontos percentuais
const TRIB = { servico: 18.33, locacao: 13.33 };

// linha 937 — só para migrar orçamentos v3/v4, valores em fração
const LEG_TAX = { servico: 0.1633, locacao: 0.1133 };
```

`LEG_TAX` está **2 pontos percentuais abaixo** de `TRIB` em ambos os regimes. É intencional (preserva o cálculo histórico dos orçamentos antigos), mas não há comentário explicando a diferença, e alterar uma sem a outra passa despercebido.

O `README.md` ainda descreve um objeto **`TAX_RULES`, que não existe mais** — foi removido na v4.x. A documentação está desatualizada.

### 5.2 Gross-up

`resultado()` (linha 880):

```js
denom = 1 − imposto% /100 − margem% /100
preço  = denom > 0 ? custo / denom : 0
imposto = preço × imposto%
lucro   = preço × margem%
```

Ou seja: imposto e margem são calculados **sobre o preço de venda**, não sobre o custo — é gross-up correto. A identidade `custo + imposto + lucro = preço` fecha exatamente.

Guarda: se `imposto% + margem% ≥ 100%`, o preço trava em R$ 0,00, `invalido = true`, e o banner `#avisoGuard` aparece. O relatório em PDF também imprime o aviso.

### 5.3 Presets

Dois botões em Parâmetros financeiros (`tribPreset`, linha 1285):

| Botão | Preenche `impostoPct` | Grava `tributacao` | Efeito extra |
|---|---|---|---|
| Serviço · 18,33% (com ISS) | 18,33 | `'servico'` | — |
| Locação · 13,33% (sem ISS) | 13,33 | `'locacao'` | exibe o aviso "benefício/regra válida até 31/12/2026" |

O campo é **sempre editável**. Ao digitar manualmente, `setFin` limpa `tributacao` (linha 1284) — o preset deixa de estar "ativo".

A margem de lucro (`margemPct`) não tem preset nem valor padrão; começa vazia.

**A data-limite 31/12/2026 está hardcoded no HTML** (linha 616), não em constante, e não há nenhuma verificação contra a data atual — o aviso continuará dizendo "válida até 31/12/2026" indefinidamente após a data passar.

---

## 6. Painel admin (aba Configurações)

Introduzido na v5.5. Montado por `montarConfig()` (linha 1570). **Não tem senha nem restrição** — é uma aba normal, visível para o Silvio.

### O que controla

Quatro blocos, definidos por `ADM_SECOES` (linha 1538) + itens prontos:

| Bloco | Persistido em | Formato |
|---|---|---|
| Materiais | `cen_v3_opcoes.materiais` | `[string]` |
| Mão de obra (funções) | `cen_v3_opcoes.producao` | `[string]` |
| Impressão (descrições) | `cen_v3_opcoes.impressao` | `[string]` |
| Itens prontos (nome + unidade) | `cen_v3_itens` | `[{nome, unidade}]` |

Operações: adicionar, renomear (com confirmação), remover (com confirmação). Para itens prontos, também trocar a unidade entre `m²` e `peça`.

Validação de duplicidade via `opcColide` / `itemColide`, usando `normNome` (trim + lowercase).

`admAplicar()` (linha 1588) grava as duas chaves, chama `render()` (atualiza os dropdowns do orçamento aberto) e remonta a própria aba.

### O que NÃO controla

- Alíquotas de imposto (`TRIB`) — hardcoded.
- Presets tributários e a data-limite de 2026 — hardcoded.
- Unidades disponíveis (`UNID_MAT`, `UNID_EST`, `UNID_IP`) — hardcoded.
- Tipos de item cenográfico (dropdown "Tipo de item") — hardcoded no HTML.
- Rótulos de transporte (frete, combustível, pedágio…) — hardcoded em três lugares.
- Listas de Estrutura e Locações — não existem.
- Preço padrão por item pronto — o comentário na linha 739 diz "preço padrão global", mas **isso nunca foi implementado**: `itensCustom` só guarda `{nome, unidade}`.

### Aviso exibido

> "As mudanças aqui valem para os **próximos** orçamentos. Renomear ou remover uma opção **não altera** orçamentos já salvos."

Isso é verdade para descrições de texto (materiais/produção/impressão), mas **é falso para itens prontos** — ver seção 8, item B.

### Alimentação automática das listas

`coletarOpcoes()` (linha 1308) roda **apenas dentro de `salvarOrcamento()`**: nomes digitados em "Outros (digitar)" viram opções globais no momento do salvamento. Quem digita e nunca salva não alimenta a lista.

---

## 7. Geração de PDF

`imprimir()` (linha 1635) → preenche `#printArea` → `window.print()`. Impressão via CSS `@media print`; o app inteiro (`.wrap`) fica `display:none`. Não há biblioteca de PDF — depende do "Salvar como PDF" do navegador.

Desde a v5.6, **é um relatório interno, não uma proposta de cliente.**

### O que entra

1. **Cabeçalho** — título "Relatório interno de orçamento", `config.nome` (ou "KMF Cenografia") e um selo laranja **"Uso interno"**.
2. **Tabela de metadados** — Projeto, Proposta nº, Cliente, Responsável, Data (dd/mm/aaaa), Tipo de item. Linhas vazias são omitidas.
3. **Observações** — se preenchidas.
4. **Detalhamento por setor** — uma tabela por setor que tenha conteúdo, com todas as colunas de entrada, todas as linhas e o subtotal:

| Setor | Colunas impressas |
|---|---|
| Itens prontos | Item, Un., Larg., Alt., m², Qtd, Valor, Total |
| Materiais | Descrição, Un., Qtd, Valor unit., Total |
| Impressão | Descrição, Larg., Alt., m², Qtd, Valor/m², Total |
| Estrutura | Descrição, Un., Qtd, Valor unit., Total |
| Mão de obra | Função/etapa, Diárias, Valor/diária, Total (produção + montagem + desmontagem) |
| Logística e locações | Item, Qtd, Dias, Valor unit., Total (transporte + locações) |

Linhas com descrição vazia **e** total zero são omitidas.

5. **Resultado financeiro** — Custo total, Impostos (com %), Margem/lucro (com %), Preço de venda. Aviso se `invalido`.
6. **Rodapé** — "Documento de uso interno. Contém custos, impostos e margem — não enviar ao cliente."

### O que NÃO entra

- **CNPJ, telefone, e-mail e cidade da empresa.** São coletados no modal "Meus dados", gravados em `cen_v3_config` e **nunca lidos em lugar nenhum** — só `config.nome` é usado. São dados write-only.
- Não existe mais uma **proposta para o cliente**. O único PDF hoje é interno e expõe custo e margem. O README ainda promete "gera proposta em PDF" — a funcionalidade não existe na v5.6.

### CSV (`exportCSV`, linha 1742)

Alternativa ao PDF: `;` como separador, decimal com vírgula, BOM UTF-8, nome do arquivo = nome do projeto. Colunas: Setor · Descrição · Detalhe · Total. Mesmo conteúdo do PDF, mas **imprime as linhas de transporte e montagem mesmo quando zeradas** (o PDF filtra) — os dois relatórios divergem em conteúdo.

---

## 8. Bugs e inconsistências encontrados

Ordenados por impacto.

### A. Salvamento falha em silêncio se a quota do localStorage estourar
`lsSet` (linha 800) tem `catch(e){}` vazio. O usuário vê o toast "Salvo: X" e o dado não foi gravado. Com dezenas de orçamentos completos, o limite de ~5 MB é alcançável.

### B. Mudar a unidade de um item pronto no admin altera o total de orçamentos já salvos
`ipUnidade(l)` (linha 855) resolve a unidade consultando a **lista global**, não a linha:

```js
function ipUnidade(l){ const k = itensProntosAll().find(x => x.nome === l.item); return k ? k.unidade : (l.unidade || 'm²'); }
```

Se o admin trocar "Trainel" de `m²` para `peça`, todo orçamento salvo que usa Trainel passa a calcular `qtd × valor` em vez de `largura × altura × qtd × valor`. **O total muda retroativamente.** O aviso da aba Configurações afirma explicitamente que isso não acontece.

Efeito espelhado ao **remover** um item da lista: `ipUnidade` cai no fallback `l.unidade || 'm²'`. Orçamentos criados na v5.1 (antes de `unidade` existir na linha) têm `unidade` vazia e viram `m²` — se eram `peça`, o total zera (largura e altura em branco).

### C. Comparação de duplicidade inconsistente entre "Outros" e o admin
`coletarOpcoes` usa comparação exata e case-sensitive (`opcoesDe(sec).includes(v)`, linha 1310; `x.nome === nome`, linha 1317); o admin usa `normNome` (lowercase). Digitar "madeira" em Outros cria uma segunda entrada ao lado de "Madeira" — e depois o admin recusa renomear qualquer uma delas por colisão. Lista fica com duplicatas impossíveis de limpar por renomeação.

### D. Banner de exemplo não some ao abrir um orçamento salvo
`novoOrcamento()` remove a classe `show` de `#bannerExemplo` (linha 1378); `carregarOrcamento()` (linha 1360) **não**. Quem está vendo o exemplo e abre um orçamento real continua lendo "Este é um orçamento de exemplo".

### E. Aviso de locação não some ao editar o imposto manualmente
`setFin` (linha 1284) zera `state.financeiro.tributacao` mas **não chama `renderTribAviso()`**. O aviso "válida até 31/12/2026" fica na tela até o próximo `render()` completo, mesmo com a alíquota já alterada.

### F. `hoje()` usa UTC
`new Date().toISOString().slice(0,10)` (linha 798). No fuso do Brasil (UTC−3), qualquer orçamento criado depois das 21h recebe a data do **dia seguinte**.

### G. Data inválida é descartada em silêncio
`dataInput()` (linha 841): se `brToIso` rejeita (ex.: 31/02/2026), a data anterior é mantida no state sem nenhum feedback. O campo mostra uma data e o state guarda outra.

### H. `hasDim` com apenas uma dimensão zera o total
`hasDim` (linha 861) retorna `true` se **largura ou altura** estiver preenchida; `impM2` então calcula `largura × altura`. Preencher só a largura resulta em 0 m² e total zero, ignorando o campo `m2` legado que existia. Sem aviso.

### I. `_outros` (flag de UI) é gravada no modelo de dados
`onItemProntoSel` (linha 1252) grava `l._outros = true/false` na linha do state, que vai para o localStorage e é preservado por `Object.assign`. Estado de interface poluindo o modelo persistido.

### J. `novoOrcamento()` usa `confirm()` nativo
Linha 1374 — único ponto do app que usa o diálogo do navegador. Todo o resto usa o modal `confirmar()`. Inconsistente e não estilizável.

### K. `snapshot.total` do duplicado pode ficar zerado
`duplicarProjeto` (linha 1517) copia `snap.total || 0`. Se o original veio de `migrarBudgets` sem snapshot completo, a cópia aparece como R$ 0,00 na tela Início até ser aberta e salva.

### L. Cabeçalhos de card não são acessíveis por teclado
`.card-head` tem `role="button"` e `onclick`, mas não tem `tabindex` nem handler de `keydown`. Os cards não recolhem/expandem por teclado.

### M. `esc()` não escapa apóstrofo
Linha 802. Hoje é seguro porque os IDs interpolados em handlers inline vêm de `uid()` (alfanumérico), mas qualquer valor de usuário que passe a ser interpolado em `onclick="fn('...')"` quebra o handler.

### N. `state.migrado` nunca é limpo
O banner de migração aparece para sempre; não há botão de dispensar e nada zera a flag depois que o usuário reorganiza os itens.

### O. `collapsed` não é persistido
O estado de recolhimento dos cards é perdido a cada recarga. Todos os sete cards sempre abrem expandidos.

### P. README desatualizado
Descreve `TAX_RULES` (removido), "catálogo de itens" (não existe) e "gera proposta em PDF" (hoje é relatório interno).

### Q. Código morto — JavaScript

| Item | Situação |
|---|---|
| `config.doc`, `config.tel`, `config.email`, `config.cidade` | coletados e gravados; **nunca lidos** |
| `OPC_BASE`, `ITENS_PRONTOS` | inertes após o primeiro `migrarOpcoes()` |
| `state.financeiro.tributacao` | só liga/desliga um aviso |
| `state.impressao[].m2` | campo legado v5.2; não editável na UI |
| `round2` | usado só no caminho de migração legada |
| `LEG_TAX`, `legMargem`, `legImposto`, `legDiv`, `legAvancado`, `legGrossup`, `linhasLegado` | só para orçamentos v3/v4 |
| `delete state.snapshot` em `carregarOrcamento` | redundante — `normalizarNovo` não copia `snapshot` |

### R. Código morto — CSS

Blocos inteiros de versões anteriores que não têm mais nenhum HTML correspondente:

- **Modo avançado (v4.x)**: `.modebar`, `.switch`, `table.itab.adv`, `.adv-col`, `.simple-col`, `.in-valor[readonly]`, `.col-custo`, `.col-cat`, `.col-imposto`, `.col-marg`, `.col-preco`, `.col-m2preco`
- **Resumo de notas fiscais (v4.x)**: `.notas-grid`, `.nota-stub`, `.nota-stub.servico`, `.nota-stub.locacao`
- **Painel de tributos (v4.x)**: `.trib-grid`, `.trib-box`, `.trib-detalhe`
- **Categorias / badges (v4.x)**: `.cat-row`, `.badge`, `.badge.servico`, `.badge.locacao`
- **Chips de sugestão de imposto**: `.chip-sug`, `.imp-quick`, `.imp-wrap`
- **Impressão**: `.p-trib`, `.p-head .prop b`
- `.hidden`, `tr.sub-row`, `tr.grand`, `.sub-tag`, `.add-bar` parcialmente
- Variáveis CSS não usadas: `--ink-soft`, `--campo-borda`, `--obra`, `--ok`

Estimativa: ~120 linhas de CSS sem uso, ~15% da folha de estilos.

### S. Divergência PDF × CSV
O CSV imprime linhas de transporte e montagem/desmontagem mesmo zeradas; o PDF filtra. Dois relatórios do mesmo orçamento com número de linhas diferente.

---

## 9. Pontos frágeis — o que quebra se o modelo de dados mudar

Ordenados por gravidade.

### 1. Não há backup, export nem import do localStorage
Todo o trabalho do Silvio vive num único navegador de uma única máquina. Limpar dados do site, trocar de navegador, formatar o computador, usar o celular ou uma aba anônima = **perda total, sem recuperação**. Antes de qualquer alteração de schema, isto deveria existir.

### 2. `normalizarNovo` descarta em silêncio o que não conhece
Linha 915: só copia os campos que enumera explicitamente. Um setor renomeado, dividido ou movido no state **desaparece sem erro** ao abrir um orçamento salvo — sem exceção, sem log, sem aviso. O usuário vê um orçamento com o total menor e não sabe por quê.

### 3. Campos de linha renomeados zeram o valor
`Object.assign(novoMaterial(), l)`: a chave antiga sobrevive como lixo, mas a nova fica no default vazio. Renomear `valorUnit` → `valorUnitario` faz todos os materiais de todos os orçamentos salvos valerem R$ 0,00 — silenciosamente, e o autosave grava o estado zerado por cima.

### 4. Prefixo `cen_v3_` é irreversível
Já está errado (app v5.6, chave v3), mas corrigi-lo apaga tudo. Qualquer alteração precisa ler as chaves antigas e migrar, nunca renomear direto.

### 5. Itens prontos: a linha depende da lista global
Ver bug B. O total de um orçamento salvo **não é auto-contido** — depende do estado atual de `cen_v3_itens`. Enquanto isso for verdade, nenhuma mudança na lista de itens prontos é segura. A correção estrutural é gravar a unidade na própria linha e parar de consultar a lista global no cálculo.

### 6. Três camadas de migração acumuladas, sem teste
`migrarBudgets` + `migrarOpcoes` + `migrar`/`normalizarNovo`/`linhasLegado`. Não há um único teste automatizado. Toda mudança de schema adiciona uma quarta camada que precisa conviver com as três anteriores, e a única forma de verificar é abrir o app e conferir na mão.

### 7. Alíquotas hardcoded em dois lugares diferentes
`TRIB` (atual) e `LEG_TAX` (legado), com valores diferentes e sem comentário explicando por quê. Uma mudança na legislação exige tocar em ambas com critérios diferentes, e o painel admin não ajuda — as alíquotas não são editáveis pelo usuário.

### 8. Data-limite 31/12/2026 hardcoded no HTML
Linha 616. Não é constante, não é verificada contra a data atual, e o app não tem versão exposta — depois de 31/12/2026 o aviso continuará afirmando algo falso e ninguém terá como saber se a versão em uso já foi corrigida.

### 9. Sem versão no código
Não há como o Silvio informar qual versão está usando, nem como verificar se o deploy chegou. Qualquer diagnóstico de bug começa às cegas.

### 10. `uid()` de 7 caracteres pode colidir
`Math.random().toString(36).slice(2,9)`. Baixa probabilidade, mas uma colisão de ID de projeto sobrescreve um orçamento salvo em `cen_v3_budgets` sem aviso.

### 11. Estrutura e Locações fora do painel admin
Os dois setores usam texto livre e não têm lista global. Se o modelo de listas globais evoluir (ex.: preço padrão por opção), esses dois setores ficam para trás e a inconsistência aumenta.

### 12. Handlers `onclick` inline em HTML gerado por template string
Todo o app depende de interpolação de string dentro de atributos HTML. Qualquer campo de usuário que passe a ser interpolado num handler (e não só em `value=`) vira quebra de sintaxe ou injeção, porque `esc()` não escapa apóstrofo.

---

## 10. Resumo executivo

O app funciona e está coerente com o modelo por setores da v5.0. Os três problemas mais importantes hoje não são de cálculo — são de **durabilidade dos dados**:

1. não há backup de nada;
2. mudanças no schema apagam dados em silêncio;
3. o painel admin pode alterar retroativamente o total de orçamentos já fechados.

Antes de qualquer nova funcionalidade, o passo de maior valor é tornar os dados exportáveis e os orçamentos salvos auto-contidos.
