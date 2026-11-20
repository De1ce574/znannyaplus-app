'use strict';
/**
 * Інтеграційні тести REST API: npm test
 * Кожен запуск використовує окрему базу даних у пам'яті та випадковий порт.
 */
process.env.TZ = 'Europe/Kyiv';
const test = require('node:test');
const assert = require('node:assert/strict');
const { open } = require('../src/db');
const { createApp } = require('../src/app');

const config = { isProduction: false, sessionSecret: 'test-secret', adminPassword: 'Admin-test-1', sessionTtlMs: 3600e3 };
let server;
let base;

/** Простий HTTP-клієнт зі збереженням cookie (як браузер) */
function client() {
  let cookie = '';
  return async function request(method, url, body, { csrf = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (csrf) headers['X-Requested-With'] = 'ZP';
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  };
}

test.before(async () => {
  const db = open(':memory:', { adminPassword: config.adminPassword });
  const app = createApp({ db, config });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const guest = client();
const student = client();
const admin = client();

test('GET /api/health — сервер працює', async () => {
  const r = await guest('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
});

test('Заголовки безпеки та відсутність X-Powered-By', async () => {
  const r = await guest('GET', '/api/health');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('Курси: READ зі фільтрами, сортуванням і пошуком', async () => {
  const all = await guest('GET', '/api/courses');
  assert.equal(all.body.length, 10);
  const math = await guest('GET', '/api/courses?subject=math&format=online&sort=price-asc');
  assert.deepEqual(math.body.map((c) => c.id), ['algebra-10', 'math-nmt']);
  const q = await guest('GET', '/api/courses?q=python');
  assert.equal(q.body.length, 1);
  const ages = await guest('GET', '/api/courses?age=18%2B');
  assert.ok(ages.body.every((c) => c.ages.includes('18+')));
});

test('Курси: спроба SQL-ін’єкції не ламає запит', async () => {
  const r = await guest('GET', `/api/courses?q=${encodeURIComponent("' OR 1=1; DROP TABLE courses; --")}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 0);
  assert.equal((await guest('GET', '/api/courses')).body.length, 10);
});

test('Курс за id містить програму та групи; невідомий id → 404', async () => {
  const r = await guest('GET', '/api/courses/math-nmt');
  assert.equal(r.status, 200);
  assert.equal(r.body.program.length, 6);
  assert.equal(r.body.groups.length, 3);
  assert.equal((await guest('GET', '/api/courses/nope')).status, 404);
});

test('Захист від CSRF: POST без X-Requested-With → 403', async () => {
  const r = await guest('POST', '/api/consultations', { name: 'Іван', phone: '+380671234567', subject: 'Математика' }, { csrf: false });
  assert.equal(r.status, 403);
});

test('Консультація: валідація → 422 з помилками полів; коректна → 201', async () => {
  const bad = await guest('POST', '/api/consultations', { name: '1', phone: '123' });
  assert.equal(bad.status, 422);
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ['name', 'phone', 'subject']);
  const ok = await guest('POST', '/api/consultations', { name: 'Іван', phone: '+380 67 123 45 67', subject: 'Математика (НМТ)' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.phone, '+380671234567');
});

test('Некоректний JSON → 400 без деталей стеку', async () => {
  const res = await fetch(`${base}/api/consultations`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ZP' }, body: '{oops' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'Некоректний JSON у тілі запиту');
});

test('Автентифікація: реєстрація, вхід, /me, хибний пароль', async () => {
  const weak = await student('POST', '/api/auth/register', { name: 'Олена', email: 'olena@test.ua', password: 'abcdefgh' });
  assert.equal(weak.status, 422);
  const reg = await student('POST', '/api/auth/register', { name: 'Олена Петренко', email: 'olena@test.ua', password: 'parol2026' });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.role, 'student');
  assert.equal(reg.body.password_hash, undefined, 'хеш пароля не повертається клієнту');
  const dup = await guest('POST', '/api/auth/register', { name: 'Олена', email: 'OLENA@test.ua', password: 'parol2026' });
  assert.equal(dup.status, 409);
  const me = await student('GET', '/api/auth/me');
  assert.equal(me.body.email, 'olena@test.ua');
  const wrong = await guest('POST', '/api/auth/login', { email: 'olena@test.ua', password: 'wrong-pass1' });
  assert.equal(wrong.status, 401);
  const login = await admin('POST', '/api/auth/login', { email: 'admin@znannyaplus.com.ua', password: config.adminPassword });
  assert.equal(login.status, 200);
  assert.equal(login.body.role, 'admin');
});

test('Сесійна cookie: HttpOnly і SameSite', async () => {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ZP' }, body: JSON.stringify({ email: 'olena@test.ua', password: 'parol2026' }) });
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

test('Підроблена cookie сесії не дає доступу', async () => {
  const res = await fetch(`${base}/api/auth/me`, { headers: { Cookie: 'zp_session=eyJ1aWQiOjF9.fake' } });
  assert.equal(res.status, 401);
  const session = await fetch(`${base}/api/auth/session`, { headers: { Cookie: 'zp_session=eyJ1aWQiOjF9.fake' } });
  assert.deepEqual(await session.json(), { user: null });
});

test('Ролі: студент не може змінювати курси й групи (403), гість — 401', async () => {
  assert.equal((await guest('POST', '/api/groups', {})).status, 401);
  assert.equal((await student('POST', '/api/groups', {})).status, 403);
  assert.equal((await student('DELETE', '/api/courses/web')).status, 403);
  assert.equal((await student('GET', '/api/consultations')).status, 403);
});

test('Промокод: існуючий, неактивний, невідомий', async () => {
  assert.equal((await guest('GET', '/api/promo/znannya10')).body.percent, 10);
  assert.equal((await guest('GET', '/api/promo/SUMMER15')).status, 404);
  assert.equal((await guest('GET', '/api/promo/NOPE')).status, 404);
});

test('Записи: CREATE групового запису, ціну рахує сервер, місця зменшуються', async () => {
  const before = (await guest('GET', '/api/courses/web')).body.groups[0];
  const r = await student('POST', '/api/bookings', { kind: 'group', groupId: before.id, promo: 'ZNANNYA10', method: 'card', total: 1 });
  assert.equal(r.status, 201);
  assert.equal(r.body.price, 1900);
  assert.equal(r.body.total, 1710, 'сума з клієнта (total: 1) ігнорується');
  const after = (await guest('GET', '/api/courses/web')).body.groups[0];
  assert.equal(after.left, before.left - 1);
  const again = await student('POST', '/api/bookings', { kind: 'group', groupId: before.id, method: 'card' });
  assert.equal(again.status, 409);
});

test('Записи: повна група → 409; невірний промокод → 422', async () => {
  const full = (await guest('GET', '/api/courses/ukr-nmt')).body.groups[0];
  assert.equal((await student('POST', '/api/bookings', { kind: 'group', groupId: full.id, method: 'card' })).status, 409);
  const g = (await guest('GET', '/api/courses/math-nmt')).body.groups[0];
  assert.equal((await student('POST', '/api/bookings', { kind: 'group', groupId: g.id, promo: 'FAKE', method: 'card' })).status, 422);
});

function slotInDays(days, hour) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

test('Індивідуальний слот: CREATE, подвійне бронювання → 409, неіснуючий час → 422', async () => {
  const slotAt = slotInDays(5, 12);
  const r = await student('POST', '/api/bookings', { kind: 'individual', slotAt, method: 'apple' });
  assert.equal(r.status, 201);
  assert.equal(r.body.total, 450);
  assert.equal((await admin('POST', '/api/bookings', { kind: 'individual', slotAt, method: 'card' })).status, 409);
  assert.equal((await student('POST', '/api/bookings', { kind: 'individual', slotAt: slotInDays(5, 13), method: 'card' })).status, 422);
  const slots = await guest('GET', '/api/slots');
  assert.ok(slots.body.includes(slotAt));
});

test('Записи: READ лише власних; чужий запис → 404', async () => {
  const mine = await student('GET', '/api/bookings');
  assert.equal(mine.body.length, 2);
  assert.equal((await admin('GET', `/api/bookings/${mine.body[0].id}`)).status, 404);
});

test('Записи: UPDATE (скасування) з поверненням на баланс; DELETE з історії', async () => {
  const [first] = (await student('GET', '/api/bookings')).body;
  const r = await student('PATCH', `/api/bookings/${first.id}`, { status: 'cancelled', refund: 'balance' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'cancelled');
  assert.equal((await student('GET', '/api/auth/me')).body.balance, first.total);
  assert.equal((await student('PATCH', `/api/bookings/${first.id}`, { status: 'cancelled', refund: 'card' })).status, 409);
  assert.equal((await student('DELETE', `/api/bookings/${first.id}`)).status, 204);
  assert.equal((await student('GET', `/api/bookings/${first.id}`)).status, 404);
});

test('Правило 12 годин: заняття, до якого менше 12 год, не скасовується (409)', async () => {
  const ivan = client();
  await ivan('POST', '/api/auth/login', { email: 'ivan.petrenko@gmail.com', password: 'znannya2026' });
  const soon = (await ivan('GET', '/api/bookings')).body.find((b) => b.status === 'paid' && new Date(b.slotAt) > Date.now());
  assert.equal(soon.canCancel, false);
  const r = await ivan('PATCH', `/api/bookings/${soon.id}`, { status: 'cancelled', refund: 'card' });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /12 год/);
});

test('Групи (адмін): CREATE з перевіркою перетину, UPDATE статусу, DELETE', async () => {
  const conflict = await admin('POST', '/api/groups', { courseId: 'math-nmt', tutor: 'Олена Коваль', days: ['Пн'], startTime: '18:30', minutes: 90, startDate: '2027-02-01', seats: 10 });
  assert.equal(conflict.status, 409);
  assert.match(conflict.body.fields.startTime, /М-1/);
  const past = await admin('POST', '/api/groups', { courseId: 'math-nmt', tutor: 'Олена Коваль', days: ['Пт'], startTime: '19:00', minutes: 90, startDate: '2020-01-01', seats: 40 });
  assert.equal(past.status, 422);
  assert.ok(past.body.fields.startDate && past.body.fields.seats);
  const created = await admin('POST', '/api/groups', { courseId: 'math-nmt', tutor: 'Олена Коваль', days: ['Пт', 'Сб'], startTime: '18:00', minutes: 90, startDate: '2027-02-05', seats: 12, status: 'draft' });
  assert.equal(created.status, 201);
  assert.equal(created.body.code, 'М-4');
  assert.equal((await guest('GET', '/api/groups?course=math-nmt')).body.some((g) => g.code === 'М-4'), false, 'чернетку не видно відвідувачам');
  const published = await admin('PATCH', `/api/groups/${created.body.id}`, { status: 'publish' });
  assert.equal(published.body.status, 'publish');
  assert.equal((await guest('GET', '/api/groups?course=math-nmt')).body.some((g) => g.code === 'М-4'), true);
  assert.equal((await admin('DELETE', `/api/groups/${created.body.id}`)).status, 204);
  const m1 = (await guest('GET', '/api/groups?course=math-nmt')).body.find((g) => g.code === 'М-1');
  assert.equal((await admin('DELETE', `/api/groups/${m1.id}`)).status, 409, 'групу з учнями видалити не можна');
});

test('Курси (адмін): CREATE, UPDATE, DELETE', async () => {
  const created = await admin('POST', '/api/courses', { id: 'physics-nmt', title: 'НМТ: фізика', subject: 'math', tutor: 'Максим Гнатюк', months: 8, perWeek: 2, format: 'online', level: 'middle', ages: '16-17', price: 1600 });
  assert.equal(created.status, 201);
  const updated = await admin('PUT', '/api/courses/physics-nmt', { price: 1700 });
  assert.equal(updated.body.price, 1700);
  assert.equal((await admin('DELETE', '/api/courses/physics-nmt')).status, 204);
  assert.equal((await guest('GET', '/api/courses/physics-nmt')).status, 404);
  assert.equal((await admin('DELETE', '/api/courses/math-nmt')).status, 409);
});

test('Консультації (адмін): READ, UPDATE статусу, DELETE', async () => {
  const list = await admin('GET', '/api/consultations?status=new');
  assert.ok(list.body.length >= 2);
  const id = list.body[0].id;
  assert.equal((await admin('PATCH', `/api/consultations/${id}`, { status: 'done' })).body.status, 'done');
  assert.equal((await admin('DELETE', `/api/consultations/${id}`)).status, 204);
  assert.equal((await admin('DELETE', `/api/consultations/${id}`)).status, 404);
});

test('Невідомий маршрут API → 404 JSON; некоректний id → 400', async () => {
  const r = await guest('GET', '/api/unknown');
  assert.equal(r.status, 404);
  assert.ok(r.body.error);
  assert.equal((await admin('PATCH', '/api/consultations/abc', { status: 'done' })).status, 400);
});

test('Обмеження частоти входу: 11-та спроба → 429', async () => {
  const attacker = client();
  let last;
  for (let i = 0; i < 12; i += 1) last = await attacker('POST', '/api/auth/login', { email: 'nobody@test.ua', password: `guess${i}` });
  assert.equal(last.status, 429);
});
