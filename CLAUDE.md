# IFSClima — Estação Meteorológica

Plataforma web/mobile que recebe, armazena e visualiza leituras de uma estação meteorológica
(temperatura, umidade, pressão, chuva, UV). Ingestão idempotente por um único endpoint +
dashboard de tema escuro. Ver `.specs/project/PROJECT.md` para a visão completa e o contrato de API.

## Repositório

- **GitHub (privado):** https://github.com/PhyBruno/IFSClima
- **Remote:** `origin` → `https://github.com/PhyBruno/IFSClima.git`, branch padrão `main`.
- Objetivo do repo: sincronizar o projeto entre máquinas. Antes de começar a trabalhar em
  qualquer máquina, faça `git pull` para pegar o estado mais recente.

## Política de commit (OBRIGATÓRIA)

**Sempre após concluir uma tarefa, faça o commit — e faça o push para `origin main`.**

- "Concluir uma tarefa" = a mudança está completa e verde (testes, lint e typecheck passando
  no(s) pacote(s) afetado(s)). Não commitar trabalho pela metade ou com a suíte vermelha.
- Um commit por tarefa concluída, com mensagem descritiva do que foi feito.
- Após o commit, `git push origin main` para que todas as máquinas fiquem sincronizadas.
- Nunca commitar segredos: `.env` e afins são cobertos pelo `.gitignore`; use apenas
  `.env.example` com valores sintéticos.
- Mensagens de commit terminam com a linha de co-autoria padrão do Claude Code.

## Stack (resumo)

- **api/**: Fastify + TypeScript + Drizzle ORM + PostgreSQL 16. Testes: Vitest + light-my-request + Testcontainers.
- **web/**: React 18 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix, estilo `radix-nova`, gráficos Recharts).
  Componentes shadcn em `web/src/components/ui/` (gerados pela CLI — não editar à mão; adicionar com
  `npx shadcn@latest add <nome>` dentro de `web/`). MCP do shadcn configurado em `.mcp.json`.
- **Infra**: Docker Compose (api + web + db). Roda com `docker compose up`.
- **Qualidade**: TDD com cobertura ≥80% (atualmente 100% na api).

## Comandos úteis (raiz)

- `npm test` · `npm run lint` · `npm run typecheck` — agregados (api + web).
- `npm run db:migrate` · `npm run db:seed` — migrations e seed da estação `main`.
- `docker compose up` — sobe api + web + db.
