# Atualizar o computador do RH

Para uma instalacao existente, envie apenas `WP-RH-Holerite-Sender-ATUALIZACAO.zip`.

1. Feche o sistema e a janela do servidor no computador do RH.
2. Extraia o ZIP de atualizacao em uma pasta separada, por exemplo na Area de Trabalho.
3. Abra `ATUALIZAR.bat` nessa pasta extraida.
4. Cole o caminho da pasta onde o sistema antigo ja funciona e pressione Enter.
5. Aguarde a mensagem de conclusao. Abra o sistema como de costume e pressione Ctrl+F5 no navegador.

Nao e necessario cadastrar os colaboradores novamente nem executar npm install para esta atualizacao.

## O que fica preservado

- `Planilha/colaboradores.csv`: cadastro existente de colaboradores.
- `Planilha/relatorios-holerites/`: relatorios anteriores.
- `Holerites/`: documentos ja anexados.
- `auth_info/`: sessao existente do WhatsApp.
- `node_modules/`, `package.json`, `package-lock.json`, `.env` e arquivos locais de inicializacao.

O atualizador substitui somente `server.js` e os arquivos de `public/`. Ele verifica a integridade do pacote, faz backup do cadastro e dos arquivos de codigo anteriores em `.backups/`, e confere que o arquivo de colaboradores continua identico ao terminar. Se a troca de codigo falhar, tenta restaurar os arquivos anteriores e informa o local do backup.

As preferencias de mensagem e intervalo continuam salvas no mesmo navegador e endereco usados anteriormente.

## Para quem atualiza copiando arquivos

Com o servidor fechado, copie somente `public/` e `server.js` do pacote de atualizacao para a pasta existente. Nao substitua `Planilha/`, `Holerites/` ou `auth_info/`. O uso de `ATUALIZAR.bat` e recomendado porque faz o backup automaticamente.

## Gerar outro pacote

Na pasta do projeto, execute:

```powershell
node scripts/gerar-atualizacao.cjs
```

O pacote de atualizacao nao contem cadastro de exemplo, banco vazio, PDFs, relatorios ou credenciais. O ZIP completo do projeto e destinado a instalacoes novas; use o ZIP identificado como `ATUALIZACAO` no computador do RH.
