@echo off
setlocal
title Uai Telecom - Atualizar Painel RH
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Execute no computador onde o sistema ja funciona.
  pause
  exit /b 1
)
node "%~dp0scripts\atualizar.cjs"
if errorlevel 1 (
  echo.
  echo A atualizacao nao foi concluida. Confira a mensagem acima.
  pause
  exit /b 1
)
pause
