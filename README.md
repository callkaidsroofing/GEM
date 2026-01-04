# GEM - General Execution Manager

GEM is a registry-driven tool execution system for Call Kaids Roofing.

> **📖 Full documentation**: See [`/docs/`](./docs/) for system truth.

## Quick Start

```bash
# GEM-CORE Executor
cd gem-core && npm install && npm start

# GEM Brain
cd gem-brain && npm install && npm start
```

## Documentation

| Document | Purpose |
|----------|---------|
| [`/docs/SYSTEM.md`](./docs/SYSTEM.md) | What GEM is |
| [`/docs/STATE.md`](./docs/STATE.md) | Current phase and status |
| [`/docs/CONSTRAINTS.md`](./docs/CONSTRAINTS.md) | Hard rules |
| [`/docs/AGENTS.md`](./docs/AGENTS.md) | AI agent guidelines |
| [`/docs/PLATFORMS.md`](./docs/PLATFORMS.md) | Deployment info |
| [`/docs/DECISIONS.md`](./docs/DECISIONS.md) | Locked decisions |

### Subsystem Docs

- `gem-core/docs/` - Executor-specific mechanics
- `gem-brain/docs/` - Brain-specific mechanics

## Repository Structure

```
/
├── docs/               # Canonical system documentation
├── gem-core/           # GEM-CORE Executor (Render Background Worker)
├── gem-brain/          # GEM Brain (Render Web Service)
└── README.md           # This file
```

## License

Proprietary - Call Kaids Roofing
