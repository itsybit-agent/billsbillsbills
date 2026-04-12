# BillsBillsBills — Family expense tracker that stays on your device

Every few weeks I go through our credit card bill to make sure we haven't accidentally signed up for some subscription, and to prepay what we've spent so we don't hit our cap when the month ends. It's also a nice way to review our spending habits more often. I used to do all of this in Excel with lookups and formulas, which worked until the bank decided to change their export format — then I'd have to redo all the lookups again.

This one took all the manual stuff out of it. Import the bank export, classify transactions, and the rules remember your classifications for next time. It let me step back and actually focus on reviewing expenses rather than entering them into a cumbersome spreadsheet system.

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
- Event sourcing architecture — all state projected from an append-only event log
- localStorage for persistence (no server, no database)
- SheetJS (xlsx) for parsing Excel files
- Swedish locale defaults (SEK currency, SEB bank format detection)
