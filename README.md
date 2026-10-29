# Análise PNR

- **Análise PNR** (aba 1): LOGISTICS_PNR + SRM BSC, gráficos e prints.
- **Análise Forms** (aba 2): suba o Forms baixado em .ods (ou .xlsx/.csv). Junta por ID, conta recusas, filtra por regional e tem a opção "Abrir Logistic" em duas versões: **Normal** (copia o ID do pacote e abre https://envios.adminml.com/logistics/case-center/cases) e **Anônimo** (copia o link; o navegador não deixa o site abrir janela anônima sozinho, então é só abrir uma com Ctrl+Shift+N e colar).

Regionais (pelo prefixo da base): MG = EMG/SMG · ES = ES/SES/EES/EBA · BA = SBA · RJ = ERJ/SRJ · SP = SSP.
Para mudar, edite a lista `REGIONAIS` no topo de `forms.js`.

Na aba Forms cada pacote tem um seletor de status (RECUSADA, ANEXADA, ANULADA, FATURADA, EM ANÁLISE (sai como "EM ANÁLISE" no Forms)) e, se for recusada, um campo para escrever o motivo da recusa. O botão **BAIXAR FORMS** abre uma janela com **Hoje** / **Escolher data** e baixa (.xlsx) ou copia (para colar no Forms) todas as respostas daquele dia, com as mesmas colunas do Forms e com as marcações feitas aqui. A coluna Evidência mostra um botão 📷 que abre a foto do Drive.

O ⧉ ao lado do ID copia só o ID; o botão "Copiar ID, base e focal" (abaixo da focal) copia "ID - BASE - FOCAL". O 📷 abre a foto direto no Drive. O motivo aparece resumido (ex.: "CLIENTE RECEBEU").

Regionais: clique para marcar várias (ou "Todas"). 📷/📋 Print gera a imagem da lista atual. Abaixo do status há o seletor de Validador (LUIZA FRANÇA, KETHELLY, EDUARDA CARVALHO, VITÓRIA), que também sai no BAIXAR FORMS.

O **validador do Forms tem prioridade**: ao baixar/subir o Forms de novo, se a resposta traz um validador diferente do que estava lá quando você alterou aqui (ex.: outra pessoa assumiu), vale o nome que está no Forms. Nomes que não estão na lista fixa aparecem normalmente no seletor.

**Filtro de Validador** (aba Forms): abaixo das regionais, clique no seu nome (pode marcar mais de um) para ver só os pacotes em que você é o validador, junto com a situação e a regional escolhidas. "Todos" limpa o filtro e "(sem validador)" mostra os que ainda não têm ninguém. A escolha fica salva no navegador.

**BAIXAR FORMS por período**: em "Escolher período" você define **De** (data + hora cheia, ex.: 18:00) e **Até** (data + hora, vai até o minuto 59, ex.: 12:59). Serve para o Forms que chega à noite e só é lançado no dia seguinte (ex.: de ontem 18:00 até hoje 12:59). "Hoje" pega o dia inteiro. **Incluir alteradas por mim no período (de outros dias)** (marcado por padrão) leva para o arquivo os pacotes de outra data que você alterou aqui *dentro do período escolhido* (a linha segue com o carimbo original do Forms). Alterações antigas (feitas antes do período) não voltam mais — por isso um caso velho, como um EMG39 que você marcou semanas atrás, deixa de aparecer; desmarque para baixar só o que tem carimbo dentro do período. Alterações salvas antes desta correção não têm data registrada e só voltam a entrar se você mexer no pacote de novo.
