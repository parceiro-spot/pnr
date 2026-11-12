# Extensão Análise Forms — Avisos Flutuantes

Esta extensão mostra uma bolinha **PNR sobre qualquer página web normal do Chrome/Edge**, não apenas no Análise Forms. Quando a página Análise Forms está aberta, ela exibe todos os pacotes que continuam **A VALIDAR**, novos ou não, e mantém a fila sincronizada.

## Instalação no Chrome ou Edge

1. Abra `chrome://extensions` no Chrome ou `edge://extensions` no Edge.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** / **Load unpacked**.
4. Selecione esta pasta `extension`.
5. Abra ou atualize a página do Análise Forms.
6. Para a bolinha aparecer em abas que já estavam abertas, recarregue cada aba uma vez (`Ctrl+R`). Em novas abas ela aparece automaticamente.

Se o navegador mostrar a opção **Acesso ao site**, selecione **Em todos os sites**. A versão atual também tenta injetar a bolinha nas abas web que já estavam abertas quando a extensão foi instalada ou atualizada.

O botão **FORMS** ficará no canto inferior direito inclusive quando você estiver no Logistic, Google ou em outra página web. No Análise Forms, clique em **Atualizar Forms Ao Vivo** normalmente; a extensão não faz consultas automáticas.

O Chrome/Edge não permite extensões sobre páginas internas como `chrome://extensions`, `edge://extensions`, a Chrome Web Store ou algumas páginas de PDF. Isso é uma limitação de segurança do navegador; em sites com endereço começando por `http://` ou `https://`, a bolinha funciona.

Na primeira vez, clique em **Ativar aviso do navegador** na janela da bolinha ou permita as notificações do navegador. O botão **Visualizar** volta para a aba que originou o aviso e abre o pacote pelo ID.

## Janela e opções

Ao clicar na bolinha, a extensão abre uma janela menor na própria página atual, sem trocar para o Análise Forms. Clique em **Visualizar** para ver os dados do envio. A janela pode ser aumentada ou reduzida arrastando o canto inferior direito.

No botão **⚙ Configurar** da janela, ou clicando no ícone da extensão na barra do navegador, é possível desligar separadamente o **Botão flutuante**, a **Janela flutuante** e a **Notificação normal do navegador**. Se o botão flutuante for desligado, as opções continuam acessíveis pelo ícone da extensão.

Na janela, os pacotes **A VALIDAR** têm prioridade e aparecem mesmo se não forem novos. Cada pacote mostra a base e o validador, e inclui copiar ID, foto, escolha de validador e status, **Validar no Forms** para abrir a linha no dash completo e **✕** para ocultar. As escolhas de status/validador são salvas no mesmo armazenamento das edições do dashboard.

A janela também tem **↻ Atualizar**, que aciona o mesmo botão manual do Análise Forms, sem criar atualização automática. Use **Ctrl+clique** para selecionar IDs e depois **Ctrl+C** ou **⧉ Copiar selecionados** para copiar uma ID por linha.

Quando a resposta tiver evidência vinculada, aparece **📷 Foto**. No detalhe do pacote também ficam os links **Ver foto**, que abrem a evidência em uma nova aba.
