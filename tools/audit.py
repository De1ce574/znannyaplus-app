"""Перевірка доступності (WCAG 2.1 AA, автоматизовані правила) і продуктивності сторінок ЛР5.
Доступність: дерево доступності Chromium (CDP Accessibility) + перевірки DOM і контрасту.
Продуктивність: Navigation/Paint Timing, LCP, CLS, кількість і обсяг ресурсів, час відповіді API."""
import json, re, sys, statistics, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
PAGES = ["index.html", "catalog.html", "course.html?id=math-nmt", "tutors.html", "booking.html", "login.html",
         "checkout.html?group=2", "cabinet.html", "settings.html", "admin-group.html", "404.html"]
AUTH = {"checkout.html?group=2", "cabinet.html", "settings.html"}

A11Y_JS = r"""
() => {
  const issues = [];
  const add = (rule, el, msg) => issues.push({ rule, el: el ? (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')) : '', msg });
  if (!document.documentElement.lang) add('html-lang', null, 'немає lang');
  if (!document.title.trim()) add('document-title', null, 'порожній title');
  const h1 = document.querySelectorAll('h1'); if (h1.length !== 1) add('page-has-one-h1', null, `h1: ${h1.length}`);
  let prev = 0;
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => { const l = +h.tagName[1]; if (prev && l > prev + 1) add('heading-order', h, `h${prev}→h${l}`); prev = l; });
  if (!document.querySelector('main')) add('landmark-main', null, 'немає main');
  const ids = {}; document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
  Object.entries(ids).filter(([, n]) => n > 1).forEach(([id]) => add('duplicate-id', null, id));
  document.querySelectorAll('img').forEach((img) => { if (!img.hasAttribute('alt')) add('image-alt', img, 'немає alt'); });
  document.querySelectorAll('[aria-labelledby],[aria-controls],[aria-describedby]').forEach((e) => {
    ['aria-labelledby', 'aria-controls', 'aria-describedby'].forEach((a) => (e.getAttribute(a) || '').split(/\s+/).filter(Boolean)
      .forEach((ref) => { if (!document.getElementById(ref)) add('aria-valid-ref', e, `${a}=${ref}`); }));
  });
  // Контраст тексту (WCAG 1.4.3): 4.5:1, для великого тексту 3:1
  const parse = (c) => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.length < 4 || c[3] > 0.9) return c; } return [255, 255, 255]; };
  let checked = 0;
  document.querySelectorAll('body *').forEach((el) => {
    const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!text || !el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || el.closest('[aria-hidden="true"], .visually-hidden, [disabled]')) return;
    const fg = parse(cs.color), bg = bgOf(el);
    const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    checked++;
    if (ratio < need) add('color-contrast', el, `${ratio.toFixed(2)}:1 < ${need}:1 «${el.textContent.trim().slice(0, 30)}»`);
  });
  return { issues, checked };
}
"""

PERF_INIT = """
window.__lcp = 0; window.__cls = 0;
new PerformanceObserver((l) => { const e = l.getEntries(); window.__lcp = e[e.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
new PerformanceObserver((l) => { l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; }); }).observe({ type: 'layout-shift', buffered: true });
"""
PERF_JS = """
() => {
  const n = performance.getEntriesByType('navigation')[0];
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  const res = performance.getEntriesByType('resource');
  return { ttfb: n.responseStart - n.requestStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd,
    fcp: fcp ? fcp.startTime : null, lcp: window.__lcp, cls: window.__cls, requests: res.length + 1,
    kb: (n.encodedBodySize + res.reduce((s, r) => s + (r.encodedBodySize || 0), 0)) / 1024,
    api: res.filter((r) => r.name.includes('/api/')).map((r) => Math.round(r.duration)) };
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()

    def context(**kw):
        c = b.new_context(locale="uk-UA", bypass_csp=True, **kw)
        c.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
        c.add_init_script(PERF_INIT)
        return c

    def login(c, email, pwd):
        pg = c.new_page(); pg.goto(BASE + "/login.html")
        pg.fill("#email", email); pg.fill("#password", pwd); pg.click("#auth-submit")
        pg.wait_for_url(re.compile(r"(cabinet|admin-group)\.html")); pg.close()

    student = context(viewport={"width": 1280, "height": 900}); login(student, "ivan.petrenko@gmail.com", "znannya2026")
    admin = context(viewport={"width": 1280, "height": 900}); login(admin, "admin@znannyaplus.com.ua", "Admin2026-dev")
    guest = context(viewport={"width": 1280, "height": 900})
    STUDENT_STATE, ADMIN_STATE = student.storage_state(), admin.storage_state()

    a11y_rows, perf_rows = [], []
    for name in PAGES:
        c = admin if name.startswith("admin") else student if name in AUTH else guest
        pg = c.new_page()
        pg.goto(BASE + "/" + name, wait_until="networkidle")
        pg.wait_for_timeout(300)
        r = pg.evaluate(A11Y_JS)
        # Дерево доступності: інтерактивні елементи без доступного імені
        cdp = c.new_cdp_session(pg)
        tree = cdp.send("Accessibility.getFullAXTree")["nodes"]
        roles = {"button", "link", "textbox", "combobox", "checkbox", "radio", "searchbox", "spinbutton", "tab", "switch"}
        unnamed = [n for n in tree if not n.get("ignored") and n.get("role", {}).get("value") in roles and not (n.get("name", {}).get("value") or "").strip()]
        for n in unnamed:
            r["issues"].append({"rule": "accessible-name", "el": n["role"]["value"], "msg": "немає доступного імені"})
        # Клавіатура: перші 15 табуляцій — фокус видимий
        invisible = 0
        pg.mouse.click(1, 1)
        for _ in range(15):
            pg.keyboard.press("Tab")
            ok = pg.evaluate("() => { const e = document.activeElement; if (!e || e === document.body) return true; const s = getComputedStyle(e); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none'; }")
            invisible += 0 if ok else 1
        if invisible:
            r["issues"].append({"rule": "focus-visible", "el": "", "msg": f"{invisible} елементів без видимого фокусу"})
        a11y_rows.append((name, r["checked"], len(tree), r["issues"]))
        pg.close()

        # Продуктивність: холодне завантаження (нова сторінка без кешу), медіана з 3 запусків
        runs = []
        for _ in range(3):
            state = ADMIN_STATE if name.startswith("admin") else STUDENT_STATE if name in AUTH else None
            pc = context(viewport={"width": 1280, "height": 900}, storage_state=state)  # cookie сесії без повторного входу (ліміт 10/15 хв)
            pp = pc.new_page(); pp.goto(BASE + "/" + name, wait_until="networkidle"); pp.wait_for_timeout(200)
            runs.append(pp.evaluate(PERF_JS)); pc.close()
        med = {k: statistics.median([x[k] or 0 for x in runs]) for k in ("ttfb", "fcp", "lcp", "dcl", "load", "cls", "requests", "kb")}
        med["api"] = max((max(x["api"]) if x["api"] else 0) for x in runs)
        perf_rows.append((name, med))
    b.close()

# Час відповіді API (50 послідовних запитів)
def api_time(path, n=50):
    t = []
    for _ in range(n):
        s = time.perf_counter(); urllib.request.urlopen(BASE + path).read(); t.append((time.perf_counter() - s) * 1000)
    t.sort(); return statistics.median(t), t[int(n * 0.95) - 1]

api = {pth: api_time(pth) for pth in ["/api/courses?sort=popular&limit=4", "/api/courses?subject=math&sort=price-asc", "/api/courses/math-nmt", "/api/groups?course=math-nmt", "/api/slots"]}

print("== ДОСТУПНІСТЬ ==")
total = 0
for name, checked, nodes, issues in a11y_rows:
    total += len(issues)
    print(f"{name:28} контраст перевірено: {checked:4}  AX-вузлів: {nodes:4}  порушень: {len(issues)}")
    for i in issues: print("    -", i["rule"], i["el"], i["msg"])
print("Усього порушень:", total)
print("\n== ПРОДУКТИВНІСТЬ (медіана 3 запусків, localhost) ==")
print(f"{'сторінка':28} {'TTFB':>6} {'FCP':>6} {'LCP':>6} {'load':>6} {'CLS':>6} {'запити':>6} {'КБ':>7} {'API max':>7}")
for name, m in perf_rows:
    print(f"{name:28} {m['ttfb']:6.1f} {m['fcp']:6.0f} {m['lcp']:6.0f} {m['load']:6.0f} {m['cls']:6.3f} {m['requests']:6.0f} {m['kb']:7.1f} {m['api']:7.0f}")
print("\n== API (50 запитів) ==")
for pth, (med, p95) in api.items(): print(f"{pth:45} медіана {med:5.1f} мс   p95 {p95:5.1f} мс")
json.dump({"a11y": [(n, c, k, i) for n, c, k, i in a11y_rows], "perf": perf_rows, "api": api}, open("audit.json", "w"), ensure_ascii=False, indent=1)
