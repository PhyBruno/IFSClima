@echo off
rem Atalho de duplo-clique: builda e grava o firmware no ESP32 (menu interativo).
rem Argumentos sao repassados, ex.: gravar.cmd -Env bench_b7_wifi_eap -Editar
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\.scripts\firmware-gravar.ps1" %*
pause
