require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

console.log('🚀 NEW TOKEN CATCHER - FIXED\n');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
let alerted = new Set(); // Only tokens we actually alerted on

async function sendAlert(msg) {
  try {
    await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { 
      parse_mode: 'HTML', 
      disable_web_page_preview: true 
    });
    console.log('✅ ALERT SENT!');
    return true;
  } catch (e) {
    console.error('❌ Telegram error:', e.message.split('\n')[0]);
    return false;
  }
}

// ==================== SCAN SOLANA ====================

async function findNewTokensSolana() {
  try {
    console.log('\n[Solana] Scanning...');

    const res = await axios.get('https://api.geckoterminal.com/api/v2/networks/solana/pools?order=h24_transaction_count_desc&limit=100', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).catch(() => null);

    if (!res?.data?.data) {
      console.log('   No data');
      return;
    }

    const pools = res.data.data;
    console.log(`   Got ${pools.length} pools`);

    let newCount = 0;

    for (const pool of pools.slice(0, 100)) {
      try {
        const baseToken = pool.tokens?.[0];
        if (!baseToken) continue;

        const tokenAddr = baseToken.address;
        const symbol = baseToken.symbol || '?';
        const name = baseToken.name || '?';

        // Skip if already alerted on
        if (alerted.has(tokenAddr)) {
          continue;
        }

        const liq = parseFloat(pool.reserve_in_usd) || 0;
        const vol24h = parseFloat(pool.volume_usd?.h24) || 0;
        const txns24h = parseInt(pool.transactions?.h24) || 0;
        const priceChange = pool.price_change_24h || 0;

        // ONLY filter: must have SOME activity
        if (liq < 50) {  // Much lower - catch BRAND NEW tokens
          continue;
        }

        // THIS IS A NEW TOKEN!
        alerted.add(tokenAddr);
        newCount++;

        console.log(`   NEW: ${symbol}`);
        console.log(`   Liq: $${(liq / 1000).toFixed(1)}K | Vol: $${(vol24h / 1000).toFixed(1)}K`);

        const msg = `<b>NEW TOKEN</b>

${symbol} (${name})
<code>${tokenAddr}</code>

Liquidity: $${(liq / 1000).toFixed(1)}K
Volume: $${(vol24h / 1000).toFixed(1)}K
Transactions: ${txns24h}
Price: ${priceChange > 0 ? 'UP' : 'DOWN'} ${Math.abs(priceChange).toFixed(1)}%

RESEARCH BEFORE BUYING
- Check Solscan security
- Verify contract
- Check holders

<a href="https://solscan.io/token/${tokenAddr}">Solscan</a> | <a href="https://dexscreener.com/solana/${tokenAddr}">DexScreener</a> | <a href="https://rugcheck.xyz/tokens/${tokenAddr}">RugCheck</a>`;

        await sendAlert(msg);
        await new Promise(r => setTimeout(r, 1000));

      } catch (e) {
        continue;
      }
    }

    console.log(`   Result: ${newCount} alerts`);

  } catch (e) {
    console.log(`   Error: ${e.message.split('\n')[0]}`);
  }
}

// ==================== SCAN BSC ====================

async function findNewTokensBSC() {
  try {
    console.log('\n[BSC] Scanning...');

    const res = await axios.get('https://api.geckoterminal.com/api/v2/networks/bsc/pools?order=h24_transaction_count_desc&limit=100', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).catch(() => null);

    if (!res?.data?.data) {
      console.log('   No data');
      return;
    }

    const pools = res.data.data;
    console.log(`   Got ${pools.length} pools`);

    let newCount = 0;

    for (const pool of pools.slice(0, 100)) {
      try {
        const baseToken = pool.tokens?.[0];
        if (!baseToken) continue;

        const tokenAddr = baseToken.address;
        const symbol = baseToken.symbol || '?';
        const name = baseToken.name || '?';

        if (alerted.has(tokenAddr)) {
          continue;
        }

        const liq = parseFloat(pool.reserve_in_usd) || 0;
        const vol24h = parseFloat(pool.volume_usd?.h24) || 0;

        if (liq < 50) {
          continue;
        }

        alerted.add(tokenAddr);
        newCount++;

        console.log(`   NEW: ${symbol}`);
        console.log(`   Liq: $${(liq / 1000).toFixed(1)}K`);

        const msg = `<b>NEW TOKEN</b>

${symbol} (${name})
<code>${tokenAddr}</code>

Liquidity: $${(liq / 1000).toFixed(1)}K
Volume: $${(vol24h / 1000).toFixed(1)}K

RESEARCH BEFORE BUYING
- Check BscScan
- Verify contract
- Check security

<a href="https://bscscan.com/token/${tokenAddr}">BscScan</a> | <a href="https://dexscreener.com/bsc/${tokenAddr}">DexScreener</a>`;

        await sendAlert(msg);
        await new Promise(r => setTimeout(r, 1000));

      } catch (e) {
        continue;
      }
    }

    console.log(`   Result: ${newCount} alerts`);

  } catch (e) {
    console.log(`   Error: ${e.message.split('\n')[0]}`);
  }
}

// ==================== STARTUP ====================

async function startup() {
  console.log('BOT ONLINE - NEW TOKEN CATCHER\n');

  try {
    await sendAlert(`<b>TOKEN CATCHER ONLINE</b>

Finding new tokens on Solana & BSC
Minimal filters - all early launches

ALWAYS DO YOUR OWN RESEARCH
Never invest without verification`);
  } catch (e) {
    console.log('Telegram issue\n');
  }

  console.log('Scanning...\n');

  // Scan every 20 seconds
  setInterval(findNewTokensSolana, 20000);
  setInterval(findNewTokensBSC, 21000);

  // Save alerted tokens
  setInterval(() => {
    try {
      fs.writeFileSync('alerted.json', JSON.stringify(Array.from(alerted)));
    } catch (e) {}
  }, 60000);
}

process.on('SIGINT', () => {
  console.log('\nStopped');
  process.exit(0);
});

startup().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
