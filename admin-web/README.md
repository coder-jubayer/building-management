# Barighorr Admin (web)
Vite + React admin console for app admins.

## Run
```bash
# from repo root (API must be running on :3001)
npm run admin-web:dev
```

Open http://localhost:5173

## Login
- Email: `admin@bm.com`
- Password: `admin123`

Uses the same API as the Expo admin app (`VITE_API_URL`, default `http://localhost:3001/api/v1`).

## Features
- Overview stats
- Buildings list + activate/deactivate + PDF report download
- Building detail (users by role + app access / free trial controls)
- Users list + activate/deactivate
- Settings (free trial toggle/length + support WhatsApp)
- Profile + logout

The Expo `admin/` app is unchanged and can still be used.
