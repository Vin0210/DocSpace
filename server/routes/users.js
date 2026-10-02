const express = require('express');

function usersRouter(getDb) {
  const router = express.Router();
  router.get('/', (req, res) => {
    try {
      const db = getDb();
      const users = db.prepare('SELECT id, name, email, created_at FROM users ORDER BY id').all();
      res.json(users);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load users.' });
    }
  });
  return router;
}

module.exports = { usersRouter };
