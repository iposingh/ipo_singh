/** Minimal HTML for missing IPO addresses returned before streaming commits HTTP 200. */
export function missingIpoHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/>
<title>IPO not found | IPO Singh</title>
<style>
  body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#f7faf7;color:#0b1f14}
  main{max-width:40rem;margin:0 auto;padding:2.5rem 1.25rem}
  h1{font-size:1.75rem;line-height:1.2;margin:0 0 1rem}
  p{line-height:1.6;color:#3d5247}
  a{color:#0f7a3a}
  nav{display:flex;flex-wrap:wrap;gap:0.75rem;margin-top:1.5rem}
</style>
</head>
<body>
<main>
  <h1>This IPO page is not available</h1>
  <p>No stored issue uses this address. IPO Singh did not substitute another company.</p>
  <nav>
    <a href="/">Home</a>
    <a href="/ipos/mainboard">Mainboard IPOs</a>
    <a href="/ipos/sme">SME IPOs</a>
  </nav>
</main>
</body>
</html>`;
}
