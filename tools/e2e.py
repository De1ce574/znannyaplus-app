"""E2E-перевірка клієнта ЛР5 (Playwright) проти запущеного сервера."""
import re, sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
SHOTS = "shots"
errors, results = [], []


def check(name, cond):
    results.append((name, bool(cond)))
    print(("OK   " if cond else "FAIL ") + name)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, locale="uk-UA", timezone_id="Europe/Kyiv", bypass_csp=True)
    ctx.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and errors.append(f"{page.url}: {m.text}"))
    page.on("pageerror", lambda e: errors.append(f"{page.url}: {e}"))

    # 1. Головна: популярні курси з API + заявка на консультацію
    page.goto(BASE + "/index.html")
    page.wait_for_selector("#popular-list .course-card, #popular-list article")
    check("index: популярні курси з API", page.locator("#popular-list > *").count() == 4)
    page.fill("#c-name", "Марія Шевченко")
    page.fill("#c-phone", "671234567")
    page.select_option("#c-subject", index=1)
    page.locator("#consultation-form input[type=checkbox]").check(force=True)
    page.click("#consultation-form [type=submit]")
    page.wait_for_timeout(700)
    check("index: заявку збережено на сервері", "№" in page.content() or "Дякуємо" in page.content())
    page.screenshot(path=f"{SHOTS}/01_index.png")

    # 2. Каталог: фільтри → запит до API, адреса оновлюється
    page.goto(BASE + "/catalog.html")
    page.wait_for_function("document.querySelector('#results-count').textContent.startsWith('Знайдено')")
    total = page.locator("#course-list > li, #course-list > article").count()
    page.locator("#filters input[name=subject][value=math]").check(force=True)
    page.wait_for_timeout(600)
    math = page.locator("#course-list > *").count()
    check(f"catalog: фільтр предмета ({total} → {math})", 0 < math < total and "subject=math" in page.url)
    page.fill("#p-from", "5000"); page.fill("#p-to", "100")
    page.wait_for_timeout(500)
    check("catalog: перевірка діапазону цін", page.locator("text=не менше, ніж «Від»").count() == 1)
    page.fill("#p-from", ""); page.fill("#p-to", "")
    page.fill("#filters input[type=search]", "zzzz")
    page.wait_for_timeout(800)
    check("catalog: порожній стан", page.locator("#empty-state").is_visible())
    page.goto(BASE + "/catalog.html?subject=math")
    page.wait_for_timeout(500)
    page.screenshot(path=f"{SHOTS}/02_catalog.png")

    # 3. Курс → групи з API
    page.goto(BASE + "/course.html?id=math-nmt")
    page.wait_for_selector("#groups-list .group-row")
    check("course: дані курсу з API", page.locator("#course-title").inner_text().startswith("Підготовка"))
    check("course: група М-3 заповнена → лист очікування", page.locator("#groups-list button:has-text('Лист очікування')").count() >= 1)
    page.goto(BASE + "/course.html?id=nope")
    page.wait_for_selector("text=Курс не знайдено")
    check("course: 404 для неіснуючого курсу", True)

    # 4. Запис без входу → логін → повернення
    page.goto(BASE + "/checkout.html?group=1")
    page.wait_for_url(re.compile(r"login\.html\?next="))
    check("checkout: гостя перенаправлено на вхід", "next=checkout.html" in page.url)

    # 5. Реєстрація нового користувача
    page.goto(BASE + "/login.html#register")
    page.fill("#name", "Олег Тестовий")
    page.fill("#email", "oleg.test@example.com")
    page.fill("#password", "secret123")
    page.fill("#password2", "secret123")
    page.click("#auth-submit")
    page.wait_for_url(re.compile(r"cabinet\.html"))
    page.wait_for_timeout(500)
    check("register: перехід до кабінету", page.locator("[data-me=name]").inner_text() == "Олег Тестовий")
    check("cabinet: порожній розклад", "Запланованих занять немає" in page.content())

    # 6. Оплата групи М-1 з промокодом
    page.goto(BASE + "/checkout.html?group=1")
    page.wait_for_function("document.querySelector('#order-title').textContent !== '—'")
    page.fill("#promo", "nope"); page.click("#promo-apply"); page.wait_for_timeout(400)
    check("checkout: неіснуючий промокод", "не знайдено" in page.content())
    page.fill("#promo", "znannya10"); page.click("#promo-apply"); page.wait_for_timeout(400)
    total_text = page.locator("#order-total").inner_text()
    check(f"checkout: знижка 10% ({total_text})", "1" in total_text and page.locator("#discount-row").is_visible())
    page.screenshot(path=f"{SHOTS}/03_checkout.png")
    page.check("#offer", force=True)
    page.click("#pay")
    page.wait_for_url(re.compile(r"success\.html\?id=\d+"))
    page.wait_for_selector("#paid-details .summary-line")
    check("success: дані запису з API", "ZNANNYA10" in page.content())
    page.screenshot(path=f"{SHOTS}/04_success.png")

    # повторний запис у ту саму групу → 409
    page.goto(BASE + "/checkout.html?group=1")
    page.wait_for_function("document.querySelector('#order-title').textContent !== '—'")
    page.check("#offer", force=True); page.click("#pay"); page.wait_for_timeout(600)
    check("checkout: повторний запис → 409", "вже записані" in page.locator("#pay-error").inner_text())

    # 7. Індивідуальне заняття
    page.goto(BASE + "/booking.html")
    page.wait_for_selector("#calendar-grid input[name=slot]:not([disabled])")
    page.locator("#calendar-grid input[name=slot]:not([disabled])").first.check(force=True)
    page.click("#confirm")
    page.wait_for_url(re.compile(r"checkout\.html\?slot="))
    page.wait_for_function("document.querySelector('#order-title').textContent !== '—'")
    page.check("#offer", force=True); page.click("#pay")
    page.wait_for_url(re.compile(r"success\.html"))
    page.wait_for_selector("#paid-details .summary-line")
    check("booking: індивідуальний запис створено", "індивідуальне" in page.content())

    # 8. Кабінет: скасування й видалення
    page.goto(BASE + "/cabinet.html")
    page.wait_for_selector("#upcoming .lesson")
    check("cabinet: 2 найближчі заняття", page.locator("#upcoming .lesson").count() == 2)
    page.screenshot(path=f"{SHOTS}/05_cabinet.png")
    page.locator("#upcoming [data-action=cancel]:not([disabled])").first.click()
    page.locator("#cancel-form input[value=balance]").check(force=True)
    page.click("#cancel-form [type=submit]")
    page.wait_for_timeout(700)
    check("cabinet: скасування → баланс", page.locator("#balance").inner_text() != "0 грн")
    page.click("#tab-past")
    page.locator("#past [data-action=delete]").first.click()
    page.wait_for_timeout(600)
    check("cabinet: видалення з історії", page.locator("#past .lesson").count() == 0)

    # слот, що вже зайнятий, недоступний у календарі
    page.goto(BASE + "/settings.html")
    page.wait_for_timeout(400)
    page.fill("#parent-email", "oleg.test@example.com"); page.click("#invite-form [type=submit]")
    check("settings: власний e-mail з API відхилено", "не власний" in page.content())

    # 9. Звичайний користувач не має доступу до адмінки
    page.goto(BASE + "/admin-group.html")
    page.wait_for_url(re.compile(r"login\.html.*denied=1"))
    check("admin: учня перенаправлено (denied)", page.locator("#auth-error").is_visible())

    # вихід
    page.goto(BASE + "/cabinet.html"); page.wait_for_selector("#logout")
    page.click("#logout"); page.wait_for_url(re.compile(r"index\.html"))
    page.goto(BASE + "/cabinet.html"); page.wait_for_url(re.compile(r"login\.html"))
    check("logout: сесію завершено", True)

    # 10. Демо-вхід і вхід адміністратора
    page.goto(BASE + "/login.html")
    page.click("#demo-login")
    page.wait_for_url(re.compile(r"cabinet\.html")); page.wait_for_selector("#upcoming .lesson")
    check("demo: розклад демо-учня", page.locator("#upcoming .lesson").count() >= 2)
    check("cabinet: правило 12 год (кнопка заблокована)", page.locator("#upcoming [data-action=cancel][disabled]").count() >= 1)
    page.screenshot(path=f"{SHOTS}/06_cabinet_demo.png")
    page.click("#logout"); page.wait_for_url(re.compile(r"index\.html"))

    page.goto(BASE + "/login.html")
    page.fill("#email", "admin@znannyaplus.com.ua"); page.fill("#password", "wrongpass1"); page.click("#auth-submit")
    page.wait_for_timeout(500)
    check("login: невірний пароль → повідомлення", page.locator("#auth-error").is_visible())
    page.fill("#password", "Admin2026-dev"); page.click("#auth-submit")
    page.wait_for_url(re.compile(r"admin-group\.html"))
    page.wait_for_selector("#groups-body tr[data-id]")
    n0 = page.locator("#groups-body tr[data-id]").count()
    check(f"admin: таблиця груп з чернетками ({n0})", n0 >= 15)
    page.select_option("#groups-filter", "math-nmt"); page.wait_for_timeout(500)
    check("admin: фільтр за курсом", page.locator("#groups-body tr[data-id]").count() == 3)
    page.select_option("#groups-filter", "")
    # конфлікт розкладу (клієнтська перевірка)
    page.select_option("#g-course", "math-nmt")
    page.fill("#g-start", "2027-01-11")
    page.locator("#g-day-0").check(force=True)
    page.fill("#g-time", "18:30"); page.fill("#g-max", "8")
    page.locator("#group-form button[value=publish]").click()
    page.wait_for_timeout(400)
    check("admin: конфлікт розкладу виявлено", "Перетин із групою М-1" in page.content())
    page.screenshot(path=f"{SHOTS}/07_admin_conflict.png", full_page=True)
    page.fill("#g-time", "10:00")
    page.locator("#group-form button[value=draft]").click()
    page.wait_for_timeout(800)
    check("admin: групу створено (чернетка)", page.locator("#groups-body tr.is-updated").count() == 1 and "М-4" in page.locator("#groups-body").inner_text())
    page.locator("#groups-body tr.is-updated [data-action=toggle]").click(); page.wait_for_timeout(500)
    check("admin: публікація (PATCH)", "Опубліковано" in page.locator("#groups-body tr.is-updated").inner_text())
    page.locator("#groups-body tr:has-text('М-4') [data-action=delete]").click()
    page.click("#confirm-form [type=submit]"); page.wait_for_timeout(500)
    check("admin: видалення групи (DELETE)", "М-4" not in page.locator("#groups-body").inner_text())
    page.locator("#groups-body tr:has-text('М-1') [data-action=delete]").click()
    page.click("#confirm-form [type=submit]"); page.wait_for_timeout(500)
    check("admin: групу із записами не видалено (409)", "М-1" in page.locator("#groups-body").inner_text())
    page.wait_for_selector("#consult-body tr[data-id]")
    nc = page.locator("#consult-body tr[data-id]").count()
    check(f"admin: заявки з сервера ({nc})", nc >= 3)
    page.locator("#consult-body input[data-action=done]").first.check(force=True); page.wait_for_timeout(400)
    page.select_option("#consult-filter", "done"); page.wait_for_timeout(400)
    check("admin: статус заявки (PATCH)", page.locator("#consult-body tr[data-id]").count() >= 1)
    page.select_option("#consult-filter", "")
    page.wait_for_timeout(400)
    page.locator("#groups-body").scroll_into_view_if_needed()
    page.screenshot(path=f"{SHOTS}/08_admin.png", full_page=True)

    # 11. Мобільна версія
    m = b.new_context(viewport={"width": 375, "height": 812}, device_scale_factor=2, locale="uk-UA", bypass_csp=True)
    m.route(re.compile(r"fonts\.(googleapis|gstatic)\.com"), lambda r: r.fulfill(status=200, body="", content_type="text/css"))
    mp = m.new_page(); mp.goto(BASE + "/catalog.html"); mp.wait_for_timeout(600)
    sw = mp.evaluate("document.documentElement.scrollWidth")
    check(f"mobile: без горизонтальної прокрутки ({sw}px)", sw <= 375)
    mp.screenshot(path=f"{SHOTS}/09_mobile.png")
    b.close()

print("\nConsole errors:", *errors, sep="\n  ") if errors else print("\nConsole errors: none")
print(f"{sum(r for _, r in results)}/{len(results)} passed")
