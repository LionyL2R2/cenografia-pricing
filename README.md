# cenografia-pricing

App de formação de preço para projetos de cenografia. Monta a cotação item a item, aplica impostos por tipo de nota fiscal (regime Lucro Presumido), gera proposta em PDF e mantém um catálogo de itens.

Cliente: Silvio, fornecedor da KMF Eventos.

## Stack

- Single-file HTML (`index.html`) — sem backend, sem build step, sem dependências.
- Persistência local via `localStorage` do navegador.

## Como rodar local

Abra o `index.html` em qualquer navegador moderno. Só isso.

## Regras tributárias

As alíquotas vivem no objeto `TAX_RULES`, no topo do `<script>` de `index.html`. Cada tipo de nota tem seus componentes de imposto; o total é somado automaticamente a partir deles. Para ajustar uma alíquota ou adicionar um tipo de nota, edite esse objeto diretamente.
