require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create axios instance that bypasses SSL certificate validation (corporate proxy)
const axios = require('axios');
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false })
});

// Rate limiting: 20 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// In-memory token store
let cachedServiceAccountToken = null;
let cachedRefreshToken = null;
let tokenFetchPromise = null; // Prevent race condition on first request

// Session store: sessionId -> { token, expiresAt }
const sessions = new Map();

// Clean up expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(id);
  }
}, 10 * 60 * 1000);

// Function to refresh the service account token using the refresh_token
async function refreshServiceAccountToken() {
  if (!cachedRefreshToken) {
    console.log('No refresh token available, falling back to ROPC.');
    await fetchTokenViaROPC();
    return;
  }
  try {
    const tokenUrl = `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      refresh_token: cachedRefreshToken,
      scope: `api://${process.env.CLIENT_ID}/Bot.TokenExchange Files.Read.All Sites.Read.All openid profile offline_access`
    });

    const tokenResponse = await axiosInstance.post(tokenUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    cachedServiceAccountToken = tokenResponse.data.access_token;
    cachedRefreshToken = tokenResponse.data.refresh_token || cachedRefreshToken;
    console.log('Service account token refreshed successfully.');
  } catch (error) {
    console.error('Token refresh failed, falling back to ROPC:', error.response?.data || error.message);
    await fetchTokenViaROPC();
  }
}

// Fetch token via ROPC (initial or fallback)
async function fetchTokenViaROPC() {
  const tokenUrl = `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    username: process.env.SERVICE_ACCOUNT_EMAIL,
    password: process.env.SERVICE_ACCOUNT_PASSWORD,
    scope: `api://${process.env.CLIENT_ID}/Bot.TokenExchange Files.Read.All Sites.Read.All openid profile offline_access`
  });

  const tokenResponse = await axiosInstance.post(tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  cachedServiceAccountToken = tokenResponse.data.access_token;
  cachedRefreshToken = tokenResponse.data.refresh_token || null;
}

// Ensure only one ROPC call happens at a time (prevents race condition)
async function ensureServiceAccountToken() {
  if (cachedServiceAccountToken) return;
  if (!tokenFetchPromise) {
    tokenFetchPromise = fetchTokenViaROPC().finally(() => { tokenFetchPromise = null; });
  }
  await tokenFetchPromise;
}

// Refresh token every 50 minutes (3,000,000 ms)
setInterval(refreshServiceAccountToken, 50 * 60 * 1000);

app.post('/api/getTokens', limiter, async (req, res) => {
  try {
    // 1. Get or reuse service account token (race-safe)
    await ensureServiceAccountToken();

    // 2. Create a session with the token stored server-side
    const sessionId = crypto.randomUUID();

    // 3. Get Direct Line token
    const directLineResponse = await axiosInstance.post(
      'https://directline.botframework.com/v3/directline/tokens/generate',
      {},
      { headers: { Authorization: `Bearer ${process.env.DIRECT_LINE_SECRET}` } }
    );
    const directLineToken = directLineResponse.data.token;

    sessions.set(sessionId, {
      token: cachedServiceAccountToken,
      directLineToken: directLineToken,
      expiresAt: Date.now() + 90 * 60 * 1000 // 90 minutes
    });

    // 4. Return sessionId and directLineToken only (no service account token)
    res.json({ sessionId, directLineToken });
  } catch (error) {
    console.error('Error getting tokens:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to retrieve tokens' });
  }
});

// Server-side token exchange endpoint
app.post('/api/exchangeToken', limiter, async (req, res) => {
  try {
    const { sessionId, connectionName, exchangeId, conversationId } = req.body;

    if (!sessionId || !connectionName || !conversationId) {
      return res.status(400).json({ error: 'Missing sessionId, connectionName, or conversationId' });
    }

    // Validate session
    const session = sessions.get(sessionId);
    if (!session || session.expiresAt < Date.now()) {
      sessions.delete(sessionId);
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    // Post signin/tokenExchange invoke activity to the existing conversation
    await axiosInstance.post(
      `https://directline.botframework.com/v3/directline/conversations/${conversationId}/activities`,
      {
        type: 'invoke',
        name: 'signin/tokenExchange',
        from: {
          id: 'user',
          role: 'user'
        },
        value: {
          id: exchangeId,
          connectionName: connectionName,
          token: session.token
        }
      },
      { headers: { Authorization: `Bearer ${session.directLineToken}` } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Token exchange failed:', error.response?.data || error.message);
    res.status(500).json({ error: 'Token exchange failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
