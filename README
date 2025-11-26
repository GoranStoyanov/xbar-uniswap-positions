# Uniswap v3 xbar plugin

This is an xbar plugin that shows Uniswap v3 NFT positions (fees, USD value, and in-range status) in the macOS menu bar.

## Prerequisite: xbar
- Download xbar from https://xbarapp.com and install it.
- In xbar Preferences, point the Plugins folder to this repo (or copy `uniswappos.10m.sh` plus the `uni` directory into your chosen Plugins folder).
- Ensure the wrapper keeps its `.10m.sh` suffix so it refreshes every 10 minutes.

## Configure the plugin
1) Create `uni/uniswappos.env` next to `uniswappos.js`:
```
UNI_WALLET_ADDRESS=0xYourWallet
UNI_RPC_URL=https://mainnet.infura.io/v3/your-key
```
- You can also set these as shell env vars; the file is optional but recommended.

2) Ensure Node is installed and reachable from xbar (`/opt/homebrew/bin/node` by default in `uniswappos.1m.sh`).

3) Load or refresh the plugin in xbar. The wrapper script `uniswappos.1m.sh` calls the Node script inside `uni/uniswappos.js`.

## Notes

- The script colors positions: green = in range, orange = out of range, gray = unknown.
- Fees and USD totals are shown; prices are fetched from CoinGecko with a DefiLlama fallback.
- If RPC or wallet are missing, the plugin will render an error line instead of data.
