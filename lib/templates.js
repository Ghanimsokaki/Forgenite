/* Starter templates for the Web Builder. */

const BASE_CSS = `:root{--bg:#0b0f14;--fg:#e8eef5;--muted:#8b98a9;--accent:#76b900;--card:#121a24;--radius:14px}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg);line-height:1.6}
a{color:var(--accent)}.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.btn{display:inline-block;background:var(--accent);color:#0b0f14;padding:12px 22px;border-radius:999px;font-weight:700;text-decoration:none;border:0;cursor:pointer}
.btn.ghost{background:transparent;color:var(--fg);border:1px solid #2a3646}
.card{background:var(--card);border:1px solid #1f2a38;border-radius:var(--radius);padding:22px}
.grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
header.nav{position:sticky;top:0;background:rgba(11,15,20,.85);backdrop-filter:blur(8px);border-bottom:1px solid #1a2330;z-index:5}
header.nav .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
header.nav nav a{margin-left:20px;color:var(--muted);text-decoration:none}header.nav nav a:hover{color:var(--fg)}
section{padding:72px 0}h1{font-size:clamp(2.2rem,5vw,3.6rem);line-height:1.1;margin:0 0 16px}h2{font-size:2rem;margin:0 0 24px}
.muted{color:var(--muted)}footer{border-top:1px solid #1a2330;padding:28px 0;color:var(--muted);font-size:.9rem}
@media(max-width:640px){header.nav nav{display:none}}`;

export const TEMPLATES = [
  {
    id: "blank",
    name: "Blank page",
    icon: "📄",
    description: "Empty HTML + CSS + JS starter.",
    files: [
      {
        path: "index.html",
        content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>My site</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="wrap">
    <h1>Hello 👋</h1>
    <p class="muted">Start editing, or ask the AI to build something.</p>
    <button class="btn" id="hello">Click me</button>
  </main>
  <script src="script.js"></script>
</body>
</html>
`,
      },
      { path: "style.css", content: BASE_CSS + "\nmain{padding:80px 20px}\n" },
      { path: "script.js", content: `document.getElementById("hello").addEventListener("click", () => {\n  console.log("Button clicked!");\n  alert("It works!");\n});\n` },
    ],
  },
  {
    id: "landing",
    name: "Landing page",
    icon: "🚀",
    description: "Hero, features, pricing and footer — ready to customise.",
    files: [
      {
        path: "index.html",
        content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Launchpad — ship faster</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="nav"><div class="wrap"><strong>🚀 Launchpad</strong>
    <nav><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#contact">Contact</a></nav></div></header>
  <section class="hero"><div class="wrap">
    <h1>Ship your idea <span class="accent">this weekend</span></h1>
    <p class="muted lead">Launchpad gives you everything you need to go from idea to paying customers — without the busywork.</p>
    <p><a class="btn" href="#pricing">Get started</a> <a class="btn ghost" href="#features">Learn more</a></p>
  </div></section>
  <section id="features"><div class="wrap"><h2>Features</h2><div class="grid">
    <div class="card"><h3>⚡ Fast</h3><p class="muted">Pages load in under a second on any device.</p></div>
    <div class="card"><h3>🔒 Secure</h3><p class="muted">Best-practice security baked in from day one.</p></div>
    <div class="card"><h3>📈 Scales</h3><p class="muted">From your first user to your millionth.</p></div>
  </div></div></section>
  <section id="pricing"><div class="wrap"><h2>Pricing</h2><div class="grid">
    <div class="card"><h3>Starter</h3><p class="price">$0</p><p class="muted">For side projects.</p><a class="btn ghost" href="#contact">Choose</a></div>
    <div class="card featured"><h3>Pro</h3><p class="price">$19<small>/mo</small></p><p class="muted">For growing teams.</p><a class="btn" href="#contact">Choose</a></div>
    <div class="card"><h3>Scale</h3><p class="price">$99<small>/mo</small></p><p class="muted">For serious traffic.</p><a class="btn ghost" href="#contact">Choose</a></div>
  </div></div></section>
  <section id="contact"><div class="wrap"><h2>Contact</h2>
    <form class="card contact" id="contact-form"><input required placeholder="Your email" type="email" /><button class="btn">Notify me</button></form>
    <p id="thanks" class="muted" hidden>Thanks! We'll be in touch.</p></div></section>
  <footer><div class="wrap">© <span id="year"></span> Launchpad</div></footer>
  <script src="script.js"></script>
</body>
</html>
`,
      },
      {
        path: "style.css",
        content:
          BASE_CSS +
          `
.hero{padding:120px 0 80px;background:radial-gradient(900px 400px at 20% 0%,rgba(118,185,0,.18),transparent)}
.accent{color:var(--accent)}.lead{font-size:1.2rem;max-width:560px}
.price{font-size:2.2rem;font-weight:800;margin:8px 0}.price small{font-size:1rem;color:var(--muted)}
.featured{border-color:var(--accent);box-shadow:0 0 40px rgba(118,185,0,.15)}
.contact{display:flex;gap:10px;max-width:520px}.contact input{flex:1;padding:12px 14px;border-radius:999px;border:1px solid #2a3646;background:#0b0f14;color:var(--fg)}
`,
      },
      {
        path: "script.js",
        content: `document.getElementById("year").textContent = new Date().getFullYear();
document.getElementById("contact-form").addEventListener("submit", (e) => {
  e.preventDefault();
  e.target.hidden = true;
  document.getElementById("thanks").hidden = false;
});
`,
      },
    ],
  },
  {
    id: "portfolio",
    name: "Portfolio",
    icon: "🎨",
    description: "Personal portfolio with projects grid and about page.",
    files: [
      {
        path: "index.html",
        content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Alex Doe — Designer & Developer</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="nav"><div class="wrap"><strong>Alex Doe</strong><nav><a href="index.html">Work</a><a href="about.html">About</a></nav></div></header>
  <section><div class="wrap">
    <h1>I design & build<br/>delightful products.</h1>
    <p class="muted">Selected work from the last few years.</p>
    <div class="grid projects" id="projects"></div>
  </div></section>
  <footer><div class="wrap">Made with Forgenite</div></footer>
  <script src="projects.js"></script>
</body>
</html>
`,
      },
      {
        path: "about.html",
        content: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>About — Alex Doe</title><link rel="stylesheet" href="style.css" /></head>
<body>
  <header class="nav"><div class="wrap"><strong>Alex Doe</strong><nav><a href="index.html">Work</a><a href="about.html">About</a></nav></div></header>
  <section><div class="wrap"><h1>About me</h1><p class="muted">I'm a designer-developer who loves clean interfaces, fast websites and good coffee.</p>
  <p><a class="btn" href="mailto:alex@example.com">Say hello</a></p></div></section>
</body>
</html>
`,
      },
      {
        path: "style.css",
        content: BASE_CSS + `\n.projects .card{min-height:180px;display:flex;flex-direction:column;justify-content:flex-end;transition:transform .2s}\n.projects .card:hover{transform:translateY(-4px)}\n.tag{font-size:.75rem;color:var(--accent);text-transform:uppercase;letter-spacing:.08em}\n`,
      },
      {
        path: "projects.js",
        content: `const projects = [
  { name: "Nimbus Weather", tag: "Mobile app", color: "#1d3b5a" },
  { name: "Fernway Coffee", tag: "Brand + web", color: "#3b2a1d" },
  { name: "Pulse Analytics", tag: "Dashboard", color: "#1d3a2a" },
  { name: "Orbit Docs", tag: "Developer tool", color: "#2e1d3b" },
];
document.getElementById("projects").innerHTML = projects
  .map((p) => \`<article class="card" style="background:linear-gradient(160deg,\${p.color},#121a24)"><span class="tag">\${p.tag}</span><h3>\${p.name}</h3></article>\`)
  .join("");
`,
      },
    ],
  },
  {
    id: "dashboard",
    name: "Dashboard",
    icon: "📊",
    description: "Admin dashboard with stats cards, a canvas chart and a table.",
    files: [
      {
        path: "index.html",
        content: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Dashboard</title><link rel="stylesheet" href="style.css" /></head>
<body>
  <div class="layout">
    <aside><strong>📊 Metrics</strong><a class="on">Overview</a><a>Customers</a><a>Billing</a><a>Settings</a></aside>
    <main>
      <h2>Overview</h2>
      <div class="grid stats" id="stats"></div>
      <div class="card"><h3>Revenue (last 12 weeks)</h3><canvas id="chart" height="220"></canvas></div>
      <div class="card"><h3>Recent orders</h3><table id="orders"><thead><tr><th>Customer</th><th>Plan</th><th>Amount</th><th>Status</th></tr></thead><tbody></tbody></table></div>
    </main>
  </div>
  <script src="app.js"></script>
</body>
</html>
`,
      },
      {
        path: "style.css",
        content:
          BASE_CSS +
          `\n.layout{display:grid;grid-template-columns:220px 1fr;min-height:100vh}\naside{background:#0e141c;border-right:1px solid #1a2330;padding:22px;display:flex;flex-direction:column;gap:6px}\naside strong{margin-bottom:18px}aside a{padding:8px 12px;border-radius:8px;color:var(--muted);cursor:pointer}aside a.on,aside a:hover{background:#16202e;color:var(--fg)}\nmain{padding:28px;display:flex;flex-direction:column;gap:18px}.stats .card b{font-size:1.8rem;display:block}\ncanvas{width:100%}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #1f2a38}th{color:var(--muted);font-weight:500}\n.pill{padding:2px 10px;border-radius:999px;font-size:.8rem;background:rgba(118,185,0,.15);color:var(--accent)}.pill.pending{background:rgba(240,169,46,.15);color:#f0a92e}\n@media(max-width:760px){.layout{grid-template-columns:1fr}aside{display:none}}\n`,
      },
      {
        path: "app.js",
        content: `const stats = [["Revenue", "$48.2k", "+12%"], ["Customers", "1,284", "+4%"], ["Churn", "1.8%", "-0.3%"], ["MRR", "$12.9k", "+9%"]];
document.getElementById("stats").innerHTML = stats.map(([k, v, d]) => \`<div class="card"><span class="muted">\${k}</span><b>\${v}</b><span class="pill">\${d}</span></div>\`).join("");

const data = Array.from({ length: 12 }, (_, i) => 20 + Math.round(Math.sin(i / 2) * 8 + i * 2.5));
const c = document.getElementById("chart");
const ctx = c.getContext("2d");
function draw() {
  c.width = c.clientWidth * devicePixelRatio; c.height = 220 * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const w = c.clientWidth, h = 220, max = Math.max(...data) * 1.15, bw = w / data.length;
  data.forEach((v, i) => { const bh = (v / max) * (h - 20); ctx.fillStyle = "#76b900"; ctx.fillRect(i * bw + 6, h - bh, bw - 12, bh); });
}
draw(); addEventListener("resize", draw);

const orders = [["Ada Lovelace", "Pro", "$19", "paid"], ["Alan Turing", "Scale", "$99", "paid"], ["Grace Hopper", "Pro", "$19", "pending"], ["Linus T.", "Starter", "$0", "paid"]];
document.querySelector("#orders tbody").innerHTML = orders.map(([n, p, a, s]) => \`<tr><td>\${n}</td><td>\${p}</td><td>\${a}</td><td><span class="pill \${s}">\${s}</span></td></tr>\`).join("");
`,
      },
    ],
  },
  {
    id: "game",
    name: "Canvas game",
    icon: "🎮",
    description: "A tiny playable canvas game loop (dodge the blocks).",
    files: [
      {
        path: "index.html",
        content: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Dodge!</title><link rel="stylesheet" href="style.css" /></head>
<body>
  <div class="hud">Score: <b id="score">0</b> · Best: <b id="best">0</b> · ← → or tap to move</div>
  <canvas id="game" width="420" height="600"></canvas>
  <script src="game.js"></script>
</body>
</html>
`,
      },
      { path: "style.css", content: `body{margin:0;background:#0b0f14;color:#e8eef5;font-family:system-ui;display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px}\ncanvas{background:#121a24;border:1px solid #1f2a38;border-radius:12px;max-width:100%;height:auto;touch-action:none}\n.hud{color:#8b98a9}.hud b{color:#76b900}\n` },
      {
        path: "game.js",
        content: `const c = document.getElementById("game"), ctx = c.getContext("2d");
let player, blocks, score, best = 0, keys = {}, over = false, t = 0;
function reset() { player = { x: 190, y: 540, w: 40, h: 40 }; blocks = []; score = 0; over = false; }
addEventListener("keydown", (e) => { keys[e.key] = true; if (over && e.key === " ") reset(); });
addEventListener("keyup", (e) => (keys[e.key] = false));
c.addEventListener("pointerdown", (e) => { if (over) return reset(); const r = c.getBoundingClientRect(); keys.tap = (e.clientX - r.left) / r.width < 0.5 ? -1 : 1; });
c.addEventListener("pointerup", () => (keys.tap = 0));
function loop() {
  t++;
  if (!over) {
    const dir = (keys.ArrowLeft ? -1 : 0) + (keys.ArrowRight ? 1 : 0) + (keys.tap || 0);
    player.x = Math.max(0, Math.min(c.width - player.w, player.x + dir * 6));
    if (t % Math.max(12, 40 - Math.floor(score / 5)) === 0) blocks.push({ x: Math.random() * (c.width - 40), y: -40, w: 40, h: 40, v: 3 + score / 20 });
    blocks.forEach((b) => (b.y += b.v));
    blocks = blocks.filter((b) => { if (b.y > c.height) { score++; return false; } return true; });
    if (blocks.some((b) => b.x < player.x + player.w && b.x + b.w > player.x && b.y < player.y + player.h && b.y + b.h > player.y)) { over = true; best = Math.max(best, score); }
  }
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#76b900"; ctx.fillRect(player.x, player.y, player.w, player.h);
  ctx.fillStyle = "#e5534b"; blocks.forEach((b) => ctx.fillRect(b.x, b.y, b.w, b.h));
  if (over) { ctx.fillStyle = "#e8eef5"; ctx.font = "bold 28px system-ui"; ctx.textAlign = "center"; ctx.fillText("Game over — tap or press space", c.width / 2, c.height / 2); }
  document.getElementById("score").textContent = score; document.getElementById("best").textContent = best;
  requestAnimationFrame(loop);
}
reset(); loop();
`,
      },
    ],
  },
];

export const BUILDER_IDEAS = [
  "Build a landing page for a neighbourhood coffee shop with menu, opening hours and a map section",
  "Make a to-do app with categories, drag-to-reorder and localStorage persistence",
  "Create a personal finance tracker with a monthly chart (canvas) and CSV export",
  "Build a restaurant menu website with 3 pages: Home, Menu, Contact",
  "Make a Pomodoro timer with sounds (WebAudio), stats and a dark/light toggle",
  "Create a snake game with high scores and mobile touch controls",
];
