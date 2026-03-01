import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pkg from 'pg';

dotenv.config();
const { Pool } = pkg;

const {
  DATABASE_URL,
  JWT_SECRET = 'dev-secret',
  PORT = 8080,
  ALLOWED_ORIGINS = 'http://localhost:8000'
} = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true
  })
);

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.sub;
    req.username = decoded.username;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/auth/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      'insert into users (username, password_hash) values ($1, $2) returning id, username',
      [username, hash]
    );
    const token = signToken(rows[0]);
    res.json({ token, user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username taken' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  const { rows } = await pool.query('select * from users where username=$1', [username]);
  if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken(user);
  res.json({ token, user: { id: user.id, username: user.username } });
});

app.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ id: req.userId, username: req.username });
});

app.get('/books', authMiddleware, async (req, res) => {
  const { month } = req.query;
  const params = [req.userId];
  let sql = 'select * from books where user_id=$1';
  if (month) {
    sql += ' and month=$2';
    params.push(month);
  }
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

app.post('/books', authMiddleware, async (req, res) => {
  const { month, title } = req.body;
  if (!month || !title) return res.status(400).json({ error: 'Missing fields' });
  const { rows } = await pool.query(
    'insert into books (user_id, month, title) values ($1, $2, $3) returning *',
    [req.userId, month, title]
  );
  res.status(201).json(rows[0]);
});

app.get('/logs', authMiddleware, async (req, res) => {
  const { month } = req.query;
  const params = [req.userId];
  let sql = 'select * from logs where user_id=$1';
  if (month) {
    sql += ' and date like $2';
    params.push(`${month}%`);
  }
  sql += ' order by date asc, created_at asc';
  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

app.post('/logs', authMiddleware, async (req, res) => {
  const { date, pages, book } = req.body;
  if (!date || !pages) return res.status(400).json({ error: 'Missing fields' });
  const { rows } = await pool.query(
    'insert into logs (user_id, date, pages, book) values ($1, $2, $3, $4) returning *',
    [req.userId, date, pages, book || null]
  );
  res.status(201).json(rows[0]);
});

app.delete('/logs/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  await pool.query('delete from logs where id=$1 and user_id=$2', [id, req.userId]);
  res.status(204).end();
});

app.get('/leaderboard', authMiddleware, async (req, res) => {
  // month format: YYYY-MM, default current month
  const month =
    req.query.month ||
    new Date().toISOString().slice(0, 7); // current month
  const client = await pool.connect();
  try {
    // totals per user for month
    const totals = await client.query(
      `select u.id, u.username, sum(l.pages) as total
       from users u
       join logs l on l.user_id = u.id
       where l.date like $1
       group by u.id, u.username
       order by total desc nulls last`,
      [`${month}%`]
    );

    // streak calculation: need logs up to today
    const streakRows = await client.query(
      `select u.id, u.username, l.date, sum(l.pages) as pages
       from users u
       join logs l on l.user_id = u.id
       where l.date <= $1
       group by u.id, u.username, l.date`,
      [new Date().toISOString().slice(0, 10)]
    );

    const streakMap = new Map();
    const today = new Date().toISOString().slice(0, 10);
    const todayDate = new Date(today);

    const userDates = new Map();
    streakRows.rows.forEach((r) => {
      if (!userDates.has(r.id)) userDates.set(r.id, new Map());
      userDates.get(r.id).set(r.date, Number(r.pages));
    });

    userDates.forEach((dateMap, userId) => {
      let streak = 0;
      const cursor = new Date(todayDate);
      while (true) {
        const key = cursor.toISOString().slice(0, 10);
        const val = dateMap.get(key) || 0;
        if (val > 0) {
          streak += 1;
          cursor.setDate(cursor.getDate() - 1);
        } else {
          break;
        }
      }
      streakMap.set(userId, streak);
    });

    const combined = totals.rows.map((row) => ({
      user_id: row.id,
      username: row.username,
      total: Number(row.total || 0),
      streak: streakMap.get(row.id) || 0,
    }));

    res.json(combined);
  } finally {
    client.release();
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => console.log(`API listening on ${PORT}`));
