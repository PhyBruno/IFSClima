# .skills — skills versionadas do IFSClima

Cópia local (vendida) das skills usadas no fluxo de desenvolvimento deste projeto,
para que fiquem disponíveis em qualquer máquina que clonar o repositório — sem depender
da instalação global em `~/.claude/skills`.

| Skill | Papel no projeto |
| --- | --- |
| `tlc-spec-driven` | Spec-Driven Development. Gera e mantém a estrutura `.specs/` (PROJECT/ROADMAP/STATE + spec/design/tasks por feature). É a espinha dorsal do planejamento. |
| `qa-expert` | Estratégia e execução de QA/testes (casos de teste, métricas, cobertura). Apoia a constraint de TDD ≥80% do projeto. |
| `webapp-testing` | Testes de web app local com Playwright (screenshots, logs, verificação de UI). Apoia os fluxos E2E (F7). |

> Fonte: copiadas de `~/.claude/skills/` em uma máquina de desenvolvimento. `qa-expert`
> era um symlink para `~/.agents/skills/qa-expert` e foi copiada com o conteúdo real.
> Para usar como skills ativas, referencie/instale conforme o mecanismo de skills do seu ambiente.
