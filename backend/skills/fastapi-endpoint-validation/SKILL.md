---
name: fastapi-endpoint-validation
description: Add Pydantic input validation to FastAPI endpoints
trigger: when asked to add validation, sanitize input, or secure an endpoint
success_rate: null
---

## Steps
1. Read the target router file
2. Identify the endpoint function and its current parameters
3. Create or update the Pydantic model for request body
4. Add the model as a type hint to the function parameter
5. Add HTTPException for validation failures with status_code=422
6. Run: pytest backend/tests/ -k "test_{endpoint_name}" to verify
7. If no test exists, create one that sends invalid data and expects 422
