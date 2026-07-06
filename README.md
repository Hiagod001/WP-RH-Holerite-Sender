# WP RH Holerite Sender

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-API-111111?style=for-the-badge&logo=express&logoColor=white)
![WhatsApp](https://img.shields.io/badge/WhatsApp-Baileys-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

Painel web para o RH cadastrar colaboradores, anexar holerites em PDF e enviar documentos pelo WhatsApp com conferência prévia, delay configurável e relatório de envio.

> Criado para transformar um processo mensal manual em uma rotina mais rápida, rastreável e organizada.

## Destaques

- Cadastro e manutenção de colaboradores pela interface web.
- Upload de holerite em PDF por colaborador e por mês.
- Conferência visual de pendências antes do disparo.
- Envio em lote via WhatsApp com sessão autenticada por QR Code.
- Mensagem personalizada com variáveis como `{nome}` e `{mes}`.
- Delay aleatório configurável entre envios para reduzir comportamento agressivo.
- Relatório CSV com sucesso, falha, motivo e identificador da mensagem.
- Proteção para não versionar PDFs reais, relatórios, sessões ou `node_modules`.

<details>
<summary><strong>Fluxo de uso</strong></summary>

1. Inicie o painel.
2. Leia o QR Code do WhatsApp.
3. Cadastre ou atualize os colaboradores.
4. Escolha o mês de referência.
5. Anexe o PDF correto para cada colaborador.
6. Confira a lista de prontos e pendentes.
7. Ajuste mensagem e intervalo de envio.
8. Clique em `Enviar holerites`.
9. Consulte o relatório gerado ao final.

</details>

## Tecnologias

| Camada | Uso |
| --- | --- |
| Node.js | Runtime da aplicação |
| Express | Servidor web e API local |
| Baileys | Integração com WhatsApp Web |
| Multer | Recebimento dos PDFs |
| CSV local | Base simples de colaboradores e relatórios |

## Como Rodar

```bash
npm install
npm start
```

Depois acesse:

```text
http://localhost:3000
```

## Estrutura

```text
.
|-- server.js
|-- public/
|-- Planilha/
|   |-- colaboradores.csv
|   `-- relatorios-holerites/
|-- Holerites/
|-- auth_info/
|-- package.json
`-- README.md
```

## Pastas Importantes

| Caminho | Descrição |
| --- | --- |
| `Planilha/colaboradores.csv` | Base local de colaboradores |
| `Holerites/` | PDFs organizados por mês |
| `Planilha/relatorios-holerites/` | Relatórios CSV de envio |
| `auth_info/` | Sessão local do WhatsApp |

## Segurança

Este projeto pode lidar com dados pessoais, números de telefone, sessões do WhatsApp e holerites. Antes de publicar ou compartilhar:

- não suba holerites reais;
- não versione `auth_info/`;
- não versione relatórios com dados pessoais;
- revise planilhas de exemplo;
- use apenas para comunicação legítima com colaboradores.

## Checklist

- [ ] WhatsApp conectado por QR Code.
- [ ] Colaboradores revisados.
- [ ] Holerites conferidos.
- [ ] Mensagem validada.
- [ ] Delay definido.
- [ ] Relatório salvo após o envio.
