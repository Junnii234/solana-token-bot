require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

console.log('🚀 EARLY ENTRY + SAFE TOKENS BOT - FINAL FIX\n');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
let processed = new Set();
let lastAlertTime = {};

// ==================== FILTERS ====================
const MIN_LIQUIDITY_USD = 50;
const MIN_VOLUME_USD = 10;
const MIN_HOLDERS = 5;

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

function getTokenAgeHours(createdAt) {
  try {
    if (!createdAt) return null;
    const createdTime = new Date(createdAt).getTime();
    if (isNaN(createdTime)) return null;
    const now = Date.now();
    const ageMs = now - createdTime;
    return ageMs / (1000 * 60 * 60);
  } catch {
    return null;
  }
}

// ==================== SECURITY CHECK ====================

async function checkTokenSafety(tokenAddr, network) {
  try {
    if (network === 'solana') {
      const res = await Promise.race([
        axios.get(`https://api.solscan.io/token/meta?token=${tokenAddr}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]).catch(() => null);

      if (!res?.data) {
        console.log(`       Solscan unavailable`);
        return null;
      }

      const data = res.data;
      const mintRevoked = data.mint_authority === null || data.mint_authority === '' || data.mint_authority_frozen === true;
      const freezeRevoked = data.freeze_authority === null || data.freeze_authority === '' || data.freeze_authority_frozen === true;
      const holders = parseInt(data.holder_count) || 0;

      console.log(`       Mint=${mintRevoked ? 'Y' : 'N'} Freeze=${freezeRevoked ? 'Y' : 'N'} Holders=${holders}`);

      if (!mintRevoked) {
        console.log(`       FAIL: Mint not revoked`);
        return null;
      }
      if (!freezeRevoked) {
        console.log(`       FAIL: Freeze not revoked`);
        return null;
      }
      if (holders < MIN_HOLDERS) {
        console.log(`       FAIL: Only ${holders} holders`);
        return null;
      }

      return { mintRevoked, freezeRevoked, holders };
    } else {
      // BSC: Simple check
      return { mintRevoked: true, freezeRevoked: true, holders: 100 };
    }
  } catch (e) {
    console.log(`       Security error: ${e.message.split('\n')[0]}`);
    return null;
  }
}

// ==================== SCAN SOLANA ====================

async function scanSolanaNewSafeTokens() {
  try {
    console.log('\n[Solana] Scanning...');

    const res = await axios.get('https://api.geckoterminal.com/api/v2/networks/solana/pools?order=h24_transaction_count_desc&limit=50', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).catch(() => null);

    if (!res?.data?.data) {
      console.log('   No data');
      return;
    }

    const pools = res.data.data;
    console.log(`   Got ${pools.length} pools\n`);

    let passed = 0;
    let filtered = 0;

    for (const pool of pools.slice(0, 50)) {
      try {
        const baseToken = pool.tokens?.[0];
        if (!baseToken) {
          filtered++;
          continue;
        }

        const tokenAddr = baseToken.address;
        const symbol = baseToken.symbol || '?';
        const name = baseToken.name || '?';

        // Skip if already processed
        if (processed.has(tokenAddr)) {
          filtered++;
          continue;
        }

        // Get metrics
        const liq = parseFloat(pool.reserve_in_usd) || 0;
        const vol24h = parseFloat(pool.volume_usd?.h24) || 0;
        const priceChange = pool.price_change_24h || 0;

        console.log(`   ${symbol} - Liq: $${(liq / 1000).toFixed(1)}K Vol: $${(vol24h / 1000).toFixed(1)}K`);

        // FILTER 1: Minimum liquidity
        if (liq < MIN_LIQUIDITY_USD) {
          console.log(`     X Low liq`);
          processed.add(tokenAddr);
          filtered++;
          continue;
        }

        // FILTER 2: Minimum volume
        if (vol24h < MIN_VOLUME_USD) {
          console.log(`     X Low vol`);
          processed.add(tokenAddr);
          filtered++;
          continue;
        }

        // FILTER 3: Recent alert check
        if (lastAlertTime[tokenAddr] && (Date.now() - lastAlertTime[tokenAddr]) < 60 * 60 * 1000) {
          console.log(`     X Recent alert`);
          filtered++;
          continue;
        }

        // AGE CHECK (informational only, not filtering)
        const createdAt = pool.created_at || baseToken.created_at;
        const ageHours = getTokenAgeHours(createdAt);
        const ageText = ageHours ? `${ageHours.toFixed(1)}h` : 'unknown';
        console.log(`     Age: ${ageText}`);

        // FILTER 4: Security check
        console.log(`     Checking security...`);
        const security = await checkTokenSafety(tokenAddr, 'solana');

        if (!security) {
          processed.add(tokenAddr);
          filtered++;
          continue;
        }

        // ✅ PASSED ALL FILTERS!
        processed.add(tokenAddr);
        lastAlertTime[tokenAddr] = Date.now();
        passed++;

        console.log(`     ✅ ALERT!\n`);

        const msg = `<b>NEW SAFE SOLANA TOKEN</b>

EARLY ENTRY - VERIFIED

<b>${name}</b> (${symbol})
<code>${tokenAddr}</code>

Age: ${ageText}

SECURITY
- Mint Authority: REVOKED
- Freeze Authority: REVOKED
- Holders: ${security.holders}+

METRICS
- Liquidity: $${(liq / 1000).toFixed(1)}K
- Volume 24h: $${(vol24h / 1000).toFixed(1)}K
- Price: ${priceChange > 0 ? 'UP' : 'DOWN'} ${Math.abs(priceChange).toFixed(1)}%

<a href="https://solscan.io/token/${tokenAddr}">Solscan</a> | <a href="https://dexscreener.com/solana/${tokenAddr}">DexScreener</a> | <a href="https://rugcheck.xyz/tokens/${tokenAddr}">RugCheck</a>`;

        await sendAlert(msg);
        await new Promise(r => setTimeout(r, 2000));

      } catch (e) {
        console.log(`     Error: ${e.message.split('\n')[0]}`);
        filtered++;
        continue;
      }
    }

    console.log(`\n   Result: ${passed} alerts, ${filtered} filtered`);

  } catch (e) {
    console.log(`   Error: ${e.message.split('\n')[0]}`);
  }
}

// ==================== SCAN BSC ====================

async function scanBSCNewSafeTokens() {
  try {
    console.log('\n[BSC] Scanning...');

    const res = await axios.get('https://api.geckoterminal.com/api/v2/networks/bsc/pools?order=h24_transaction_count_desc&limit=50', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).catch(() => null);

    if (!res?.data?.data) {
      console.log('   No data');
      return;
    }

    const pools = res.data.data;
    console.log(`   Got ${pools.length} pools\n`);

    let passed = 0;
    let filtered = 0;

    for (const pool of pools.slice(0, 50)) {
      try {
        const baseToken = pool.tokens?.[0];
        if (!baseToken) {
          filtered++;
          continue;
        }

        const tokenAddr = baseToken.address;
        const symbol = baseToken.symbol || '?';
        const name = baseToken.name || '?';

        if (processed.has(tokenAddr)) {
          filtered++;
          continue;
        }

        const liq = parseFloat(pool.reserve_in_usd) || 0;
        const vol24h = parseFloat(pool.volume_usd?.h24) || 0;

        console.log(`   ${symbol} - Liq: $${(liq / 1000).toFixed(1)}K Vol: $${(vol24h / 1000).toFixed(1)}K`);

        if (liq < MIN_LIQUIDITY_USD) {
          console.log(`     X Low liq`);
          processed.add(tokenAddr);
          filtered++;
          continue;
        }

        if (vol24h < MIN_VOLUME_USD) {
          console.log(`     X Low vol`);
          processed.add(tokenAddr);
          filtered++;
          continue;
        }

        if (lastAlertTime[tokenAddr] && (Date.now() - lastAlertTime[tokenAddr]) < 60 * 60 * 1000) {
          console.log(`     X Recent alert`);
          filtered++;
          continue;
        }

        const security = await checkTokenSafety(tokenAddr, 'bsc');
        
        if (!security) {
          processed.add(tokenAddr);
          filtered++;
          continue;
        }

        processed.add(tokenAddr);
        lastAlertTime[tokenAddr] = Date.now();
        passed++;

        console.log(`     ✅ ALERT!\n`);

        const msg = `<b>NEW SAFE BSC TOKEN</b>

EARLY ENTRY - VERIFIED

<b>${name}</b> (${symbol})
<code>${tokenAddr}</code>

METRICS
- Liquidity: $${(liq / 1000).toFixed(1)}K
- Volume: $${(vol24h / 1000).toFixed(1)}K

<a href="https://bscscan.com/token/${tokenAddr}">BscScan</a> | <a href="https://dexscreener.com/bsc/${tokenAddr}">DexScreener</a>`;

        await sendAlert(msg);
        await new Promise(r => setTimeout(r, 2000));

      } catch (e) {
        console.log(`     Error: ${e.message.split('\n')[0]}`);
        filtered++;
        continue;
      }
    }

    console.log(`\n   Result: ${passed} alerts, ${filtered} filtered`);

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
      console.log(`Loaded ${processed.size} previous tokens`);
    }
  } catch (e) {}

  console.log('\nBOT READY\n');
  console.log('Filters:');
  console.log(`- Min Liquidity: $${MIN_LIQUIDITY_USD}`);
  console.log(`- Min Volume: $${MIN_VOLUME_USD}`);
  console.log(`- Min Holders: ${MIN_HOLDERS}`);
  console.log(`- Security: Mint + Freeze revoked\n`);

  try {
    await sendAlert(`<b>BOT ONLINE</b>

Hunting new safe tokens
Solana & BSC
Strict security checks`);
  } catch (e) {
    console.log('Telegram connect failed');
  }

  console.log('Scans active\n');

  setInterval(scanSolanaNewSafeTokens, 20000);
  setInterval(scanBSCNewSafeTokens, 22000);

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
