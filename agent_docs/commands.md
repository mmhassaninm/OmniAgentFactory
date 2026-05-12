⚠️ ══════════════════════════════════════════════════════════════════════
                  CRITICAL PROTECTED FILE — DO NOT DELETE
══════════════════════════════════════════════════════════════════════ ⚠️

  DELETING THIS FILE IS STRICTLY AND ABSOLUTELY FORBIDDEN UNDER ANY
  CIRCUMSTANCE, BY ANY AGENT, TOOL, SCRIPT, OR MANUAL ACTION.

  Any deletion of content, replacement of any section, or structural
  modification to this file MUST NOT be executed unless the agent has
  verified with 100% certainty that:
    (1) the change is logically sound and strictly necessary,
    (2) the full impact on the rest of the system is understood,
    (3) no historical record or permanent standard is being erased.

  When in doubt — DO NOT EDIT. Abort and report instead.

⚠️ ══════════════════════════════════════════════════════════════════════

# Commands

## Start all services
docker-compose up -d --build

## Stop all services
docker-compose down

## View backend logs (live)
docker-compose logs -f backend

## View all logs
docker-compose logs -f

## Open backend shell
docker-compose exec backend bash

## Run Backend Unit Tests
docker-compose exec -T backend python -m pytest tests/test_evolution_core.py tests/test_self_evolution.py

## Install a Python package inside container
docker-compose exec backend pip install <package>

## Open MongoDB shell
docker-compose exec mongo mongosh omnibot

## Rebuild one service only
docker-compose up -d --build backend

## Check running containers
docker ps

## Check service health
docker-compose ps
