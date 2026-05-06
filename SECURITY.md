# Security Policy

## Dados Sensiveis

Este projeto pode lidar com dados pessoais, numeros de telefone, sessoes de WhatsApp e holerites em PDF.

Nunca versione:

- PDFs reais de holerite
- relatorios de envio
- pasta `auth_info/`
- chaves SSH ou tokens
- dados reais de colaboradores em exemplos publicos

## Boas Praticas

- Use a aplicacao em ambiente controlado.
- Revise os destinatarios antes do envio.
- Mantenha o Node.js e dependencias atualizados.
- Execute `npm audit` periodicamente.
- Restrinja acesso ao computador que guarda a sessao do WhatsApp.

## Reporte

Para problemas de seguranca, abra uma issue privada ou entre em contato diretamente com o mantenedor do repositorio.
