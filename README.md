# Análise PNR

- **Análise PNR** (aba 1): LOGISTICS_PNR + SRM BSC, gráficos e prints.
- **Análise Forms** (aba 2): suba o Forms baixado em .ods (ou .xlsx/.csv). Junta por ID, conta recusas, filtra por regional e tem o botão "Abrir Logistic", que copia o ID do pacote e abre https://envios.adminml.com/logistics/case-center/cases.

Regionais (pelo prefixo da base): MG = EMG/SMG · ES = ES/SES/EES/EBA · BA = SBA · RJ = ERJ/SRJ · SP = SSP.
Para mudar, edite a lista `REGIONAIS` no topo de `forms.js`.

Na aba Forms cada pacote tem um seletor de status (RECUSADA, ANEXADA, ANULADA, FATURADA, EM ANÁLISE (sai como "EM ANÁLISE" no Forms)) e, se for recusada, um campo para escrever o motivo da recusa. O botão **BAIXAR FORMS** abre uma janela com **Hoje** / **Escolher data** e baixa (.xlsx) ou copia (para colar no Forms) todas as respostas daquele dia, com as mesmas colunas do Forms e com as marcações feitas aqui. A coluna Evidência mostra um botão 📷 que abre a foto do Drive.

O ⧉ ao lado do ID copia só o ID; o botão "Copiar ID, base e focal" (abaixo da focal) copia "ID - BASE - FOCAL". O 📷 abre a foto direto no Drive. O motivo aparece resumido (ex.: "CLIENTE RECEBEU").

Regionais: clique para marcar várias (ou "Todas"). 📷/📋 Print gera a imagem da lista atual. Abaixo do status há o seletor de Validador (LUIZA FRANÇA, KETHELLY, EDUARDA CARVALHO, VITÓRIA), que também sai no BAIXAR FORMS.
