const fs = require('fs');
const path = require('path');
const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'portal.json');
fs.mkdirSync(dataDir, { recursive: true });
const initial = { users: [], firefighters: [], disciplinary_actions: [], audit_log: [], counters: { users: 1, firefighters: 1, disciplinary_actions: 1, audit_log: 1 } };
function load(){ if(!fs.existsSync(dbFile)) save(initial); return JSON.parse(fs.readFileSync(dbFile,'utf8')); }
function save(db){ fs.writeFileSync(dbFile, JSON.stringify(db,null,2)); }
function now(){ return new Date().toISOString(); }
function next(db, table){ const id=db.counters[table] || 1; db.counters[table]=id+1; return id; }
function audit(actor, action, entity, entityId, details=''){ const db=load(); db.audit_log.unshift({ id: next(db,'audit_log'), actor_user_id: actor?.id || null, username: actor?.username || 'System', action, entity, entity_id: String(entityId ?? ''), details, created_at: now() }); save(db); }
function seedOwner(){ const db=load(); const id=process.env.INITIAL_OWNER_ROBLOX_ID; if(id && !db.users.find(u=>u.roblox_id===String(id))){ db.users.push({ id: next(db,'users'), roblox_id:String(id), username:'Owner', display_name:'Owner', role:'owner', is_allowed:1, created_at:now(), updated_at:now() }); save(db); }}
module.exports={load,save,next,now,audit,seedOwner};
