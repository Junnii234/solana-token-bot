require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

console.log('🚀 NEW TOKEN CATCHER - Early Launch Detection\n');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
let processed = new Set();
let seenAddresses = new Set(); // Track all addresses seen

async function sendAlert(msg) {
  try {
    await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { 
      parse_mode: 'HTML', 
      disable_web_page_preview: true 
    });
    console.log('✅ ALERT!');
    return true;
  } catch (e) {
    console.error('❌ Telegram error:', e.message.split('\n')[0]);
    return false;
  }
}

// ==================== SCAN FOR NEW TOKENS ====================

async function findNewTokensSolana() {
  try {
    console.log('\n[Solana] Looking for NEW tokens...');

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
    let skipped = 0;

    for (const pool of pools.slice(0, 100)) {
      try {
        const baseToken = pool.tokens?.[0];
        if (!baseToken) continue;

        const tokenAddr = baseToken.address;
        const symbol = baseToken.symbol || '?';
        const name = baseToken.name || '?';

        // Check if this is a NEW token we haven't seen
        if (seenAddresses.has(tokenAddr)) {
          skipped++;
          continue;
        }

        // Mark as seen
        seenAddresses.add(tokenAddr);

        const liq = parseFloat(pool.reserve_in_usd) || 0;
        const vol24h = parseFloat(pool.volume_usd?.h24) || 0;
        const txns24h = parseInt(pool.transactions?.h24) || 0;
        const priceChange = pool.price_change_24h || 0;

        // ONLY FILTER: Must have SOME liquidity and SOME trading
        if (liq < 100) {
          skipped++;
          continue;
        }

        // Check if already alerted
        if (processed.has(tokenAddr)) {
          skipped++;
          continue;
        }

        processed.add(tokenAddr);
        newCount++;

        console.log(`\n   NEW: ${symbol} (${name})`);
        console.log(`   Liq: $${(liq / 1000).toFixed(1)}K | Vol: $${(vol24h / 1000).toFixed(1)}K | Txns: ${txns24h}`);
        console.log(`   Sending alert...\n`);

        const msg = `<b>NEW TOKEN FOUND</b>

${symbol} (${name})
<code>${tokenAddr}</code>

EARLY STAGE
Liquidity: $${(liq / 1000).toFixed(1)}K
Volume: $${(vol24h / 1000).toFixed(1)}K
Transactions: ${txns24h}
Price Change: ${priceChange > 0 ? 'UP' : 'DOWN'} ${Math.abs(priceChange).toFixed(1)}%

RESEARCH REQUIRED
- Check Solscan for security
- Verify mint authority
- Check holder distribution
- Look for red flags

<a href="https://solscan.io/token/${tokenAddr}">Solscan</a> | <a href="https://dexscreener.com/solana/${tokenAddr}">DexScreener</a> | <a href="https://rugcheck.xyz/tokens/${tokenAddr}">RugCheck</a>`;

        await sendAlert(msg);
        await new Promise(r => setTimeout(r, 1000));

      } catch (e) {
        continue;
      }
    }

    console.log(`   Found: ${newCount} new | Skipped: ${skipped}`);

  } catch (e) {
    console.log(`   Error: ${e.message.split('\n')[0]}`);
  }
}

// ==================== SCAN FOR NEW TOKENS BSC ====================

async function findNewTokensBSC() {
  try {
    console.log('\n[BSC] Looking for NEW tokens...');

    const res = await axios.get('https://api.dexscreener.com/latest/dex/tokens?chain=bsc&limit=30', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).catch(async () => {
      // Fallback to GeckoTerminal
      return await axios.get('https://api.geckoterminal.com/api/v2/networks/bsc/pools?order=h24_transaction_count_desc&limit=100', {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).catch(() => null);
    });

    if (!res?.data) {
      console.log('   No data');
      return;
    }

    // Handle different API response formats
    let tokens = [];
    
    if (res.data.pairs) {
      // DexScreener format
      tokens = res.data.pairs.slice(0, 100);
    } else if (res.data.data) {
      // GeckoTerminal format
      tokens = res.data.data.slice(0, 100);
    }

    console.log(`   Got ${tokens.length} tokens`);

    let newCount = 0;
    let skipped = 0;

    for (const token of tokens) {
      try {
        let tokenAddr, symbol, name, liq, vol24h;

        // Handle DexScreener format
        if (token.baseToken) {
          tokenAddr = token.baseToken.address;
          symbol = token.baseToken.symbol || '?';
          name = token.baseToken.name || '?';
          liq = token.liquidity?.usd || 0;
          vol24h = token.volume?.h24 || 0;
        }
        // Handle GeckoTerminal format
        else if (token.tokens?.[0]) {
          const baseToken = token.tokens[0];
          tokenAddr = baseToken.address;
          symbol = baseToken.symbol || '?';
          name = baseToken.name || '?';
          liq = parseFloat(token.reserve_in_usd) || 0;
          vol24h = parseFloat(token.volume_usd?.h24) || 0;
        } else {
          continue;
        }

        if (!tokenAddr) continue;

        // Check if new
        if (seenAddresses.has(tokenAddr)) {
          skipped++;
          continue;
        }

        seenAddresses.add(tokenAddr);

        // Minimal filter: >$100 liquidity
        if (liq < 100) {
          skipped++;
          continue;
        }

        if (processed.has(tokenAddr)) {
          skipped++;
          continue;
        }

        processed.add(tokenAddr);
        newCount++;

        console.log(`\n   NEW: ${symbol} (${name})`);
        console.log(`   Liq: $${(liq / 1000).toFixed(1)}K | Vol: $${(vol24h / 1000).toFixed(1)}K`);
        console.log(`   Sending alert...\n`);

        const msg = `<b>NEW TOKEN FOUND</b>

${symbol} (${name})
<code>${tokenAddr}</code>

EARLY STAGE
Liquidity: $${(liq / 1000).toFixed(1)}K
Volume: $${(vol24h / 1000).toFixed(1)}K

RESEARCH REQUIRED
- Check BscScan for security
- Verify owner actions
- Check holder distribution

<a href="https://bscscan.com/token/${tokenAddr}">BscScan</a> | <a href="https://dexscreener.com/bsc/${tokenAddr}">DexScreener</a>`;

        await sendAlert(msg);
        await new Promise(r => setTimeout(r, 1000));

      } catch (e) {
        continue;
      }
    }

    console.log(`   Found: ${newCount} new | Skipped: ${skipped}`);

  } catch (e) {
    console.log(`   Error: ${e.message.split('\n')[0]}`);
  }
}

// ==================== STARTUP ====================

async function startup() {
  try {
    if (fs.existsSync('processed.json')) {
      const data = JSON.parse(fs.readFileSync('processed.json', 'utf8'));
      processed = new Set(data);
      console.log(`Loaded ${processed.size} previous tokens\n`);
    }
  } catch (e) {}

  console.log('BOT ONLINE - NEW TOKEN CATCHER\n');
  console.log('Strategy:');
  console.log('- Detect ALL new tokens');
  console.log('- Minimal filters ($100+ liquidity)');
  console.log('- Alert for research\n');

  try {
    await sendAlert(`<b>NEW TOKEN CATCHER ONLINE</b>

Detecting new tokens on Solana & BSC
Minimal filters for early entry

YOU MUST DO YOUR OWN RESEARCH
- Check security
- Verify contracts
- Look for red flags

Be careful with your money!`);
  } catch (e) {
    console.log('Telegram connect issue\n');
  }

  console.log('Scanning started\n');

  // Scan every 30 seconds - more frequent for new token detection
  setInterval(findNewTokensSolana, 30000);
  setInterval(findNewTokensBSC, 31000);

  // Save progress
  setInterval(() => {
    try {
      fs.writeFileSync('processed.json', JSON.stringify(Array.from(processed)));
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
