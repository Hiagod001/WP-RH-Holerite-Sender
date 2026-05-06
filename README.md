# RH Uai Telecom - Envio de Holerites

Sistema em Node.js para o RH cadastrar colaboradores, anexar holerites em PDF e enviar os documentos pelo WhatsApp com delay entre os envios.

## O que ele faz

- conecta o WhatsApp por QR Code
- gerencia colaboradores pela pagina web
- permite anexar o PDF do holerite direto na linha do colaborador
- confere quem esta pronto ou pendente antes do envio
- envia holerites mensais em PDF para cada colaborador
- aplica delay aleatorio entre os envios para reduzir risco de bloqueio
- grava relatorio CSV do envio dos holerites
- permite desconectar a sessao atual e gerar um novo QR Code

## Como rodar

Com Node.js instalado:

```bash
npm install
npm start
```

Depois abra:

```text
http://localhost:3000
```

## Uso no dia a dia

1. Abra o painel.
2. Cadastre ou edite os colaboradores pela propria pagina.
3. Selecione o mes do holerite.
4. Clique em `PDF` na linha do colaborador e escolha o arquivo.
5. Clique em `Conferir` para ver pendencias.
6. Leia o QR Code do WhatsApp, se ainda nao estiver conectado.
7. Ajuste o delay, se quiser.
8. Clique em `Enviar holerites`.

## Dados locais

O painel gerencia estes arquivos automaticamente:

- `Planilha/colaboradores.csv`
- `Holerites/AAAA-MM/`
- `Planilha/relatorios-holerites/`

O RH nao precisa editar o CSV manualmente. Ele fica apenas como base local do sistema.

## Delay

O painel vem com delay aleatorio entre 45 e 90 segundos por padrao.

Voce pode aumentar esse intervalo antes de enviar. O delay ajuda a deixar o envio menos agressivo, mas nao existe garantia absoluta contra bloqueio do WhatsApp. Use apenas para comunicacao legitima com colaboradores.

## Relatorio

Ao final do envio, o sistema cria um CSV em:

```text
Planilha/relatorios-holerites/
```

Esse arquivo mostra quem recebeu, quem falhou e o motivo.

## Estrutura

```text
.
|-- Planilha/
|   |-- COMO_USAR.txt
|   `-- colaboradores.csv
|-- Holerites/
|   |-- COMO_USAR.txt
|   `-- 2026-05/
|-- public/
|   `-- index.html
|-- package.json
|-- package-lock.json
`-- server.js
```

## Observacao

Depois que a sessao for conectada uma vez, ela fica salva localmente para nao precisar ler o QR toda hora. Se quiser forcar uma nova conexao, use o botao `Novo QR` no painel.
