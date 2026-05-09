# PowerShell CLI for OmniBot — Autonomous Agent Factory
# Universal Admin Shell Control Panel

$API_BASE = "http://localhost:3001/api"

# ── Helper for HTTP Requests ──────────────────────────────────────────────────
function Invoke-OmniApi {
    param(
        [string]$Method = "GET",
        [string]$UriPath,
        [object]$Body = $null
    )
    $url = "$API_BASE$UriPath"
    $headers = @{ "Content-Type" = "application/json" }
    
    try {
        $params = @{
            Method      = $Method
            Uri         = $url
            Headers     = $headers
            TimeoutSec  = 5
            UseBasicParsing = $true
        }
        if ($Body) {
            $params.Body = $Body | ConvertTo-Json -Depth 5
        }
        $response = Invoke-RestMethod @params
        return $response
    }
    catch {
        Write-Host " [ERROR] Failed to communicate with OmniBot API: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# ── Header Banner ─────────────────────────────────────────────────────────────
function Show-Banner {
    Write-Host ""
    Write-Host " ┌────────────────────────────────────────────────────────┐ " -ForegroundColor Cyan
    Write-Host " │              OMNIBOT — AGENT FACTORY CLI               │ " -ForegroundColor Cyan
    Write-Host " └────────────────────────────────────────────────────────┘ " -ForegroundColor Cyan
}

# ── Help Menu ─────────────────────────────────────────────────────────────────
function Show-Help {
    Show-Banner
    Write-Host "Usage: .\omnibot.ps1 <command> [subcommand] [arguments]" -ForegroundColor White
    Write-Host ""
    Write-Host "Docker Service Management:" -ForegroundColor Yellow
    Write-Host "  start                     - Start all containers (docker-compose up)"
    Write-Host "  stop                      - Stop all containers (docker-compose down)"
    Write-Host "  restart                   - Restart all containers"
    Write-Host "  status                    - Check service status and health"
    Write-Host "  logs [service]            - Stream logs (backend, frontend, mongo, chroma)"
    Write-Host ""
    Write-Host "Agent Management:" -ForegroundColor Yellow
    Write-Host "  agents list               - List all registered agents"
    Write-Host "  agents create             - Create a new agent interactively"
    Write-Host "  agents evolve <id>        - Evolve a specific agent"
    Write-Host "  agents delete <id>        - Delete an agent"
    Write-Host ""
    Write-Host "Key Vault & Profiles:" -ForegroundColor Yellow
    Write-Host "  keys list                 - List all saved API keys"
    Write-Host "  keys add                  - Add a new API key interactively"
    Write-Host "  profiles list             - List all environment profiles"
    Write-Host ""
    Write-Host "Autonomous Factory Engine:" -ForegroundColor Yellow
    Write-Host "  factory start             - Start Autonomous Never-Stop mode"
    Write-Host "  factory stop              - Stop Autonomous mode"
    Write-Host "  factory status            - Display Autonomous status and thinking logs"
    Write-Host ""
    Write-Host "General:" -ForegroundColor Yellow
    Write-Host "  help                      - Show this guide"
    Write-Host ""
}

# ── Command router ────────────────────────────────────────────────────────────
$cmd = $args[0]
$sub = $args[1]
$val = $args[2]

if (-not $cmd -or $cmd -eq "help") {
    Show-Help
    exit
}

switch ($cmd) {
    # ── Docker Service Commands ───────────────────────────────────────────────
    "start" {
        Write-Host "🚀 Launching OmniBot Factory Services..." -ForegroundColor Green
        docker-compose up -d --build
    }
    "stop" {
        Write-Host "🛑 Tearing down OmniBot Services..." -ForegroundColor Yellow
        docker-compose down
    }
    "restart" {
        Write-Host "🔄 Restarting OmniBot Services..." -ForegroundColor Green
        docker-compose down
        docker-compose up -d --build
    }
    "status" {
        Show-Banner
        Write-Host "== Container Status ==" -ForegroundColor Yellow
        docker-compose ps
        
        Write-Host "`n== Factory API Health ==" -ForegroundColor Yellow
        $res = Invoke-OmniApi -UriPath "/factory/status"
        if ($res) {
            Write-Host "  API Server    : Online" -ForegroundColor Green
            Write-Host "  Night Mode    : $($res.night_mode)"
            Write-Host "  Evolutions    : $($res.factory.active_evolutions) active / $($res.factory.max_concurrent) max"
            if ($res.autonomous) {
                Write-Host "  Autonomous Mode: $(if($res.autonomous.running){'RUNNING' -ForegroundColor Green}else{'STOPPED' -ForegroundColor Gray})"
                Write-Host "  Core Goal     : $($res.autonomous.goal)"
                Write-Host "  Interval      : $($res.autonomous.interval_minutes) min"
                Write-Host "  Last Thought  : $($res.autonomous.last_thought)"
            }
        } else {
            Write-Host "  API Server    : Offline / Unreachable" -ForegroundColor Red
        }
    }
    "logs" {
        if ($sub) {
            docker-compose logs -f $sub
        } else {
            docker-compose logs -f
        }
    }

    # ── Agent Management ──────────────────────────────────────────────────────
    "agents" {
        switch ($sub) {
            "list" {
                $res = Invoke-OmniApi -UriPath "/factory/agents"
                if ($res) {
                    Show-Banner
                    Write-Host "== Registered Agents ==" -ForegroundColor Yellow
                    $agents = $res.agents
                    if ($agents.Count -eq 0) {
                        Write-Host "No agents registered in the factory." -ForegroundColor Gray
                    } else {
                        $agents | ForEach-Object {
                            Write-Host "------------------------------------------------" -ForegroundColor Gray
                            Write-Host "ID     : $($_.id)" -ForegroundColor White
                            Write-Host "Name   : $($_.name)" -ForegroundColor Cyan -NoNewline
                            Write-Host " (v$($_.version))" -ForegroundColor Gray
                            Write-Host "Status : $($_.status.ToUpper())" -ForegroundColor (if($_.status -eq 'evolving'){'Magenta'}else{'Green'})
                            Write-Host "Score  : $([Math]::Round($_.current_score * 100))%" -ForegroundColor Green
                            Write-Host "Goal   : $($_.goal)"
                        }
                        Write-Host "------------------------------------------------" -ForegroundColor Gray
                    }
                }
            }
            "create" {
                $name = Read-Host "Enter Agent Name"
                $goal = Read-Host "Enter Agent Goal"
                $tmpl = Read-Host "Enter Template (general/code/research/revenue) [general]"
                if (-not $tmpl) { $tmpl = "general" }
                
                if (-not $name -or -not $goal) {
                    Write-Host " [ERROR] Name and Goal are required." -ForegroundColor Red
                    exit
                }
                
                $body = @{ name = $name; goal = $goal; template = $tmpl }
                Write-Host "Manufacturing agent..." -ForegroundColor Cyan
                $res = Invoke-OmniApi -Method "POST" -UriPath "/factory/agents" -Body $body
                if ($res) {
                    Write-Host " [SUCCESS] Agent '$name' created successfully with ID: $($res.id)" -ForegroundColor Green
                }
            }
            "evolve" {
                if (-not $val) {
                    Write-Host " [ERROR] Missing Agent ID. Usage: .\omnibot.ps1 agents evolve <id>" -ForegroundColor Red
                    exit
                }
                Write-Host "Triggering evolutionary mutation for agent: $val..." -ForegroundColor Magenta
                $res = Invoke-OmniApi -Method "POST" -UriPath "/factory/agents/$val/evolve"
                if ($res) {
                    Write-Host " [SUCCESS] Evolution loop initialized for agent $val!" -ForegroundColor Green
                }
            }
            "delete" {
                if (-not $val) {
                    Write-Host " [ERROR] Missing Agent ID. Usage: .\omnibot.ps1 agents delete <id>" -ForegroundColor Red
                    exit
                }
                Write-Host "De-constructing agent: $val..." -ForegroundColor Red
                $res = Invoke-OmniApi -Method "DELETE" -UriPath "/factory/agents/$val"
                if ($res) {
                    Write-Host " [SUCCESS] Agent deleted from MongoDB." -ForegroundColor Green
                }
            }
            Default {
                Write-Host " [ERROR] Invalid subcommand '$sub'. Use 'list', 'create', 'evolve', or 'delete'." -ForegroundColor Red
            }
        }
    }

    # ── Keys & Profiles ───────────────────────────────────────────────────────
    "keys" {
        switch ($sub) {
            "list" {
                $res = Invoke-OmniApi -UriPath "/settings/keys"
                if ($res) {
                    Show-Banner
                    Write-Host "== Configured API Keys ==" -ForegroundColor Yellow
                    $keys = $res
                    if ($keys.Count -eq 0) {
                        Write-Host "No API keys configured." -ForegroundColor Gray
                    } else {
                        $keys | ForEach-Object {
                            Write-Host "Provider : $($_.provider.ToUpper())" -ForegroundColor Cyan
                            Write-Host "Name     : $($_.name)"
                            Write-Host "Value    : $($_.key_value)" -ForegroundColor Gray
                            Write-Host "Status   : $($_.status.ToUpper()) ($($_.status_message))" -ForegroundColor (if($_.status -eq 'verified'){'Green'}else{'Yellow'})
                            Write-Host "------------------------------------------------" -ForegroundColor Gray
                        }
                    }
                }
            }
            "add" {
                $prov = Read-Host "Provider (groq/gemini/openai/anthropic/cerebras/cloudflare/llamacloud)"
                $name = Read-Host "Key Name / Identifier"
                $val  = Read-Host "API Key / Token Value"
                $prof = Read-Host "Profile Email [mmhassaninm@gmail.com]"
                if (-not $prof) { $prof = "mmhassaninm@gmail.com" }
                
                if (-not $prov -or -not $name -or -not $val) {
                    Write-Host " [ERROR] Provider, Key Name, and Value are required." -ForegroundColor Red
                    exit
                }
                
                $body = @{
                    provider = $prov
                    name = $name
                    key_value = $val
                    model = ""
                    profile = $prof
                }
                Write-Host "Registering and verifying key with $prov validator..." -ForegroundColor Cyan
                $res = Invoke-OmniApi -Method "POST" -UriPath "/settings/keys" -Body $body
                if ($res) {
                    Write-Host " [SUCCESS] Key registered successfully! Status: $($res.key.status.ToUpper())" -ForegroundColor Green
                }
            }
            Default {
                Write-Host " [ERROR] Invalid subcommand '$sub'. Use 'list' or 'add'." -ForegroundColor Red
            }
        }
    }

    "profiles" {
        if ($sub -eq "list") {
            $res = Invoke-OmniApi -UriPath "/settings/profiles"
            if ($res) {
                Show-Banner
                Write-Host "== Environment Profiles ==" -ForegroundColor Yellow
                $res | ForEach-Object {
                    Write-Host "  Name  : $($_.name)" -ForegroundColor Cyan
                    Write-Host "  Email : $($_.email)"
                    Write-Host "  Color : $($_.color)"
                    Write-Host "  Primary: $($_.is_primary)"
                    Write-Host "  ------------------------------------------------" -ForegroundColor Gray
                }
            }
        } else {
            Write-Host " [ERROR] Invalid subcommand. Use 'profiles list'." -ForegroundColor Red
        }
    }

    # ── Autonomous Mode Commands ──────────────────────────────────────────────
    "factory" {
        switch ($sub) {
            "start" {
                $goal = Read-Host "Enter Autonomous Core Goal"
                $min  = Read-Host "Interval in minutes [5]"
                if (-not $min) { $min = 5 }
                
                if (-not $goal) {
                    Write-Host " [ERROR] Core Goal is required to engage Autonomous Mode." -ForegroundColor Red
                    exit
                }
                
                $body = @{ goal = $goal; interval_minutes = [int]$min }
                Write-Host "Activating Central central autonomous engine..." -ForegroundColor Magenta
                $res = Invoke-OmniApi -Method "POST" -UriPath "/factory/start" -Body $body
                if ($res) {
                    Write-Host " [SUCCESS] Autonomous mode activated! Engaged with goal: '$goal'" -ForegroundColor Green
                }
            }
            "stop" {
                Write-Host "Disengaging central autonomous loop..." -ForegroundColor Yellow
                $res = Invoke-OmniApi -Method "POST" -UriPath "/factory/stop"
                if ($res) {
                    Write-Host " [SUCCESS] Autonomous mode stopped safely." -ForegroundColor Green
                }
            }
            "status" {
                $status = Invoke-OmniApi -UriPath "/factory/autonomous/status"
                $logs = Invoke-OmniApi -UriPath "/factory/autonomous/log"
                
                if ($status) {
                    Show-Banner
                    Write-Host "== Autonomous Central Engine ==" -ForegroundColor Yellow
                    Write-Host "Status        : $(if($status.running){'RUNNING' -ForegroundColor Green}else{'STOPPED' -ForegroundColor Gray})"
                    Write-Host "Active Goal   : $($status.goal)"
                    Write-Host "Interval Time : $($status.interval_minutes) min"
                    Write-Host "Latest Thought: $($status.last_thought)" -ForegroundColor Cyan
                    Write-Host "Agents Spawned: $($status.agents_created.Count)"
                    
                    if ($logs -and $logs.logs) {
                        Write-Host "`n== Recent Decisions Log ==" -ForegroundColor Yellow
                        $logs.logs | Select-Object -First 5 | ForEach-Object {
                            Write-Host "[$($_.timestamp)] Action: $($_.action.ToUpper())" -ForegroundColor Magenta
                            Write-Host "Thought: $($_.thought)" -ForegroundColor Gray
                            Write-Host "------------------------------------------------" -ForegroundColor Gray
                        }
                    }
                }
            }
            Default {
                Write-Host " [ERROR] Invalid subcommand '$sub'. Use 'start', 'stop', or 'status'." -ForegroundColor Red
            }
        }
    }

    Default {
        Write-Host " [ERROR] Unknown command '$cmd'. Run '.\omnibot.ps1 help' for instructions." -ForegroundColor Red
    }
}
