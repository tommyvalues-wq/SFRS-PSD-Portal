require('dotenv').config();

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');

const { load, save, next: nextId, now, audit, seedOwner } = require('./db');
const { authUrl, callback } = require('./auth');
const { attachUser, requireLogin, requirePST, requireOwner } = require('./middleware');

const app = express();

seedOwner();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false
  }
}));

app.use(attachUser);

app.locals.roles = {
  owner: 'Owner',
  pst: 'Professional Standards',
  member: 'Member'
};

app.get('/', (req, res) => {
  res.render('home', { title: 'Home' });
});

app.get('/login', (req, res) => {
  res.render('login', { title: 'Sign In' });
});

app.get('/denied', (req, res) => {
  res.status(403).render('denied', { title: 'Access Denied' });
});

app.get('/auth/roblox', async (req, res, next) => {
  try {
    if (!process.env.ROBLOX_CLIENT_ID) {
      return res.redirect('/login');
    }

    res.redirect(await authUrl(req));
  } catch (e) {
    next(e);
  }
});

app.get('/auth/roblox/callback', async (req, res, next) => {
  try {
    const profile = await callback(req);
    const robloxId = String(profile.sub);

    const db = load();

    let user = db.users.find(u => u.roblox_id === robloxId);

    if (user) {
      user.username = profile.preferred_username || profile.name || robloxId;
      user.display_name = profile.name || '';
      user.updated_at = now();
    } else {
      const owner =
        process.env.INITIAL_OWNER_ROBLOX_ID &&
        robloxId === String(process.env.INITIAL_OWNER_ROBLOX_ID);

      user = {
        id: nextId(db, 'users'),
        roblox_id: robloxId,
        username: profile.preferred_username || profile.name || robloxId,
        display_name: profile.name || '',
        role: owner ? 'owner' : 'member',
        is_allowed: owner ? 1 : 0,
        created_at: now(),
        updated_at: now()
      };

      db.users.push(user);
    }

    save(db);

    req.session.userId = user.id;

    res.redirect('/dashboard');
  } catch (e) {
    next(e);
  }
});

app.post('/demo-login', (req, res) => {
  const db = load();

  let user = db.users.find(u => u.roblox_id === 'demo-owner');

  if (!user) {
    user = {
      id: nextId(db, 'users'),
      roblox_id: 'demo-owner',
      username: 'Demo Owner',
      display_name: 'Demo Owner',
      role: 'owner',
      is_allowed: 1,
      created_at: now(),
      updated_at: now()
    };

    db.users.push(user);
    save(db);
  }

  req.session.userId = user.id;

  res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/dashboard', requireLogin, (req, res) => {
  const db = load();

  const stats = {
    firefighters: db.firefighters.length,
    cases: db.disciplinary_actions.length,
    pst: db.users.filter(u => ['owner', 'pst'].includes(u.role)).length
  };

  res.render('dashboard', {
    title: 'Dashboard',
    stats,
    recent: db.audit_log.slice(0, 8)
  });
});

app.get('/firefighters', requireLogin, (req, res) => {
  const db = load();

  const q = (req.query.q || '').toLowerCase().trim();

  let firefighters = db.firefighters || [];

  if (q) {
    firefighters = firefighters.filter(f =>
      (f.name || '').toLowerCase().includes(q) ||
      (f.roblox_id || '').toLowerCase().includes(q) ||
      (f.rank || '').toLowerCase().includes(q) ||
      (f.station || '').toLowerCase().includes(q) ||
      (f.command_level || '').toLowerCase().includes(q) ||
      (f.status || '').toLowerCase().includes(q)
    );
  }

  firefighters.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  res.render('firefighters', {
    title: 'Firefighters',
    firefighters,
    q
  });
});

app.get('/firefighters/new', requirePST, (req, res) => {
  res.render('firefighter-form', {
    title: 'Add Firefighter',
    f: {}
  });
});

app.post('/firefighters', requirePST, (req, res) => {
  const db = load();
  const r = req.body;

  const firefighter = {
    id: nextId(db, 'firefighters'),
    roblox_id: r.roblox_id || '',
    name: r.name || '',
    rank: r.rank || '',
    station: r.station || '',
    command_level: r.command_level || 'No Command',
    status: r.status || 'Active',
    notes: r.notes || '',
    created_at: now(),
    updated_at: now()
  };

  db.firefighters.push(firefighter);
  save(db);

  audit(req.user, 'created', 'firefighter', firefighter.id, firefighter.name);

  res.redirect('/firefighters');
});

app.get('/firefighters/:id/edit', requirePST, (req, res) => {
  const db = load();

  const firefighter = db.firefighters.find(x => x.id == req.params.id);

  if (!firefighter) {
    return res.status(404).render('error', {
      title: 'Not Found',
      error: new Error('Firefighter not found')
    });
  }

  res.render('firefighter-form', {
    title: 'Edit Firefighter',
    f: firefighter
  });
});

app.post('/firefighters/:id', requirePST, (req, res) => {
  const db = load();
  const r = req.body;

  const firefighter = db.firefighters.find(x => x.id == req.params.id);

  if (!firefighter) {
    return res.status(404).render('error', {
      title: 'Not Found',
      error: new Error('Firefighter not found')
    });
  }

  firefighter.roblox_id = r.roblox_id || '';
  firefighter.name = r.name || '';
  firefighter.rank = r.rank || '';
  firefighter.station = r.station || '';
  firefighter.command_level = r.command_level || 'No Command';
  firefighter.status = r.status || 'Active';
  firefighter.notes = r.notes || '';
  firefighter.updated_at = now();

  save(db);

  audit(req.user, 'updated', 'firefighter', firefighter.id, firefighter.name);

  res.redirect('/firefighters');
});

app.post('/firefighters/:id/delete', requirePST, (req, res) => {
  const db = load();

  db.firefighters = db.firefighters.filter(x => x.id != req.params.id);
  db.disciplinary_actions = db.disciplinary_actions.filter(
    x => x.firefighter_id != req.params.id
  );

  save(db);

  audit(req.user, 'deleted', 'firefighter', req.params.id);

  res.redirect('/firefighters');
});

app.get('/discipline', requirePST, (req, res) => {
  const db = load();

  const cases = db.disciplinary_actions.map(c => ({
    ...c,
    firefighter:
      (db.firefighters.find(f => f.id == c.firefighter_id) || {}).name ||
      'Unknown',
    issuer:
      (db.users.find(u => u.id == c.issued_by_user_id) || {}).username ||
      'System'
  }));

  res.render('discipline', {
    title: 'Disciplinary Actions',
    cases
  });
});

app.get('/discipline/new', requirePST, (req, res) => {
  const db = load();

  res.render('discipline-form', {
    title: 'Add Disciplinary Action',
    c: {},
    firefighters: db.firefighters
  });
});

app.post('/discipline', requirePST, (req, res) => {
  const db = load();
  const r = req.body;

  const c = {
    id: nextId(db, 'disciplinary_actions'),
    firefighter_id: Number(r.firefighter_id),
    type: r.type,
    severity: r.severity,
    summary: r.summary,
    outcome: r.outcome || '',
    issued_by_user_id: req.user.id,
    action_date: r.action_date || now().slice(0, 10),
    created_at: now(),
    updated_at: now()
  };

  db.disciplinary_actions.push(c);
  save(db);

  audit(req.user, 'created', 'disciplinary_action', c.id, c.summary);

  res.redirect('/discipline');
});

app.get('/discipline/:id/edit', requirePST, (req, res) => {
  const db = load();

  const c = db.disciplinary_actions.find(x => x.id == req.params.id);

  if (!c) {
    return res.status(404).render('error', {
      title: 'Not Found',
      error: new Error('Disciplinary action not found')
    });
  }

  res.render('discipline-form', {
    title: 'Edit Disciplinary Action',
    c,
    firefighters: db.firefighters
  });
});

app.post('/discipline/:id', requirePST, (req, res) => {
  const db = load();
  const r = req.body;

  const c = db.disciplinary_actions.find(x => x.id == req.params.id);

  if (!c) {
    return res.status(404).render('error', {
      title: 'Not Found',
      error: new Error('Disciplinary action not found')
    });
  }

  c.firefighter_id = Number(r.firefighter_id);
  c.type = r.type;
  c.severity = r.severity;
  c.summary = r.summary;
  c.outcome = r.outcome || '';
  c.action_date = r.action_date;
  c.updated_at = now();

  save(db);

  audit(req.user, 'updated', 'disciplinary_action', c.id, c.summary);

  res.redirect('/discipline');
});

app.post('/discipline/:id/delete', requirePST, (req, res) => {
  const db = load();

  db.disciplinary_actions = db.disciplinary_actions.filter(
    x => x.id != req.params.id
  );

  save(db);

  audit(req.user, 'deleted', 'disciplinary_action', req.params.id);

  res.redirect('/discipline');
});

app.get('/admin/users', requireOwner, (req, res) => {
  const db = load();

  res.render('users', {
    title: 'User Management',
    users: db.users
  });
});

app.post('/admin/users/add', requireOwner, (req, res) => {
  const db = load();
  const r = req.body;

  let u = db.users.find(x => x.roblox_id === String(r.roblox_id));

  if (!u) {
    u = {
      id: nextId(db, 'users'),
      roblox_id: String(r.roblox_id),
      username: r.username || String(r.roblox_id),
      display_name: '',
      role: r.role || 'member',
      is_allowed: 1,
      created_at: now(),
      updated_at: now()
    };

    db.users.push(u);
  } else {
    u.username = r.username || u.username;
    u.role = r.role || u.role;
    u.is_allowed = 1;
    u.updated_at = now();
  }

  save(db);

  audit(req.user, 'upserted', 'user', u.id, u.role);

  res.redirect('/admin/users');
});

app.post('/admin/users/:id/role', requireOwner, (req, res) => {
  const db = load();

  const u = db.users.find(x => x.id == req.params.id);

  if (!u) {
    return res.status(404).render('error', {
      title: 'Not Found',
      error: new Error('User not found')
    });
  }

  u.role = req.body.role;
  u.is_allowed = req.body.is_allowed ? 1 : 0;
  u.updated_at = now();

  save(db);

  audit(req.user, 'updated role', 'user', u.id, u.role);

  res.redirect('/admin/users');
});

app.get('/audit', requirePST, (req, res) => {
  const db = load();

  res.render('audit', {
    title: 'Audit Log',
    rows: db.audit_log.slice(0, 200)
  });
});

app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).render('error', {
    title: 'Error',
    error: err
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log(
    `Portal running on ${process.env.BASE_URL || 'http://localhost:3000'}`
  );
});
