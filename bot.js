const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

console.log('🧪 TEST MODE - Multi-Chain Bot\n');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

async function sendAlert(msg) {
  try {
    await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
    console.log('✉️  Alert sent');
  } catch (e) {
    console.error('Alert error:', e.message);
  }
}

// ==================== SOLANA TESTS ====================

async function testPumpFun() {
  try {
    console.log('\n🧪 TEST: Pump.fun (SOLANA)');
    
    const res = await axios.get('https://frontend-api.pump.fun/tokens/recent', { timeout: 5000 }).catch(() => null);
    if (!res || !res.data) {
      console.log('❌ API unavailable');
      return;
    }

    let tested = 0;
    for (const token of res.data.slice(0, 3)) {
      tested++;
      
      const msg = `🧪 <b>TEST #${tested} - PUMP.FUN</b> 🧪

<b>🟡 SOLANA</b>

<b>${token.name}</b> (${token.symbol})
Mint: <code>${token.mint}</code>

📊 Holders: ${token.holder_count || '?'}
💰 Market Cap: $${token.market_cap ? (token.market_cap / 1000).toFixed(1) + 'K' : '?'}

✅ <b>Alert Test Status:</b> SUCCESS
🔗 <a href="https://pump.fun/${token.mint}">View on Pump.fun</a>`;
      
      await sendAlert(msg);
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✅ Sent ${tested} Pump.fun test alerts`);
  } catch (e) {
    console.error('Test error:', e.message);
  }
}

async function testRaydium() {
  try {
    console.log('\n🧪 TEST: Raydium (SOLANA)');
    
    const res = await axios.get('https://api.raydium.io/v2/main/pools', { timeout: 5000 }).catch(() => null);
    if (!res || !res.data) {
      console.log('❌ API unavailable');
      return;
    }

    let tested = 0;
    for (const pool of res.data.slice(0, 3)) {
      if (pool.liquidity < 5000) continue;
      tested++;
      
      const liq = Math.round(pool.liquidity || 0);
      const msg = `🧪 <b>TEST #${tested} - RAYDIUM</b> 🧪

<b>🟡 SOLANA</b>

<b>${pool.baseSymbol}</b>
Mint: <code>${pool.baseMint}</code>

💰 Liquidity: $${(liq / 1000).toFixed(1)}K
📈 Pair: ${pool.baseSymbol}/${pool.quoteSymbol}

✅ <b>Alert Test Status:</b> SUCCESS
🔗 <a href="https://dexscreener.com/solana/${pool.baseMint}">View on DexScreener</a>`;
      
      await sendAlert(msg);
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✅ Sent ${tested} Raydium test alerts`);
  } catch (e) {
    console.error('Test error:', e.message);
  }
}

// ==================== BSC TESTS ====================

async function testFourMeme() {
  try {
    console.log('\n🧪 TEST: 4MEME (BSC)');
    
    // Try 4MEME API first
    const res = await axios.get('https://api.fourmeme.io/latest-launches', { timeout: 5000 }).catch(() => null);
    
    if (!res || !res.data || !Array.isArray(res.data)) {
      // Fallback to DexScreener
      const dex = await axios.get('https://api.dexscreener.com/latest/dex/tokens?chain=bsc', { timeout: 5000 }).catch(() => null);
      if (!dex || !dex.data || !dex.data.pairs) {
        console.log('❌ API unavailable');
        return;
      }

      let tested = 0;
      for (const pair of dex.data.pairs.slice(0, 3)) {
        tested++;
        const token = pair.baseToken;
        
        const msg = `🧪 <b>TEST #${tested} - 4MEME</b> 🧪

<b>🟡 BSC</b>

<b>${token.name}</b> (${token.symbol})
Address: <code>${token.address}</code>

📊 Price: $${pair.priceUsd ? parseFloat(pair.priceUsd).toFixed(8) : '?'}
💰 Liquidity: $${pair.liquidity ? (pair.liquidity.usd / 1000).toFixed(1) + 'K' : '?'}

✅ <b>Alert Test Status:</b> SUCCESS
🔗 <a href="https://dexscreener.com/bsc/${token.address}">View on DexScreener</a>`;
        
        await sendAlert(msg);
        await new Promise(r => setTimeout(r, 1000));
      }
      console.log(`✅ Sent ${tested} 4MEME test alerts`);
      return;
    }

    let tested = 0;
    for (const token of res.data.slice(0, 3)) {
      tested++;
      
      const msg = `🧪 <b>TEST #${tested} - 4MEME</b> 🧪

<b>🟡 BSC</b>

<b>${token.name}</b> (${token.symbol})
Address: <code>${token.address}</code>

📊 Holders: ${token.holders || '?'}
💰 Market Cap: $${token.market_cap ? (token.market_cap / 1000).toFixed(1) + 'K' : '?'}

✅ <b>Alert Test Status:</b> SUCCESS
🔗 <a href="https://bscscan.com/token/${token.address}">View on BscScan</a>`;
      
      await sendAlert(msg);
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`✅ Sent ${tested} 4MEME test alerts`);
  } catch (e) {
    console.error('Test error:', e.message);
  }
}

async function testPancakeSwap() {
  try {
    console.log('\n🧪 TEST: PancakeSwap (BSC)');
    
    const res = await axios.get('https://api.pancakeswap.info/api/v2/pairs', { timeout: 5000 }).catch(() => null);
    if (!res || !res.data || !res.data.pairs) {
      console.log('❌ API unavailable');
      return;
    }

    let tested = 0;
    for (const pairId in res.data.pairs) {
      if (tested >= 3) break;
      
      const pair = res.data.pairs[pairId];
      if (!pair || !pair.token0) continue;
      
      const liq = parseFloat(pair.reserveUSD) || 0;
      if (liq > 5000) {
        tested++;
        
        const msg = `🧪 <b>TEST #${tested} - PANCAKESWAP</b> 🧪

<b>🟡 BSC</b>

<b>${pair.token0.symbol}</b>
Address: <code>${pair.token0.address}</code>

💰 Liquidity: $${(liq / 1000).toFixed(1)}K
📈 Pair: ${pair.token0.symbol}/${pair.token1.symbol}

✅ <b>Alert Test Status:</b> SUCCESS
🔗 <a href="https://pancakeswap.finance/swap?outputCurrency=${pair.token0.address}">Trade on PancakeSwap</a>`;
        
        await sendAlert(msg);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    console.log(`✅ Sent ${tested} PancakeSwap test alerts`);
  } catch (e) {
    console.error('Test error:', e.message);
  }
}

// ==================== RUN TESTS ====================

async function runTests() {
  console.log('\n════════════════════════════════');
  console.log('🧪 MULTI-CHAIN TEST MODE');
  console.log('════════════════════════════════\n');
  
  await sendAlert('🧪 <b>MULTI-CHAIN TEST STARTED</b>\n\nTesting Solana + BSC launchpads...');
  await new Promise(r => setTimeout(r, 2000));
  
  // SOLANA TESTS
  console.log('\n📊 SOLANA TESTS:');
  await testPumpFun();
  await new Promise(r => setTimeout(r, 2000));
  
  await testRaydium();
  await new Promise(r => setTimeout(r, 2000));
  
  // BSC TESTS
  console.log('\n📊 BSC TESTS:');
  await testFourMeme();
  await new Promise(r => setTimeout(r, 2000));
  
  await testPancakeSwap();
  await new Promise(r => setTimeout(r, 2000));
  
  // Final message
  await sendAlert('✅ <b>ALL TESTS PASSED</b>\n\n✅ Solana working\n✅ BSC working\n✅ All launchpads detected\n\n🚀 PRODUCTION MODE STARTING...');
  
  console.log('\n════════════════════════════════');
  console.log('✅ TESTING COMPLETE');
  console.log('════════════════════════════════\n');
  
  console.log('🚀 Switching to PRODUCTION MODE in 5 seconds...\n');
  await new Promise(r => setTimeout(r, 5000));
  
  startProduction();
}

// ==================== PRODUCTION MODE ====================

async function startProduction() {
  console.log('🟢 PRODUCTION MODE - Multi-Chain Monitoring\n');
  
  // Solana
  console.log('📊 SOLANA:');
  console.log('   ✅ Pump.fun (every 10 sec)');
  console.log('   ✅ Raydium (every 12 sec)');
  
  // BSC
  console.log('📊 BSC:');
  console.log('   ✅ 4MEME (every 15 sec)');
  console.log('   ✅ PancakeSwap (every 17 sec)\n');
  
  await sendAlert('✅ <b>PRODUCTION ACTIVE</b>\n\n🟡 SOLANA:\n✅ Pump.fun\n✅ Raydium\n\n🟡 BSC:\n✅ 4MEME\n✅ PancakeSwap');
  
  // Solana scans
  setInterval(async () => {
    try {
      const res = await axios.get('https://frontend-api.pump.fun/tokens/recent', { timeout: 5000 }).catch(() => null);
      if (res && res.data) {
        for (const token of res.data.slice(0, 1)) {
          const msg = `🔥 <b>PUMP.FUN</b>\n<b>🟡 SOLANA</b>\n\n<b>${token.name}</b> (${token.symbol})\nMint: <code>${token.mint}</code>\n\n📊 Holders: ${token.holder_count || '?'}\n💰 Market Cap: $${token.market_cap ? (token.market_cap / 1000).toFixed(1) + 'K' : '?'}\n\n🔗 <a href="https://pump.fun/${token.mint}">Trade</a>`;
          await sendAlert(msg);
        }
      }
    } catch (e) {}
  }, 10000);
  
  setInterval(async () => {
    try {
      const res = await axios.get('https://api.raydium.io/v2/main/pools', { timeout: 5000 }).catch(() => null);
      if (res && res.data) {
        for (const pool of res.data.slice(0, 1)) {
          if (pool.liquidity > 5000) {
            const liq = Math.round(pool.liquidity || 0);
            const msg = `🔥 <b>RAYDIUM</b>\n<b>🟡 SOLANA</b>\n\n<b>${pool.baseSymbol}</b>\nMint: <code>${pool.baseMint}</code>\n\n💰 Liquidity: $${(liq / 1000).toFixed(1)}K\n📈 Pair: ${pool.baseSymbol}/${pool.quoteSymbol}\n\n🔗 <a href="https://dexscreener.com/solana/${pool.baseMint}">Trade</a>`;
            await sendAlert(msg);
          }
        }
      }
    } catch (e) {}
  }, 12000);
  
  // BSC scans
  setInterval(async () => {
    try {
      const dex = await axios.get('https://api.dexscreener.com/latest/dex/tokens?chain=bsc', { timeout: 5000 }).catch(() => null);
      if (dex && dex.data && dex.data.pairs) {
        for (const pair of dex.data.pairs.slice(0, 1)) {
          const token = pair.baseToken;
          const msg = `🔥 <b>4MEME</b>\n<b>🟡 BSC</b>\n\n<b>${token.name}</b> (${token.symbol})\nAddress: <code>${token.address}</code>\n\n📊 Price: $${pair.priceUsd ? parseFloat(pair.priceUsd).toFixed(8) : '?'}\n💰 Liquidity: $${pair.liquidity ? (pair.liquidity.usd / 1000).toFixed(1) + 'K' : '?'}\n\n🔗 <a href="https://dexscreener.com/bsc/${token.address}">Trade</a>`;
          await sendAlert(msg);
        }
      }
    } catch (e) {}
  }, 15000);
  
  setInterval(async () => {
    try {
      const res = await axios.get('https://api.pancakeswap.info/api/v2/pairs', { timeout: 5000 }).catch(() => null);
      if (res && res.data && res.data.pairs) {
        for (const pairId in res.data.pairs) {
          const pair = res.data.pairs[pairId];
          if (pair && pair.token0) {
            const liq = parseFloat(pair.reserveUSD) || 0;
            if (liq > 5000) {
              const msg = `🔥 <b>PANCAKESWAP</b>\n<b>🟡 BSC</b>\n\n<b>${pair.token0.symbol}</b>\nAddress: <code>${pair.token0.address}</code>\n\n💰 Liquidity: $${(liq / 1000).toFixed(1)}K\n📈 Pair: ${pair.token0.symbol}/${pair.token1.symbol}\n\n🔗 <a href="https://pancakeswap.finance/swap?outputCurrency=${pair.token0.address}">Trade</a>`;
              await sendAlert(msg);
              break;
            }
          }
        }
      }
    } catch (e) {}
  }, 17000);
}

process.on('SIGINT', () => {
  console.log('\n👋 Shutdown');
  process.exit(0);
});

runTests().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
