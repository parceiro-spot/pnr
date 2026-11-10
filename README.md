# Análise PNR

- **Análise PNR** (aba 1): LOGISTICS_PNR + SRM BSC, gráficos e prints.
- **Análise Forms** (aba 2): suba o Forms baixado em .ods (ou .xlsx/.csv). Junta por ID, conta recusas, filtra por regional e tem a opção "Abrir Logistic" em duas versões: **Normal** (copia o ID do pacote e abre https://envios.adminml.com/logistics/case-center/cases) e **Anônimo** (copia o link; o navegador não deixa o site abrir janela anônima sozinho, então é só abrir uma com Ctrl+Shift+N e colar).

Regionais (pelo prefixo da base): MG = EMG/SMG · ES = ES/SES/EES/EBA · BA = SBA · RJ = ERJ/SRJ · SP = SSP.
Para mudar, edite a lista `REGIONAIS` no topo de `forms.js`.

Na aba Forms cada pacote tem um seletor de status (RECUSADA, ANEXADA, ANULADA, FATURADA, EM ANÁLISE (sai como "EM ANÁLISE" no Forms)) e, se for recusada, um campo para escrever o motivo da recusa. O botão **BAIXAR FORMS** abre uma janela com **Hoje** / **Escolher data** e baixa (.xlsx) ou copia (para colar no Forms) todas as respostas daquele dia, com as mesmas colunas do Forms e com as marcações feitas aqui. A coluna Evidência mostra um botão 📷 que abre a foto do Drive.

O ⧉ ao lado do ID copia só o ID; o botão "Copiar mensagem ID, base e focal" copia `🚨 ID: ID - BASE - FOCAL` e, na linha seguinte, `Por favor, reenviar evidência.` O 📷 abre a foto direto no Drive. O motivo aparece resumido (ex.: "CLIENTE RECEBEU").

Regionais: clique para marcar várias (ou "Todas"). 📷/📋 Print gera a imagem da lista atual. Abaixo do status há o seletor de Validador (LUIZA FRANÇA, KETHELLY, EDUARDA CARVALHO, VITÓRIA), que também sai no BAIXAR FORMS.

O **validador do Forms tem prioridade**: ao baixar/subir o Forms de novo, se a resposta traz um validador diferente do que estava lá quando você alterou aqui (ex.: outra pessoa assumiu), vale o nome que está no Forms. Nomes que não estão na lista fixa aparecem normalmente no seletor.

**Filtro de Validador** (aba Forms): abaixo das regionais, clique no seu nome (pode marcar mais de um) para ver só os pacotes em que você é o validador, junto com a situação e a regional escolhidas. "Todos" limpa o filtro e "(sem validador)" mostra os que ainda não têm ninguém. A escolha fica salva no navegador.

**BAIXAR FORMS por período**: em "Escolher período" você define **De** (data + hora cheia, ex.: 18:00) e **Até** (data + hora, vai até o minuto 59, ex.: 12:59). Serve para o Forms que chega à noite e só é lançado no dia seguinte (ex.: de ontem 18:00 até hoje 12:59). "Hoje" pega o dia inteiro. **Incluir alteradas por mim no período (de outros dias)** (marcado por padrão) leva para o arquivo os pacotes de outra data que você alterou aqui *dentro do período escolhido* (a linha segue com o carimbo original do Forms). Alterações antigas (feitas antes do período) não voltam mais — por isso um caso velho, como um EMG39 que você marcou semanas atrás, deixa de aparecer; desmarque para baixar só o que tem carimbo dentro do período. Alterações salvas antes desta correção não têm data registrada e só voltam a entrar se você mexer no pacote de novo.

**Novidades (nov/2026)**
- O Forms fica salvo no navegador (IndexedDB, sem o limite de ~5 MB do localStorage). Ao abrir, a Análise Forms já mostra a lista; a caixa de anexar fica pequena e só precisa ser usada quando houver informações novas.
- **Copiar selecionadas para o Forms** (e Ctrl+C) e **BAIXAR FORMS → Copiar** agora copiam a partir da coluna **VALIDADOR** (sem o carimbo). Cole na célula VALIDADOR da primeira linha vazia. O .xlsx continua com o carimbo completo.
- As mensagens da aba **Mensagem Logistic** aparecem como botões em cada linha da lista; um clique copia a mensagem (no lugar do seletor antigo).
- Qualquer clique na linha (copiar ID, mensagem, Abrir Logistic, histórico…) primeiro executa a ação e só depois abre o pacote centralizado (TRATANDO). Em status/validador, abre ao escolher a opção.

**Correção (cópia para o Forms)**: ao selecionar pacotes (Ctrl+clique) e copiar (Ctrl+C ou "Copiar selecionadas para o Forms"), sai **uma linha por pacote, sempre o envio ATUAL** (a evidência mais recente), nunca o histórico. 1 pacote selecionado = 1 linha; vários = várias linhas, uma embaixo da outra, em ordem cronológica, a partir da coluna VALIDADOR, prontas para colar no Forms.

**✕ ao lado do ID**: só **oculta** o pacote. Ele some da lista e **não entra** na cópia para o Forms nem no BAIXAR FORMS, mas continua na análise (recusas, histórico e as alterações de status/validador que você fez ficam guardadas). Se chegar um envio **novo** desse ID, ele volta sozinho para a lista. O botão **👁 Mostrar ocultos (N)** traz todos de volta.

**Status novos e cores**: qualquer status que aparecer na coluna STATUS DA EVIDÊNCIA do arquivo vira sozinho uma aba, uma opção no seletor de cada pacote e ganha uma cor. O arquivo baixado do Forms (.ods/.xlsx) não leva a cor dos chips da planilha, então a cor se escolhe no botão **🎨 Status e cores** (também dá para criar um status novo ali). As escolhas ficam salvas no navegador.


**Atualização do PNR (nov/2026)**
- LOGISTICS_PNR e SRM BSC ficam salvos no navegador via IndexedDB e reaparecem automaticamente na tela inicial após F5 ou ao reabrir a página. A caixa informa o nome do arquivo e a quantidade de linhas salvas.
- As datas começam **ocultas por padrão** na Análise PNR e no detalhe de uma base. O botão **Mostrar datas na foto** ativa a exibição; quando ativadas, aparecem na tela e no PNG baixado ou copiado. Ao clicar novamente, voltam a ficar ocultas e acinzentadas.

**Ocultar data nos gráficos por data (nov/2026)**
- Os cards **Quantidade por data** e **Valor por data** têm o botão **Ocultar data**, que já vem **ATIVADO**: o gráfico **não aparece** no print (baixado ou copiado) e fica **meio transparente** na tela para mostrar que está de fora.
- Ao **desativar**, o gráfico volta ao normal na tela e entra no print, com as datas visíveis.
- Cada gráfico tem o seu botão, e a escolha fica salva no navegador. O botão "Mostrar datas na foto" do topo continua valendo para os textos de data (subtítulo e tabelas de detalhe), mas não controla mais os gráficos.

**Ajustes (nov/2026)**
- **Análise PNR**: a linha "Tipo · Data · casos · em aberto" saiu do topo. O título agora é específico: com o filtro XPT ou SVC aparece, por exemplo, **Com penalidade XPT**; em "XPT + SVC" fica só **Com penalidade**.
- **🎨 Status e cores** agora tem duas seções: **Status** e **Validadores** (cor por nome; aparece no seletor de validador, no histórico e numa bolinha no filtro de validador).
- **Descrição por status**: cada status tem a caixinha **Descrição**. Marcada, o pacote com aquele status ganha o campo de texto para escrever o motivo, igual ao RECUSADA (ex.: REENVIAR PRINT). Ao criar um status novo há a opção **Adicionar descrição**. O texto sai na coluna MOTIVO RESCUSA do BAIXAR FORMS, como na recusa.
- **📡 Forms ao vivo** (aba Análise Forms): o dash busca sozinho, a cada 30 segundos, a planilha de respostas publicada como CSV (Arquivo → Compartilhar → Publicar na web → aba de respostas → .csv) e junta só o que é novo, sem baixar/subir arquivo. Tem botões para desligar/ligar e "Atualizar agora", e o link pode ser trocado no campo. O Google demora alguns minutos para refletir novas respostas no CSV publicado. É só leitura: status, validador e descrição marcados aqui **não** voltam sozinhos para a planilha (continuam saindo por BAIXAR FORMS / cópia). Se você estiver digitando ou escolhendo algo numa linha, a atualização espera para não atrapalhar.
