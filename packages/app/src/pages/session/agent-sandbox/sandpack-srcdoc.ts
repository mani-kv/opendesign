/** Self-contained React hello world for WoZ testing. Loads React via CDN + Babel. */
export const SANDPACK_SRCDOC = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
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
<div id="root"></div>
<script type="text/babel">
function App() {
  const [count, setCount] = React.useState(0)
  return (
    <div className="card">
      <h1>Hello from Agent</h1>
      <p>Sandpack prototype preview</p>
      <div className="count">{count}</div>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  )
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />)
</script>
</body>
</html>`
