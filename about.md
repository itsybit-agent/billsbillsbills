# BillsBillsBills — Family expense tracker that stays on your device

Every month, Fredde and I go through our shared expenses. Who paid for groceries, who covered the streaming subscriptions, what's still unsettled. We tried spreadsheets, we tried apps with logins and subscriptions of their own. Nothing stuck. I just wanted something where I could drop in a bank export, tag things by category, and see what's paid and what isn't. So I built exactly that.

BillsBillsBills is a local-first expense tracker. No accounts, no cloud, no backend. You drop in an Excel export from your bank, classify transactions into categories, mark what's been settled, and get a clear breakdown of where the money went. Everything lives in your browser's localStorage using event sourcing -- every action is an immutable event, so you can export and replay your full history anytime.

**Features:**
- Import bank exports (Excel/CSV) via drag-and-drop with automatic column detection
- Auto-detects SEB bank format; falls back to a manual column-mapping UI for any bank
- Remembers your column mapping so repeat imports are one-click
- Duplicate detection skips transactions you've already imported
- Rule-based auto-classification: define patterns that match transaction descriptions to categories
- Classifying a transaction automatically creates a rule from the description for future imports
- Mark transactions as paid individually or in bulk (filtered batch marking)
- Filter transactions by category, month, unclassified, or unpaid status
- Summary dashboard with per-category totals, paid/unpaid breakdown, and monthly trends
- Full data portability: export rules as JSON, transactions as CSV, or the complete event log

**Tech:**
- Vanilla JavaScript (ES modules, no framework, no build step)
- Event sourcing architecture -- all state projected from an append-only event log
- localStorage for persistence (no server, no database)
- SheetJS (xlsx) for parsing Excel files
- Swedish locale defaults (SEK currency, SEB bank format detection)
