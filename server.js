require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const { google } = require('googleapis');
const app = express();
const env = process.env;

// CORS e JSON
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());

// Sessão
app.use(session({
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { sameSite: 'none', secure: true }
}));

// OAuth2 client com URI hard-coded
const oauth2Client = new google.auth.OAuth2(
  env.CLIENT_ID,
  env.CLIENT_SECRET,
  'https://softr-calendar-backend.vercel.app/api/auth/google/callback'
);
console.log('>> REDIRECT_URI =', oauth2Client.redirectUri);

// Rotas OAuth
app.get('/api/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar']
  });
  res.redirect(url);
});
app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    req.session.tokens = tokens;
    res.redirect(env.FRONTEND_URL);
  } catch (err) {
    console.error('Erro no callback OAuth:', err);
    res.status(500).send('Erro interno no OAuth callback');
  }
});

// Middleware e endpoints de eventos
function ensureAuth(req, res, next) {
  if (!req.session.tokens) return res.status(401).send('Não autenticado');
  oauth2Client.setCredentials(req.session.tokens);
  next();
}
app.get('/api/events', ensureAuth, async (req, res) => {
  const cal = google.calendar({ version: 'v3', auth: oauth2Client });
  const resp = await cal.events.list({ calendarId: 'primary' });
  res.json(resp.data.items);
});
app.post('/api/events', ensureAuth, async (req, res) => {
  const cal = google.calendar({ version: 'v3', auth: oauth2Client });
  const ev = await cal.events.insert({ calendarId: 'primary', resource: req.body });
  res.json(ev.data);
});

// Inicia server
const PORT = env.PORT || 3000;
app.listen(PORT, () => console.log('Rodando na porta', PORT));
