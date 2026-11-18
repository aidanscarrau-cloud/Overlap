# TestersAI API Key Reference (INTERNAL ONLY)

**CONFIDENTIAL - DO NOT SHARE WITH USERS**

## API Key Format

Keys follow the pattern: `tai_pro_[12-char-hex]`

Example:
- `tai_pro_a1b2c3d4e5f6` -- Pro tier

## How Keys Are Generated

1. Customer completes Stripe checkout
2. Stripe fires a `checkout.session.completed` webhook to our GCF endpoint
3. GCF generates a random 12-char hex key via `secrets.token_hex(6)`
4. Key is stored in Firestore `api_keys` collection
5. Customer is redirected to success page showing the key

## Validation Flow

1. User pastes key in any Claude message
2. Plugin detects `tai_[tier]_[random]` pattern via regex
3. Plugin calls GCF `POST /validate_key` with the key
4. GCF looks up key in Firestore, returns `{valid, tier}`
5. Plugin caches result in `.unlock_status.json`
6. Subsequent uses skip the network call (cached locally)

## Admin Operations

Keys are managed in Firestore (`api_keys` collection):
- **Revoke**: Set `active: false` on the key document
- **Lookup by email**: Check `customers` collection
- **Generate manually**: Add document to `api_keys` with `active: true`

## Customer Support

If a customer lost their key:
1. Look up by email in Firestore `customers` collection
2. Re-send the key
3. Or generate a new one and deactivate the old

Contact: support@testers.ai
