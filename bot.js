require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

console.log('🚀 GMGN TOKEN HUNTER BOT - Real Solana Token Discovery\n');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
let processed = new Set();
let lastAlertTime = {};

async function sendAlert(msg) {
  try {
    await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
    console.log('✉️  ✅ ALERT SENT TO TELEGRAM!');
    return true;
  } catch (e) {
    console.error('❌ Telegram error:', e.message.split('\n')[0]);
    return false;
  }
}

async function scanGMGNTokens() {
  try {
    console.log('\n🔍 [GMGN] Scanning Solana for NEW hot tokens...');

    const res = await axios.get('https://gmgn.ai/api/v1/tokens/solana/hot?limit=20&order=latest', {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    }).catch(async (err) => {
      console.log(`   Trying alternative endpoint...`);
      return await axios.get('https://api.gmgn.ai/api/v1/tokens/hot', {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).catch(() => null);
    });

    if (!res?.data) {
      console.log('   ❌ GMGN API not responding');
      console.log('   📋 Falling back to GeckoTerminal...');
      return await fallbackGeckoTerminal();
    }

    const tokens = res.data.data || res.data.tokens || res.data;
    const tokenList = Array.isArray(tokens) ? tokens : [];

    if (tokenList.length === 0) {
      console.log('   ❌ No tokens found');
      return;
    }

    console.log(`   ✅ Found ${tokenList.length} hot tokens!\n`);

    for (const token of tokenList.slice(0, 5)) {
      const mint = token.mint || token.address || token.token_address;
      
      if (!mint || processed.has(mint)) {
        continue;
      }

      const symbol = token.symbol || token.token_symbol || '?';
      const name = token.name || token.token_name || '?';
      const liq = token.liquidity || token.usd_liquidity || 0;
      const vol24h = token.volume_24h || token.trading_volume || 0;
      const holders = token.holder_count || token.holders || '?';
      const priceChange = token.price_change_24h || token.price_change || 0;

      console.log(`   📊 ${symbol}`);
      console.log(`      Name: ${name}`);
      console.log(`      Liquidity: $${(liq / 1000).toFixed(1)}K`);
      console.log(`      Volume 24h: $${(vol24h / 1000).toFixed(1)}K`);

      if (liq < 5000 || vol24h < 500) {
        console.log(`      ⏭️  Low metrics - skip\n`);
        processed.add(mint);
        continue;
      }

      if (lastAlertTime[mint] && (Date.now() - lastAlertTime[mint]) < 3600000) {
        console.log(`      ⏭️  Already alerted - skip\n`);
        continue;
      }

      processed.add(mint);
      lastAlertTime[mint] = Date.now();
      
      console.log(`      ✅ SENDING ALERT!\n`);

      const msg = `🔥 <b>GMGN - HOT SOLANA TOKEN 🔥</b>\n\n<b>${name}</b> (${symbol})\nMint: <code>${mint}</code>\n\n📊 <b>24h METRICS:</b>\n• Liquidity: $${(liq / 1000).toFixed(1)}K\n• Volume: $${(vol24h / 1000).toFixed(1)}K\n• Holders: ${holders}\n• Price Change: ${priceChange > 0 ? '📈' : '📉'} ${Math.abs(priceChange).toFixed(1)}%\n\n🚀 <b>HOT TOKEN ALERT!</b>\n\n🔗 <a href="https://gmgn.ai/sol/token/${mint}">GMGN</a> | <a href="https://dexscreener.com/solana/${mint}">DexScreener</a>`;

      await sendAlert(msg);
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (e) {
    console.log(`   ❌ Error: ${e.message.split('\n')[0]}`);
  }
}

async function fallbackGeckoTerminal() {
  try {
    console.log('\n   🔄 [GeckoTerminal Fallback] Scanning...');

    const res = await axios.get('https://api.geckoterminal.com/api/v2/networks/solana/pools?order=h24_transaction_count_desc&limit=20', {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).catch(() => null);

    if (!res?.data?.data) {
      console.log('   ❌ Fallback also failed');
      return;
    }

    console.log(`   ✅ Fallback working! Got ${res.data.data.length} pools\n`);

    for (const pool of res.data.data.slice(0, 3)) {
      const baseToken = pool.tokens?.[0];
      if (!baseToken || processed.has(baseToken.address)) continue;

      const liq = parseFloat(pool.reserve_in_usd) || 0;
      if (liq < 5000) {
        processed.add(baseToken.address);
        continue;
      }

      processed.add(baseToken.address);

      const msg = `🟢 <b>NEW TOKEN</b>\n\n<b>${baseToken.name}</b> (${baseToken.symbol})\nLiquidity: $${(liq / 1000).toFixed(1)}K`;
      await sendAlert(msg);
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (e) {
    console.log(`   ❌ Fallback error: ${e.message.split('\n')[0]}`);
  }
}

async function startup() {
  try {
    if (fs.existsSync('processed.json')) {
      const data = JSON.parse(fs.readFileSync('processed.json', 'utf8'));
      processed = new Set(data);
    }
  } catch (e) {}

  console.log('\n✅ GMGN TOKEN HUNTER BOT ONLINE\n');
  console.log('🔥 Primary: GMGN API');
  console.log('📋 Fallback: GeckoTerminal\n');

  try {
    await sendAlert('🔥 <b>GMGN BOT ONLINE!</b>\n✅ Scanning Solana\n✅ Hot token alerts\n\n🎯 Hunting begins!');
  } catch (e) {
    console.error('⚠️  Telegram connection issue');
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
