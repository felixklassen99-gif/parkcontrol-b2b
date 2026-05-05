const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./parkcontrol.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    logo_path TEXT,
    subscription_plan TEXT DEFAULT 'Basic',
    subscription_status TEXT DEFAULT 'unpaid',
    monthly_fee REAL DEFAULT 0,
    next_due_date TEXT,
    last_payment_date TEXT,
    is_blocked INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    full_name TEXT,
    email TEXT,
    active INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS garages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    location TEXT,
    licensed INTEGER NOT NULL DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS spots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    garage_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'Standard',
    status TEXT DEFAULT 'free',
    level TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    garage_id INTEGER NOT NULL UNIQUE,
    price_per_hour REAL DEFAULT 0,
    price_per_half_hour REAL DEFAULT 0,
    price_after_5_hours REAL DEFAULT 0,
    day_price REAL DEFAULT 0,
    month_price REAL DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS monthly_customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    garage_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    plate TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    monthly_price REAL DEFAULT 0,
    active INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    garage_id INTEGER,
    spot_id INTEGER,
    code TEXT,
    plate TEXT,
    monthly_customer_id INTEGER,
    entry_time TEXT,
    exit_time TEXT,
    total REAL DEFAULT 0,
    status TEXT DEFAULT 'open'
  )`);

  db.get(`SELECT COUNT(*) as c FROM companies`, (err, row) => {
    if (!row || row.c === 0) {
      db.run(`
        INSERT INTO companies
        (name, subscription_plan, subscription_status, monthly_fee, next_due_date, last_payment_date, is_blocked)
        VALUES
        ('Master Firma', 'Master', 'paid', 0, date('now', '+30 day'), date('now'), 0)
      `);

      db.run(`
        INSERT INTO companies
        (name, subscription_plan, subscription_status, monthly_fee, next_due_date, last_payment_date, is_blocked)
        VALUES
        ('Demo Parking SA', 'Pro', 'paid', 350000, date('now', '+30 day'), date('now'), 0)
      `);

      db.run(`
        INSERT INTO users (company_id, username, password, role, full_name, email, active)
        VALUES (1, 'master', 'Parkcontrol2026!', 'superadmin', 'Master User', 'master@parkcontrol.local', 1)
      `);

      db.run(`
        INSERT INTO users (company_id, username, password, role, full_name, email, active)
        VALUES (2, 'admin', 'Parkcontrol2026!', 'admin', 'Demo Admin', 'admin@demo.com', 1)
      `);

      db.run(`
        INSERT INTO users (company_id, username, password, role, full_name, email, active)
        VALUES (2, 'employee', 'Parkcontrol2026!', 'employee', 'Demo Employee', 'employee@demo.com', 1)
      `);

      db.run(`INSERT INTO garages (company_id, name, location, licensed) VALUES (2, 'Centro Garage', 'Asuncion', 1)`);
      db.run(`INSERT INTO garages (company_id, name, location, licensed) VALUES (2, 'Mall Parking', 'Fernando de la Mora', 1)`);
      db.run(`INSERT INTO spots (garage_id, name, type, status, level) VALUES (1, 'A-01', 'Standard', 'free', 'EG')`);
      db.run(`INSERT INTO spots (garage_id, name, type, status, level) VALUES (1, 'A-02', 'Standard', 'free', 'EG')`);
      db.run(`INSERT INTO spots (garage_id, name, type, status, level) VALUES (1, 'B-01', 'VIP', 'free', '1')`);
      db.run(`INSERT INTO rates (garage_id, price_per_hour, price_per_half_hour, price_after_5_hours, day_price, month_price) VALUES (1, 12000, 7000, 9000, 70000, 800000)`);
      db.run(`INSERT INTO monthly_customers (company_id, garage_id, customer_name, plate, start_date, end_date, monthly_price, active) VALUES (2, 1, 'Juan Perez', 'ABC123', date('now'), date('now', '+30 day'), 800000, 1)`);
    }
  });
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err); else resolve(this);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
  });
}
module.exports = { db, run, get, all };
