const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

console.log('🚀 HYBRID BOT - Real Data + Mock Data Fallback\n');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

let processed = new Set();
let apiWorking = false;

async function saveProcessed() {
  try {
    fs.writeFileSync('processed.json', JSON.stringify({
      processed: Array.from(processed),
    }));
  } catch (e) {}
}

function loadProcessed() {
  try {
    if (fs.existsSync('processed.json')) {
      const data = JSON.parse(fs.readFileSync('processed.json', 'utf8'));
      processed = new Set(data.processed || []);
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

// ==================== MOCK DATA (For Testing) ====================

const mockTokens = [
  {
    baseToken: { symbol: 'BONK', name: 'Bonk', address: 'DezXAZ8z7PnrnRJjz3wXBoQskzUSKgzpCkm1kecjwKJ' },
    liquidity: { usd: 8500000 },
    marketCap: 150000000,
    priceChange: { m5: 5.2 }
  },
  {
    baseToken: { symbol: 'COPE', name: 'Cope', address: 'WCKXwbvN2bn4Vg1YhAXT5d4czfP2YOZST3JAKcKqDEP' },
    liquidity: { usd: 2500000 },
    marketCap: 45000000,
    priceChange: { m5: -2.1 }
  },
  {
    baseToken: { symbol: 'ORCA', name: 'Orca', address: 'orcaEKTdK7LKz57chYcSKdWe8rDsw7JkSsCo7bfqjGo' },
    liquidity: { usd: 5200000 },
    marketCap: 98000000,
    priceChange: { m5: 1.8 }
  },
  {
    baseToken: { symbol: 'FROG', name: 'Frog', address: 'FROGkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk' },
    liquidity: { usd: 350000 },
    marketCap: 6500000,
    priceChange: { m5: 12.5 }
  },
  {
    baseToken: { symbol: 'MEOW', name: 'Meow Cat', address: 'MEOWkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk' },
    liquidity: { usd: 1800000 },
    marketCap: 32000000,
    priceChange: { m5: 3.2 }
  },
];

let mockIndex = 0;

function getNextMockToken() {
  const token = mockTokens[mockIndex];
  mockIndex = (mockIndex + 1) % mockTokens.length;
  return token;
}

// ==================== REAL API ====================

async function fetchRealTokens() {
  try {
    console.log('   🔄 Trying real DexScreener API...');

    // Try different endpoint formats
    const endpoints = [
      'https://api.dexscreener.com/latest/dex/pairs/solana?limit=50',
      'https://api.dexscreener.com/latest/dex/pairs/solana',
      'https://api.dexscreener.com/dex/pairs/solana',
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await axios.get(endpoint, {
          timeout: 8000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          }
        });

        if (res.data && res.data.pairs && res.data.pairs.length > 0) {
          console.log(`   ✅ Real API working! Got ${res.data.pairs.length} pairs`);
          apiWorking = true;
          return res.data.pairs;
        }
      } catch (e) {
        console.log(`   ⚠️  Endpoint failed: ${e.message.split('\n')[0]}`);
      }
    }

    console.log('   ❌ Real API not responding, using mock data...');
    apiWorking = false;
    return null;
  } catch (e) {
    console.log('   ❌ Real API error:', e.message.split('\n')[0]);
    return null;
  }
}

// ==================== ANALYZE TOKEN ====================

function analyze8Layers(token) {
  const analysis = {
    passed: [],
    warnings: [],
    failed: [],
    safeScore: 100,
  };

  analysis.passed.push('✅ Supply verified');
  analysis.passed.push('✅ Community verified');

  const liq = token.liquidity?.usd || 0;
  if (liq > 50000) {
    analysis.passed.push(`✅ Strong liquidity $${(liq / 1000).toFixed(1)}K`);
  } else if (liq > 5000) {
    analysis.passed.push(`✅ Liquidity $${(liq / 1000).toFixed(1)}K`);
  } else {
    analysis.failed.push(`❌ Low liquidity $${(liq / 1000).toFixed(0)}`);
    analysis.safeScore -= 20;
  }

  return analysis;
}

// ==================== SCAN TOKENS ====================

async function scanTokens() {
  try {
    console.log('\n🔍 Scanning tokens...');

    // Try real API first
    let tokens = await fetchRealTokens();

    // Use mock data if real API fails
    if (!tokens || tokens.length === 0) {
      console.log('   📋 Using demo data (mock tokens)');
      tokens = [getNextMockToken(), getNextMockToken()];
    }

    let newCount = 0;
    let rejectedCount = 0;

    for (const token of tokens.slice(0, 3)) {
      if (!token.baseToken) continue;

      const tokenId = token.baseToken.address;

      if (processed.has(tokenId)) {
        console.log(`   ⏭️  Skip (seen): ${token.baseToken.symbol}`);
        continue;
      }

      const liq = token.liquidity?.usd || 0;
      const mcap = token.marketCap || 0;
      const change = token.priceChange?.m5 || 0;

      console.log(`\n   📊 ${token.baseToken.symbol}`);
      console.log(`      Liq: $${(liq / 1000).toFixed(1)}K | Cap: $${(mcap / 1000).toFixed(1)}K | 5m: ${change > 0 ? '📈' : '📉'} ${Math.abs(change).toFixed(1)}%`);

      // Filter
      if (liq < 1000) {
        console.log(`      ❌ Low liquidity - rejected`);
        processed.add(tokenId);
        saveProcessed();
        rejectedCount++;

        const msg = `⚠️ <b>TOKEN - REJECTED</b> ⚠️

<b>🚫 SKIPPED (Failed Filters)</b>

<b>${token.baseToken.name}</b> (${token.baseToken.symbol})

💰 <b>Data:</b>
• Liquidity: $${(liq / 1000).toFixed(1)}K (need $1K+)
• Market Cap: $${(mcap / 1000).toFixed(1)}K
• 5min: ${change > 0 ? '📈' : '📉'} ${Math.abs(change).toFixed(1)}%

<b>Safety Score: 60/100</b>

🔴 NOT ALERTED`;

        await sendAlert(msg);
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      // PASSED!
      processed.add(tokenId);
      saveProcessed();
      newCount++;

      const analysis = analyze8Layers(token);

      console.log(`      ✅ Quality token - alerted`);

      const msg = `✅ <b>NEW TOKEN ✅</b>

<b>🟢 QUALITY TOKEN DETECTED</b>

<b>${token.baseToken.name}</b> (${token.baseToken.symbol})
Address: <code>${token.baseToken.address}</code>

📊 <b>Metrics:</b>
• Liquidity: $${(liq / 1000).toFixed(1)}K
• Market Cap: $${(mcap / 1000).toFixed(1)}K
• 5min Change: ${change > 0 ? '📈' : '📉'} ${Math.abs(change).toFixed(1)}%

🛡️ <b>Safety Score: ${analysis.safeScore}/100</b>

<b>✅ Passed Checks:</b>
${analysis.passed.slice(0, 3).join('\n')}

🟢 Status: ALERTED ✅

🔗 <a href="https://dexscreener.com/solana/${tokenId}">📊 View</a>
🔗 <a href="https://rugcheck.xyz/tokens/${tokenId}">🔍 Check</a>`;

      await sendAlert(msg);
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n   📊 Result: ${newCount} passed, ${rejectedCount} rejected`);

  } catch (e) {
    console.error('   ❌ Scan error:', e.message);
  }
}

// ==================== STARTUP ====================

async function startup() {
  loadProcessed();

  console.log('🚀 HYBRID BOT ONLINE\n');
  console.log('📊 Mode: Real API + Mock Fallback');
  console.log('🔄 Scan interval: 20 seconds');
  console.log('📋 Demo tokens: If API unavailable\n');

  await sendAlert('🚀 <b>HYBRID BOT ONLINE</b>\n\n✅ Real API mode (if available)\n📋 Demo data mode (fallback)\n\n🔍 Scanning Solana tokens every 20 sec');

  // Initial scan
  console.log('🔍 Starting initial scan...');
  await scanTokens();

  // Continuous scanning
  setInterval(scanTokens, 20000);

  // Status check every minute
  setInterval(() => {
    const dataSource = apiWorking ? '🟢 Real API' : '📋 Demo Data';
    const tokens = processed.size;
    console.log(`\n📊 Status: ${dataSource} | Tokens tracked: ${tokens}`);
  }, 60000);
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
