/** Lightweight vanilla JS hello world for WoZ testing. No CDN deps. */
export const SANDPACK_SRCDOC = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:24px;max-width:320px;width:100%;text-align:center}
h1{font-size:20px;font-weight:600;margin-bottom:8px;background:linear-gradient(135deg,#818cf8,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
p{font-size:13px;color:#a1a1aa;margin-bottom:16px}
button{background:#818cf8;color:white;border:none;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:500;cursor:pointer;transition:background .15s}
button:hover{background:#6366f1}
.count{font-size:32px;font-weight:700;margin:12px 0;color:#e5e5e5}
</style>
</head>
<body>
<div class="card">
  <h1>Hello from Agent</h1>
  <p>Sandpack prototype preview</p>
  <div class="count" id="count">0</div>
  <button id="btn">Increment</button>
</div>
<script>
var c=0;
document.getElementById("btn").onclick=function(){document.getElementById("count").textContent=++c};
</script>
</body>
</html>`
