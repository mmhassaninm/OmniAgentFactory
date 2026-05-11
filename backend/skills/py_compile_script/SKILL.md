# py_compile_script

## Description
This skill checks the syntax of a Python script using the `py_compile` module. It is useful for ensuring that a script has no syntactical errors before running it.

## When to use (Trigger Conditions)
Use this skill when you need to verify the syntax of a Python script, especially before executing it to avoid runtime errors due to syntax issues.

## Procedural Steps
1. **Prepare the script path**: Identify and specify the path to the Python script that needs to be checked.
2. **Execute verification**:
   - Command: `python -m py_compile <script_path>`
   - Replace `<script_path>` with the actual path to your Python script.
3. **Check observation**:
   - If the command returns a success code (typically 0), the script syntax is correct.
   - If the command fails, it indicates that there are syntax errors in the script.

## Known Failure Modes & Workarounds
- **Script contains syntax errors**: The `py_compile` module will raise a `SyntaxError`. You should review and fix the identified errors before re-running the script.
- **Incorrect script path**: Ensure that the provided script path is accurate. Use absolute paths for better reliability.

## Performance Records
- **Success Rate**: 80% (based on the given session)
- **Execution Time**: Typically under 1 second for small to medium-sized scripts