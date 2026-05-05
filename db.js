const Database = require('better-sqlite3');
const db = new Database('parkcontrol.db');

// Promise Wrapper
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const result = db.prepare(sql).run(params);
      resolve(result);
    } catch (err) {
      reject(err);
    }
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const row = db.prepare(sql).get(params);
      resolve(row);
    } catch (err) {
      reject(err);
    }
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.prepare(sql).all(params);
      resolve(rows);
    } catch (err) {
      reject(err);
    }
  });
}

// Tabellen erstellen
db.exec(`
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  subscription_plan TEXT,
  subscription_status TEXT,
  monthly_fee INTEGER,
  next_due_date TEXT,
  last_payment_date TEXT,
  is_blocked INTEGER DEFAULT 0,
  logo_path TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  username TEXT UNIQUE,
  password TEXT,
  role TEXT,
  full_name TEXT,
  email TEXT,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS garages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  name TEXT,
  location TEXT,
  licensed INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS spots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garage_id INTEGER,
  name TEXT,
  type TEXT,
  status TEXT,
  level TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  garage_id INTEGER,
  spot_id INTEGER,
  code TEXT,
  plate TEXT,
  monthly_customer_id INTEGER,
  entry_time TEXT,
  exit_time TEXT,
  total INTEGER,
  status TEXT
);

CREATE TABLE IF NOT EXISTS rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  garage_id INTEGER,
  price_per_hour INTEGER,
  price_per_half_hour INTEGER,
  price_after_5_hours INTEGER,
  day_price INTEGER,
  month_price INTEGER
);

CREATE TABLE IF NOT EXISTS monthly_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  garage_id INTEGER,
  customer_name TEXT,
  plate TEXT,
  start_date TEXT,
  end_date TEXT,
  monthly_price INTEGER,
  active INTEGER
);
`);

module.exports = { run, get, all };