MICROSAAS_TEMPLATE = {
    "description": "MicroSaaS Agent - specialized in building, styling, and refining standalone HTML/JS utility web tools.",
    "code": '''async def execute(input_data):
    """MicroSaaS Agent — drafts, styles, and bundles micro-utilities (e.g. invoice makers, image resizers)."""
    if not input_data:
        return "Please specify a MicroSaaS utility idea or feature requests."

    task_desc = str(input_data).lower()
    
    # Standard template generators
    if "invoice" in task_desc:
        tool_name = "Neural Invoice Generator"
        code_html = """<!DOCTYPE html>
<html>
<head>
  <style>
    body { background: #0f172a; color: #f8fafc; font-family: system-ui; padding: 2rem; }
    .card { background: #1e293b; border: 1px solid #334155; padding: 2rem; border-radius: 12px; max-width: 600px; margin: auto; }
    h1 { color: #38bdf8; font-size: 1.5rem; border-bottom: 2px solid #334155; padding-bottom: 0.5rem; }
    .flex { display: flex; justify-content: space-between; margin: 1rem 0; }
    input, button { background: #334155; border: 1px solid #475569; color: white; padding: 0.5rem; border-radius: 6px; }
    button { background: #38bdf8; color: #0f172a; font-weight: bold; cursor: pointer; }
    button:hover { background: #0ea5e9; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Neural Invoice Creator</h1>
    <div class="flex">
      <input type="text" id="client" placeholder="Client Name" />
      <input type="number" id="amount" placeholder="Amount ($)" />
    </div>
    <button onclick="generate()">Create PDF</button>
  </div>
  <script>
    function generate() {
      const client = document.getElementById('client').value || 'Guest';
      const amount = document.getElementById('amount').value || '0.00';
      alert('Generating Invoice for ' + client + ' of $' + amount);
    }
  </script>
</body>
</html>"""
    else:
        tool_name = "Dynamic Multi-Tool Core"
        code_html = """<!DOCTYPE html>
<html>
<head>
  <style>
    body { background: #020617; color: #f1f5f9; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .app { text-align: center; border: 1px solid #1e293b; padding: 3rem; border-radius: 16px; background: #0b1329; box-shadow: 0 4px 30px rgba(0,0,0,0.5); }
    h1 { background: linear-gradient(to right, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    input { background: #1e293b; border: 1px solid #334155; padding: 0.5rem; border-radius: 6px; color: white; }
  </style>
</head>
<body>
  <div class="app">
    <h1>Autonomous Micro-SaaS Base</h1>
    <p>Engineered dynamically based on prompts.</p>
    <input type="text" placeholder="Enter custom parameter..." />
  </div>
</body>
</html>"""

    return {
        "saas_tool": tool_name,
        "language_stack": ["HTML5", "CSS3", "JavaScript ES6"],
        "bundle_size": len(code_html),
        "code": code_html,
        "monetization_ready": True,
        "estimated_value_usd": 49.0
    }
''',
    "test_cases": [
        {"input": "create an elegant dark-theme invoice creator", "weight": 1.0},
        {"input": "write a basic conversion utility", "weight": 1.0},
        {"input": None, "expected": "Please specify a MicroSaaS utility idea or feature requests.", "weight": 0.5},
    ]
}
