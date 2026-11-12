# WhatsApp — Recebimento

Extensão do WhatsApp Web que identifica respostas de cliente como `recebi`, `recebi o produto`, `recebi o pedido`, `produto recebido` e `recebimento confirmado`. Mensagens enviadas por você são ignoradas.

## Instalação e autorização da sincronização

1. Abra `chrome://extensions` ou `edge://extensions` e ative o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha a pasta `whatsapp-recebimento`.
3. Abra ou recarregue `https://web.whatsapp.com/`.
4. Clique no ícone da extensão WhatsApp na barra do navegador. No popup, informe a URL do dashboard e escolha **Salvar link e ativar sincronização**.
5. Autorize o acesso solicitado para o domínio informado. A permissão é específica a esse domínio; sem ela, a extensão não consegue inserir as confirmações no dashboard.
6. Recarregue a aba do WhatsApp Web. O botão verde **RECEBIMENTO** fica acima do botão **FORMS** e abre diretamente a aba Análise Recebimento.

## O que aparece na tabela

Uma confirmação detectada é salva automaticamente na tabela da Análise Recebimento com o nome do contato, o ID de 11 dígitos quando localizado na mensagem enviada no mesmo chat, o texto de confirmação e status **A VALIDAR**. Se não localizar o ID, a linha ainda é adicionada com o campo ID vazio para completar/editar no dashboard. A confirmação também fica numa fila local da extensão até ser confirmada como salva no dashboard.

Ao atualizar a extensão, ela ignora conversas antigas, mas tenta recuperar mensagens de confirmação dos últimos 20 minutos. Para mensagens mais antigas, use a aba Recebimento para registrar os dados manualmente.

A extensão não envia mensagens, não responde clientes e não usa uma API externa. Ela observa apenas o conteúdo que já aparece no WhatsApp Web aberto no navegador. Mudanças futuras na interface do WhatsApp podem exigir ajuste no detector.
