# NodejsM365AgentChat

A Node.js Express backend + plain HTML/JS frontend that connects a **Microsoft Copilot Studio agent** to **SharePoint** using a service account via **Direct Line token exchange**.

## Architecture

```
Browser (Web Chat) → Express Backend → Microsoft Entra ID (ROPC)
                                     → Direct Line (token generate)
                                     → Direct Line (token exchange)
```

## Features

- **Silent SSO** — No login prompt for end users; authentication is handled server-side via a service account
- **Secure token handling** — Service account token never exposed to the browser; stored server-side with session-based access
- **Auto token refresh** — Background refresh every 50 minutes to keep sessions alive beyond 75 minutes
- **Rate limiting** — 20 requests/min/IP on all API endpoints
- **Corporate proxy support** — SSL certificate validation bypass for environments behind corporate firewalls

## Prerequisites

- Node.js 18+
- A Microsoft Entra ID app registration with ROPC enabled
- A service account with MFA disabled and SharePoint access
- A Copilot Studio agent with SharePoint knowledge source and Direct Line channel enabled

## Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/NatVis/NodejsM365AgentChat-.git
   cd NodejsM365AgentChat-
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your values:
   ```env
   TENANT_ID=your-tenant-id
   CLIENT_ID=your-client-id
   CLIENT_SECRET=your-client-secret
   SERVICE_ACCOUNT_EMAIL=your-service-account@domain.com
   SERVICE_ACCOUNT_PASSWORD=your-password
   DIRECT_LINE_SECRET=your-direct-line-secret
   PORT=3000
   ```

4. Start the server:
   ```bash
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/getTokens` | Returns `sessionId` + `directLineToken` |
| POST | `/api/exchangeToken` | Performs server-side OAuth token exchange |

## Project Structure

```
├── server.js                 # Express backend with token logic
├── public/
│   └── index.html            # Web Chat frontend with custom UI
├── package.json
├── postman_collection.json   # Postman collection for testing
├── TEST_CHECKLIST.md         # End-to-end test scenarios
└── .env                      # Environment variables (not tracked)
```

## Testing

Import `postman_collection.json` into Postman to test:
1. Entra ID ROPC authentication
2. Direct Line token generation
3. Token exchange endpoint
4. Graph API SharePoint access

## Security Notes

- `.env` is excluded from git via `.gitignore`
- Service account token is never sent to the frontend
- Sessions expire after 90 minutes
- Rate limiting prevents abuse
- `rejectUnauthorized: false` is used for corporate proxy environments — remove in production with proper CA certificates
