# cenografia-pricing

App de formação de preço para projetos de cenografia. O orçamento é montado por
setores (materiais, impressão, estrutura, mão de obra, logística), o preço de venda
sai por gross-up sobre o custo, e o resultado pode ser exportado como relatório
interno em PDF ou CSV.

Cliente: Silvio, fornecedor da KMF Eventos.
Em produção: https://cenografia-pricing.vercel.app (deploy automático no push para `main`).

## Stack

- Single-file HTML (`index.html`) — sem backend, sem build step, sem dependências, sem framework.
- Persistência local via `localStorage` do navegador.
- Versão atual: **v5.9.2** · schema de dados **3** (exibidos no rodapé do app e do PDF).

A regra de arquivo único vale para o **app**. Os testes ficam em `testes/`.

## Como rodar local

Abra o `index.html` em qualquer navegador moderno. Só isso.

## Testes

```powershell
node testes\run.js
```

Suíte de regressão que carrega o JavaScript real do `index.html` num DOM falso —
sem framework, sem `package.json`, só o módulo `vm` do Node. **Toda entrega roda a
suíte antes do commit.** Detalhes e cobertura em [`testes/README.md`](testes/README.md).

## Modelo de dados

Um orçamento é um objeto com sete setores. Cada setor é uma lista de linhas, exceto
montagem/desmontagem e transporte, que são campos fixos.

| Setor | Campos da linha | Total da linha |
|---|---|---|
| `itensProntos` | `item, unidade, qtd, largura, altura, valorUnit, precoRef` | m²: `largura×altura×qtd×valorUnit` · peça: `qtd×valorUnit` |
| `materiais` | `desc, unidade, qtd, valorUnit` | `qtd × valorUnit` |
| `impressao` | `desc, largura, altura, qtd, valorM2` | `largura×altura × qtd × valorM2` |
| `estrutura` | `desc, unidade, qtd, valorUnit` | `qtd × valorUnit` |
| `maoObra.producao` | `funcao, diarias, valorDiaria` | `diarias × valorDiaria` |
| `maoObra.montagem` | 4 campos fixos | `diárias × valor`, montagem + desmontagem |
| `logistica.transporte` | 7 campos fixos | soma dos campos |
| `logistica.locacoes` | `equipamento, qtd, dias, valorDia` | `qtd × dias × valorDia` |

Custo total = soma dos setores.

## Formação de preço

```
preço  = custo / (1 − imposto% − margem%)
imposto = preço × imposto%
lucro   = preço × margem%
```

Imposto e margem incidem sobre o **preço de venda**, não sobre o custo (gross-up).
Se `imposto% + margem% ≥ 100%` não existe preço possível: o app trava o preço em
R$ 0,00 e exibe um aviso.

## Regras tributárias

As alíquotas ficam no objeto **`TRIB`**, no topo do `<script>` de `index.html`:

```js
const TRIB = { servico: 18.33, locacao: 13.33 };   // Lucro Presumido, em pontos percentuais
```

Os dois botões em *Parâmetros financeiros* apenas **pré-preenchem** esse percentual —
o campo é sempre editável, porque a alíquota efetiva varia com o porte do projeto
(adicional de IR). Para ajustar uma alíquota, edite `TRIB` diretamente.

Existe um segundo objeto, `LEG_TAX` (`servico: 0.1633`, `locacao: 0.1133`), usado
**exclusivamente** para recalcular orçamentos das versões 3.x/4.x na migração. Ele
preserva o cálculo histórico daqueles orçamentos e **não deve ser sincronizado** com
`TRIB` — são coisas diferentes de propósito.

> Versões anteriores documentavam um objeto `TAX_RULES`. Ele não existe desde a v4.x.

## Schema versionado

Todo orçamento gravado carrega `schemaVersion`. Registros sem o campo são tratados
como schema 1.

| Schema | Introduzido em | O que mudou |
|---|---|---|
| 1 | — | formato por setores original (v5.0–v5.6) |
| 2 | v5.7 | carimbo da versão; nenhum dado alterado |
| 3 | v5.9 | linha de item pronto passa a ser auto-contida |

As migrações vivem no objeto `migrations`, uma função por versão, encadeadas até
`SCHEMA_VERSION`. Rodam na leitura de qualquer orçamento e também numa **varredura
eager no boot** (ver abaixo).

Regras que valem para qualquer mudança futura de schema:

- `normalizarNovo()` **não descarta** campos que não reconhece — setores renomeados,
  chaves soltas e listas com tipo inesperado vão para `state._legacy[caminho]` com um
  `console.warn`. Nada é perdido em silêncio.
- Um orçamento gravado por um schema **mais novo** que o app é usado como está, com aviso.
- O `schemaVersion` declarado não é confiável por si só: `versaoRealDe()` confere se o
  registro tem as marcas que aquela versão deveria ter escrito e remigra se não tiver.

### Migração eager (v5.9.1)

A migração 2→3 resolve a unidade de cada item pronto **consultando o catálogo**. Se
rodasse só na leitura, congelaria o catálogo do dia em que cada orçamento fosse aberto —
e uma mudança no catálogo antes disso alteraria o total. Por isso, no boot:

1. se a flag `cen_v3_mig3` não existe, o conteúdo original de `cen_v3_budgets` e
   `cen_v3_auto` é gravado em `cen_v3_backup_pre_mig3`;
2. todos os orçamentos são migrados e regravados;
3. a flag é marcada.

Se qualquer gravação falhar, o backup é restaurado byte a byte e a flag **não** é
marcada — a varredura tenta de novo no próximo boot.

## Catálogo de itens prontos

`cen_v3_itens` guarda `{nome, unidade, preco}`. Ao escolher um item numa linha, os três
valores são **copiados para dentro da linha**. A partir daí o cálculo nunca mais
consulta o catálogo: mexer no catálogo não altera nenhum orçamento existente.

- `precoRef` guarda o preço que o catálogo tinha quando a linha foi montada. Se o
  catálogo mudar depois, a linha mostra um aviso discreto com o preço novo e um botão
  **usar**. Nunca atualiza sozinho.
- Item do catálogo **sem preço** deixa o campo em branco e a linha avisa
  *"sem preço no catálogo"*. Zero nunca é gravado como se fosse preço real, e no PDF
  a linha sai como `— sem preço`, não como R$ 0,00.

O painel admin (aba **Configurações**) gerencia o catálogo e as listas de descrição
dos dropdowns. Mudanças ali valem só para os próximos orçamentos.

## Conferência de integridade

**Configurações → Conferir integridade** recalcula cada orçamento salvo com as regras
atuais e compara com o `snapshot.total` congelado no momento do salvamento. Mostra
nome, data, total gravado, total recalculado e a diferença em R$ e %, destacando em
vermelho qualquer divergência acima de R$ 0,01. Para os divergentes, abre o detalhe
das linhas de item pronto (item, unidade, valor unitário) com uma observação por
linha — *fora do catálogo*, *catálogo sem preço*, *difere do catálogo (R$ X)* — que
identifica o caso de preço herdado. Exporta em CSV.

É **só diagnóstico**: nada é corrigido automaticamente. Serve para achar orçamento
cujo valor tenha mudado por trás antes de a auto-contenção (v5.9) e a varredura eager
(v5.9.1) passarem a impedir isso.

## Backup

Não há backend: os dados vivem no `localStorage` de um navegador. **Configurações →
Backup dos dados** exporta um `.json` com as sete chaves de dados, a versão do app e a
data. O import valida o arquivo, mostra um resumo (quantos orçamentos, quais nomes,
itens prontos, versão) e exige confirmação — ele **substitui tudo**. O conteúdo
importado passa pelas migrações independentemente do que o cabeçalho do arquivo declara.

## Chaves do localStorage

Dados do usuário (entram no backup):

| Chave | Conteúdo |
|---|---|
| `cen_v3_auto` | rascunho atual (autosave, debounce 350 ms) |
| `cen_v3_budgets` | orçamentos salvos, `{ [id]: orçamento + snapshot }` |
| `cen_v3_config` | dados da empresa ("Meus dados") |
| `cen_v3_seen` | onboarding já visto |
| `cen_v3_opcoes` | listas de descrição dos dropdowns |
| `cen_v3_itens` | catálogo de itens prontos |
| `cen_v3_opcseed` | flag de semeadura das listas base |

Controle interno (ficam **fora** do backup de propósito):

| Chave | Conteúdo |
|---|---|
| `cen_v3_mig3` | varredura eager de schema 3 já rodou |
| `cen_v3_backup_pre_mig3` | cópia byte-exata de `budgets`/`auto` antes da varredura |

O prefixo `cen_v3_` é histórico e **não deve ser renomeado**: mudar o prefixo apaga
todos os dados do usuário, sem recuperação.

## Documentação

`ESTADO-ATUAL.md` tem o mapeamento detalhado do app: telas, modelo de dados, lógica
tributária, painel admin, geração de relatórios, bugs abertos e pontos frágeis.
