const { load } = require('./db');
function attachUser(req,res,next){ const db=load(); req.user = req.session.userId ? db.users.find(u=>u.id===req.session.userId) : null; res.locals.user=req.user; next(); }
function requireLogin(req,res,next){ if(!req.user || !req.user.is_allowed) return res.redirect('/denied'); next(); }
function requirePST(req,res,next){ if(!req.user || !req.user.is_allowed || !['owner','pst'].includes(req.user.role)) return res.redirect('/denied'); next(); }
function requireOwner(req,res,next){ if(!req.user || req.user.role !== 'owner') return res.redirect('/denied'); next(); }
module.exports={attachUser,requireLogin,requirePST,requireOwner};
