const { ethers } = require('ethers');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, 'uniswappos.env');
loadEnvFromFile(ENV_PATH);

// Wallet and RPC from env (either shell env or uniswappos.env file)
const WALLET_ADDRESS =
  process.env.UNI_WALLET_ADDRESS ||
  process.env.UNISWAP_WALLET_ADDRESS ||
  process.env.WALLET_ADDRESS ||
  '';
const RPC_URL =
  process.env.UNI_RPC_URL ||
  process.env.UNISWAP_RPC_URL ||
  process.env.RPC_URL ||
  '';

// NonfungiblePositionManager (Uniswap v3) on mainnet
const NFPM_ADDRESS = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

const NFPM_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  // collect signature uses struct params
  'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) params) returns (uint256 amount0, uint256 amount1)'
];

const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)'
];

const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
];

const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
];

// 2^128 - 1
const MAX_UINT128 = ethers.BigNumber.from('0xffffffffffffffffffffffffffffffff');

async function main() {
  if (!WALLET_ADDRESS || !RPC_URL) {
    console.log('UNI $: 0.00');
    console.log('---');
    console.log('Set UNI_WALLET_ADDRESS and UNI_RPC_URL in uniswappos.env');
    return;
  }

  let provider;
  try {
    provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  } catch (e) {
    console.log('UNI $: 0.00');
    console.log('---');
    console.log((e && e.message) || String(e));
    return;
  }

  const nfpm = new ethers.Contract(NFPM_ADDRESS, NFPM_ABI, provider);
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);

  let numPositions;
  try {
    const raw = await nfpm.balanceOf(WALLET_ADDRESS);
    numPositions = raw.toNumber();
  } catch (e) {
    console.log('UNI $: 0.00');
    console.log('---');
    console.log('balanceOf failed');
    console.log((e && e.message) || String(e));
    return;
  }

  if (numPositions === 0) {
    console.log('UNI $: 0.00');
    console.log('---');
    console.log('No Uniswap v3 positions for this wallet');
    return;
  }

  const tokenMetaCache = {}; // addr -> { symbol, decimals }
  const tokenAddrSet = new Set(); // for price lookup
  const positions = [];
  const poolTickCache = {}; // poolAddr -> tick

  async function getTokenMeta(addr) {
    if (tokenMetaCache[addr]) return tokenMetaCache[addr];
    const erc = new ethers.Contract(addr, ERC20_ABI, provider);
    let symbol;
    let decimals = 18;
    try {
      symbol = await erc.symbol();
    } catch (_) {
      symbol = shorten(addr);
    }
    try {
      decimals = await erc.decimals();
    } catch (_) {
      decimals = 18;
    }
    tokenMetaCache[addr] = { symbol, decimals };
    return tokenMetaCache[addr];
  }

  // collect active positions with unclaimed fees
  for (let i = 0; i < numPositions; i++) {
    try {
      const tokenIdBN = await nfpm.tokenOfOwnerByIndex(WALLET_ADDRESS, i);
      const tokenId = tokenIdBN.toString();
      const pos = await nfpm.positions(tokenIdBN);

      const token0 = pos.token0 || pos[2];
      const token1 = pos.token1 || pos[3];
      const feeRaw = pos.fee || pos[4];
      const tickLower = pos.tickLower || pos[5];
      const tickUpper = pos.tickUpper || pos[6];
      const liquidity = pos.liquidity || pos[7];

      // simulate collect() to get *current* unclaimed fees
      let amount0FeesBN;
      let amount1FeesBN;
      try {
        const collectRes = await nfpm.callStatic.collect(
          {
            tokenId: tokenIdBN,
            recipient: WALLET_ADDRESS,
            amount0Max: MAX_UINT128,
            amount1Max: MAX_UINT128
          }
        );
        amount0FeesBN = collectRes.amount0 || collectRes[0];
        amount1FeesBN = collectRes.amount1 || collectRes[1];
      } catch (_) {
        amount0FeesBN = ethers.BigNumber.from(0);
        amount1FeesBN = ethers.BigNumber.from(0);
      }

      const isLiquidityZero = liquidity.isZero();
      const hasFees =
        !amount0FeesBN.isZero() || !amount1FeesBN.isZero();

      // closed and nothing left to collect -> skip
      if (isLiquidityZero && !hasFees) continue;

      const fee = Number(feeRaw);
      const feePct = (fee / 10000).toFixed(2); // e.g. 500 -> 0.05%

      const meta0 = await getTokenMeta(token0);
      const meta1 = await getTokenMeta(token1);

      const fees0 = parseFloat(
        ethers.utils.formatUnits(amount0FeesBN, meta0.decimals)
      );
      const fees1 = parseFloat(
        ethers.utils.formatUnits(amount1FeesBN, meta1.decimals)
      );

      tokenAddrSet.add(token0.toLowerCase());
      tokenAddrSet.add(token1.toLowerCase());

      positions.push({
        tokenId,
        token0,
        token1,
        sym0: meta0.symbol,
        sym1: meta1.symbol,
        feePct,
        feeRaw: fee,
        fees0,
        fees1,
        tickLower: Number(tickLower),
        tickUpper: Number(tickUpper)
      });
    } catch (e) {
      positions.push({
        tokenId: `err-${i}`,
        error: (e && e.message) || String(e)
      });
    }
  }

  if (positions.length === 0) {
    console.log('UNI $: 0.00');
    console.log('---');
    console.log('No active positions with remaining liquidity or fees');
    return;
  }

  const priceMap = await fetchPrices(Array.from(tokenAddrSet));
  let totalUsd = 0;

  for (const p of positions) {
    if (p.error) continue;

    const addr0 = p.token0.toLowerCase();
    const addr1 = p.token1.toLowerCase();

    const price0 =
      priceMap[addr0] && typeof priceMap[addr0].usd === 'number'
        ? priceMap[addr0].usd
        : null;
    const price1 =
      priceMap[addr1] && typeof priceMap[addr1].usd === 'number'
        ? priceMap[addr1].usd
        : null;

    let usd = 0;
    let hasUsd = false;

    if (price0 !== null && p.fees0 > 0) {
      usd += p.fees0 * price0;
      hasUsd = true;
    }
    if (price1 !== null && p.fees1 > 0) {
      usd += p.fees1 * price1;
      hasUsd = true;
    }

    if (hasUsd) {
      p.usd = usd;
      totalUsd += usd;
    } else {
      p.usd = null;
    }

    // in-range check; best-effort
    p.inRange = await isInRange(p, factory, provider, poolTickCache);
  }

  const titleUsd = totalUsd.toFixed(2);
  console.log(`UNI $: ${titleUsd}`);

  for (const p of positions) {
    console.log('---');
    if (p.error) {
      console.log(`Error loading position ${p.tokenId}`);
      console.log(p.error);
      continue;
    }

    const pair = `${p.sym0}/${p.sym1}`;
    const feesLabel = formatFees(p);
    const usdLabel =
      p.usd != null ? ` ($${p.usd.toFixed(2)})` : '';
    const rangeLabel = p.inRange === null ? 'RANGE ?' : p.inRange ? 'IN RANGE' : 'OUT RANGE';
    const color = p.inRange === null ? 'gray' : p.inRange ? 'green' : 'orange';
    const label = `#${p.tokenId} [${rangeLabel}] ${pair} ${p.feePct}% fees: ${feesLabel}${usdLabel}`;
    const link = `https://app.uniswap.org/pools/${p.tokenId}`;
    console.log(`${label} | href=${link} color=${color}`);
  }
}

// Coingecko simple token price via https (no fetch)
function fetchPrices(addresses) {
  const uniq = Array.from(new Set(addresses.map((a) => a.toLowerCase())));
  if (!uniq.length) return {};

  // Try CoinGecko first, then backfill missing symbols with DefiLlama
  return (async () => {
    const fromCg = await fetchFromCoingecko(uniq);
    const missing = uniq.filter((a) => !fromCg[a]);

    if (!missing.length) return fromCg;

    const fromLlama = await fetchFromLlama(missing);
    return { ...fromLlama, ...fromCg };
  })();
}

function fetchFromCoingecko(addresses) {
  return new Promise((resolve) => {
    if (!addresses.length) return resolve({});

    const qs = encodeURIComponent(addresses.join(','));
    const url =
      'https://api.coingecko.com/api/v3/simple/token_price/ethereum' +
      '?contract_addresses=' +
      qs +
      '&vs_currencies=usd';

    let data = '';
    https
      .get(url, (res) => {
        res.on('data', (chunk) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json && typeof json === 'object' ? json : {});
          } catch (_) {
            resolve({});
          }
        });
      })
      .on('error', () => resolve({}));
  });
}

function fetchFromLlama(addresses) {
  return new Promise((resolve) => {
    if (!addresses.length) return resolve({});

    const qs = addresses.map((a) => `ethereum:${a}`).join(',');
    const url = `https://coins.llama.fi/prices/current/${qs}`;

    let data = '';
    https
      .get(url, (res) => {
        res.on('data', (chunk) => {
          data += chunk.toString();
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (!json || typeof json !== 'object' || !json.coins) {
              return resolve({});
            }
            const out = {};
            for (const [k, v] of Object.entries(json.coins)) {
              const addr = k.split(':')[1]?.toLowerCase();
              if (!addr || !v || typeof v.price !== 'number') continue;
              out[addr] = { usd: v.price };
            }
            resolve(out);
          } catch (_) {
            resolve({});
          }
        });
      })
      .on('error', () => resolve({}));
  });
}

function formatFees(p) {
  const parts = [];
  if (p.fees0 && p.fees0 > 0) {
    parts.push(trimNum(p.fees0) + ' ' + p.sym0);
  }
  if (p.fees1 && p.fees1 > 0) {
    parts.push(trimNum(p.fees1) + ' ' + p.sym1);
  }
  if (!parts.length) return '0';
  return parts.join(' + ');
}

function trimNum(x) {
  return x.toFixed(6).replace(/0+$/g, '').replace(/\.$/, '');
}

function shorten(addr) {
  if (!addr || addr.length < 10) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

async function isInRange(p, factory, provider, poolTickCache) {
  try {
    const poolAddr = await factory.getPool(p.token0, p.token1, p.feeRaw || 0);
    const pool = poolAddr && poolAddr !== ethers.constants.AddressZero ? poolAddr : null;
    if (!pool) return null;

    if (poolTickCache[pool] === undefined) {
      const poolC = new ethers.Contract(pool, POOL_ABI, provider);
      const slot0 = await poolC.slot0();
      const tick = slot0.tick || slot0[1];
      poolTickCache[pool] = Number(tick);
    }

    const tick = poolTickCache[pool];
    return tick >= p.tickLower && tick <= p.tickUpper;
  } catch (_) {
    return null;
  }
}

function loadEnvFromFile(envPath) {
  try {
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, 'utf8');
    raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .forEach((line) => {
        const eq = line.indexOf('=');
        if (eq === -1) return;
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        if (!key) return;
        // do not override existing env
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      });
  } catch (_) {
    // best-effort; ignore errors
  }
}

main().catch((e) => {
  console.log('UNI $: 0.00');
  console.log('---');
  console.log((e && e.message) || String(e));
});
