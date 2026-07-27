# Estado atual do app — v5.9.2

Mapeamento do `index.html` como está em produção (`cenografia-pricing.vercel.app`).
Documento de referência para qualquer alteração futura.

Atualizado em 27/07/2026 · schema de dados **3**.
Versão anterior deste documento mapeava a v5.6; as seções abaixo refletem o que as
entregas das fases 2 e 2.1 (v5.7 → v5.9.1) mudaram.

---

## 1. Versão

| Onde | Valor |
|---|---|
| `APP_VERSION` no topo do `<script>` | `'5.9.2'` |
| `SCHEMA_VERSION` | `3` |
| Rodapé do app | `KMF Orçamento v5.9.1 · schema v3` |
| Rodapé do PDF | idem + data de geração |

Desde a v5.7 a versão é única fonte da verdade no código e visível na tela — antes
existia só na mensagem de commit e não havia como saber o que estava rodando.

Histórico:

```
v5.9.2  suíte de testes versionada, conferência de integridade
v5.9.1  migração eager de schema 3, item sem preço, docs
v5.9    orçamentos auto-contidos, preços congelados na linha   ← schema 3
v5.8    export/import de backup, correção de quota e fuso
v5.7    schema versionado, campos desconhecidos preservados     ← schema 2
v5.6    PDF vira relatório interno completo
v5.5    aba Configurações (listas globais)
v5.0    modelo de entrada por setores                           ← quebra de modelo
v4.0    planilha simples + modo avançado                        ← modelo antigo
```

Arquivo único: ~2.100 linhas, ~130 KB (HTML + CSS + JS inline). Sem build, sem
dependências, sem backend. Única requisição externa: Google Fonts (Inter).

---

## 2. Telas / abas

Três telas, controladas por `irPara(tela)`. Mostrar/esconder `div`s — não há rota,
hash ou histórico.

### 2.1 Início

- **Continuar de onde parei** — se o rascunho tem nome, cliente ou custo > 0.
- **Busca** por nome ou cliente (normalizada por `normNome`).
- **Grid de projetos salvos**, ordenado por `snapshot.salvoEm`. Ações: Abrir,
  Duplicar (sugere `Nome (1)`), Excluir (com confirmação).

### 2.2 Orçamento atual

Oito cards recolhíveis: Dados do projeto · Itens prontos · Materiais · Impressão ·
Estrutura · Mão de obra · Logística e locações · Parâmetros financeiros. Cada setor
com linha exibe um badge de subtotal.

Abaixo: faixa de **Preço de venda** (preço, custo, impostos, lucro), card de
**Composição** (barra empilhada + barras por setor) e as ações
**Relatório interno (PDF)** e **Exportar interno (CSV)**.

Banners condicionais: `#avisoSalvar` (gravação falhou — fixo no topo, v5.8),
`#bannerExemplo`, `#bannerMigrado`, `#avisoGuard` (imposto% + margem% ≥ 100%).

### 2.3 Configurações

Painel admin das listas globais + **card de Backup dos dados** (v5.8). Detalhado na §6.

### 2.4 Modais

`#modalConfig` (Meus dados) · `#modalNome` (salvar/duplicar, valida unicidade) ·
`#modalConfirm` (sim/não) · `#modalImport` (resumo do backup antes de substituir, v5.8).

---

## 3. Modelo de dados

### 3.1 Estado completo

```js
{
  schemaVersion: 3,
  meta: { nome, num, cliente, responsavel, data, tipoItem, obs },
  itensProntos: [], materiais: [], impressao: [], estrutura: [],
  maoObra:   { producao: [], montagem: {diariasMontagem, valorMontagem, diariasDesmontagem, valorDesmontagem} },
  logistica: { transporte: {frete, combustivel, pedagio, estacionamento, hospedagem, alimentacao, outros},
               locacoes: [] },
  financeiro: { tributacao, impostoPct, margemPct },
  migrado: false,
  _projId: "<id>",      // só quando já foi salvo
  _legacy: { ... }      // só quando havia campo desconhecido a preservar
}
```

`meta.data` em ISO (`aaaa-mm-dd`), exibida em BR. Desde a v5.8 `hoje()` usa data
**local** — antes era UTC e adiantava o dia depois das 21h no Brasil.

### 3.2 Setores e campos de linha

| Setor | Campos | Total |
|---|---|---|
| **Itens prontos** | `id, item, unidade, qtd, largura, altura, valorUnit, precoRef` (+ `_outros`, UI) | m²: `larg×alt×qtd×valorUnit` · peça: `qtd×valorUnit` |
| **Materiais** | `id, desc, unidade, qtd, valorUnit` | `qtd × valorUnit` |
| **Impressão** | `id, desc, largura, altura, m2, qtd, valorM2` | `m² × qtd × valorM2` |
| **Estrutura** | `id, desc, unidade, qtd, valorUnit` | `qtd × valorUnit` |
| **Produção** | `id, funcao, diarias, valorDiaria` | `diarias × valorDiaria` |
| **Locações** | `id, equipamento, qtd, dias, valorDia` | `qtd × dias × valorDia` |

`precoRef` (v5.9) é o preço que o catálogo tinha quando a linha foi montada. Não entra
em cálculo nenhum — só detecta que o catálogo mudou depois.

### 3.3 Unidades

```js
UNID_MAT = ['m²','m','peça','kg','m³','l','un']
UNID_EST = ['m','peça','kg','conjunto','un']
UNID_IP  = ['m²','peça']
```

A unidade só afeta o cálculo em **Itens prontos**. Em Materiais e Estrutura é rótulo:
escolher `m²` num material não faz o app calcular área.

### 3.4 Catálogo e listas globais

```js
OPC_BASE = { materiais: [...], producao: [...], impressao: [...] }   // sementes
ITENS_PRONTOS = [{nome:'Trainel', unidade:'m²'}, ...]                // sementes
```

`migrarOpcoes()` copia as sementes para o localStorage na primeira execução e marca
`cen_v3_opcseed`. Depois disso o localStorage é a fonte única e as constantes ficam
inertes. **As 4 sementes de itens prontos não têm preço** — é o estado normal do
catálogo de quem já usava o app antes da v5.9.

**Estrutura e Locações não têm lista global** e não aparecem no painel admin.

### 3.5 Auto-contenção (v5.9 + v5.9.1)

Até o schema 2, `ipUnidade()` resolvia a unidade de um item pronto consultando o
catálogo **no momento do cálculo**. Trocar a unidade de um item no painel admin
mudava o total de orçamentos já fechados.

Hoje a linha é auto-contida: nome, unidade e valor vivem na linha, e o cálculo nunca
consulta `cen_v3_itens`. Escolher um item do catálogo **copia** os três valores.

---

## 4. Schema do localStorage

### 4.1 Chaves de dados (entram no backup)

| Chave | Formato | Conteúdo |
|---|---|---|
| `cen_v3_auto` | objeto `state` | rascunho atual, autosave com debounce de 350 ms |
| `cen_v3_budgets` | `{ [id]: state + snapshot }` | orçamentos salvos |
| `cen_v3_config` | `{nome, doc, tel, email, cidade}` | "Meus dados" |
| `cen_v3_seen` | `true` | onboarding visto |
| `cen_v3_opcoes` | `{materiais:[], producao:[], impressao:[]}` | descrições dos dropdowns |
| `cen_v3_itens` | `[{nome, unidade, preco}]` | catálogo de itens prontos |
| `cen_v3_opcseed` | `true` | flag de semeadura |

`snapshot = { id, nome, salvoEm, total, cliente, tipoItem, appVersion }`. O nome do
orçamento vive em `snapshot.nome`, não em `meta.nome` — são independentes.

### 4.2 Chaves de controle interno (ficam fora do backup)

| Chave | Conteúdo |
|---|---|
| `cen_v3_mig3` | varredura eager de schema 3 já rodou |
| `cen_v3_backup_pre_mig3` | cópia byte-exata de `budgets`/`auto` antes da varredura |

Ficam fora do backup de propósito: a flag não deve viajar entre navegadores, e o
backup pré-migração dobraria o tamanho do arquivo exportado.

### 4.3 Camadas de migração

1. **`migrarBudgets()`** — chave = nome → chave = ID único.
2. **`migrarOpcoes()`** — semeia as listas base uma única vez. Roda **antes** da
   varredura eager, porque a migração 2→3 depende do catálogo.
3. **`migrarTudoParaSchema3()`** (v5.9.1) — varredura eager no boot, com rollback.
4. **`migrations[]` / `aplicarMigracoes()`** — cadeia por versão, rodada na leitura de
   qualquer orçamento e no conteúdo importado.
5. **`migrar()` / `normalizarNovo()` / `linhasLegado()`** — converte o formato v3/v4
   (tabela plana `itens` ou `secoes`) para o modelo por setores, usando as alíquotas
   históricas `LEG_TAX`. Marca `migrado: true`.

### 4.4 Salvaguardas de schema

- `normalizarNovo()` **preserva** campos desconhecidos em `_legacy[caminho]` com
  `console.warn`, em vez de descartá-los.
- `versaoRealDe()` não confia no `schemaVersion` declarado: se um registro diz ser v3+
  mas as linhas de item pronto não têm `precoRef` — campo que só a migração 2→3
  escreve — ele é tratado como v2 e remigrado.
- Registro gravado por um schema **mais novo** que o app é usado como está, com aviso.
- A varredura eager grava `cen_v3_backup_pre_mig3` antes de tocar em qualquer coisa;
  se qualquer gravação falhar, restaura byte a byte e **não** marca a flag.

---

## 5. Lógica tributária

Ver README para a fórmula. O que importa aqui:

- Alíquotas atuais em **`TRIB`** (`servico: 18.33`, `locacao: 13.33`), em pontos
  percentuais. Não há painel para editá-las.
- **`LEG_TAX`** (`0.1633` / `0.1133`) existe só para recalcular orçamentos v3/v4 na
  migração, preservando o cálculo histórico. Não deve ser sincronizado com `TRIB`.
- Gross-up: imposto e margem incidem sobre o preço; `custo + imposto + lucro = preço`
  fecha exatamente. Se `denom ≤ 0`, preço trava em 0 e o aviso aparece.
- A data-limite **31/12/2026** do aviso de locação está hardcoded no HTML e não é
  verificada contra a data atual.

---

## 6. Painel admin (aba Configurações)

Sem senha — é uma aba normal.

| Bloco | Persistido em | Formato |
|---|---|---|
| Materiais | `cen_v3_opcoes.materiais` | `[string]` |
| Mão de obra (funções) | `cen_v3_opcoes.producao` | `[string]` |
| Impressão (descrições) | `cen_v3_opcoes.impressao` | `[string]` |
| Itens prontos | `cen_v3_itens` | `[{nome, unidade, preco}]` |
| **Backup dos dados** | — | exporta/importa as 7 chaves de dados |
| **Conferir integridade** | — | diagnóstico, não grava nada |

### Conferência de integridade (v5.9.2)

`conferirIntegridade()` recalcula cada orçamento salvo com as regras atuais e compara
com `snapshot.total`. Divergência acima de **R$ 0,01** é destacada; para cada orçamento
divergente, abre o detalhe das linhas de item pronto com `obsLinhaIP()` classificando
a causa provável (*fora do catálogo*, *catálogo sem preço*, *difere do catálogo*,
*unidade difere*). Exporta CSV. **Não corrige nada** — é a ferramenta para achar o
estrago que possa ter ocorrido antes da v5.9, que o app não tem como desfazer sozinho.

Orçamento sem `snapshot.total` (salvo antes do campo existir) é listado como "sem
referência", não como divergente.

O campo **preço** do catálogo foi adicionado na v5.9. O comentário no código prometia
um "preço padrão global" desde a v5.1, mas ele nunca havia sido implementado.

**O que o admin ainda não controla:** alíquotas, presets tributários, a data de 2026,
as unidades disponíveis, os tipos de item cenográfico, os rótulos de transporte, e as
listas de Estrutura e Locações (que não existem).

O aviso da aba — "mudanças aqui não alteram orçamentos já salvos" — **hoje é verdade**,
inclusive para itens prontos. Até a v5.8 era falso para eles.

---

## 7. Relatórios

### PDF (`imprimir()`)

Relatório **interno** (expõe custo e margem; não é proposta de cliente). Traz
cabeçalho, metadados do projeto, observações, uma tabela por setor com todas as linhas
e subtotal, resultado financeiro e rodapé com a versão do app.

Linha de item pronto sem preço sai como **`— sem preço`**, nunca como R$ 0,00, com nota
explicando que ela não entra no subtotal (v5.9.1).

**Não entram:** CNPJ, telefone, e-mail e cidade da empresa — são coletados em "Meus
dados", gravados em `cen_v3_config` e nunca lidos. Só `config.nome` é usado.

Não existe uma **proposta para o cliente**. O único PDF é interno.

### CSV (`exportCSV()`)

Mesmo conteúdo, separador `;`, decimal com vírgula, BOM UTF-8. Item pronto sem preço
sai com célula vazia em vez de `0,00`.

---

## 8. Bugs: o que foi corrigido e o que continua aberto

Os 19 itens mapeados na v5.6, com o status atual.

### Corrigidos (5)

| # | Bug | Corrigido em |
|---|---|---|
| A | Salvamento falhava em silêncio ao estourar a quota | v5.8 — `lsSet` devolve `true/false` e exibe banner fixo |
| B | Mudar a unidade de um item pronto alterava o total de orçamentos salvos | v5.9 (linha auto-contida) + v5.9.1 (varredura eager) |
| C | `coletarOpcoes` comparava nomes case-sensitive e criava "madeira" ao lado de "Madeira" | v5.9 — passou a usar `normNome` |
| F | `hoje()` usava UTC e adiantava o dia depois das 21h | v5.8 — data local |
| P | README descrevia `TAX_RULES`, removido na v4.x | v5.9.1 |

Corrigido também um bug novo, encontrado na fase 2.1: trocar de um item **com** preço
para um item **sem** preço mantinha o preço do anterior na linha (um Trainel herdava
os R$ 1.200 de um Stand, sem sinal nenhum). v5.9.1.

### Continuam abertos (14)

| # | Bug | Gravidade |
|---|---|---|
| D | Banner de exemplo não some ao abrir um orçamento salvo (`carregarOrcamento` não limpa a classe, `novoOrcamento` limpa) | baixa, confunde |
| E | Aviso de locação não some ao editar o imposto à mão — `setFin` zera `tributacao` mas não chama `renderTribAviso()` | baixa |
| G | Data inválida (31/02) é descartada em silêncio: o campo mostra uma coisa e o state guarda outra | média |
| H | `hasDim` retorna `true` com **uma** dimensão preenchida → `impM2` calcula `larg × 0` e o total zera sem aviso | média |
| I | `_outros` (flag de UI) é gravada no modelo e vai para o localStorage | baixa |
| J | `novoOrcamento()` usa `confirm()` nativo — único ponto do app que não usa o modal | baixa |
| K | `snapshot.total` do duplicado pode ficar zerado até o orçamento ser aberto e salvo | baixa |
| L | `.card-head` tem `role="button"` mas sem `tabindex` nem handler de teclado | acessibilidade |
| M | `esc()` não escapa apóstrofo — seguro hoje porque só `uid()` é interpolado em handlers | latente |
| N | `state.migrado` nunca é limpo: o banner de migração fica para sempre, sem botão de dispensar | baixa |
| O | `collapsed` não é persistido — os cards sempre reabrem expandidos | baixa |
| Q | `config.doc`, `config.tel`, `config.email`, `config.cidade` são write-only. `LEG_TAX` e o caminho legado só rodam para dados v3/v4 | código morto |
| R | ~120 linhas de CSS do modo avançado da v4.x sem HTML correspondente (`.modebar`, `.switch`, `.nota-stub`, `.trib-box`, `.chip-sug`, `.badge`, `.cat-row`, `table.itab.adv`…) | limpeza |
| S | CSV imprime linhas de transporte e montagem zeradas, o PDF filtra — dois relatórios com número de linhas diferente | baixa |

Nota sobre o item **H** e o tratamento de "sem preço": a regra
`— sem preço` foi aplicada a **itens prontos**, que era o escopo pedido. Materiais,
Impressão e Estrutura com valor em branco continuam saindo como `R$ 0,00` no PDF.

---

## 9. Pontos frágeis: o que mudou

### Resolvidos

| # | Ponto frágil | Como |
|---|---|---|
| 1 | Não havia backup, export nem import — limpar o navegador apagava tudo | v5.8: export/import de backup com validação, resumo e confirmação |
| 2 | `normalizarNovo` descartava em silêncio o que não conhecia | v5.7: `_legacy` + `console.warn` |
| 5 | Orçamentos salvos dependiam do catálogo global para calcular | v5.9 + v5.9.1: linha auto-contida, varredura eager com rollback |
| 9 | Não havia versão no código | v5.7: `APP_VERSION` no rodapé e no PDF |
| — | Não havia mecanismo de versionamento de schema | v5.7: `schemaVersion`, `migrations[]`, `versaoRealDe()` |

### Mitigados

| # | Ponto frágil | Situação |
|---|---|---|
| 4 | Prefixo `cen_v3_` irreversível | continua irreversível, mas agora existe export/import para mover os dados entre navegadores |
| 6 | Camadas de migração sem teste | **resolvido na v5.9.2**: suíte de 166 asserções em `testes/`, versionada, rodando sobre o `index.html` real num DOM falso (`node testes\run.js`). Cobre migrações, totais antes/depois, rollback, import, backup, quota, fuso e conferência. Ainda **não roda em CI** — depende de alguém rodar antes do commit |

### Continuam abertos

| # | Ponto frágil |
|---|---|
| 3 | Renomear um campo de linha zera o valor: `Object.assign(factory(), l)` mantém a chave antiga como lixo e o campo novo fica vazio. Existe agora backup e migração para tratar isso direito, mas o mecanismo não impede o erro |
| 7 | Alíquotas hardcoded em dois objetos (`TRIB` e `LEG_TAX`), não editáveis pelo usuário |
| 8 | Data-limite 31/12/2026 hardcoded no HTML, sem verificação contra a data atual |
| 10 | `uid()` de 7 caracteres pode colidir e sobrescrever um orçamento salvo |
| 11 | Estrutura e Locações fora do painel admin, sem lista global |
| 12 | Handlers `onclick` inline em HTML gerado por template string |
| — | O backup pré-migração (`cen_v3_backup_pre_mig3`) ocupa espaço permanentemente e não tem UI para ser descartado — soma-se ao risco de quota |
| — | A varredura eager congela o catálogo **do momento em que a v5.9.1 for aberta pela primeira vez**. Se o catálogo tiver sido alterado entre o deploy da v5.9 e o da v5.9.1, esse desvio já ocorreu e não é recuperável pelo app. A **conferência de integridade** (v5.9.2) detecta o estrago, mas não o desfaz |

---

## 10. Resumo executivo

As três entregas da fase 2 e o fechamento da v5.9.1 atacaram os três riscos de
durabilidade de dados que este documento apontava como os mais graves: **não havia
backup**, **mudanças de schema apagavam dados em silêncio** e **o painel admin podia
alterar retroativamente orçamentos já fechados**. Os três estão resolvidos, com testes
que verificam que nenhum total mudou na migração.

A v5.9.2 fecha a fase: a suíte de testes passou a ser versionada em `testes/`
(166 asserções, `node testes\run.js`) e a aba Configurações ganhou a **conferência de
integridade**, que detecta orçamento cujo valor tenha mudado por trás — o único
caminho para achar estrago anterior à v5.9, que o app não desfaz sozinho.

O que sobra é de outra natureza: acabamento de UX (14 bugs de baixa gravidade), código
morto da v4.x, e duas lacunas estruturais — **não existe proposta para o cliente**
(o único PDF é interno) e **a suíte não roda em CI**, dependendo de disciplina manual.
