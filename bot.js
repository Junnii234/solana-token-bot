const { Connection, PublicKey, TOKEN_PROGRAM_ID } = require('@solana/web3.js');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

console.log('🤖 Bot Starting...');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ Missing environment variables!');
  console.error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Railway');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const connection = new Connection(SOLANA_RPC, 'confirmed');

let processed = new Set();

async function saveProcessed() {
  try {
    fs.writeFileSync('processed.json', JSON.stringify(Array.from(processed)));
  } catch (e) {}
}

function loadProcessed() {
  try {
    if (fs.existsSync('processed.json')) {
      processed = new Set(JSON.parse(fs.readFileSync('processed.json', 'utf8')));
      console.log(`✅ Loaded ${processed.size} tokens`);
    }
  } catch (e) {}
}

async function sendAlert(msg) {
  try {
    await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
    console.log('✉️  Alert sent');
  } catch (e) {
    console.error('Alert error:', e.message);
  }
}

async function scanPumpFun() {
  try {
    const res = await axios.get('https://frontend-api.pump.fun/tokens/recent', { timeout: 5000 }).catch(() => null);
    if (!res || !res.data) return;

    for (const token of res.data.slice(0, 3)) {
      if (processed.has(token.mint)) continue;
      
      processed.add(token.mint);
      saveProcessed();
      
      const msg = `🔥 <b>PUMP.FUN</b>
<b>${token.name}</b> (${token.symbol})
Holders: ${token.holder_count || '?'}
<a href="https://pump.fun/${token.mint}">Trade</a>`;
      
      await sendAlert(msg);
    }
  } catch (e) {
    console.error('Pump.fun error:', e.message);
  }
}

async function scanRaydium() {
  try {
    const res = await axios.get('https://api.raydium.io/v2/main/pools', { timeout: 5000 }).catch(() => null);
    if (!res || !res.data) return;

    for (const pool of res.data.slice(0, 3)) {
      if (processed.has(pool.baseMint)) continue;
      
      processed.add(pool.baseMint);
      saveProcessed();
      
      const liq = Math.round(pool.liquidity || 0);
      if (liq > 5000) {
        const msg = `🔥 <b>RAYDIUM</b>
${pool.baseSymbol}
Liquidity: $${liq}
<a href="https://dexscreener.com/solana/${pool.baseMint}">Trade</a>`;
        
        await sendAlert(msg);
      }
    }
  } catch (e) {
    console.error('Raydium error:', e.message);
  }
}

async function startup() {
  loadProcessed();
  
  console.log('\n🟢 Bot Running');
  console.log('📱 Chat ID:', TELEGRAM_CHAT_ID);
  console.log('⛓️  Scanning Pump.fun & Raydium\n');
  
  await sendAlert('✅ Bot Started\n✅ Pump.fun\n✅ Raydium');
  
  setInterval(scanPumpFun, 10000);
  setInterval(scanRaydium, 12000);
}

process.on('SIGINT', () => {
  console.log('\n👋 Shutdown');
  saveProcessed();
  process.exit(0);
});

startup().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});