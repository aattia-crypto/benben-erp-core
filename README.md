# Benben ERP (Core)

Benben ERP is a high-performance, local-first enterprise resource planning system designed to run entirely on local infrastructure with zero mandatory network dependencies.

## 🛡️ Licensing & Terms
Copyright (c) 2026 Benben Software, Inc. All rights reserved.

This repository contains the source code for the free core framework of Benben ERP. This is a **source-available** repository. You are welcome to download, audit, run, and self-host the core system locally for personal or internal business operations. However, no permission is granted to modify, redistribute, commercialize, or white-label this software under another brand without explicit written permission from Benben Software, Inc.

## 🚀 Key Architecture
- **Local-First Infrastructure:** Runs natively using an embedded local PostgreSQL instance.
- **Zero Phone-Home Gating:** Core initialization bypasses external network queries entirely.
- **Dynamic Localization Shell:** Ready for structural community internationalization.

## 🌐 Global Localization (i18n)
The core application frontend is fully structured for internationalization using dynamic JSON locale maps. We actively welcome structural localization contributions from the global community.

If you would like to help translate Benben ERP into your native language, please navigate to `renderer/src/locales/` and submit a Pull Request (PR) for any of our target language bundles:
- 🇸🇦 Arabic (`ar.json`)
- 🇨🇳 Chinese (`zh.json`)
- 🇩🇪 German (`de.json`)
- 🇪🇸 Spanish (`es.json`)
- 🇫🇷 French (`fr.json`)
- 🇰🇷 Korean (`ko.json`)
- 🇵🇹 Portuguese (`pt.json`)

## 💻 Local Development Setup

### Prerequisite
Ensure you have **Node.js (v18+)** and **npm** installed locally.

1. Install local dependencies:
   ```bash
   npm install
   ```

2. Build the UI and desktop shell:
   ```bash
   npm run build
   ```

3. Start the local desktop application:
   ```bash
   npm run start
   ```

For iterative desktop development after dependencies are installed:
```bash
npm run dev
```
