# OmniBot Command Line Interface (CLI)

The OmniBot CLI provides complete administrative control and monitoring capability directly from your terminal. It supports both Windows PowerShell and Unix Bash.

---

## Installation & Setup

1. Open your terminal of choice (PowerShell on Windows, Bash on macOS/Linux).
2. Navigate to the project root directory.
3. If using Bash, make sure the script is executable:
   ```bash
   chmod +x ./omnibot-cli/omnibot.sh
   ```

---

## Available Commands

### 1. Docker Service Management
Manage container lifecycle and check status:
```powershell
# Windows PowerShell
.\omnibot-cli\omnibot.ps1 status
.\omnibot-cli\omnibot.ps1 start
.\omnibot-cli\omnibot.ps1 stop
.\omnibot-cli\omnibot.ps1 restart
.\omnibot-cli\omnibot.ps1 logs backend

# Unix Bash
./omnibot-cli/omnibot.sh status
./omnibot-cli/omnibot.sh start
./omnibot-cli/omnibot.sh stop
./omnibot-cli/omnibot.sh restart
./omnibot-cli/omnibot.sh logs backend
```

### 2. Agent Catalog Management
List, create, evolve, and delete agents in the database:
```bash
# List all registered agents
./omnibot-cli/omnibot.sh agents list

# Create a new agent interactively
./omnibot-cli/omnibot.sh agents create

# Evolve a specific agent (starts the evolution cycle)
./omnibot-cli/omnibot.sh agents evolve <agent-id>

# Delete an agent from the factory
./omnibot-cli/omnibot.sh agents delete <agent-id>
```

### 3. Key Vault & Profiles
Manage credentials and profile registries:
```bash
# List registered API keys and status
./omnibot-cli/omnibot.sh keys list

# Register and verify a new API key
./omnibot-cli/omnibot.sh keys add

# List registered workspace profiles
./omnibot-cli/omnibot.sh profiles list
```

### 4. Autonomous Factory Mode
Toggle and monitor the Central Never-Stop Autonomous thinking engine:
```bash
# Start autonomous mode with goal and minutes interval
./omnibot-cli/omnibot.sh factory start

# Stop autonomous mode safely
./omnibot-cli/omnibot.sh factory stop

# Check autonomous mode status, last thought, and logs
./omnibot-cli/omnibot.sh factory status
```
