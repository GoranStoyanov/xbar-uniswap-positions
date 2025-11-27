# Uniswap v3 xbar plugin

This xbar plugin shows Uniswap v3 NFT positions (fees, USD value, and in-range status) in the macOS menu bar.

## Prerequisite: xbar
- Download xbar from https://xbarapp.com and install it.
- In xbar Preferences, point the Plugins folder to this repo (or copy `uniswappos.10m.sh` plus the `uni` directory into your chosen Plugins folder).

## Installation
- Copy `uniswappos.10m.sh` and the `uni` directory to your xbar Plugins folder (default `~/Library/Application Support/xbar/plugins`).
- Run `node install.js` (or `npm run install-plugin`) once to bootstrap. It removes the README from the plugin folder and installs the npm modules into that folder. By default it installs only if `node_modules` is missing; add `--force` to reinstall.
- Optional: call `node install.js --auto` from `uniswappos.10m.sh` if you want an automated first-run bootstrap. In `--auto` mode the script only runs when a README exists and `node_modules` is missing, so regular refreshes remain fast.

Note: because the installer deletes the README, keep a copy elsewhere (e.g., Git) if you need to refer back to these notes.

## Refresh scheduling
- xbar schedules a plugin based on the interval token in the filename: `something.<interval>.sh`.
- The interval uses a short unit: `s` = seconds, `m` = minutes, `h` = hours, `d` = days.
- Examples: `uniswappos.1m.sh` runs every 1 minute, `uniswappos.10m.sh` runs every 10 minutes, `uniswappos.2h.sh` runs every 2 hours.
- This repo ships with `uniswappos.10m.sh` so it refreshes every 10 minutes by default; rename the file if you want a different cadence.

## Configure the plugin
1) Create `uni/uniswappos.env` next to `uniswappos.js`:
```
UNI_WALLET_ADDRESS=0xYourWallet
UNI_RPC_URL=https://mainnet.infura.io/v3/your-key
```
- You can also set these as shell env vars; the file is optional but recommended.

2) Ensure Node is installed and reachable from xbar (`/opt/homebrew/bin/node` by default in `uniswappos.10m.sh`).

3) Load or refresh the plugin in xbar. The wrapper script `uniswappos.10m.sh` (or whichever interval you choose) calls the Node script inside `uni/uniswappos.js`.

## Notes
- The script colors positions: green = in range, orange = out of range, gray = unknown.
- Fees and USD totals are shown; prices are fetched from CoinGecko with a DefiLlama fallback.
- If RPC or wallet are missing, the plugin will render an error line instead of data.
