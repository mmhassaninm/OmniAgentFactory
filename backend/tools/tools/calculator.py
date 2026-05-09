import ast
import math
import operator
from typing import Any

_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

_SAFE_NAMES: dict = {k: getattr(math, k) for k in dir(math) if not k.startswith('_')}
_SAFE_NAMES.update({'abs': abs, 'round': round, 'min': min, 'max': max, 'sum': sum, 'int': int, 'float': float})


def _eval(node: ast.AST) -> Any:
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.BinOp):
        op = _OPS.get(type(node.op))
        if op is None:
            raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
        return op(_eval(node.left), _eval(node.right))
    if isinstance(node, ast.UnaryOp):
        op = _OPS.get(type(node.op))
        if op is None:
            raise ValueError(f"Unsupported unary op: {type(node.op).__name__}")
        return op(_eval(node.operand))
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ValueError("Only named function calls allowed")
        func = _SAFE_NAMES.get(node.func.id)
        if func is None:
            raise ValueError(f"Unknown function: {node.func.id}")
        args = [_eval(a) for a in node.args]
        return func(*args)
    if isinstance(node, ast.Name):
        val = _SAFE_NAMES.get(node.id)
        if val is None:
            raise ValueError(f"Unknown name: {node.id}")
        return val
    raise ValueError(f"Unsupported AST node: {type(node).__name__}")


def calculate(expression: str) -> str:
    try:
        tree = ast.parse(expression.strip(), mode='eval')
        result = _eval(tree.body)
        if isinstance(result, float) and result == int(result):
            result = int(result)
        return f"Result: {result}"
    except ZeroDivisionError:
        return "Error: Division by zero"
    except Exception as e:
        return f"Calculation error: {e}"
