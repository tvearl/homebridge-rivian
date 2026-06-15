# Contributing to homebridge-rivian

Thanks for your interest in improving this plugin! Issues and pull requests are welcome.

## Reporting bugs / requesting features

Please use the issue templates. When filing a bug, include your vehicle model
(R1T / R1S), Homebridge version, plugin version, and relevant logs.

> Never paste secrets in an issue or PR: no Rivian tokens, no VIN, and never the
> contents of `rivian-auth.json`. Redact them from any logs you share.

## Development setup

Requires Node.js 18+ and npm.

```bash
git clone https://github.com/tvearl/homebridge-rivian.git
cd homebridge-rivian
npm install
npm run build     # compile TypeScript to dist/
npm run lint      # eslint, must pass with no warnings
npm run watch     # rebuild on change during development
```

## Coding guidelines

- TypeScript, strict mode. Keep `npm run build` and `npm run lint` clean
  (the publish step enforces both via `prepublishOnly`).
- Match the existing style: small accessory classes under `src/accessories/`,
  each implementing `update(values)` and using `platform.sendCommand(...)`.
- Don't add narration-only comments; comment intent/edge cases only.
- New vehicle commands go in `src/commands.ts`; state fields it reads go in
  `STATE_PROPERTIES`.

## Pull requests

1. Fork and branch from `main`.
2. Make your change with a clear, focused commit history.
3. Run `npm run build` and `npm run lint`.
4. Open a PR using the template and describe what you changed and how you tested
   it (note your vehicle model if behavior is model-specific).

## A note on the Rivian API

This project uses Rivian's unofficial API. It can change or break at any time,
and this project is not affiliated with or endorsed by Rivian. Be considerate of
the API (don't add aggressive polling or brute-force unknown commands).
