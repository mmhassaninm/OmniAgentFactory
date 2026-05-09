---
name: write-pytest  
description: Write a pytest test for any Python function or endpoint
trigger: when asked to write tests, add coverage, or verify a function
---

## Steps
1. Read the target file to understand the function signature and behavior
2. Identify: happy path, edge cases, error cases
3. Create test file at backend/tests/test_{module_name}.py if not exists
4. Write test functions using pytest conventions (def test_{scenario}():)
5. For async functions use @pytest.mark.asyncio
6. Run: pytest {test_file} -v and check exit code
7. A passing test (exit code 0) means success
