# code_syntax_check

## Description
This skill checks the syntax of a Python script using `py_compile`.

## When to use (Trigger Conditions)
- You need to verify if your Python script has any syntax errors before running it.
- The script is located on a Windows system with Python installed.

## Procedural Steps
1. Locate the path to the Python script you want to check, e.g., `D:\\2026\\Projects\\AI\\NexusOS\\backend\\autonomous_engine.py`.
2. Open a command prompt.
3. Run the following command:
   ```cmd
   python -m py_compile D:\\2026\\Projects\\AI\\NexusOS\\backend\\autonomous_engine.py
   ```
4. Observe the output:
   - If the script has syntax errors, `py_compile` will raise a `SyntaxError`.
   - If there are no syntax errors, the command will complete successfully with code 0.

## Known Failure Modes & Workarounds
- **Failure Mode:** The script contains syntax errors.
  - **Workaround:** Identify and fix the syntax errors in the script. Then re-run the syntax check.
- **Failure Mode:** Python is not installed or accessible from the command prompt.
  - **Workaround:** Ensure Python is installed and its executable path is added to your system's PATH environment variable.

## Performance Records
- This skill has a consistent success rate of 100% when run with valid Python scripts.