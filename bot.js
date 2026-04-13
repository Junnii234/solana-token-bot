require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

console.log('🚀 GMGN TOKEN HUNTER BOT - Low Filter Version\n');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
let processed = new Set();
let lastAlertTime = {};

// FILTER SETTINGS - Adjust these to get more/fewer alerts
const MIN_LIQUIDITY = 1000;    // $1K minimum (was $5K)
const MIN_VOLUME = 100;         // $100 minimum (was $500)

async function sendAlert(msg) {
  try {
    await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
    console.log('✉️  ✅ ALERT SENT!');
    return true;
  } catch (e) {
    console.error('❌ Telegram error:', e.message.split('\n')[0]);
    return false;
  }
}

async function scanGMGNTokens() {
  try {
    console.log('\n🔍 [GMGN] Scanning for hot tokens...');

    const res = await axios.get('https://gmgn.ai/api/v1/tokens/solana/hot?limit=20&order=latest', {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).catch(async (err) => {
      console.log(`   Trying alternative endpoint...`);
      return await axios.get('https://api.gmgn.ai/api/v1/tokens/hot', {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).catch(() => null);
    });

    if (!res?.data) {
      console.log('   ❌ GMGN API not responding');
      console.log('   📋 Trying fallback...');
      return await fallbackGeckoTerminal();
    }

    const tokens = res.data.data || res.data.tokens || res.data;
    const tokenList = Array.isArray(tokens) ? tokens : [];

    if (tokenList.length === 0) {
      console.log('   ❌ No tokens found');
      return;
    }

    console.log(`   ✅ Got ${tokenList.length} pools\n`);

    let passed = 0;
    let filtered = 0;
    let skipped = 0;

    for (const token of tokenList.slice(0, 10)) {
      const mint = token.mint || token.address || token.token_address;
      
      if (!mint) {
        console.log(`   ⏭️  No mint - skip`);
        filtered++;
        continue;
      }

      if (processed.has(mint)) {
        console.log(`   ⏭️  Already seen: ${token.symbol || '?'}`);
        skipped++;
        continue;
      }

      const symbol = token.symbol || token.token_symbol || '?';
      const name = token.name || token.token_name || '?';
      const liq = token.liquidity || token.usd_liquidity || 0;
      const vol24h = token.volume_24h || token.trading_volume || 0;
      const holders = token.holder_count || token.holders || '?';
      const priceChange = token.price_change_24h || token.price_change || 0;

      console.log(`   📊 ${symbol}`);
      console.log(`      Liq: $${(liq / 1000).toFixed(1)}K | Vol: $${(vol24h / 1000).toFixed(1)}K`);

      // CHECK FILTERS
      if (liq < MIN_LIQUIDITY) {
        console.log(`      ❌ Liquidity too low ($${(liq / 1000).toFixed(1)}K < $${MIN_LIQUIDITY / 1000}K)`);
        processed.add(mint);
        filtered++;
        continue;
      }

      if (vol24h < MIN_VOLUME) {
        console.log(`      ❌ Volume too low ($${(vol24h / 1000).toFixed(1)}K < $${MIN_VOLUME / 1000}K)`);
        processed.add(mint);
        filtered++;
        continue;
      }

      // Check already alerted
      if (lastAlertTime[mint] && (Date.now() - lastAlertTime[mint]) < 3600000) {
        console.log(`      ⏭️  Alerted recently`);
        skipped++;
        continue;
      }

      // PASSED ALL FILTERS - SEND ALERT!
      processed.add(mint);
      lastAlertTime[mint] = Date.now();
      passed++;
      
      console.log(`      ✅ PASSED - SENDING ALERT!\n`);

      const msg = `🔥 <b>NEW HOT TOKEN 🔥</b>

<b>🟡 SOLANA</b>

<b>${name}</b> (${symbol})
Mint: <code>${mint}</code>

📊 <b>Metrics:</b>
• Liquidity: $${(liq / 1000).toFixed(1)}K
• Volume 24h: $${(vol24h / 1000).toFixed(1)}K
• Holders: ${holders}
• Price 24h: ${priceChange > 0 ? '📈' : '📉'} ${Math.abs(priceChange).toFixed(1)}%

🚀 <b>HOT OPPORTUNITY!</b>

🔗 <a href="https://gmgn.ai/sol/token/${mint}">GMGN</a> | <a href="https://dexscreener.com/solana/${mint}">DexScreener</a> | <a href="https://solscan.io/token/${mint}">Solscan</a>`;

      await sendAlert(msg);
      await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`\n   📊 Scan Summary:`);
    console.log(`      ✅ Passed: ${passed}`);
    console.log(`      ❌ Filtered out: ${filtered}`);
    console.log(`      ⏭️  Already seen: ${skipped}`);

  } catch (e) {
    console.log(`   ❌ Error: ${e.message.split('\n')[0]}`);
  }
}

async function fallbackGeckoTerminal() {
  try {
    console.log('\n   🔄 [GeckoTerminal] Scanning...');

    const res = await axios.get('https://api.geckoterminal.com/api/v2/networks/solana/pools?order=h24_transaction_count_desc&limit=20', {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).catch(() => null);

    if (!res?.data?.data) {
      console.log('   ❌ No data');
      return;
    }

    console.log(`   ✅ Got ${res.data.data.length} pools\n`);

    let passed = 0;
    let filtered = 0;

    for (const pool of res.data.data.slice(0, 10)) {
      const baseToken = pool.tokens?.[0];
      if (!baseToken || processed.has(baseToken.address)) {
        filtered++;
        continue;
      }

      const liq = parseFloat(pool.reserve_in_usd) || 0;
      const symbol = baseToken.symbol || '?';

      console.log(`   📊 ${symbol} - $${(liq / 1000).toFixed(1)}K`);

      if (liq < MIN_LIQUIDITY) {
        console.log(`      ❌ Too low`);
        processed.add(baseToken.address);
        filtered++;
        continue;
      }

      processed.add(baseToken.address);
      passed++;

      const msg = `🟢 <b>NEW TOKEN</b>\n\n<b>${baseToken.name}</b> (${symbol})\nLiquidity: $${(liq / 1000).toFixed(1)}K`;
      await sendAlert(msg);
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n   📊 GeckoTerminal Summary: ${passed} passed, ${filtered} filtered`);
  } catch (e) {
    console.log(`   ❌ Error: ${e.message.split('\n')[0]}`);
  }
}

async function startup() {
  try {
    if (fs.existsSync('processed.json')) {
      const data = JSON.parse(fs.readFileSync('processed.json', 'utf8'));
      processed = new Set(data);
    }
  } catch (e) {}

  console.log('\n✅ GMGN BOT ONLINE - LOW FILTER MODE\n');
  console.log('🔥 Primary: GMGN API');
  console.log('📋 Fallback: GeckoTerminal');
  console.log(`🎯 Min Liquidity: $${MIN_LIQUIDITY / 1000}K`);
  console.log(`🎯 Min Volume: $${MIN_VOLUME / 1000}K\n`);

  try {
    await sendAlert(`🔥 <b>BOT ONLINE!</b>\n\n✅ GMGN Scanner\n✅ Low filters = More alerts\n✅ Min Liq: $${MIN_LIQUIDITY / 1000}K\n✅ Min Vol: $${MIN_VOLUME / 1000}K\n\n🎯 Hunting!`);
  } catch (e) {
    console.error('⚠️  Telegram issue');
  }

  console.log('⏰ Starting scans...\n');

  setInterval(scanGMGNTokens, 12000);

  setInterval(() => {
    try {
      fs.writeFileSync('processed.json', JSON.stringify(Array.from(processed)));
    } catch (e) {}
  }, 60000);
}

process.on('SIGINT', () => {
  console.log('\n👋 Bot stopped');
  process.exit(0);
});

startup().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
