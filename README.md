# WP RH Holerite Sender

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-API-111111?style=for-the-badge&logo=express&logoColor=white)
![WhatsApp](https://img.shields.io/badge/WhatsApp-Baileys-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

Painel web para o RH cadastrar colaboradores, anexar holerites em PDF e enviar os documentos pelo WhatsApp com conferencia previa, delay configuravel e relatorio de envio.

> Projeto criado para reduzir o envio manual de holerites conversa por conversa, mantendo uma rotina mensal mais rapida, rastreavel e organizada.

## Destaques

- Cadastro de colaboradores direto pela interface web.
- Upload de holerite em PDF por colaborador e por mes.
- Conferencia visual de colaboradores prontos e pendentes.
- Envio em lote pelo WhatsApp usando sessao via QR Code.
- Delay aleatorio configuravel entre envios.
- Relatorio CSV com sucesso, falha, motivo e identificador da mensagem.
- Protecao local para nao versionar PDFs, relatorios, `node_modules` ou sessao do WhatsApp.

## Stack

- Node.js
- Express
- Baileys
- Multer
- HTML + Tailwind CDN

## Como Rodar

Clone o repositorio e instale as dependencias:

```bash
npm install
```

Inicie o servidor:

```bash
npm start
```

Acesse o painel:

```text
http://localhost:3000
```

## Fluxo Do RH

1. Abra o painel web.
2. Cadastre ou edite os colaboradores.
3. Selecione o mes do holerite.
4. Clique em `PDF` na linha do colaborador e escolha o arquivo.
5. Clique em `Conferir` para validar pendencias.
6. Leia o QR Code do WhatsApp, se ainda nao estiver conectado.
7. Ajuste o delay entre envios.
8. Clique em `Enviar holerites`.

## Estrutura

```text
.
|-- Holerites/
|   |-- COMO_USAR.txt
|   `-- 2026-05/
|-- Planilha/
|   |-- COMO_USAR.txt
|   `-- colaboradores.csv
|-- public/
|   `-- index.html
|-- server.js
|-- package.json
`-- README.md
```

## Dados Locais

O sistema grava os dados em arquivos locais para manter a operacao simples:

| Caminho | Funcao |
| --- | --- |
| `Planilha/colaboradores.csv` | Base local de colaboradores |
| `Holerites/AAAA-MM/` | PDFs enviados ou pendentes por mes |
| `Planilha/relatorios-holerites/` | Relatorios CSV gerados apos envio |
| `auth_info/` | Sessao local do WhatsApp |

Arquivos sensiveis e gerados em runtime ficam protegidos pelo `.gitignore`.

## Delay E Boas Praticas

O delay padrao e de 45 a 90 segundos entre envios. Voce pode aumentar esse intervalo antes de iniciar um lote.

O delay ajuda a reduzir comportamento agressivo de envio, mas nao garante ausencia de bloqueio. Use apenas para comunicacao legitima com colaboradores e evite reenviar o mesmo lote varias vezes.

## Seguranca E Privacidade

- Nao suba holerites reais no repositorio.
- Nao versione a pasta `auth_info/`.
- Nao versione relatorios com dados pessoais.
- Revise os numeros antes de enviar.
- Use uma conta autorizada pela empresa para operar o WhatsApp.

## Scripts

```bash
npm start
npm audit
```

## Status

Versao inicial aprovada para uso interno do RH, com foco em simplicidade operacional e controle mensal de envio.

## Licenca

Distribuido sob a licenca MIT. Veja `LICENSE` para mais detalhes.
