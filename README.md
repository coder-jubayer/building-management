# Building Management System

Cross-platform mobile app (Android & iOS) for residential building / society management.

## Status: Phase 0 Complete

- Monorepo with `mobile/` (Expo) + `server/` (Node.js API)
- MongoDB Atlas connected (`building_dev`)
- Role-based navigation skeleton (Resident, Guard, Admin)
- Design system (Button, Input, Card)
- Store-ready `app.json` + `eas.json`

## Quick start

```bash
# Terminal 1 — API
cd server && npm run dev

# Terminal 2 — Mobile
cd mobile && npm start
```

See [docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md) for full instructions.

## Stack

| Layer | Technology |
|-------|------------|
| Mobile | React Native + Expo SDK 57 + TypeScript |
| Navigation | Expo Router (file-based) |
| Backend | Node.js + Express + Mongoose |
| Database | MongoDB Atlas (dev) → MongoDB on VPS (prod) |
| Push (Phase 2+) | Expo Push Notifications |
| Real-time (Phase 7+) | Socket.io |
| Images | Server disk (`server/uploads/`) |

## Modules

1. Authentication — **Phase 1 next**
2. Notice & Circular
3. Monthly Expense Management
4. Amenity Booking
5. Marketplace
6. Election Voting
7. Smart Guest Approval
8. Emergency & Utility Directory
9. Complaint & Maintenance

See [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md) for the full build plan.

## Production

Docker on Ubuntu (isolated from other VPS projects): see [DEPLOY.md](./DEPLOY.md).

API health: `http://64.176.81.197:3011/api/v1/health`

## Repository

https://github.com/coder-jubayer/building-management
