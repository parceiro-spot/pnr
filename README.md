# VITORIA SPOT

Site estático pronto para publicação no GitHub Pages.

## Como usar

- Abra `index.html` para acessar a tela inicial.
- A página inicial direciona para `original/index.html` e `dashboard/index.html`.
- O projeto usa HTML, CSS e JavaScript; não há código Java neste pacote.

## Publicar no GitHub Pages

1. Extraia este ZIP.
2. Envie o conteúdo da pasta `vitoria-spot-site` para um repositório.
3. Nas configurações do repositório, ative o GitHub Pages usando a branch principal e a pasta raiz.

## Situação: dropdown e integração com o dashboard

A lista suspensa da planilha é gerada a partir das mesmas 13 opções coloridas do dashboard. O importador reconhece cabeçalhos iniciados por `Situação`, `Situation`, `Status` ou `Fila` (por exemplo, `Situação (lista clicável)` e `Fila atual`). Se houver mais de uma dessas colunas, prioriza `Situação`/`Status` em vez de `Fila`. Depois de editar a planilha no Excel/OneDrive, importe o arquivo no dashboard por **Anexar planilha de retorno** e confirme com **OK**; não há sincronização automática do OneDrive para o dashboard.

## Aba Análise Base (corrigida)

A aba estava em branco porque o `index.html` não tinha a lógica nem o CSS dessa aba (ela existia só no `script.js`, que a página não carrega). Agora tudo está dentro do `index.html`: filtro por regional e base, calendário De/Até, atalhos de 3/6/12 meses, resumo por mês e, ao clicar no mês, o valor de cada dia. Os dados vêm das planilhas já importadas (arquivos antigos salvos no navegador).

## Regra de Valor Revertido

O arquivo executado pelo dashboard é o `index.html`. O `script.js` mantido na pasta é legado e não é carregado por esta página. A configuração oficial do prazo fica diretamente no JavaScript do dashboard (`index.html`): na aba **Valor Revertido**, o valor é calculado pacote a pacote: pacote que desaparece até 48 horas entra como **Valor revertido**; pacote que continua presente após 48 horas entra como **Valor não revertido/ofensor**. O **Valor atual** mostra o total real atual. A aba **Pacote Revertido** usa a mesma regra própria de 48 horas.
