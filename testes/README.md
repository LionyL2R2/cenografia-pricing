# Testes

Suíte de regressão do `index.html`. Sem framework, sem `package.json`, sem
dependências: só o módulo `vm` que já vem com o Node.

O `harness.js` carrega o JavaScript **real** do `index.html` dentro de um DOM falso
e devolve as funções do app para o teste chamar. Não há cópia da lógica em lugar
nenhum — se o `index.html` quebrar, a suíte quebra junto.

## Como rodar

No PowerShell, a partir da raiz do projeto:

```powershell
node testes\run.js
```

Saída esperada:

```
t1.js     20 PASS   0 FALHA   schema versionado e preservação de campos desconhecidos (v5.7)
t2.js     33 PASS   0 FALHA   backup, quota e fuso horário (v5.8)
t3.js     44 PASS   0 FALHA   orçamentos auto-contidos (v5.9)
t4.js     38 PASS   0 FALHA   migração eager e item sem preço (v5.9.1)
t5.js     31 PASS   0 FALHA   conferência de integridade (v5.9.2)
t6.js     68 PASS   0 FALHA   dados da empresa no PDF e migração legada de responsavel (v5.10)
------------------------------------------------------------
TOTAL: 235 PASS / 0 FALHA em 6 suítes
```

O runner sai com código **1** se qualquer asserção falhar, e imprime as linhas
`FALHA` de cada suíte quebrada.

Para rodar uma suíte isolada, com a saída completa:

```powershell
node testes\t3.js
```

Requisito: Node 18 ou mais novo (`node --version`). Nada mais precisa ser instalado.

## No CI

`.github/workflows/testes.yml` roda a mesma suíte no GitHub Actions a cada push e
pull request para `main`, com Node 20. Sem `npm install` e sem cache — não há nada
para instalar. O badge de status fica no topo do `README.md` da raiz.

O CI roda em **UTC**. Por isso `t2.js` fixa `process.env.TZ = 'America/Sao_Paulo'`
antes de criar qualquer `Date`: o bug de fuso que ele cobre (`hoje()` usando
`toISOString()`, que adiantava o dia depois das 21h no Brasil) é **invisível** num
ambiente em UTC, onde local e UTC coincidem. Há uma asserção-guarda que falha alto
se o Node parar de respeitar `TZ` em runtime, para o teste não virar um falso PASS.
A suíte passa igual em qualquer fuso — verificada em UTC, America/Sao_Paulo e
Asia/Tokyo.

## Regra de entrega

**Toda entrega roda `node testes\run.js` antes do commit.** Commit só sai com
`0 FALHA`. Mudou comportamento? A suíte que cobre aquele comportamento é atualizada
no mesmo commit — teste que some junto com o bug não protege ninguém.

Mudança que altera o valor de um orçamento existente precisa de uma asserção que
compare o total **antes e depois**, como as de `t3.js` e `t4.js`. É a única
verificação que impede o app de mudar silenciosamente o preço de um orçamento já
fechado, que é o pior defeito possível neste projeto.

## O que cada suíte cobre

### `t1.js` — schema versionado (v5.7)

- `APP_VERSION` e `SCHEMA_VERSION` presentes; `novoEstado()` carimba a versão.
- Orçamento sem `schemaVersion` é tratado como schema 1 e migrado até a versão
  corrente, sem alterar custo, preço nem metadados.
- `normalizarNovo()` **preserva** o que não reconhece em `_legacy`: setor renomeado,
  campo solto, chave desconhecida dentro de `maoObra`/`logistica`, lista que veio
  com tipo inesperado. `_legacy` sobrevive ao round-trip salvar/carregar.
- Registro gravado por schema **mais novo** que o app não é destruído.
- Formato legado v3/v4 (tabela plana) vira linhas de materiais preservando o total.

### `t2.js` — backup, quota e fuso (v5.8)

- `hoje()` usa data local, não UTC — inclui um caso às 23h30 no fuso do Brasil, em
  que o UTC já virou o dia e o local não.
- `lsSet` devolve `true`/`false` e não engole a exceção quando a quota estoura.
- Export gera as 7 chaves de dados, com `app`, `appVersion`, `schemaVersion` e data,
  e o nome de arquivo `cenografia-backup-aaaa-mm-dd.json`.
- Resumo do backup conta orçamentos, itens prontos, opções, rascunho e nomes.
- Validação rejeita: não-objeto, `null`, array, backup de outro app, arquivo sem o
  bloco `dados`, `dados` sem nenhuma chave conhecida, lista de orçamentos corrompida.
- Import substitui tudo: chave ausente no arquivo é **removida**, não mantida.

### `t3.js` — orçamentos auto-contidos (v5.9)

- **Migração 2→3 não altera o total**, linha a linha, cobrindo: unidade normal,
  linha sem unidade gravada (formato v5.1), linha cuja unidade discorda do catálogo,
  item que não está mais no catálogo, e linha de texto livre.
- Unidade é congelada na linha com exatamente a regra que o schema 2 usava.
- Depois de migrado: trocar unidade e preço de **todo** o catálogo, ou apagar o item
  do catálogo, não muda o total de nenhum orçamento salvo.
- Aviso de divergência de preço aparece só quando o catálogo mudou, o valor da linha
  não muda sozinho, e `usarPrecoCatalogo` só age quando chamado.
- Escolher um item do catálogo copia nome, unidade e preço para a linha.
- Dropdowns: texto fora da lista global vira opção própria da linha, em vez de
  jogá-la no modo "Outros".
- `coletarOpcoes` não cria duplicata por diferença de caixa ("madeira"/"Madeira").

### `t4.js` — migração eager e item sem preço (v5.9.1)

- Varredura eager roda no boot, grava `cen_v3_backup_pre_mig3` byte a byte antes de
  tocar em qualquer coisa, e marca `cen_v3_mig3` no fim.
- **O teste de total roda sobre a varredura completa**: 10 orçamentos, comparando
  cada total contra o valor calculado pela regra do schema 2 com o catálogo original.
  Depois troca o catálogo inteiro e confere que nada mudou.
- Registro v3/v4 é pulado e preservado intacto; `snapshot` e `materiais` sobrevivem.
- Registro que **mente** sobre o `schemaVersion` (diz v3 mas as linhas não têm
  `precoRef`) é detectado por `versaoRealDe()` e remigrado.
- Rollback: falha de gravação no meio restaura o backup byte a byte e **não** marca
  a flag, para tentar de novo no próximo boot.
- Import roda as migrações no conteúdo importado, ignorando o `schemaVersion`
  declarado no cabeçalho do arquivo.
- Item de catálogo sem preço: não herda o preço do item escolhido antes, não grava
  zero, exibe "sem preço no catálogo", e o aviso some quando o usuário preenche.

### `t5.js` — conferência de integridade (v5.9.2)

- Compara `snapshot.total` com o total recalculado pelas regras atuais.
- Tolerância: R$ 0,01 exato **não** é divergência; R$ 0,02 é.
- Detecta o caso de preço herdado e mostra item, unidade e `valorUnit` da linha.
- Observação por linha: sem preço, fora do catálogo, catálogo sem preço, valor
  difere do catálogo, unidade difere do catálogo.
- Orçamento sem `snapshot.total` fica como "sem referência", não como divergente.
- Divergências vêm primeiro na ordenação.
- **A conferência não altera nada** — verificado comparando o `localStorage` antes
  e depois.
- Export em CSV: nome com data, cabeçalho, marcação `DIVERGENTE`, linhas de item
  pronto do divergente e a versão do app no rodapé.

### `t6.js` — dados da empresa no PDF e migração legada de responsavel (v5.10)

- `blocoEmpresa()` com todos os campos: nome em destaque, razão social, `CNPJ/CPF`,
  telefone e e-mail na mesma linha, cidade.
- Com só o nome: o bloco de detalhe **nem é criado**.
- Sem nenhum campo (`{}`, `undefined`, `null`, tudo em branco, só espaços): cai no
  nome padrão, sem bloco de detalhe.
- **Nenhum rótulo sem valor e nenhum `<div>` vazio**, em qualquer combinação parcial —
  inclusive só telefone ou só e-mail, que não podem deixar o `·` órfão.
- Escape de HTML no nome e na razão social.
- O PDF inteiro (`imprimir()`), capturando o `innerHTML` do `printArea`, nos três
  cenários; e o resto do relatório continua saindo quando o config está vazio.
- `normConfig()` sobre config gravado antes da v5.10: ganha `razaoSocial: ''`, preserva
  o resto, sobrevive a valor corrompido e força string.
- Round-trip do modal: `abrirConfig()` preenche o input, `salvarConfig()` persiste os
  seis campos em `cen_v3_config`, e o valor salvo chega ao PDF.
- Ramo legado de `migrar()`: `meta.responsavel` preservado (era descartado), junto de
  `nome`, `num`, `cliente` e `obs`, com o total intacto — e o nome chega ao PDF.

## Como escrever uma suíte nova

```js
/* Suíte 7 — descrição curta (versão). */
const criar = require('./harness');
let falhas = 0;
const ok = (nome, cond, extra) => {
  console.log((cond ? 'PASS  ' : 'FALHA ') + nome + (cond ? '' : '  -> ' + JSON.stringify(extra)));
  if (!cond) falhas++;
};

// o seed é gravado no localStorage ANTES do script do app rodar,
// o que permite testar o boot (migração eager, onboarding, etc.)
const { ctx, K, V, store } = criar({ cen_v3_seen: true, cen_v3_mig3: true });

ok('descrição da asserção', ctx.algumaFuncao() === esperado);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
```

O runner descobre sozinho qualquer arquivo `t<número>.js` — não precisa registrar
em lugar nenhum. A descrição na barra do runner sai do texto após o travessão na
primeira linha do arquivo.

### O que o harness devolve

| | |
|---|---|
| `ctx` | funções do app — só declarações `function` viram propriedade do contexto |
| `K` | constantes de topo: `APP_VERSION`, `SCHEMA_VERSION`, `LS`, `LS_INT`, `TRIB`… |
| `V` | getters/setters das variáveis `let` de topo: `state`, `itensCustom`, `opcoesCustom`, `config`, `ultimaConferencia` |
| `store` | o `Map` por trás do localStorage falso, para inspeção direta |

Nem `const` nem `let` de topo viram propriedade do contexto de um script `vm` — só
`function` e `var`. Por isso `K` e `V` existem: sem eles, `ctx.APP_VERSION` seria
`undefined` e o teste passaria comparando `undefined` com `undefined`.

O harness devolve `undefined` para qualquer nome desconhecido, **exceto** os que têm
formato de id do app (`p_nome`, `f_imposto`, `tr_frete`…), que viram elementos DOM
falsos. Isso é de propósito: um erro de digitação no nome de uma função aparece como
`TypeError`, em vez de passar despercebido.
