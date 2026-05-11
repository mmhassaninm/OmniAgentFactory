"""
Health Check Utility — Diagnose OmniBot system state
Run: python -c "from backend.utils.health_check import diagnose_system; diagnose_system()"
"""
import asyncio
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


class SystemHealthCheck:
    """Diagnose and report on system health."""

    def __init__(self):
        self.checks: Dict[str, bool] = {}
        self.issues: List[str] = []
        self.details: Dict[str, Any] = {}

    def check_filesystem(self) -> bool:
        """Check critical filesystem paths exist."""
        try:
            base = Path(__file__).parent.parent.parent
            required_dirs = [
                base / "backend",
                base / "backend" / "core",
                base / "backend" / "core" / "autonomous_evolution",
                base / "autonomous_logs",
            ]

            all_exist = True
            for dir_path in required_dirs:
                if not dir_path.exists():
                    self.issues.append(f"Missing directory: {dir_path}")
                    all_exist = False

            # Check critical files
            critical_files = [
                base / "Evolve_plan.md",
                base / "autonomous_logs" / "IDEAS_LOG.json",
                base / "autonomous_logs" / "PROBLEMS_LOG.json",
            ]

            for file_path in critical_files:
                if not file_path.exists():
                    self.issues.append(f"Missing file: {file_path}")
                    all_exist = False

            self.checks["filesystem"] = all_exist
            return all_exist
        except Exception as e:
            self.issues.append(f"Filesystem check error: {e}")
            self.checks["filesystem"] = False
            return False

    async def check_mongodb_connection(self) -> bool:
        """Check MongoDB connectivity."""
        try:
            from core.database import get_db

            db = await get_db()
            if db is None:
                self.issues.append("MongoDB not connected")
                self.checks["mongodb"] = False
                return False

            # Try a simple operation
            ping_result = await db.command("ping")
            self.checks["mongodb"] = ping_result.get("ok") == 1
            return self.checks["mongodb"]
        except Exception as e:
            self.issues.append(f"MongoDB check error: {e}")
            self.checks["mongodb"] = False
            return False

    async def check_evolution_components(self) -> bool:
        """Check evolution module imports."""
        try:
            from core.autonomous_evolution.registry_manager import RegistryManager
            from core.autonomous_evolution.idea_engine_v2 import IdeaEngineV2
            from core.autonomous_evolution.problem_scanner import ProblemScanner
            from core.autonomous_evolution.agent_council import AgentCouncil
            from core.autonomous_evolution.loop_orchestrator import LoopOrchestrator
            from core.autonomous_evolution.implementation_runner import ImplementationRunner

            self.checks["evolution_modules"] = True
            return True
        except Exception as e:
            self.issues.append(f"Evolution modules import error: {e}")
            self.checks["evolution_modules"] = False
            return False

    def check_env_variables(self) -> bool:
        """Check critical environment variables."""
        import os

        critical_vars = {
            "ENABLE_AUTONOMOUS_EVOLUTION": os.getenv("ENABLE_AUTONOMOUS_EVOLUTION", "true"),
            "MODEL_ROUTER_CONFIG": os.getenv("MODEL_ROUTER_CONFIG", ""),
        }

        all_set = all(critical_vars.values())
        if not all_set:
            missing = [k for k, v in critical_vars.items() if not v]
            self.issues.extend([f"Missing env var: {v}" for v in missing])

        self.checks["env_variables"] = all_set
        return all_set

    async def check_api_endpoints(self) -> bool:
        """Check if critical API endpoints exist."""
        try:
            from main import app

            routes = {route.path for route in app.routes}
            required_routes = {
                "/api/evolution/ideas",
                "/api/evolution/problems",
                "/api/evolution/diagnostics",
                "/api/factory/agents",
                "/health",
            }

            missing_routes = required_routes - routes
            if missing_routes:
                self.issues.extend([f"Missing route: {r}" for r in missing_routes])
                self.checks["api_endpoints"] = False
                return False

            self.checks["api_endpoints"] = True
            return True
        except Exception as e:
            self.issues.append(f"API endpoint check error: {e}")
            self.checks["api_endpoints"] = False
            return False

    async def run_all_checks(self) -> Dict[str, Any]:
        """Run all health checks."""
        logger.info("━━━ Starting System Health Check ━━━")

        self.check_filesystem()
        self.check_env_variables()
        await self.check_mongodb_connection()
        await self.check_evolution_components()
        await self.check_api_endpoints()

        overall_health = all(self.checks.values())

        result = {
            "timestamp": datetime.now().isoformat(),
            "overall_health": "healthy" if overall_health else "degraded",
            "checks": self.checks,
            "issues": self.issues,
            "check_summary": f"{sum(self.checks.values())}/{len(self.checks)} checks passed",
        }

        return result

    def print_report(self, result: Dict[str, Any]):
        """Print health check report."""
        print("\n" + "=" * 60)
        print(f"OmniBot System Health Report — {result['timestamp']}")
        print("=" * 60)

        print(f"\nOverall Health: {result['overall_health'].upper()}")
        print(f"Check Summary: {result['check_summary']}")

        print("\nDetailed Checks:")
        for check_name, passed in result["checks"].items():
            status = "✓ PASS" if passed else "✗ FAIL"
            print(f"  {status} — {check_name}")

        if result["issues"]:
            print("\nIssues Found:")
            for i, issue in enumerate(result["issues"], 1):
                print(f"  {i}. {issue}")
        else:
            print("\nNo issues found — system is ready!")

        print("\n" + "=" * 60)


async def diagnose_system():
    """Main diagnostic entry point."""
    health_check = SystemHealthCheck()
    result = await health_check.run_all_checks()
    health_check.print_report(result)
    return result


if __name__ == "__main__":
    result = asyncio.run(diagnose_system())
