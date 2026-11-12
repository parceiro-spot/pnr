# WhatsApp — Avisos de Recebimento

Extensão independente do Análise Forms. Ela funciona somente no **WhatsApp Web** e avisa quando uma mensagem recebida de um cliente contém confirmações como:

- `recebi`
- `eu recebi`
- `recebi o produto`
- `recebi o pedido`
- `produto recebido`
- `pedido recebido`
- `recebimento confirmado`

Mensagens enviadas por você são ignoradas. A primeira carga da conversa é usada como base para não notificar mensagens antigas; somente mensagens novas que chegarem depois são avaliadas.

## Instalação

1. Abra `chrome://extensions` ou `edge://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione somente esta pasta `whatsapp-recebimento`.
5. Abra ou recarregue `https://web.whatsapp.com/`.
6. No WhatsApp Web, o botão flutuante verde **RECEBIMENTO** aparece logo acima do PNR. Clique nele para ajustar a captação, as notificações, o som e a visibilidade do botão.
7. Se ocultar o botão flutuante, reative-o pelo ícone da extensão na barra do navegador (popup **WhatsApp — Recebimento**).

A extensão não envia mensagens, não responde clientes e não usa uma API externa. Ela apenas identifica texto que já foi renderizado no WhatsApp Web aberto no navegador. Mudanças futuras na interface do WhatsApp podem exigir ajuste no detector.
