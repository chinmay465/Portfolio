export default function ApiView({ authRequired }: { authRequired: boolean }) {
  const base = typeof window === 'undefined' ? 'http://localhost:3001' : window.location.origin
  const auth = authRequired ? ` -H "Authorization: Bearer $SETU_TOKEN"` : ''
  return (
    <section className="panel prose">
      <h2>Use Setu from any app</h2>
      <p>Three ways in, from simplest to most flexible. All of them rotate through the validated pool and retry on a new proxy when one fails or gets blocked.</p>

      <h3>1. As a normal HTTP proxy (local tunnel)</h3>
      <p>Anything that supports a proxy setting works unchanged — curl, Python, Node, Playwright, your browser.</p>
      <pre>{`curl -x http://127.0.0.1:8899 https://api.ipify.org

# Python requests
requests.get(url, proxies={"https": "http://127.0.0.1:8899"})

# Playwright
chromium.launch({ proxy: { server: "http://127.0.0.1:8899" } })`}</pre>

      <h3>2. Fetch API — drop-in for fetch()</h3>
      <p>
        <code>format=raw</code> returns the target’s body with its real status and content type, so a scraper can treat it exactly like a
        direct request. Headers <code>X-Setu-Proxy</code>, <code>X-Setu-Exit-Ip</code> and <code>X-Setu-Final-Url</code> tell you what happened.
      </p>
      <pre>{`curl${auth} "${base}/api/fetch?format=raw&url=https%3A%2F%2Fexample.com"

// Node / browser
const res = await fetch(\`${base}/api/fetch?format=raw&sticky=1&url=\${encodeURIComponent(url)}\`${authRequired ? ", {\n  headers: { Authorization: `Bearer ${token}` },\n}" : ''})
const html = await res.text()`}</pre>
      <ul>
        <li><code>format=json</code> → <code>{'{ meta, body }'}</code> · <code>format=reader</code> → title, text blocks, links</li>
        <li><code>sticky=1</code> keeps the same proxy per hostname (10 min)</li>
        <li><code>POST /api/fetch</code> with JSON <code>{'{ url, method, headers, body, format }'}</code> for form posts</li>
      </ul>

      <h3>3. Search API</h3>
      <pre>{`curl${auth} "${base}/api/search?q=react+server+components&engine=duckduckgo"`}</pre>
      <p>Returns <code>{'{ engine, results: [{ title, url, snippet }], proxy, exitIp }'}</code>. Falls back to the next engine if one blocks the proxy.</p>

      <h3>Shodh</h3>
      <p>
        Shodh’s custom HTML source has a “Route through Setu” switch. Run Shodh with <code>SETU_URL={base}</code>
        {authRequired ? <> and <code>SETU_TOKEN</code></> : null} and it fetches archive and item pages through the pool.
      </p>
    </section>
  )
}
