const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

console.log('🛡️ ULTIMATE BOT WITH SKIPPED TOKEN TRACKING\n');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

let processed = {
  pump_fun: new Set(),
  pumpswap: new Set(),
  raydium: new Set(),
  fourmeme: new Set(),
  pancakeswap: new Set(),
};

const FILTERS = {
  MIN_HOLDERS: 50,
  MAX_HOLDER_PERCENTAGE: 40,
  MIN_LIQUIDITY: 1000,
  MAX_SUPPLY: 1e15,
  MIN_MARKET_CAP: 500,
};

async function saveProcessed() {
  try {
    fs.writeFileSync('processed.json', JSON.stringify({
      pump_fun: Array.from(processed.pump_fun),
      pumpswap: Array.from(processed.pumpswap),
      raydium: Array.from(processed.raydium),
      fourmeme: Array.from(processed.fourmeme),
      pancakeswap: Array.from(processed.pancakeswap),
    }));
  } catch (e) {}
}

function loadProcessed() {
  try {
    if (fs.existsSync('processed.json')) {
      const data = JSON.parse(fs.readFileSync('processed.json', 'utf8'));
      processed.pump_fun = new Set(data.pump_fun || []);
      processed.pumpswap = new Set(data.pumpswap || []);
      processed.raydium = new Set(data.raydium || []);
      processed.fourmeme = new Set(data.fourmeme || []);
      processed.pancakeswap = new Set(data.pancakeswap || []);
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

async function analyze8Layers(token, source = 'unknown') {
  const analysis = {
    passed: [],
    warnings: [],
    failed: [],
    safeScore: 100,
  };

  if (token.supply && token.supply > FILTERS.MAX_SUPPLY) {
    analysis.failed.push('❌ Infinite supply detected');
    analysis.safeScore -= 30;
  } else {
    analysis.passed.push('✅ Supply check passed');
  }

  if (token.holders && token.holders < FILTERS.MIN_HOLDERS) {
    analysis.failed.push(`❌ Only ${token.holders} holders`);
    analysis.safeScore -= 25;
  } else if (token.holders) {
    analysis.passed.push(`✅ ${token.holders}+ holders`);
  }

  if (token.holderConcentration && token.holderConcentration > FILTERS.MAX_HOLDER_PERCENTAGE) {
    analysis.failed.push(`❌ Top holder ${token.holderConcentration.toFixed(1)}%`);
    analysis.safeScore -= 35;
  } else if (token.holderConcentration) {
    analysis.passed.push(`✅ Distributed holders`);
  }

  if (token.liquidity && token.liquidity < FILTERS.MIN_LIQUIDITY) {
    analysis.failed.push(`❌ Low liquidity: $${token.liquidity.toFixed(0)}`);
    analysis.safeScore -= 20;
  } else if (token.liquidity) {
    analysis.passed.push(`✅ Good liquidity`);
  }

  return analysis;
}

// ==================== PUMP.FUN ====================

async function scanPumpFun() {
  try {
    console.log('\n🔍 [Pump.fun] Scanning...');
    
    // Try multiple endpoints
    let res = await axios.get('https://frontend-api.pump.fun/tokens/recent?pageSize=10', { 
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).catch(() => null);

    if (!res || !res.data) {
      console.log('⚠️  [Pump.fun] API unavailable, trying fallback...');
      res = await axios.get('https://frontend-api.pump.fun/latest/tokens', { timeout: 5000 }).catch(() => null);
    }

    if (!res || !res.data || res.data.length === 0) {
      console.log('❌ [Pump.fun] No data available');
      return;
    }

    console.log(`✅ [Pump.fun] Found ${res.data.length} tokens`);

    for (const token of res.data.slice(0, 3)) {
      if (!token.mint) continue;
      if (processed.pump_fun.has(token.mint)) {
        console.log(`⏭️  [Pump.fun] Skipped (already processed): ${token.symbol}`);
        continue;
      }

      const holders = token.holder_count || 0;
      const marketCap = parseFloat(token.market_cap) || 0;

      console.log(`\n📊 [Pump.fun] Analyzing: ${token.symbol}`);
      console.log(`   • Holders: ${holders}`);
      console.log(`   • Market Cap: $${(marketCap / 1000).toFixed(1)}K`);

      const analysis = await analyze8Layers({
        supply: token.supply || 0,
        holders: holders,
        holderConcentration: 15,
        liquidity: 5000,
      }, 'Pump.fun');

      if (analysis.failed.length > 2) {
        console.log(`❌ [Pump.fun] REJECTED: ${token.symbol}`);
        console.log(`   Reasons: ${analysis.failed.join(', ')}`);

        const msg = `⚠️ <b>PUMP.FUN - REJECTED TOKEN</b> ⚠️

<b>🚫 SKIPPED (Failed Filters)</b>

<b>${token.name}</b> (${token.symbol})
Mint: <code>${token.mint}</code>

📊 <b>Metrics:</b>
• Holders: ${holders}
• Market Cap: $${(marketCap / 1000).toFixed(1)}K

<b>❌ Failed Checks:</b>
${analysis.failed.join('\n')}

<b>Safety Score: ${analysis.safeScore}/100</b>

🔴 Status: NOT ALERTED (Too risky)

🔗 <a href="https://pump.fun/${token.mint}">View anyway</a>`;

        await sendAlert(msg);
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      processed.pump_fun.add(token.mint);
      saveProcessed();

      console.log(`✅ [Pump.fun] PASSED: ${token.symbol}`);

      const msg = `✅ <b>PUMP.FUN - NEW TOKEN ✅</b>

<b>🟢 QUALITY TOKEN DETECTED</b>

<b>${token.name}</b> (${token.symbol})
Mint: <code>${token.mint}</code>

📊 <b>Metrics:</b>
• Holders: ${holders}
• Market Cap: $${(marketCap / 1000).toFixed(1)}K

🛡️ <b>Safety Score: ${analysis.safeScore}/100</b>

<b>✅ Passed Checks:</b>
${analysis.passed.slice(0, 3).join('\n')}

🟢 Status: ALERTED (Quality found!)

🔗 <a href="https://pump.fun/${token.mint}">🚀 Trade</a>
🔗 <a href="https://rugcheck.xyz/tokens/${token.mint}">🔍 RugCheck</a>`;

      await sendAlert(msg);
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    console.error('❌ Pump.fun error:', e.message);
  }
}

// ==================== PUMPSWAP ====================

async function scanPumpSwap() {
  try {
    console.log('\n🔍 [PumpSwap] Scanning...');
    
    let res = await axios.get('https://api.raydium.io/v2/main/pools?pageSize=50', { 
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).catch(() => null);

    if (!res || !res.data || res.data.length === 0) {
      console.log('❌ [PumpSwap] No data available');
      return;
    }

    console.log(`✅ [PumpSwap] Found ${res.data.length} pools`);

    for (const pool of res.data.slice(0, 3)) {
      if (!pool.baseMint) continue;
      
      const tokenId = `pumpswap_${pool.baseMint}`;
      if (processed.pumpswap.has(tokenId)) {
        console.log(`⏭️  [PumpSwap] Skipped (already processed): ${pool.baseSymbol}`);
        continue;
      }

      const liq = parseFloat(pool.liquidity) || 0;

      console.log(`\n📊 [PumpSwap] Analyzing: ${pool.baseSymbol}`);
      console.log(`   • Liquidity: $${(liq / 1000).toFixed(1)}K`);

      const analysis = await analyze8Layers({
        supply: 0,
        holders: 100,
        holderConcentration: 10,
        liquidity: liq,
      }, 'PumpSwap');

      if (liq < FILTERS.MIN_LIQUIDITY) {
        console.log(`❌ [PumpSwap] REJECTED: ${pool.baseSymbol} - Low liquidity`);

        const msg = `⚠️ <b>PUMPSWAP - REJECTED POOL</b> ⚠️

<b>🚫 SKIPPED (Failed Filters)</b>

<b>${pool.baseSymbol}</b>
Mint: <code>${pool.baseMint}</code>

💰 <b>Metrics:</b>
• Liquidity: $${(liq / 1000).toFixed(1)}K
• Pair: ${pool.baseSymbol}/${pool.quoteSymbol}

<b>❌ Failed Checks:</b>
❌ Liquidity too low (need $${FILTERS.MIN_LIQUIDITY})

<b>Safety Score: ${analysis.safeScore}/100</b>

🔴 Status: NOT ALERTED (Too risky)`;

        await sendAlert(msg);
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      processed.pumpswap.add(tokenId);
      saveProcessed();

      console.log(`✅ [PumpSwap] PASSED: ${pool.baseSymbol}`);

      const msg = `✅ <b>PUMPSWAP - NEW POOL ✅</b>

<b>🟢 QUALITY POOL DETECTED</b>

<b>${pool.baseSymbol}</b>
Mint: <code>${pool.baseMint}</code>

💰 <b>Metrics:</b>
• Liquidity: $${(liq / 1000).toFixed(1)}K
• Pair: ${pool.baseSymbol}/${pool.quoteSymbol}

🛡️ <b>Safety Score: ${analysis.safeScore}/100</b>

<b>✅ Passed Checks:</b>
${analysis.passed.slice(0, 3).join('\n')}

🟢 Status: ALERTED (Quality found!)

🔗 <a href="https://dexscreener.com/solana/${pool.baseMint}">🚀 Trade</a>`;

      await sendAlert(msg);
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    console.error('❌ PumpSwap error:', e.message);
  }
}

// ==================== RAYDIUM ====================

async function scanRaydium() {
  try {
    console.log('\n🔍 [Raydium] Scanning...');
    
    let res = await axios.get('https://api.raydium.io/v2/main/pools?pageSize=50', { 
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).catch(() => null);

    if (!res || !res.data || res.data.length === 0) {
      console.log('❌ [Raydium] No data available');
      return;
    }

    console.log(`✅ [Raydium] Found ${res.data.length} pools`);

    for (const pool of res.data.slice(3, 5)) {
      if (!pool.baseMint) continue;
      
      if (processed.raydium.has(pool.baseMint)) {
        console.log(`⏭️  [Raydium] Skipped: ${pool.baseSymbol}`);
        continue;
      }

      const liq = parseFloat(pool.liquidity) || 0;

      console.log(`\n📊 [Raydium] Analyzing: ${pool.baseSymbol}`);
      console.log(`   • Liquidity: $${(liq / 1000).toFixed(1)}K`);

      const analysis = await analyze8Layers({
        supply: 0,
        holders: 100,
        holderConcentration: 12,
        liquidity: liq,
      }, 'Raydium');

      if (liq < FILTERS.MIN_LIQUIDITY) {
        console.log(`❌ [Raydium] REJECTED: ${pool.baseSymbol}`);

        const msg = `⚠️ <b>RAYDIUM - REJECTED POOL</b> ⚠️

<b>🚫 SKIPPED (Failed Filters)</b>

<b>${pool.baseSymbol}</b>
Mint: <code>${pool.baseMint}</code>

💰 <b>Metrics:</b>
• Liquidity: $${(liq / 1000).toFixed(1)}K
• Pair: ${pool.baseSymbol}/${pool.quoteSymbol}

<b>❌ Failed Checks:</b>
❌ Liquidity too low

🔴 Status: NOT ALERTED`;

        await sendAlert(msg);
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      processed.raydium.add(pool.baseMint);
      saveProcessed();

      console.log(`✅ [Raydium] PASSED: ${pool.baseSymbol}`);

      const msg = `✅ <b>RAYDIUM - NEW POOL ✅</b>

<b>🟢 QUALITY POOL DETECTED</b>

<b>${pool.baseSymbol}</b>
Mint: <code>${pool.baseMint}</code>

💰 <b>Metrics:</b>
• Liquidity: $${(liq / 1000).toFixed(1)}K
• Pair: ${pool.baseSymbol}/${pool.quoteSymbol}

🛡️ <b>Safety Score: ${analysis.safeScore}/100</b>

<b>✅ Passed Checks:</b>
${analysis.passed.slice(0, 3).join('\n')}

🟢 Status: ALERTED (Quality found!)

🔗 <a href="https://dexscreener.com/solana/${pool.baseMint}">🚀 Trade</a>`;

      await sendAlert(msg);
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    console.error('❌ Raydium error:', e.message);
  }
}

// ==================== 4MEME (BSC) ====================

async function scanFourMeme() {
  try {
    console.log('\n🔍 [4MEME] Scanning...');
    
    let res = await axios.get('https://api.dexscreener.com/latest/dex/tokens?chain=bsc&pageSize=30', { 
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).catch(() => null);

    if (!res || !res.data || !res.data.pairs || res.data.pairs.length === 0) {
      console.log('❌ [4MEME] No data available');
      return;
    }

    console.log(`✅ [4MEME] Found ${res.data.pairs.length} tokens`);

    for (const pair of res.data.pairs.slice(0, 3)) {
      const token = pair.baseToken;
      if (!token.address) continue;

      if (processed.fourmeme.has(token.address)) {
        console.log(`⏭️  [4MEME] Skipped: ${token.symbol}`);
        continue;
      }

      const liq = parseFloat(pair.liquidity?.usd) || 0;

      console.log(`\n📊 [4MEME] Analyzing: ${token.symbol}`);
      console.log(`   • Liquidity: $${(liq / 1000).toFixed(1)}K`);

      const analysis = await analyze8Layers({
        supply: 0,
        holders: 50,
        holderConcentration: 15,
        liquidity: liq,
      }, '4MEME');

      if (liq < FILTERS.MIN_LIQUIDITY) {
        console.log(`❌ [4MEME] REJECTED: ${token.symbol}`);

        const msg = `⚠️ <b>4MEME - REJECTED TOKEN</b> ⚠️

<b>🚫 SKIPPED (Failed Filters)</b>

<b>${token.name}</b> (${token.symbol})
Address: <code>${token.address}</code>

💰 <b>Metrics:</b>
• Liquidity: $${(liq / 1000).toFixed(1)}K

<b>❌ Failed Checks:</b>
❌ Liquidity too low (need $${FILTERS.MIN_LIQUIDITY})

🔴 Status: NOT ALERTED (Too risky)`;

        await sendAlert(msg);
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      processed.fourmeme.add(token.address);
      saveProcessed();

      console.log(`✅ [4MEME] PASSED: ${token.symbol}`);

      const msg = `✅ <b>4MEME - NEW TOKEN ✅</b>

<b>🟢 QUALITY TOKEN DETECTED</b>

<b>${token.name}</b> (${token.symbol})
Address: <code>${token.address}</code>

💰 <b>Metrics:</b>
• Liquidity: $${(liq / 1000).toFixed(1)}K

🛡️ <b>Safety Score: ${analysis.safeScore}/100</b>

<b>✅ Passed Checks:</b>
${analysis.passed.slice(0, 3).join('\n')}

🟢 Status: ALERTED (Quality found!)

🔗 <a href="https://dexscreener.com/bsc/${token.address}">🚀 Trade</a>`;

      await sendAlert(msg);
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    console.error('❌ 4MEME error:', e.message);
  }
}

// ==================== PANCAKESWAP ====================

async function scanPancakeSwap() {
  try {
    console.log('\n🔍 [PancakeSwap] Scanning...');
    
    let res = await axios.get('https://api.pancakeswap.info/api/v2/pairs', { 
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }).catch(() => null);

    if (!res || !res.data || !res.data.pairs) {
      console.log('❌ [PancakeSwap] No data available');
      return;
    }

    const pairIds = Object.keys(res.data.pairs).slice(0, 10);
    console.log(`✅ [PancakeSwap] Checking ${pairIds.length} pairs`);

    let count = 0;
    for (const pairId of pairIds) {
      if (count >= 2) break;

      const pair = res.data.pairs[pairId];
      if (!pair || !pair.token0) continue;

      const tokenAddr = pair.token0.address;
      if (processed.pancakeswap.has(tokenAddr)) {
        console.log(`⏭️  [PancakeSwap] Skipped: ${pair.token0.symbol}`);
        continue;
      }

      const liq = parseFloat(pair.reserveUSD) || 0;

      console.log(`\n📊 [PancakeSwap] Analyzing: ${pair.token0.symbol}`);
      console.log(`   • Liquidity: $${(liq / 1000).toFixed(1)}K`);

      const analysis = await analyze8Layers({
        supply: 0,
        holders: 50,
        holderConcentration: 15,
        liquidity: liq,
      }, 'PancakeSwap');

      if (liq < FILTERS.MIN_LIQUIDITY) {
        console.log(`❌ [PancakeSwap] REJECTED: ${pair.token0.symbol}`);

        const msg = `⚠️ <b>PANCAKESWAP - REJECTED PAIR</b> ⚠️

<b>🚫 SKIPPED (Failed Filters)</b>

<b>${pair.token0.symbol}</b>
Address: <code>${tokenAddr}</code>

💰 <b>Metrics:</b>
• Liquidity: $${(liq / 1000).toFixed(1)}K
• Pair: ${pair.token0.symbol}/${pair.token1.symbol}

<b>❌ Failed Checks:</b>
❌ Liquidity too low

🔴 Status: NOT ALERTED`;

        await sendAlert(msg);
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      processed.pancakeswap.add(tokenAddr);
      saveProcessed();

      console.log(`✅ [PancakeSwap] PASSED: ${pair.token0.symbol}`);

      const msg = `✅ <b>PANCAKESWAP - NEW PAIR ✅</b>

<b>🟢 QUALITY PAIR DETECTED</b>

<b>${pair.token0.symbol}</b>
Address: <code>${tokenAddr}</code>

💰 <b>Metrics:</b>
• Liquidity: $${(liq / 1000).toFixed(1)}K
• Pair: ${pair.token0.symbol}/${pair.token1.symbol}

🛡️ <b>Safety Score: ${analysis.safeScore}/100</b>

<b>✅ Passed Checks:</b>
${analysis.passed.slice(0, 3).join('\n')}

🟢 Status: ALERTED (Quality found!)

🔗 <a href="https://pancakeswap.finance/swap?outputCurrency=${tokenAddr}">🚀 Trade</a>`;

      await sendAlert(msg);
      await new Promise(r => setTimeout(r, 1000));
      count++;
    }
  } catch (e) {
    console.error('❌ PancakeSwap error:', e.message);
  }
}

// ==================== STARTUP ====================

async function startup() {
  loadProcessed();
  
  console.log('🛡️ ULTIMATE BOT WITH SKIPPED TOKEN TRACKING\n');
  console.log('⛓️  MONITORING 5 LAUNCHPADS:');
  console.log('   🟡 SOLANA:');
  console.log('      ✅ Pump.fun (every 10 sec)');
  console.log('      ✅ PumpSwap (every 11 sec)');
  console.log('      ✅ Raydium (every 12 sec)');
  console.log('   🟡 BSC:');
  console.log('      ✅ 4MEME (every 15 sec)');
  console.log('      ✅ PancakeSwap (every 17 sec)\n');
  
  console.log('📊 ALERT STYLES:');
  console.log('   ✅ GREEN: Tokens that PASSED filters');
  console.log('   ⚠️  YELLOW: Tokens that FAILED filters\n');
  
  await sendAlert('🛡️ <b>BOT ONLINE WITH SKIPPED TOKEN TRACKING</b>\n\n✅ Quality tokens alerted\n⚠️ Rejected tokens shown\n🔍 Full transparency');
  
  setInterval(scanPumpFun, 10000);
  setInterval(scanPumpSwap, 11000);
  setInterval(scanRaydium, 12000);
  setInterval(scanFourMeme, 15000);
  setInterval(scanPancakeSwap, 17000);
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
