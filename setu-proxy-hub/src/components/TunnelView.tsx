import { useEffect, useState } from 'react'
import { getTunnel } from '../lib/api.ts'
import { ago, bytes } from '../lib/format.ts'
import type { TunnelStats } from '../lib/types.ts'

export default function TunnelView() {
  const [t, setT] = useState<TunnelStats | null>(null)

  useEffect(() => {
    const load = () => getTunnel().then(setT).catch(() => setT(null))
    load()
    const id = setInterval(load, 2000)
    return () => clearInterval(id)
  }, [])

  const addr = t?.address ?? '127.0.0.1:8899'
  const [host, port] = addr.split(':')

  return (
    <div className="grid">
      <section className="panel">
        <div className="panel-head">
          <h2>Tunnel</h2>
          <span className={`badge ${t?.listening ? 'ok' : 'off'}`}>{t?.listening ? `running on ${addr}` : t?.enabled === false ? 'off on this host' : 'not running'}</span>
        </div>
        {t?.enabled === false ? (
          <p className="muted">
            The tunnel only runs when Setu is on your own computer (<code>npm start</code> locally). It’s disabled on public hosts
            because an internet-facing proxy gets abused within hours.
          </p>
        ) : (
          <>
            <dl className="stats">
              <div><dt>Active</dt><dd>{t?.active ?? 0}</dd></div>
              <div><dt>Total</dt><dd>{t?.total ?? 0}</dd></div>
              <div><dt>Failed</dt><dd>{t?.failed ?? 0}</dd></div>
              <div><dt>Up / down</dt><dd>{bytes(t?.bytesUp)} / {bytes(t?.bytesDown)}</dd></div>
            </dl>
            <h3 className="mini">Recent sites</h3>
            <table className="table">
              <tbody>
                {(t?.recent ?? []).map((r, i) => (
                  <tr key={`${r.at}-${i}`}>
                    <td className={r.ok ? '' : 'error'}>{r.host}</td>
                    <td><code>{r.proxy}</code></td>
                    <td>{ago(r.at)}</td>
                  </tr>
                ))}
                {!t?.recent?.length && <tr><td className="muted">Nothing yet — point an app at the tunnel.</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="panel prose">
        <h2>Use it like a VPN</h2>
        <p>
          The tunnel is a local proxy at <code>{addr}</code>. Anything you point at it leaves the internet from a free proxy’s IP.
          Each website sticks to one proxy for 10 minutes so pages don’t break mid-session; if that proxy dies, Setu switches
          to another.
        </p>
        <h3>Browser only (easiest)</h3>
        <ul>
          <li><strong>Chrome / Edge, one window:</strong> <code>chrome --proxy-server="http://{addr}" --user-data-dir=/tmp/setu-profile</code></li>
          <li><strong>Firefox:</strong> Settings → Network Settings → Manual proxy → HTTP Proxy <code>{host}</code> port <code>{port}</code>, tick “Also use this proxy for HTTPS”.</li>
          <li><strong>Per-site switching:</strong> install FoxyProxy and add <code>{addr}</code> (type HTTP).</li>
        </ul>
        <h3>Whole computer</h3>
        <ul>
          <li><strong>macOS:</strong> System Settings → Network → Wi-Fi → Details → Proxies → Automatic proxy configuration → <code>http://{addr}/proxy.pac</code></li>
          <li><strong>Windows:</strong> Settings → Network &amp; internet → Proxy → Use setup script → <code>http://{addr}/proxy.pac</code></li>
          <li><strong>Terminal / scripts:</strong> <code>export HTTPS_PROXY=http://{addr}</code></li>
        </ul>
        <h3>What it is not</h3>
        <ul>
          <li>Not a real VPN: it carries web (HTTPS) traffic from apps that honour proxy settings. Apps that ignore proxy settings, games and other UDP traffic still go direct.</li>
          <li>Plain <code>http://</code> is blocked unless you start Setu with <code>SETU_ALLOW_HTTP=1</code> — a free proxy can read and rewrite it.</li>
          <li>With HTTPS the proxy can’t read pages, but it does see which sites you visit and when. Don’t log in to banking, email or work accounts through it.</li>
          <li>For real privacy, use a proper VPN. Setu is for changing your apparent IP, scraping and testing.</li>
        </ul>
      </section>
    </div>
  )
}
