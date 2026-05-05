const express = require('express');
const session = require('express-session');
const QRCode = require('qrcode');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { run, get, all } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

const uploadDir = path.join(__dirname, 'uploads', 'logos');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, 'logo_' + Date.now() + (path.extname(file.originalname || '') || '.png'))
  })
});

app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(session({
  secret: 'parkcontrol-secret',
  resave: false,
  saveUninitialized: false
}));

const tr = {
  de: {
    app: 'ParkControl B2B',
    dashboard: 'Dashboard',
    entry: 'Einfahrt',
    exit: 'Ausfahrt',
    tickets: 'Tickets',
    garages: 'ParkhÃ¤user',
    spots: 'ParkplÃ¤tze',
    rates: 'Tarife',
    monthly: 'Monatsmieter',
    users: 'Benutzer',
    logo: 'Logo',
    companies: 'Firmen',
    contract: 'Vertrag',
    logout: 'Logout',
    login: 'Login',
    user: 'Benutzername',
    pass: 'Passwort',
    signin: 'Einloggen',
    failed: 'Login fehlgeschlagen',
    back: 'ZurÃ¼ck',
    denied: 'Kein Zugriff',
    employeeHint: 'Employee darf nur Einfahrt, Ausfahrt, Tickets und Vertrag sehen.'
  },
  es: {
    app: 'ParkControl B2B',
    dashboard: 'Panel',
    entry: 'Entrada',
    exit: 'Salida',
    tickets: 'Tickets',
    garages: 'Estacionamientos',
    spots: 'Plazas',
    rates: 'Tarifas',
    monthly: 'Mensuales',
    users: 'Usuarios',
    logo: 'Logo',
    companies: 'Empresas',
    contract: 'Contrato',
    logout: 'Cerrar sesiÃ³n',
    login: 'Login',
    user: 'Usuario',
    pass: 'ContraseÃ±a',
    signin: 'Entrar',
    failed: 'Login fallido',
    back: 'Volver',
    denied: 'Sin acceso',
    employeeHint: 'Employee solo puede ver entrada, salida, tickets y contrato.'
  },
  en: {
    app: 'ParkControl B2B',
    dashboard: 'Dashboard',
    entry: 'Entry',
    exit: 'Exit',
    tickets: 'Tickets',
    garages: 'Garages',
    spots: 'Parking spots',
    rates: 'Rates',
    monthly: 'Monthly renters',
    users: 'Users',
    logo: 'Logo',
    companies: 'Companies',
    contract: 'Contract',
    logout: 'Logout',
    login: 'Login',
    user: 'Username',
    pass: 'Password',
    signin: 'Sign in',
    failed: 'Login failed',
    back: 'Back',
    denied: 'No access',
    employeeHint: 'Employee can only see entry, exit, tickets and contract.'
  },
  pt: {
    app: 'ParkControl B2B',
    dashboard: 'Painel',
    entry: 'Entrada',
    exit: 'SaÃ­da',
    tickets: 'Tickets',
    garages: 'Estacionamentos',
    spots: 'Vagas',
    rates: 'Tarifas',
    monthly: 'Mensalistas',
    users: 'UsuÃ¡rios',
    logo: 'Logo',
    companies: 'Empresas',
    contract: 'Contrato',
    logout: 'Sair',
    login: 'Login',
    user: 'UsuÃ¡rio',
    pass: 'Senha',
    signin: 'Entrar',
    failed: 'Falha no login',
    back: 'Voltar',
    denied: 'Sem acesso',
    employeeHint: 'Employee sÃ³ pode ver entrada, saÃ­da, tickets e contrato.'
  }
};

function lang(req) {
  return req.session.lang || 'de';
}

function t(req, key) {
  return tr[lang(req)]?.[key] || tr.de[key] || key;
}

function esc(v = '') {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(v) {
  return `${Number(v || 0)} PYG`;
}

function canManage(role) {
  return role === 'admin' || role === 'superadmin';
}

function canWork(role) {
  return role === 'employee' || role === 'admin' || role === 'superadmin';
}

async function companyOf(user) {
  if (!user) return null;
  return await get('SELECT * FROM companies WHERE id = ?', [user.company_id]);
}

async function garagesFor(user) {
  if (user.role === 'superadmin') {
    return await all('SELECT * FROM garages ORDER BY name');
  }
  return await all('SELECT * FROM garages WHERE company_id = ? ORDER BY name', [user.company_id]);
}

async function calc(ticket) {
  if (ticket.monthly_customer_id) {
    return { minutes: 0, total: 0 };
  }

  const rate = await get('SELECT * FROM rates WHERE garage_id = ?', [ticket.garage_id]);
  const mins = Math.max(1, Math.ceil((Date.now() - new Date(ticket.entry_time).getTime()) / 60000));
  const hrs = mins / 60;
  let total = 0;

  if (rate) {
    if (hrs >= 24 && Number(rate.day_price || 0) > 0) {
      total = Math.ceil(hrs / 24) * Number(rate.day_price || 0);
    } else if (hrs > 5 && Number(rate.price_after_5_hours || 0) > 0) {
      total = Math.ceil(hrs) * Number(rate.price_after_5_hours || 0);
    } else if (Number(rate.price_per_half_hour || 0) > 0) {
      total = Math.ceil(mins / 30) * Number(rate.price_per_half_hour || 0);
    } else {
      total = Math.ceil(hrs) * Number(rate.price_per_hour || 0);
    }
  }

  return { minutes: mins, total };
}

function page(title, body, user, company, req) {
  const role = user?.role || '';

  const logo = company?.logo_path
    ? `<img src="${esc(company.logo_path)}" style="height:54px;max-width:180px;object-fit:contain;background:white;padding:6px;border-radius:10px;">`
    : '';

  const nav = user ? `
    <div class="nav">
      <a href="/">${t(req, 'dashboard')}</a>
      ${canWork(role) ? `<a href="/entry">${t(req, 'entry')}</a>` : ''}
      ${canWork(role) ? `<a href="/exit">${t(req, 'exit')}</a>` : ''}
      ${canWork(role) ? `<a href="/tickets">${t(req, 'tickets')}</a>` : ''}

      ${canManage(role) ? `<a href="/garages">${t(req, 'garages')}</a>` : ''}
      ${canManage(role) ? `<a href="/spots">${t(req, 'spots')}</a>` : ''}
      ${canManage(role) ? `<a href="/rates">${t(req, 'rates')}</a>` : ''}
      ${canManage(role) ? `<a href="/monthly-customers">${t(req, 'monthly')}</a>` : ''}
      ${canManage(role) ? `<a href="/users">${t(req, 'users')}</a>` : ''}
      ${canManage(role) ? `<a href="/company-brand">${t(req, 'logo')}</a>` : ''}

      ${role === 'superadmin' ? `<a href="/companies">${t(req, 'companies')}</a>` : ''}
      <a href="/subscription">${t(req, 'contract')}</a>
      <a href="/logout">${t(req, 'logout')}</a>
    </div>
  ` : '';

  return `<!doctype html>
<html lang="${lang(req)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
*{box-sizing:border-box}
body{font-family:Arial;margin:0;background:#f3f4f6;color:#111827}
.top{background:#111827;color:white;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.nav{background:#1f2937;padding:12px 20px;display:flex;gap:10px;flex-wrap:wrap}
.nav a{color:white;text-decoration:none;background:#374151;padding:8px 12px;border-radius:8px}
.container{max-width:1300px;margin:20px auto;padding:0 16px 40px}
.card{background:white;padding:18px;border-radius:14px;box-shadow:0 2px 12px rgba(0,0,0,.08);margin-bottom:16px}
input,select,button{width:100%;padding:10px;margin-top:6px;margin-bottom:12px;border:1px solid #d1d5db;border-radius:8px}
button{background:#111827;color:white;cursor:pointer}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.small{max-width:620px;margin:0 auto}
.big{font-size:28px;font-weight:bold}
.ticket-box{border:2px dashed #111827;padding:18px;border-radius:12px;max-width:460px;margin:0 auto 16px;background:white}
.danger{background:#7f1d1d!important}
.ok{background:#065f46!important}
.button-link{display:inline-block;padding:10px 14px;background:#111827;color:white;border-radius:8px;text-decoration:none}
.lang{display:flex;gap:8px;flex-wrap:wrap}
.lang a{color:white;text-decoration:none;border:1px solid rgba(255,255,255,.25);padding:6px 10px;border-radius:8px}
</style>
</head>
<body>
<div class="top">
  <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
    ${logo}
    <div>
      <h1 style="margin:0">${t(req, 'app')}</h1>
      <div>${user ? `${t(req, 'user')}: ${esc(user.username)} (${esc(user.role)})` : '-'}</div>
      ${company ? `<div>${esc(company.name || '')}</div>` : ''}
    </div>
  </div>
  <div class="lang">
    <a href="/lang/de">DE</a>
    <a href="/lang/es">ES</a>
    <a href="/lang/en">EN</a>
    <a href="/lang/pt">PT</a>
  </div>
</div>
${nav}
<div class="container">${body}</div>
</body>
</html>`;
}

app.get('/lang/:code', (req, res) => {
  const allowed = ['de', 'es', 'en', 'pt'];
  req.session.lang = allowed.includes(req.params.code) ? req.params.code : 'de';
  res.redirect('back');
});

app.use(async (req, res, next) => {
  if (!req.session.user) {
    req.currentCompany = null;
    return next();
  }

  req.currentCompany = await companyOf(req.session.user);

  const blocked =
    req.session.user.role !== 'superadmin' &&
    req.currentCompany &&
    Number(req.currentCompany.is_blocked) === 1;

  if (blocked && !['/subscription', '/logout'].includes(req.path) && !req.path.startsWith('/lang/')) {
    return res.send(page(
      'Gesperrt',
      `<div class="card small">
        <h2>Diese Firma ist aktuell gesperrt.</h2>
        <p>Nur Vertragsansicht und Logout sind erlaubt.</p>
        <a class="button-link" href="/subscription">Vertrag</a>
      </div>`,
      req.session.user,
      req.currentCompany,
      req
    ));
  }

  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireManage(req, res, next) {
  if (!req.session.user) return res.redirect('/login');

  if (!canManage(req.session.user.role)) {
    return res.send(page(
      t(req, 'denied'),
      `<div class="card"><h2>${t(req, 'denied')}</h2><p>${t(req, 'employeeHint')}</p></div>`,
      req.session.user,
      req.currentCompany,
      req
    ));
  }

  next();
}

function requireWork(req, res, next) {
  if (!req.session.user) return res.redirect('/login');

  if (!canWork(req.session.user.role)) {
    return res.send(page(
      t(req, 'denied'),
      `<div class="card"><h2>${t(req, 'denied')}</h2></div>`,
      req.session.user,
      req.currentCompany,
      req
    ));
  }

  next();
}

app.get('/login', (req, res) => {
  res.send(page(t(req, 'login'), `
    <div class="card small">
      <h2>${t(req, 'login')}</h2>
      <form method="post" action="/login">
        <label>${t(req, 'user')}</label>
        <input name="username" required>
        <label>${t(req, 'pass')}</label>
        <input type="password" name="password" required>
        <button>${t(req, 'signin')}</button>
      </form>
      <p>Superadmin: master / Parkcontrol2026!</p>
      <p>Admin: admin / Parkcontrol2026!</p>
      <p>Employee: employee / Parkcontrol2026!</p>
    </div>
  `, null, null, req));
});

app.post('/login', async (req, res) => {
  const user = await get(
    'SELECT * FROM users WHERE username = ? AND password = ? AND active = 1',
    [req.body.username, req.body.password]
  );

  if (!user) {
    return res.send(page(t(req, 'login'), `
      <div class="card small">
        <h2>${t(req, 'failed')}</h2>
        <a class="button-link" href="/login">${t(req, 'back')}</a>
      </div>
    `, null, null, req));
  }

  req.session.user = user;
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/', requireAuth, async (req, res) => {
  const u = req.session.user;

  const ticketCount = u.role === 'superadmin'
    ? await get('SELECT COUNT(*) c FROM tickets')
    : await get('SELECT COUNT(*) c FROM tickets WHERE company_id = ?', [u.company_id]);

  const garageCount = u.role === 'superadmin'
    ? await get('SELECT COUNT(*) c FROM garages')
    : await get('SELECT COUNT(*) c FROM garages WHERE company_id = ?', [u.company_id]);

  const spotCount = u.role === 'superadmin'
    ? await get('SELECT COUNT(*) c FROM spots')
    : await get('SELECT COUNT(*) c FROM spots WHERE garage_id IN (SELECT id FROM garages WHERE company_id = ?)', [u.company_id]);

  res.send(page(t(req, 'dashboard'), `
    <div class="grid">
      <div class="card"><h3>${t(req, 'tickets')}</h3><div class="big">${ticketCount.c}</div></div>
      <div class="card"><h3>${t(req, 'garages')}</h3><div class="big">${garageCount.c}</div></div>
      <div class="card"><h3>${t(req, 'spots')}</h3><div class="big">${spotCount.c}</div></div>
    </div>
  `, u, req.currentCompany, req));
});

app.get('/subscription', requireAuth, async (req, res) => {
  const c = req.currentCompany;

  if (req.session.user.role === 'superadmin') {
    const companies = await all('SELECT * FROM companies ORDER BY id DESC');

    return res.send(page(t(req, 'contract'), `
      <div class="card">
        <h2>VertragsÃ¼bersicht</h2>
        <table>
          <tr>
            <th>ID</th><th>Firma</th><th>Plan</th><th>Status</th><th>MonatsgebÃ¼hr</th><th>FÃ¤lligkeit</th><th>Letzte Zahlung</th><th>Gesperrt</th>
          </tr>
          ${companies.map(x => `
            <tr>
              <td>${x.id}</td>
              <td>${esc(x.name)}</td>
              <td>${esc(x.subscription_plan || '')}</td>
              <td>${esc(x.subscription_status || '')}</td>
              <td>${money(x.monthly_fee || 0)}</td>
              <td>${esc(x.next_due_date || '')}</td>
              <td>${esc(x.last_payment_date || '')}</td>
              <td>${Number(x.is_blocked) ? 'Ja' : 'Nein'}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    `, req.session.user, c, req));
  }

  res.send(page(t(req, 'contract'), `
    <div class="card small">
      <h2>${t(req, 'contract')}</h2>
      <p><strong>Firma:</strong> ${esc(c?.name || '')}</p>
      <p><strong>Plan:</strong> ${esc(c?.subscription_plan || '')}</p>
      <p><strong>Status:</strong> ${esc(c?.subscription_status || '')}</p>
      <p><strong>MonatsgebÃ¼hr:</strong> ${money(c?.monthly_fee || 0)}</p>
      <p><strong>FÃ¤lligkeit:</strong> ${esc(c?.next_due_date || '')}</p>
      <p><strong>Letzte Zahlung:</strong> ${esc(c?.last_payment_date || '')}</p>
      <p><strong>Gesperrt:</strong> ${Number(c?.is_blocked) ? 'Ja' : 'Nein'}</p>
    </div>
  `, req.session.user, c, req));
});

app.get('/companies', requireAuth, async (req, res) => {
  if (req.session.user.role !== 'superadmin') {
    return res.send(page(t(req, 'denied'), `<div class="card"><h2>${t(req, 'denied')}</h2></div>`, req.session.user, req.currentCompany, req));
  }

  const companies = await all('SELECT * FROM companies ORDER BY id DESC');

  res.send(page(t(req, 'companies'), `
    <div class="grid">
      <div class="card">
        <h2>Firma anlegen</h2>
        <form method="post" action="/companies/create">
          <label>Name</label>
          <input name="name" required>
          <label>Plan</label>
          <select name="subscription_plan">
            <option>Basic</option>
            <option>Pro</option>
            <option>Enterprise</option>
          </select>
          <label>MonatsgebÃ¼hr</label>
          <input name="monthly_fee" value="0">
          <label>FÃ¤lligkeit</label>
          <input type="date" name="next_due_date">
          <button>Speichern</button>
        </form>
      </div>

      <div class="card">
        <h2>Firmen</h2>
        <table>
          <tr>
            <th>ID</th><th>Firma</th><th>Plan</th><th>Status</th><th>MonatsgebÃ¼hr</th><th>FÃ¤lligkeit</th><th>Gesperrt</th><th>Aktion</th>
          </tr>
          ${companies.map(c => `
            <tr>
              <td>${c.id}</td>
              <td>${esc(c.name)}</td>
              <td>${esc(c.subscription_plan || '')}</td>
              <td>${esc(c.subscription_status || '')}</td>
              <td>${money(c.monthly_fee || 0)}</td>
              <td>${esc(c.next_due_date || '')}</td>
              <td>${Number(c.is_blocked) ? 'Ja' : 'Nein'}</td>
              <td>
                <form method="post" action="/companies/update">
                  <input type="hidden" name="company_id" value="${c.id}">
                  <select name="subscription_plan">
                    <option ${c.subscription_plan === 'Basic' ? 'selected' : ''}>Basic</option>
                    <option ${c.subscription_plan === 'Pro' ? 'selected' : ''}>Pro</option>
                    <option ${c.subscription_plan === 'Enterprise' ? 'selected' : ''}>Enterprise</option>
                  </select>
                  <select name="subscription_status">
                    <option value="paid" ${c.subscription_status === 'paid' ? 'selected' : ''}>paid</option>
                    <option value="unpaid" ${c.subscription_status === 'unpaid' ? 'selected' : ''}>unpaid</option>
                  </select>
                  <input name="monthly_fee" value="${c.monthly_fee || 0}">
                  <input type="date" name="next_due_date" value="${c.next_due_date || ''}">
                  <input type="date" name="last_payment_date" value="${c.last_payment_date || ''}">
                  <button>Speichern</button>
                </form>
                <form method="post" action="/companies/toggle-block">
                  <input type="hidden" name="company_id" value="${c.id}">
                  <button class="${Number(c.is_blocked) ? 'ok' : 'danger'}">${Number(c.is_blocked) ? 'Entsperren' : 'Sperren'}</button>
                </form>
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `, req.session.user, req.currentCompany, req));
});

app.post('/companies/create', requireAuth, async (req, res) => {
  if (req.session.user.role !== 'superadmin') return res.redirect('/');

  await run(
    `INSERT INTO companies (name, subscription_plan, subscription_status, monthly_fee, next_due_date, last_payment_date, is_blocked)
     VALUES (?, ?, 'unpaid', ?, ?, '', 0)`,
    [req.body.name, req.body.subscription_plan || 'Basic', Number(req.body.monthly_fee || 0), req.body.next_due_date || '']
  );

  res.redirect('/companies');
});

app.post('/companies/update', requireAuth, async (req, res) => {
  if (req.session.user.role !== 'superadmin') return res.redirect('/');

  await run(
    `UPDATE companies SET subscription_plan = ?, subscription_status = ?, monthly_fee = ?, next_due_date = ?, last_payment_date = ? WHERE id = ?`,
    [req.body.subscription_plan || 'Basic', req.body.subscription_status || 'unpaid', Number(req.body.monthly_fee || 0), req.body.next_due_date || '', req.body.last_payment_date || '', req.body.company_id]
  );

  res.redirect('/companies');
});

app.post('/companies/toggle-block', requireAuth, async (req, res) => {
  if (req.session.user.role !== 'superadmin') return res.redirect('/');

  const c = await get('SELECT * FROM companies WHERE id = ?', [req.body.company_id]);
  await run('UPDATE companies SET is_blocked = ? WHERE id = ?', [Number(c?.is_blocked) ? 0 : 1, req.body.company_id]);

  res.redirect('/companies');
});

app.get('/company-brand', requireManage, async (req, res) => {
  const user = req.session.user;
  const companies = user.role === 'superadmin'
    ? await all('SELECT * FROM companies ORDER BY name')
    : [req.currentCompany];

  res.send(page(t(req, 'logo'), `
    <div class="grid">
      <div class="card">
        <h2>Logo hochladen</h2>
        <form method="post" action="/company-brand/upload" enctype="multipart/form-data">
          ${user.role === 'superadmin'
            ? `<label>Firma</label><select name="company_id">${companies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>`
            : `<input type="hidden" name="company_id" value="${req.currentCompany?.id || ''}">`
          }
          <input type="file" name="logo" accept=".png,.jpg,.jpeg,.webp" required>
          <button>Logo hochladen</button>
        </form>
      </div>
      <div class="card">
        <h2>Aktuelles Logo</h2>
        ${req.currentCompany?.logo_path ? `<img src="${esc(req.currentCompany.logo_path)}" style="max-width:260px;max-height:160px;object-fit:contain;">` : '<p>-</p>'}
      </div>
    </div>
  `, user, req.currentCompany, req));
});

app.post('/company-brand/upload', requireManage, upload.single('logo'), async (req, res) => {
  const companyId = req.session.user.role === 'superadmin'
    ? Number(req.body.company_id)
    : req.session.user.company_id;

  const logoPath = req.file ? `/uploads/logos/${req.file.filename}` : '';

  if (logoPath) {
    await run('UPDATE companies SET logo_path = ? WHERE id = ?', [logoPath, companyId]);
  }

  res.redirect('/company-brand');
});

app.get('/users', requireManage, async (req, res) => {
  const user = req.session.user;

  const companies = user.role === 'superadmin'
    ? await all('SELECT * FROM companies ORDER BY name')
    : [req.currentCompany];

  const list = user.role === 'superadmin'
    ? await all(`SELECT users.*, companies.name company_name FROM users LEFT JOIN companies ON companies.id = users.company_id ORDER BY users.id DESC`)
    : await all(`SELECT users.*, companies.name company_name FROM users LEFT JOIN companies ON companies.id = users.company_id WHERE users.company_id = ? ORDER BY users.id DESC`, [user.company_id]);

  res.send(page(t(req, 'users'), `
    <div class="grid">
      <div class="card">
        <h2>Benutzer anlegen</h2>
        <form method="post" action="/users/create">
          ${user.role === 'superadmin'
            ? `<label>Firma</label><select name="company_id">${companies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>`
            : `<input type="hidden" name="company_id" value="${user.company_id}">`
          }
          <label>Name</label>
          <input name="full_name" required>
          <label>E-Mail</label>
          <input name="email">
          <label>Benutzername</label>
          <input name="username" required>
          <label>Passwort</label>
          <input name="password" required>
          <label>Rolle</label>
          <select name="role">
            <option value="employee">employee</option>
            <option value="admin">admin</option>
          </select>
          <button>Speichern</button>
        </form>
      </div>

      <div class="card">
        <h2>Benutzer</h2>
        <table>
          <tr><th>ID</th><th>Name</th><th>Email</th><th>Benutzer</th><th>Rolle</th><th>Firma</th><th>Status</th></tr>
          ${list.map(u => `
            <tr>
              <td>${u.id}</td>
              <td>${esc(u.full_name || '')}</td>
              <td>${esc(u.email || '')}</td>
              <td>${esc(u.username || '')}</td>
              <td>${esc(u.role || '')}</td>
              <td>${esc(u.company_name || '')}</td>
              <td>${Number(u.active) ? 'Aktiv' : 'Inaktiv'}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `, user, req.currentCompany, req));
});

app.post('/users/create', requireManage, async (req, res) => {
  const companyId = req.session.user.role === 'superadmin'
    ? Number(req.body.company_id)
    : req.session.user.company_id;

  try {
    await run(
      `INSERT INTO users (company_id, username, password, role, full_name, email, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [companyId, req.body.username, req.body.password, req.body.role || 'employee', req.body.full_name, req.body.email || '']
    );

    res.redirect('/users');
  } catch (err) {
    res.status(500).send('Benutzer konnte nicht angelegt werden. Username evtl. schon vorhanden. ' + err.message);
  }
});

app.get('/garages', requireManage, async (req, res) => {
  const user = req.session.user;
  const companies = await all('SELECT * FROM companies ORDER BY name');

  const garages = user.role === 'superadmin'
    ? await all(`SELECT garages.*, companies.name company_name FROM garages LEFT JOIN companies ON companies.id = garages.company_id ORDER BY garages.id DESC`)
    : await all(`SELECT garages.*, companies.name company_name FROM garages LEFT JOIN companies ON companies.id = garages.company_id WHERE garages.company_id = ? ORDER BY garages.id DESC`, [user.company_id]);

  res.send(page(t(req, 'garages'), `
    <div class="grid">
      <div class="card">
        <h2>Parkhaus anlegen</h2>
        <form method="post" action="/garages/create">
          ${user.role === 'superadmin'
            ? `<label>Firma</label><select name="company_id">${companies.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>`
            : ''
          }
          <label>Name</label>
          <input name="name" required>
          <label>Standort</label>
          <input name="location">
          <button>Speichern</button>
        </form>
      </div>

      <div class="card">
        <h2>ParkhÃ¤user</h2>
        <table>
          <tr><th>ID</th><th>Firma</th><th>Name</th><th>Standort</th><th>Lizenziert</th><th>Aktion</th></tr>
          ${garages.map(g => `
            <tr>
              <td>${g.id}</td>
              <td>${esc(g.company_name || '')}</td>
              <td>${esc(g.name)}</td>
              <td>${esc(g.location || '')}</td>
              <td>${Number(g.licensed) ? 'Ja' : 'Nein'}</td>
              <td>
                ${user.role === 'superadmin'
                  ? `<form method="post" action="/garages/license"><input type="hidden" name="garage_id" value="${g.id}"><button>Lizenz umschalten</button></form>`
                  : '-'
                }
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `, user, req.currentCompany, req));
});

app.post('/garages/create', requireManage, async (req, res) => {
  const user = req.session.user;
  const companyId = user.role === 'superadmin'
    ? Number(req.body.company_id)
    : user.company_id;

  await run('INSERT INTO garages (company_id, name, location, licensed) VALUES (?, ?, ?, 0)', [companyId, req.body.name, req.body.location || '']);

  res.redirect('/garages');
});

app.post('/garages/license', requireManage, async (req, res) => {
  if (req.session.user.role !== 'superadmin') return res.redirect('/garages');

  const row = await get('SELECT licensed FROM garages WHERE id = ?', [req.body.garage_id]);
  await run('UPDATE garages SET licensed = ? WHERE id = ?', [Number(row?.licensed) ? 0 : 1, req.body.garage_id]);

  res.redirect('/garages');
});

app.get('/spots', requireManage, async (req, res) => {
  const user = req.session.user;
  const garages = await garagesFor(user);
  const garageId = Number(req.query.garage_id || garages[0]?.id || 0);
  const spots = garageId ? await all('SELECT * FROM spots WHERE garage_id = ? ORDER BY name', [garageId]) : [];

  res.send(page(t(req, 'spots'), `
    <div class="grid">
      <div class="card">
        <h2>Parkplatz anlegen</h2>
        <form method="get" action="/spots">
          <label>Parkhaus wÃ¤hlen</label>
          <select name="garage_id" onchange="this.form.submit()">
            ${garages.map(g => `<option value="${g.id}" ${g.id === garageId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
          </select>
        </form>

        <form method="post" action="/spots/create">
          <input type="hidden" name="garage_id" value="${garageId}">
          <label>Name</label>
          <input name="name" placeholder="A-01" required>
          <label>Typ</label>
          <select name="type">
            <option>Standard</option>
            <option>VIP</option>
            <option>Elektro</option>
            <option>Behindert</option>
            <option>Motorrad</option>
          </select>
          <label>Ebene</label>
          <input name="level" placeholder="EG / 1 / B1">
          <button>Speichern</button>
        </form>
      </div>

      <div class="card">
        <h2>ParkplÃ¤tze</h2>
        <table>
          <tr><th>Name</th><th>Typ</th><th>Status</th><th>Ebene</th></tr>
          ${spots.map(s => `
            <tr>
              <td>${esc(s.name)}</td>
              <td>${esc(s.type)}</td>
              <td>${esc(s.status)}</td>
              <td>${esc(s.level || '')}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `, user, req.currentCompany, req));
});

app.post('/spots/create', requireManage, async (req, res) => {
  await run(
    `INSERT INTO spots (garage_id, name, type, status, level) VALUES (?, ?, ?, 'free', ?)`,
    [req.body.garage_id, req.body.name, req.body.type, req.body.level || '']
  );

  res.redirect('/spots?garage_id=' + req.body.garage_id);
});

app.get('/rates', requireManage, async (req, res) => {
  const user = req.session.user;
  const garages = await garagesFor(user);
  const garageId = Number(req.query.garage_id || garages[0]?.id || 0);
  const rate = garageId ? await get('SELECT * FROM rates WHERE garage_id = ?', [garageId]) : null;

  res.send(page(t(req, 'rates'), `
    <div class="card">
      <h2>Tarife</h2>
      <form method="get" action="/rates">
        <label>Parkhaus wÃ¤hlen</label>
        <select name="garage_id" onchange="this.form.submit()">
          ${garages.map(g => `<option value="${g.id}" ${g.id === garageId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
        </select>
      </form>

      <form method="post" action="/rates/save">
        <input type="hidden" name="garage_id" value="${garageId}">
        <label>Preis pro Stunde</label>
        <input name="price_per_hour" value="${rate?.price_per_hour || 0}">
        <label>Preis pro halbe Stunde</label>
        <input name="price_per_half_hour" value="${rate?.price_per_half_hour || 0}">
        <label>Preis ab 5 Stunden</label>
        <input name="price_after_5_hours" value="${rate?.price_after_5_hours || 0}">
        <label>Tagestarif</label>
        <input name="day_price" value="${rate?.day_price || 0}">
        <label>Monatspreis</label>
        <input name="month_price" value="${rate?.month_price || 0}">
        <button>Speichern</button>
      </form>
    </div>
  `, user, req.currentCompany, req));
});

app.post('/rates/save', requireManage, async (req, res) => {
  const existing = await get('SELECT id FROM rates WHERE garage_id = ?', [req.body.garage_id]);

  if (existing) {
    await run(
      `UPDATE rates SET price_per_hour = ?, price_per_half_hour = ?, price_after_5_hours = ?, day_price = ?, month_price = ? WHERE garage_id = ?`,
      [Number(req.body.price_per_hour || 0), Number(req.body.price_per_half_hour || 0), Number(req.body.price_after_5_hours || 0), Number(req.body.day_price || 0), Number(req.body.month_price || 0), req.body.garage_id]
    );
  } else {
    await run(
      `INSERT INTO rates (garage_id, price_per_hour, price_per_half_hour, price_after_5_hours, day_price, month_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.body.garage_id, Number(req.body.price_per_hour || 0), Number(req.body.price_per_half_hour || 0), Number(req.body.price_after_5_hours || 0), Number(req.body.day_price || 0), Number(req.body.month_price || 0)]
    );
  }

  res.redirect('/rates?garage_id=' + req.body.garage_id);
});

app.get('/monthly-customers', requireManage, async (req, res) => {
  const user = req.session.user;
  const garages = await garagesFor(user);

  const customers = user.role === 'superadmin'
    ? await all(`SELECT monthly_customers.*, garages.name garage_name FROM monthly_customers LEFT JOIN garages ON garages.id = monthly_customers.garage_id ORDER BY monthly_customers.id DESC`)
    : await all(`SELECT monthly_customers.*, garages.name garage_name FROM monthly_customers LEFT JOIN garages ON garages.id = monthly_customers.garage_id WHERE monthly_customers.company_id = ? ORDER BY monthly_customers.id DESC`, [user.company_id]);

  res.send(page(t(req, 'monthly'), `
    <div class="grid">
      <div class="card">
        <h2>Monatsmieter anlegen</h2>
        <form method="post" action="/monthly-customers/create">
          <label>Parkhaus</label>
          <select name="garage_id">
            ${garages.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}
          </select>
          <label>Kunde</label>
          <input name="customer_name" required>
          <label>Kennzeichen</label>
          <input name="plate" required>
          <label>Startdatum</label>
          <input type="date" name="start_date" required>
          <label>Enddatum</label>
          <input type="date" name="end_date" required>
          <label>Monatspreis</label>
          <input name="monthly_price" required>
          <button>Speichern</button>
        </form>
      </div>

      <div class="card">
        <h2>Monatsmieter</h2>
        <table>
          <tr><th>ID</th><th>Kunde</th><th>Kennzeichen</th><th>Parkhaus</th><th>Start</th><th>Ende</th><th>Preis</th><th>Status</th></tr>
          ${customers.map(c => `
            <tr>
              <td>${c.id}</td>
              <td>${esc(c.customer_name)}</td>
              <td>${esc(c.plate)}</td>
              <td>${esc(c.garage_name || '')}</td>
              <td>${esc(c.start_date)}</td>
              <td>${esc(c.end_date)}</td>
              <td>${money(c.monthly_price)}</td>
              <td>${Number(c.active) ? 'Aktiv' : 'Inaktiv'}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `, user, req.currentCompany, req));
});

app.post('/monthly-customers/create', requireManage, async (req, res) => {
  const user = req.session.user;
  const garage = await get('SELECT * FROM garages WHERE id = ?', [req.body.garage_id]);

  const companyId = user.role === 'superadmin'
    ? garage.company_id
    : user.company_id;

  await run(
    `INSERT INTO monthly_customers (company_id, garage_id, customer_name, plate, start_date, end_date, monthly_price, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [companyId, req.body.garage_id, req.body.customer_name, req.body.plate, req.body.start_date, req.body.end_date, Number(req.body.monthly_price || 0)]
  );

  res.redirect('/monthly-customers');
});

app.get('/entry', requireWork, async (req, res) => {
  const user = req.session.user;

  const garages = user.role === 'superadmin'
    ? await all('SELECT * FROM garages WHERE licensed = 1 ORDER BY name')
    : await all('SELECT * FROM garages WHERE company_id = ? AND licensed = 1 ORDER BY name', [user.company_id]);

  const garageId = Number(req.query.garage_id || garages[0]?.id || 0);

  const spots = garageId
    ? await all(`SELECT * FROM spots WHERE garage_id = ? AND status = 'free' ORDER BY name`, [garageId])
    : [];

  const monthlyCustomers = garageId
    ? await all(`SELECT * FROM monthly_customers WHERE garage_id = ? AND active = 1 ORDER BY customer_name`, [garageId])
    : [];

  res.send(page(t(req, 'entry'), `
    <div class="card small">
      <h2>Ticket erstellen</h2>
      <form method="post" action="/entry">
        <label>Ticket-Typ</label>
        <select name="ticket_type">
          <option value="normal">Normales Ticket</option>
          <option value="monthly">Monatsmieter-Ticket</option>
        </select>

        <label>Parkhaus</label>
        <select name="garage_id">
          ${garages.map(g => `<option value="${g.id}" ${g.id === garageId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
        </select>

        <label>Kennzeichen</label>
        <input name="plate">

        <label>Parkplatz</label>
        <select name="spot_id">
          <option value="">Kein Platz</option>
          ${spots.map(s => `<option value="${s.id}">${esc(s.name)} - ${esc(s.type)}</option>`).join('')}
        </select>

        <label>Monatsmieter wÃ¤hlen</label>
        <select name="monthly_customer_id">
          <option value="">-</option>
          ${monthlyCustomers.map(c => `<option value="${c.id}">${esc(c.customer_name)} - ${esc(c.plate)}</option>`).join('')}
        </select>

        <button>Ticket erstellen</button>
      </form>
    </div>
  `, user, req.currentCompany, req));
});

app.post('/entry', requireWork, async (req, res) => {
  const garage = await get('SELECT * FROM garages WHERE id = ?', [req.body.garage_id]);

  if (!garage || !Number(garage.licensed)) {
    return res.send(page('Fehler', `<div class="card"><h2>Parkhaus nicht freigeschaltet</h2></div>`, req.session.user, req.currentCompany, req));
  }

  let plate = req.body.plate || '';
  let monthlyCustomerId = null;

  if (req.body.ticket_type === 'monthly' && req.body.monthly_customer_id) {
    const monthlyCustomer = await get(
      `SELECT * FROM monthly_customers WHERE id = ? AND active = 1 AND date('now') BETWEEN date(start_date) AND date(end_date)`,
      [req.body.monthly_customer_id]
    );

    if (!monthlyCustomer) {
      return res.send(page('Fehler', `<div class="card"><h2>Monatsmieter nicht aktiv</h2></div>`, req.session.user, req.currentCompany, req));
    }

    plate = monthlyCustomer.plate;
    monthlyCustomerId = monthlyCustomer.id;
  }

  const code = 'PK-' + Date.now();

  await run(
    `INSERT INTO tickets (company_id, garage_id, spot_id, code, plate, monthly_customer_id, entry_time, status)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'open')`,
    [garage.company_id, garage.id, req.body.spot_id || null, code, plate, monthlyCustomerId]
  );

  if (req.body.spot_id) {
    await run(`UPDATE spots SET status = 'occupied' WHERE id = ?`, [req.body.spot_id]);
  }

  const ticket = await get(
    `SELECT tickets.*, garages.name garage_name, spots.name spot_name
     FROM tickets
     LEFT JOIN garages ON garages.id = tickets.garage_id
     LEFT JOIN spots ON spots.id = tickets.spot_id
     WHERE tickets.code = ?`,
    [code]
  );

  const qr = await QRCode.toDataURL(code);

  res.send(page('Ticket erstellt', `
    <div class="card">
      <h2>Ticket erstellt</h2>
      <div class="ticket-box">
        <h3>Ticketdaten</h3>
        <p><strong>Ticket-Code:</strong> ${esc(ticket.code)}</p>
        <p><strong>Parkhaus:</strong> ${esc(ticket.garage_name || '')}</p>
        <p><strong>Parkplatz:</strong> ${esc(ticket.spot_name || '-')}</p>
        <p><strong>Kennzeichen:</strong> ${esc(ticket.plate || '-')}</p>
        <p><strong>Einfahrt:</strong> ${esc(ticket.entry_time || '')}</p>
        <p><strong>Ticket-Typ:</strong> ${monthlyCustomerId ? 'Monatsmieter-Ticket' : 'Normales Ticket'}</p>
        ${monthlyCustomerId ? `<p><strong>Betrag:</strong> 0 PYG</p>` : ''}
        <div style="text-align:center;margin-top:16px;">
          <img src="${qr}" style="max-width:220px;">
        </div>
      </div>
      <button onclick="window.print()">Drucken</button>
    </div>
  `, req.session.user, req.currentCompany, req));
});

app.get('/exit', requireWork, (req, res) => {
  res.send(page(t(req, 'exit'), `
    <div class="card small">
      <h2>Ausfahrt</h2>
      <form method="post" action="/exit">
        <label>Ticket-Code</label>
        <input name="code" required>
        <button>Preis berechnen</button>
      </form>
    </div>
  `, req.session.user, req.currentCompany, req));
});

app.post('/exit', requireWork, async (req, res) => {
  const ticket = await get(
    `SELECT tickets.*, garages.name garage_name, spots.name spot_name
     FROM tickets
     LEFT JOIN garages ON garages.id = tickets.garage_id
     LEFT JOIN spots ON spots.id = tickets.spot_id
     WHERE tickets.code = ? AND tickets.status = 'open'`,
    [req.body.code]
  );

  if (!ticket) {
    return res.send(page('Nicht gefunden', `<div class="card"><h2>Ticket nicht gefunden</h2></div>`, req.session.user, req.currentCompany, req));
  }

  const c = await calc(ticket);

  await run(
    `UPDATE tickets SET exit_time = datetime('now'), total = ?, status = 'closed' WHERE id = ?`,
    [c.total, ticket.id]
  );

  if (ticket.spot_id) {
    await run(`UPDATE spots SET status = 'free' WHERE id = ?`, [ticket.spot_id]);
  }

  res.send(page('Ausfahrt abgeschlossen', `
    <div class="card small">
      <h2>Ausfahrt abgeschlossen</h2>
      <p><strong>Ticket-Code:</strong> ${esc(ticket.code)}</p>
      <p><strong>Parkhaus:</strong> ${esc(ticket.garage_name || '')}</p>
      <p><strong>Parkplatz:</strong> ${esc(ticket.spot_name || '-')}</p>
      <p><strong>Kennzeichen:</strong> ${esc(ticket.plate || '-')}</p>
      <p><strong>Parkdauer:</strong> ${c.minutes} Minuten</p>
      <p><strong>Gesamt:</strong> ${money(c.total)}</p>
      <a class="button-link" href="/exit">NÃ¤chstes Ticket</a>
    </div>
  `, req.session.user, req.currentCompany, req));
});

app.get('/tickets', requireWork, async (req, res) => {
  const user = req.session.user;

  const tickets = user.role === 'superadmin'
    ? await all(`SELECT tickets.*, garages.name garage_name, spots.name spot_name FROM tickets LEFT JOIN garages ON garages.id = tickets.garage_id LEFT JOIN spots ON spots.id = tickets.spot_id ORDER BY tickets.id DESC LIMIT 100`)
    : await all(`SELECT tickets.*, garages.name garage_name, spots.name spot_name FROM tickets LEFT JOIN garages ON garages.id = tickets.garage_id LEFT JOIN spots ON spots.id = tickets.spot_id WHERE tickets.company_id = ? ORDER BY tickets.id DESC LIMIT 100`, [user.company_id]);

  res.send(page(t(req, 'tickets'), `
    <div class="card">
      <h2>Tickets</h2>
      <table>
        <tr>
          <th>Code</th><th>Parkhaus</th><th>Parkplatz</th><th>Kennzeichen</th><th>Einfahrt</th><th>Ausfahrt</th><th>Status</th><th>Betrag</th>
        </tr>
        ${tickets.map(tk => `
          <tr>
            <td>${esc(tk.code)}</td>
            <td>${esc(tk.garage_name || '')}</td>
            <td>${esc(tk.spot_name || '-')}</td>
            <td>${esc(tk.plate || '-')}</td>
            <td>${esc(tk.entry_time || '')}</td>
            <td>${esc(tk.exit_time || '')}</td>
            <td>${esc(tk.status || '')}</td>
            <td>${money(tk.total || 0)}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `, user, req.currentCompany, req));
});
app.get('/', (req, res) => {
  res.redirect('/login');
});
app.listen(PORT, () => {
  console.log('Server lÃ¤uft auf http://localhost:' + PORT);
});
