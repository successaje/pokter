import { decodeFunctionResult, encodeFunctionData, getAddress, parseAbi, parseEther, toFunctionSelector, toHex, type Address, type Hex } from 'viem';

import { settledBlockNumber, venusClient } from '@/lib/assay/venus';

import type { HouseAgentDefinition } from '../types';
import { isDelegatedWallet, readTouchstoneBrief, touchstoneVerdict, type Stage, type TokenFacts } from './touchstone-math';
import { TRADE_PROBE_RUNTIME } from './touchstone-probe';

const ROUTER: Address = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const V2_FACTORY: Address = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
const WBNB: Address = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const BNB_USD_FEED: Address = '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE';
const PROBE_AT: Address = '0x0000000000000000000000000000000000007070';
const PROBE_FROM: Address = '0x0000000000000000000000000000000000007071';
const DEAD: Address = '0x000000000000000000000000000000000000dEaD';
const ZERO: Address = '0x0000000000000000000000000000000000000000';
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

const ERC20 = parseAbi(['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)', 'function balanceOf(address) view returns (uint256)', 'function owner() view returns (address)', 'function getOwner() view returns (address)']);
const PROBE = parseAbi(['function probe(address router, address token) payable returns (uint256 buyExpected, uint256 buyReceived, uint256 sellExpected, uint256 sellReceived, uint8 stage)']);
const FACTORY = parseAbi(['function getPair(address,address) view returns (address)']);
const PAIR = parseAbi(['function getReserves() view returns (uint112, uint112, uint32)', 'function token0() view returns (address)', 'function totalSupply() view returns (uint256)', 'function balanceOf(address) view returns (uint256)']);
const FEED = parseAbi(['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)']);

/** Powers that matter while an owner is active, found by function selector in the code. */
const POWERS: Record<string, string[]> = {
  mint: ['mint(address,uint256)', 'mint(uint256)', 'mintTo(address,uint256)'],
  blacklist: ['blacklist(address)', 'addToBlacklist(address)', 'setBlacklist(address,bool)', 'blacklistAddress(address,bool)', 'setBots(address[],bool)', 'addBots(address[])'],
  'change fees': ['setTaxFee(uint256)', 'setFee(uint256)', 'setFees(uint256,uint256)', 'setBuyFee(uint256)', 'setSellFee(uint256)', 'updateFees(uint256,uint256)', 'setTaxes(uint256,uint256)'],
  'pause trading': ['pause()', 'setTradingEnabled(bool)', 'enableTrading(bool)', 'setTrading(bool)'],
  'limit transactions': ['setMaxTxAmount(uint256)', 'setMaxTxPercent(uint256)', 'setMaxWalletSize(uint256)', 'setMaxWallet(uint256)'],
};

type Client = ReturnType<typeof venusClient>;

async function tradeProbe(client: Client, token: Address): Promise<TokenFacts['probe']> {
  const data = encodeFunctionData({ abi: PROBE, functionName: 'probe', args: [ROUTER, token] });
  try {
    const result = (await client.request({
      method: 'eth_call',
      params: [
        { from: PROBE_FROM, to: PROBE_AT, data, value: toHex(parseEther('0.01')), gas: toHex(8_000_000) },
        'latest',
        { [PROBE_AT]: { code: TRADE_PROBE_RUNTIME }, [PROBE_FROM]: { balance: toHex(parseEther('10')) } },
      ] as never,
    })) as Hex;
    const [buyExpected, buyReceived, sellExpected, sellReceived, stage] = decodeFunctionResult({ abi: PROBE, functionName: 'probe', data: result });
    return {
      stage: stage as Stage,
      buyTax: buyExpected > 0n && stage !== 2 ? Math.max(0, 1 - Number(buyReceived) / Number(buyExpected)) : null,
      sellTax: sellExpected > 0n && stage === 0 ? Math.max(0, 1 - Number(sellReceived) / Number(sellExpected)) : null,
    };
  } catch {
    return null;
  }
}

export const touchstone: HouseAgentDefinition = {
  slug: 'touchstone',
  name: 'Touchstone',
  version: '1.0.0',
  category: 'token-safety',
  description:
    'Checks a BNB Chain token before you buy: simulates a real buy and sell on PancakeSwap to catch honeypots and measure the actual buy and sell tax, reads whether the owner is renounced and which powers they keep (mint, blacklist, fees, pausing trading), whether the contract is upgradable, and how deep and how locked its liquidity is. Returns Safe, Caution or Avoid with every reason. Needs the token address. Read-only: the trades are simulated and nothing is sent.',
  priceU: 0.05,
  skill: {
    id: 'token_check',
    name: 'Token safety check before a buy',
    description:
      'Give a BNB Chain token address. Returns Safe, Caution or Avoid, the measured buy and sell tax, owner powers, upgradability, liquidity and how much of it is burned, each with its source and the block it was read at.',
    examples: [
      'Check the BNB Chain token 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82 before a buy: is it safe to trade, and why.',
      'Is 0x… a honeypot? What are its taxes?',
      'Token safety check for 0x…',
    ],
    tags: ['token-safety', 'honeypot', 'tax', 'bnb-chain'],
  },
  deliverables: 'Safe, Caution or Avoid with every reason: simulated buy and sell taxes, honeypot check, owner powers, upgradability, liquidity depth and how much of it is burned.',
  qualityStandards: 'Read and simulated against BNB Chain mainnet at a stated block; no transaction is sent.',
  check(brief) {
    return readTouchstoneBrief(brief).token ? null : { error: 'The brief names no token address', need: 'Include the BNB Chain token to check, e.g. "Check the token 0x1234…abcd"' };
  },
  async run(brief) {
    const { token: raw } = readTouchstoneBrief(brief);
    if (!raw) return { ok: false, error: 'The brief names no token address', need: 'Include the token to check' };
    const token = getAddress(raw) as Address;
    const client = venusClient();
    const block = await settledBlockNumber(client);
    const [code, header] = await Promise.all([client.getCode({ address: token, blockNumber: block }), client.getBlock({ blockNumber: block })]);
    const asOf = { block: block.toString(), time: new Date(Number(header.timestamp) * 1000).toISOString() };
    if (!code || code === '0x' || isDelegatedWallet(code)) {
      const facts: TokenFacts = { isContract: false, symbol: null, probe: null, owner: { address: null, renounced: false }, powers: [], upgradable: false, liquidityUsd: null, lpBurnedShare: null, ownerShare: null, burnedShare: null };
      return { ok: true, content: { token, ...touchstoneVerdict(facts), as_of: asOf } };
    }
    const read = <T>(fn: string, args: unknown[] = []) => client.readContract({ address: token, abi: ERC20, functionName: fn as never, args: args as never, blockNumber: block }).catch(() => null) as Promise<T | null>;
    const [name, symbol, decimals, supply, ownerA, ownerB, implSlot, pair, probe, bnb] = await Promise.all([
      read<string>('name'), read<string>('symbol'), read<number>('decimals'), read<bigint>('totalSupply'), read<Address>('owner'), read<Address>('getOwner'),
      client.getStorageAt({ address: token, slot: IMPLEMENTATION_SLOT, blockNumber: block }),
      client.readContract({ address: V2_FACTORY, abi: FACTORY, functionName: 'getPair', args: [token, WBNB], blockNumber: block }),
      tradeProbe(client, token),
      client.readContract({ address: BNB_USD_FEED, abi: FEED, functionName: 'latestRoundData', blockNumber: block }),
    ]);
    const implementation = implSlot && !/^0x0*$/.test(implSlot) ? (getAddress(`0x${implSlot.slice(-40)}`) as Address) : null;
    const logicCode = implementation ? await client.getCode({ address: implementation, blockNumber: block }) : code;
    const powers = Object.entries(POWERS).filter(([, signatures]) => signatures.some((s) => (logicCode ?? '').includes(toFunctionSelector(s).slice(2)))).map(([power]) => power);
    const owner = ownerA ?? ownerB;
    const renounced = owner === null ? false : [ZERO, DEAD].some((a) => a.toLowerCase() === owner.toLowerCase());
    const readOwnerCode = () => client.getCode({ address: owner as Address, blockNumber: block });
    const ownerCode = owner && !renounced ? await readOwnerCode().catch(() => readOwnerCode()).catch(() => null) : null;
    // Unknown stays unknown: a failed read is not evidence of a wallet.
    const ownerIsContract = ownerCode === null ? null : Boolean(ownerCode && ownerCode !== '0x' && !isDelegatedWallet(ownerCode));
    const share = async (holder: Address) => (supply && supply > 0n ? Number((await read<bigint>('balanceOf', [holder])) ?? 0n) / Number(supply) : null);
    const [ownerShare, deadShare, zeroShare] = await Promise.all([owner && !renounced ? share(owner) : Promise.resolve(null), share(DEAD), share(ZERO)]);
    let liquidityUsd: number | null = null;
    let lpBurnedShare: number | null = null;
    let pairShare: number | null = null;
    if (!/^0x0+$/.test(pair)) {
      const [reserves, token0, lpSupply, lpDead, lpZero] = await Promise.all([
        client.readContract({ address: pair, abi: PAIR, functionName: 'getReserves', blockNumber: block }),
        client.readContract({ address: pair, abi: PAIR, functionName: 'token0', blockNumber: block }),
        client.readContract({ address: pair, abi: PAIR, functionName: 'totalSupply', blockNumber: block }),
        client.readContract({ address: pair, abi: PAIR, functionName: 'balanceOf', args: [DEAD], blockNumber: block }),
        client.readContract({ address: pair, abi: PAIR, functionName: 'balanceOf', args: [ZERO], blockNumber: block }),
      ]);
      const wbnbReserve = token0.toLowerCase() === WBNB.toLowerCase() ? reserves[0] : reserves[1];
      liquidityUsd = 2 * (Number(wbnbReserve) / 1e18) * (Number(bnb[1]) / 1e8);
      lpBurnedShare = lpSupply > 0n ? Number(lpDead + lpZero) / Number(lpSupply) : null;
      pairShare = await share(pair);
    }
    const facts: TokenFacts = {
      isContract: true,
      wrappedNative: token.toLowerCase() === WBNB.toLowerCase(),
      symbol,
      probe,
      owner: { address: owner, renounced, isContract: ownerIsContract },
      powers,
      upgradable: implementation !== null,
      liquidityUsd,
      lpBurnedShare,
      ownerShare,
      burnedShare: deadShare === null && zeroShare === null ? null : (deadShare ?? 0) + (zeroShare ?? 0),
    };
    const { verdict, reasons } = touchstoneVerdict(facts);
    const pct = (value: number | null) => (value === null ? null : Math.round(value * 10_000) / 100);
    return {
      ok: true,
      content: {
        token,
        name, symbol,
        verdict,
        reasons,
        measured: {
          buy_tax_pct: pct(probe?.buyTax ?? null),
          sell_tax_pct: pct(probe?.sellTax ?? null),
          honeypot: probe ? probe.stage === 6 : null,
          owner,
          owner_renounced: renounced,
          owner_powers: powers,
          upgradable: implementation !== null,
          ...(implementation ? { implementation } : {}),
          liquidity_usd: liquidityUsd === null ? null : Math.round(liquidityUsd),
          lp_burned_pct: pct(lpBurnedShare),
          supply: supply === null || decimals === null ? null : Number(supply) / 10 ** decimals,
          holdings_pct: { owner: pct(ownerShare), burned: pct(facts.burnedShare), in_v2_pool: pct(pairShare) },
        },
        as_of: asOf,
        sources: [
          `Buy and sell simulated through PancakeSwap v2 router ${ROUTER} with 0.01 BNB in one eth_call at block ${block}; nothing was sent`,
          `Token contract${implementation ? ` and its implementation ${implementation}` : ''} read at block ${block}`,
          pair && !/^0x0+$/.test(pair) ? `PancakeSwap v2 pair ${pair}, valued with Chainlink BNB/USD` : 'No PancakeSwap v2 WBNB pair',
        ],
        not_checked: ['The full holder list (it needs an indexer); only the owner, burn addresses and the pool are shown.', 'Liquidity on PancakeSwap v3 and other venues.', 'Whether the project behind the token is any good.'],
      },
    };
  },
};
