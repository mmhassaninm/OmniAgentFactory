#!/bin/bash
# Bash CLI for OmniBot — Autonomous Agent Factory
# Universal Admin Shell Control Panel

API_BASE="http://localhost:3001/api"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Helper for API Calls
invoke_api() {
    local method="$1"
    local path="$2"
    local data="$3"
    
    if [ -n "$data" ]; then
        curl -s -X "$method" \
             -H "Content-Type: application/json" \
             -d "$data" \
             "$API_BASE$path"
    else
        curl -s -X "$method" \
             -H "Content-Type: application/json" \
             "$API_BASE$path"
    fi
}

show_banner() {
    echo -e "${CYAN}┌────────────────────────────────────────────────────────┐${NC}"
    echo -e "${CYAN}│              OMNIBOT — AGENT FACTORY CLI               │${NC}"
    echo -e "${CYAN}└────────────────────────────────────────────────────────┘${NC}"
}

show_help() {
    show_banner
    echo -e "Usage: ./omnibot.sh <command> [subcommand] [arguments]"
    echo ""
    echo -e "${YELLOW}Docker Service Management:${NC}"
    echo "  start                     - Start all containers (docker-compose up)"
    echo "  stop                      - Stop all containers (docker-compose down)"
    echo "  restart                   - Restart all containers"
    echo "  status                    - Check service status and health"
    echo "  logs [service]            - Stream logs (backend, frontend, mongo, chroma)"
    echo ""
    echo -e "${YELLOW}Agent Management:${NC}"
    echo "  agents list               - List all registered agents"
    echo "  agents create             - Create a new agent interactively"
    echo "  agents evolve <id>        - Evolve a specific agent"
    echo "  agents delete <id>        - Delete an agent"
    echo ""
    echo -e "${YELLOW}Key Vault & Profiles:${NC}"
    echo "  keys list                 - List all saved API keys"
    echo "  keys add                  - Add a new API key interactively"
    echo "  profiles list             - List all environment profiles"
    echo ""
    echo -e "${YELLOW}Autonomous Factory Engine:${NC}"
    echo "  factory start             - Start Autonomous Never-Stop mode"
    echo "  factory stop              - Stop Autonomous mode"
    echo "  factory status            - Display Autonomous status and thinking logs"
    echo ""
    echo -e "${YELLOW}General:${NC}"
    echo "  help                      - Show this guide"
    echo ""
}

CMD="$1"
SUB="$2"
VAL="$3"

if [ -z "$CMD" ] || [ "$CMD" = "help" ]; then
    show_help
    exit 0
fi

case "$CMD" in
    start)
        echo -e "${GREEN}🚀 Launching OmniBot Factory Services...${NC}"
        docker-compose up -d --build
        ;;
    stop)
        echo -e "${YELLOW}🛑 Tearing down OmniBot Services...${NC}"
        docker-compose down
        ;;
    restart)
        echo -e "${GREEN}🔄 Restarting OmniBot Services...${NC}"
        docker-compose down
        docker-compose up -d --build
        ;;
    status)
        show_banner
        echo -e "${YELLOW}== Container Status ==${NC}"
        docker-compose ps
        echo ""
        echo -e "${YELLOW}== Factory API Health ==${NC}"
        res=$(invoke_api "GET" "/factory/status")
        if [ -n "$res" ]; then
            echo -e "  API Server    : ${GREEN}Online${NC}"
            echo "  Night Mode    : $(echo "$res" | grep -o '"night_mode":[^,]*' | cut -d: -f2)"
            echo "  Evolutions    : $(echo "$res" | grep -o '"active_evolutions":[^,]*' | cut -d: -f2) active / $(echo "$res" | grep -o '"max_concurrent":[^,]*' | cut -d: -f2) max"
        else
            echo -e "  API Server    : ${RED}Offline / Unreachable${NC}"
        fi
        ;;
    logs)
        if [ -n "$SUB" ]; then
            docker-compose logs -f "$SUB"
        else
            docker-compose logs -f
        fi
        ;;
    agents)
        case "$SUB" in
            list)
                res=$(invoke_api "GET" "/factory/agents")
                if [ -n "$res" ]; then
                    show_banner
                    echo -e "${YELLOW}== Registered Agents ==${NC}"
                    echo "$res" | grep -o '{[^{]*"id"[^}]*}' | while read -r line; do
                        id=$(echo "$line" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
                        name=$(echo "$line" | grep -o '"name":"[^"]*' | cut -d'"' -f4)
                        ver=$(echo "$line" | grep -o '"version":[^,]*' | cut -d: -f2)
                        status=$(echo "$line" | grep -o '"status":"[^"]*' | cut -d'"' -f4)
                        score=$(echo "$line" | grep -o '"current_score":[^,]*' | cut -d: -f2)
                        goal=$(echo "$line" | grep -o '"goal":"[^"]*' | cut -d'"' -f4)
                        
                        echo -e "${GRAY}------------------------------------------------${NC}"
                        echo -e "ID     : $id"
                        echo -e "Name   : ${CYAN}$name${NC} (v$ver)"
                        if [ "$status" = "evolving" ]; then
                            echo -e "Status : ${MAGENTA}${status^^}${NC}"
                        else
                            echo -e "Status : ${GREEN}${status^^}${NC}"
                        fi
                        # Multiply score by 100
                        score_pct=$(echo "$score * 100" | bc 2>/dev/null || echo "0")
                        echo -e "Score  : ${GREEN}${score_pct%.*}%${NC}"
                        echo -e "Goal   : $goal"
                    done
                    echo -e "${GRAY}------------------------------------------------${NC}"
                fi
                ;;
            create)
                read -p "Enter Agent Name: " name
                read -p "Enter Agent Goal: " goal
                read -p "Enter Template (general/code/research/revenue) [general]: " tmpl
                tmpl=${tmpl:-general}
                
                if [ -z "$name" ] || [ -z "$goal" ]; then
                    echo -e "${RED} [ERROR] Name and Goal are required.${NC}"
                    exit 1
                fi
                
                body="{\"name\":\"$name\",\"goal\":\"$goal\",\"template\":\"$tmpl\"}"
                echo -e "Manufacturing agent..."
                res=$(invoke_api "POST" "/factory/agents" "$body")
                id=$(echo "$res" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
                if [ -n "$id" ]; then
                    echo -e "${GREEN} [SUCCESS] Agent '$name' created successfully with ID: $id${NC}"
                fi
                ;;
            evolve)
                if [ -z "$VAL" ]; then
                    echo -e "${RED} [ERROR] Missing Agent ID. Usage: ./omnibot.sh agents evolve <id>${NC}"
                    exit 1
                fi
                echo -e "Triggering evolutionary mutation for agent: $VAL..."
                res=$(invoke_api "POST" "/factory/agents/$VAL/evolve")
                echo -e "${GREEN} [SUCCESS] Evolution loop initialized for agent $VAL!${NC}"
                ;;
            delete)
                if [ -z "$VAL" ]; then
                    echo -e "${RED} [ERROR] Missing Agent ID. Usage: ./omnibot.sh agents delete <id>${NC}"
                    exit 1
                fi
                echo -e "De-constructing agent: $VAL..."
                res=$(invoke_api "DELETE" "/factory/agents/$VAL")
                echo -e "${GREEN} [SUCCESS] Agent deleted from MongoDB.${NC}"
                ;;
            *)
                echo -e "${RED} [ERROR] Invalid subcommand. Use 'list', 'create', 'evolve', or 'delete'.${NC}"
                ;;
        esac
        ;;
    keys)
        case "$SUB" in
            list)
                res=$(invoke_api "GET" "/settings/keys")
                if [ -n "$res" ]; then
                    show_banner
                    echo -e "${YELLOW}== Configured API Keys ==${NC}"
                    echo "$res" | grep -o '{[^{]*"provider"[^}]*}' | while read -r line; do
                        prov=$(echo "$line" | grep -o '"provider":"[^"]*' | cut -d'"' -f4)
                        name=$(echo "$line" | grep -o '"name":"[^"]*' | cut -d'"' -f4)
                        val=$(echo "$line" | grep -o '"key_value":"[^"]*' | cut -d'"' -f4)
                        status=$(echo "$line" | grep -o '"status":"[^"]*' | cut -d'"' -f4)
                        msg=$(echo "$line" | grep -o '"status_message":"[^"]*' | cut -d'"' -f4)
                        
                        echo -e "Provider : ${CYAN}${prov^^}${NC}"
                        echo -e "Name     : $name"
                        echo -e "Value    : ${GRAY}$val${NC}"
                        if [ "$status" = "verified" ]; then
                            echo -e "Status   : ${GREEN}${status^^} ($msg)${NC}"
                        else
                            echo -e "Status   : ${YELLOW}${status^^} ($msg)${NC}"
                        fi
                        echo -e "${GRAY}------------------------------------------------${NC}"
                    done
                fi
                ;;
            add)
                read -p "Provider (groq/gemini/openai/anthropic/cerebras/cloudflare/llamacloud): " prov
                read -p "Key Name / Identifier: " name
                read -p "API Key / Token Value: " val
                read -p "Profile Email [mmhassaninm@gmail.com]: " prof
                prof=${prof:-mmhassaninm@gmail.com}
                
                if [ -z "$prov" ] || [ -z "$name" ] || [ -z "$val" ]; then
                    echo -e "${RED} [ERROR] Provider, Key Name, and Value are required.${NC}"
                    exit 1
                fi
                
                body="{\"provider\":\"$prov\",\"name\":\"$name\",\"key_value\":\"$val\",\"model\":\"\",\"profile\":\"$prof\"}"
                echo -e "Registering and verifying key with $prov validator..."
                res=$(invoke_api "POST" "/settings/keys" "$body")
                echo -e "${GREEN} [SUCCESS] Key registered successfully!${NC}"
                ;;
            *)
                echo -e "${RED} [ERROR] Invalid subcommand. Use 'list' or 'add'.${NC}"
                ;;
        esac
        ;;
    profiles)
        if [ "$SUB" = "list" ]; then
            res=$(invoke_api "GET" "/settings/profiles")
            if [ -n "$res" ]; then
                show_banner
                echo -e "${YELLOW}== Environment Profiles ==${NC}"
                echo "$res" | grep -o '{[^{]*"name"[^}]*}' | while read -r line; do
                    name=$(echo "$line" | grep -o '"name":"[^"]*' | cut -d'"' -f4)
                    email=$(echo "$line" | grep -o '"email":"[^"]*' | cut -d'"' -f4)
                    color=$(echo "$line" | grep -o '"color":"[^"]*' | cut -d'"' -f4)
                    prim=$(echo "$line" | grep -o '"is_primary":[^,}]*' | cut -d: -f2)
                    
                    echo -e "  Name  : ${CYAN}$name${NC}"
                    echo -e "  Email : $email"
                    echo -e "  Color : $color"
                    echo -e "  Primary: $prim"
                    echo -e "${GRAY}  ------------------------------------------------${NC}"
                done
            fi
        else
            echo -e "${RED} [ERROR] Invalid subcommand. Use 'profiles list'.${NC}"
        fi
        ;;
    factory)
        case "$SUB" in
            start)
                read -p "Enter Autonomous Core Goal: " goal
                read -p "Interval in minutes [5]: " min
                min=${min:-5}
                
                if [ -z "$goal" ]; then
                    echo -e "${RED} [ERROR] Core Goal is required to engage Autonomous Mode.${NC}"
                    exit 1
                fi
                
                body="{\"goal\":\"$goal\",\"interval_minutes\":$min}"
                echo -e "Activating central autonomous engine..."
                res=$(invoke_api "POST" "/factory/start" "$body")
                echo -e "${GREEN} [SUCCESS] Autonomous mode activated! Engaged with goal: '$goal'${NC}"
                ;;
            stop)
                echo -e "${YELLOW}Disengaging central autonomous loop...${NC}"
                res=$(invoke_api "POST" "/factory/stop")
                echo -e "${GREEN} [SUCCESS] Autonomous mode stopped safely.${NC}"
                ;;
            status)
                status=$(invoke_api "GET" "/factory/autonomous/status")
                logs=$(invoke_api "GET" "/factory/autonomous/log")
                
                if [ -n "$status" ]; then
                    show_banner
                    echo -e "${YELLOW}== Autonomous Central Engine ==${NC}"
                    running=$(echo "$status" | grep -o '"running":[^,]*' | cut -d: -f2)
                    if [ "$running" = "true" ]; then
                        echo -e "Status        : ${GREEN}RUNNING${NC}"
                    else
                        echo -e "Status        : ${GRAY}STOPPED${NC}"
                    fi
                    echo "Active Goal   : $(echo "$status" | grep -o '"goal":"[^"]*' | cut -d'"' -f4)"
                    echo "Interval Time : $(echo "$status" | grep -o '"interval_minutes":[^,]*' | cut -d: -f2) min"
                    echo -e "Latest Thought: ${CYAN}$(echo "$status" | grep -o '"last_thought":"[^"]*' | cut -d'"' -f4)${NC}"
                    
                    if [ -n "$logs" ]; then
                        echo ""
                        echo -e "${YELLOW}== Recent Decisions Log ==${NC}"
                        echo "$logs" | grep -o '{[^{]*"thought"[^}]*}' | head -n 5 | while read -r line; do
                            ts=$(echo "$line" | grep -o '"timestamp":"[^"]*' | cut -d'"' -f4)
                            act=$(echo "$line" | grep -o '"action":"[^"]*' | cut -d'"' -f4)
                            tht=$(echo "$line" | grep -o '"thought":"[^"]*' | cut -d'"' -f4)
                            echo -e "[$ts] Action: ${MAGENTA}${act^^}${NC}"
                            echo -e "Thought: ${GRAY}$tht${NC}"
                            echo -e "${GRAY}------------------------------------------------${NC}"
                        done
                    fi
                fi
                ;;
            *)
                echo -e "${RED} [ERROR] Invalid subcommand. Use 'start', 'stop', or 'status'.${NC}"
                ;;
        esac
        ;;
    *)
        echo -e "${RED} [ERROR] Unknown command '$CMD'. Run './omnibot.sh help' for instructions.${NC}"
        ;;
esac
