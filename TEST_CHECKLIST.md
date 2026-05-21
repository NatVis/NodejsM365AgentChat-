# End-to-End Test Checklist

## Scenario 1: Page loads and chat window appears with no login prompt

**What to do:**
- Open `http://localhost:3000` in a browser with DevTools open (Network tab).
- Wait for the page to fully load.

**What to look for in the Network tab:**
- A POST request to `/api/getTokens` returns HTTP 200.
- Response body contains `sessionId` (UUID string) and `directLineToken` (long string).
- A WebSocket connection opens to `directline.botframework.com`.

**Successful result:**
- The Web Chat widget renders inside the page with no OAuth login card or popup.
- The user sees a chat input box ready to type immediately.

---

## Scenario 2: Asking a SharePoint question returns a real document answer

**What to do:**
- Type a question that references content stored in SharePoint (e.g., "What is the travel policy?").
- Press Enter / Send.

**What to look for in the Network tab:**
- Outgoing WebSocket message with the user's text.
- If an OAuth card arrives, a POST to `/api/exchangeToken` fires and returns HTTP 200.
- Incoming WebSocket messages contain the bot's reply with document content or citations.

**Successful result:**
- The bot responds with an answer sourced from SharePoint (may include file names, links, or excerpts).
- No OAuth card or "Sign in" button is ever displayed to the user.

---

## Scenario 3: Session lasting more than 75 minutes still works (token refresh)

**What to do:**
- Open the app and send an initial message (confirm it works).
- Leave the page open for at least 75 minutes without closing the browser.
- After 75+ minutes, send another question referencing SharePoint content.

**What to look for in the Network tab:**
- Server console logs show "Service account token refreshed successfully." at ~50-minute intervals.
- The second question still triggers a successful `/api/exchangeToken` (if needed) with HTTP 200.
- No 401 or token-expired errors in any network call.

**Successful result:**
- The bot answers the second question correctly, proving the refreshed token is valid.
- No interruption, login prompt, or error message appears.

---

## Scenario 4: Service account password is wrong

**What to do:**
- In `.env`, set `SERVICE_ACCOUNT_PASSWORD` to an incorrect value.
- Restart the server (`npm start`).
- Open `http://localhost:3000` in the browser.

**What to look for in the Network tab:**
- POST to `/api/getTokens` returns HTTP 500.
- Response body contains `{ "error": "Failed to retrieve tokens" }`.
- Server console shows an Entra ID error like `AADSTS50126: Invalid username or password`.

**Successful result:**
- The chat window does NOT render (or shows an error state).
- No token is leaked in the response.
- The error is graceful — no stack trace exposed to the browser.

---

## Scenario 5: Direct Line secret is invalid

**What to do:**
- In `.env`, set `DIRECT_LINE_SECRET` to a garbage value (e.g., `invalid-secret`).
- Restart the server.
- Open `http://localhost:3000` in the browser.

**What to look for in the Network tab:**
- POST to `/api/getTokens` returns HTTP 500.
- Server console shows a 401/403 error from `directline.botframework.com/v3/directline/tokens/generate`.

**Successful result:**
- The page does not render a functional chat widget.
- The error message returned is generic (`"Failed to retrieve tokens"`) — no secret or internal detail is exposed.
- Even though the Entra ID token succeeds, the overall endpoint fails because Direct Line token generation is rejected.
