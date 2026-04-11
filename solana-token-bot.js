const { Connection, PublicKey, TOKEN_PROGRAM_ID } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getMint } = require('@solana/spl-token');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const Web3 = require('web3');

// Configuration
const CONFIG = {
  // Telegram
  TELEGRAM_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID',
  
  // Solana Configuration
  SOLANA: {
    RPC: 'https://api.mainnet-beta.solana.com',
    MIN_HOLDERS: 50,
    MAX_HOLDER_PERCENTAGE: 40,
    MAX_SUPPLY_THRESHOLD: 1e15,
    POLL_INTERVAL: 10000,
    ENABLED: true,
  },
  
  // BSC Configuration
  BSC: {
    RPC: 'https://bsc-dataseed1.binance.org:443',
    SCAN_INTERVAL: 10000,
    MIN_HOLDERS: 50,
    MAX_HOLDER_PERCENTAGE: 40,
    ENABLED: true,
  },

  // Launchpad Detection
  LAUNCHPADS: {
    SOLANA: {
      PUMP_FUN: {
        enabled: true,
        name: 'Pump.fun',
        method: 'api', // Uses Pump.fun API
      },
      RAYDIUM: {
        enabled: true,
        name: 'Raydium',
        method: 'events',
      },
      PUMPSWAP: {
        enabled: true,
        name: 'PumpSwap',
        method: 'events',
      },
    },
    BSC: {
      FOURMEME: {
        enabled: true,
        name: '4MEME',
        method: 'api',
      },
      PANCAKESWAP: {
        enabled: true,
        name: 'PancakeSwap',
        method: 'events',
      },
    },
  },
};

// In-memory storage
let processedTokens = {
  solana: new Set(),
  solana_launchpad: new Set(),
  bsc: new Set(),
  bsc_launchpad: new Set(),
};

// Initialize Telegram bot
const bot = new TelegramBot(CONFIG.TELEGRAM_TOKEN, { polling: false });

// Initialize Solana connection
const solanaConnection = new Connection(CONFIG.SOLANA.RPC, 'confirmed');

// Initialize BSC Web3
const bscWeb3 = new Web3(CONFIG.BSC.RPC);

console.log('🤖 Enhanced Multi-Chain Launchpad Monitor Bot Starting...');
console.log(`📱 Telegram Chat ID: ${CONFIG.TELEGRAM_CHAT_ID}`);
console.log(`⛓️  Solana RPC: ${CONFIG.SOLANA.RPC}`);
console.log(`⛓️  BSC RPC: ${CONFIG.BSC.RPC}`);

// Load processed tokens from file
function loadProcessedTokens() {
  try {
    if (fs.existsSync('processed_tokens_launchpad.json')) {
      const data = fs.readFileSync('processed_tokens_launchpad.json', 'utf8');
      const parsed = JSON.parse(data);
      processedTokens.solana = new Set(parsed.solana || []);
      processedTokens.solana_launchpad = new Set(parsed.solana_launchpad || []);
      processedTokens.bsc = new Set(parsed.bsc || []);
      processedTokens.bsc_launchpad = new Set(parsed.bsc_launchpad || []);
      console.log(`✅ Loaded ${processedTokens.solana.size + processedTokens.solana_launchpad.size} Solana + ${processedTokens.bsc.size + processedTokens.bsc_launchpad.size} BSC tokens`);
    }
  } catch (err) {
    console.error('Error loading processed tokens:', err);
  }
}

// Save processed tokens to file
function saveProcessedTokens() {
  try {
    fs.writeFileSync('processed_tokens_launchpad.json', JSON.stringify({
      solana: Array.from(processedTokens.solana),
      solana_launchpad: Array.from(processedTokens.solana_launchpad),
      bsc: Array.from(processedTokens.bsc),
      bsc_launchpad: Array.from(processedTokens.bsc_launchpad),
    }), 'utf8');
  } catch (err) {
    console.error('Error saving processed tokens:', err);
  }
}

// Send Telegram message
async function sendAlert(message) {
  try {
    await bot.sendMessage(CONFIG.TELEGRAM_CHAT_ID, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    console.log('✉️  Alert sent to Telegram');
  } catch (err) {
    console.error('Error sending Telegram message:', err);
  }
}

// ==================== SOLANA LAUNCHPAD DETECTION ====================

// Monitor Pump.fun for new tokens
async function monitorPumpFun() {
  try {
    console.log('\n🔍 [Pump.fun] Scanning for new tokens...');
    
    // Pump.fun API endpoint for recent tokens
    const response = await axios.get('https://frontend-api.pump.fun/tokens/recent', {
      timeout: 5000,
    }).catch(() => null);

    if (!response || !response.data || !Array.isArray(response.data)) {
      return;
    }

    let tokensFound = 0;

    for (const token of response.data.slice(0, 10)) {
      try {
        const tokenAddress = token.mint;

        if (processedTokens.solana_launchpad.has(tokenAddress)) {
          continue;
        }

        console.log(`\n🚀 [Pump.fun] New token found: ${tokenAddress}`);
        tokensFound++;

        // Basic legitimacy check
        const holders = token.holder_count || 50;
        const marketCap = token.market_cap || 0;

        // Only alert if token has some traction
        if (holders >= CONFIG.SOLANA.MIN_HOLDERS && marketCap > 1000) {
          const alertMessage = `
🔥 <b>NEW TOKEN - PUMP.FUN 🔥</b>

<b>Token:</b> ${token.name} (${token.symbol})
<b>Address:</b> <code>${tokenAddress}</code>
<b>Launchpad:</b> 🎯 Pump.fun
<b>Chain:</b> 🟡 Solana

📊 <b>Stats:</b>
• Holders: ${holders}
• Market Cap: $${(marketCap / 1000).toFixed(1)}K
• Progress: ${token.usd_market_cap_fx ? '🔝 Growing' : '📈 Fresh'}

🔗 <a href="https://pump.fun/${tokenAddress}">View on Pump.fun</a>
🔗 <a href="https://dexscreener.com/solana/${tokenAddress}">View on DexScreener</a>
`;

          await sendAlert(alertMessage);

          processedTokens.solana_launchpad.add(tokenAddress);
          saveProcessedTokens();
        } else {
          processedTokens.solana_launchpad.add(tokenAddress);
          saveProcessedTokens();
        }
      } catch (err) {
        // Continue scanning
      }
    }

    if (tokensFound > 0) {
      console.log(`✅ [Pump.fun] Scanned ${tokensFound} new tokens`);
    }
  } catch (err) {
    console.error(`Error monitoring Pump.fun: ${err.message}`);
  }
}

// Monitor Raydium pools (Solana DEX)
async function monitorRaydium() {
  try {
    console.log('\n🔍 [Raydium] Scanning for new pools...');

    const response = await axios.get('https://api.raydium.io/v2/main/pools', {
      timeout: 5000,
    }).catch(() => null);

    if (!response || !response.data) {
      return;
    }

    let poolsFound = 0;

    // Check latest 20 pools
    for (const pool of response.data.slice(0, 20)) {
      try {
        const tokenMint = pool.baseMint;

        if (processedTokens.solana_launchpad.has(tokenMint)) {
          continue;
        }

        console.log(`\n🚀 [Raydium] New pool detected: ${tokenMint}`);
        poolsFound++;

        const liquidity = pool.liquidity || 0;

        if (liquidity > 5000) { // Only alert if liquidity > $5K
          const alertMessage = `
🔥 <b>NEW POOL - RAYDIUM 🔥</b>

<b>Base Token:</b> ${pool.baseMint}
<b>Launchpad:</b> 🎯 Raydium
<b>Chain:</b> 🟡 Solana

💰 <b>Pool Info:</b>
• Liquidity: $${(liquidity / 1000).toFixed(1)}K
• Status: ✅ Active

🔗 <a href="https://raydium.io/swap?ammId=${pool.id}">Trade on Raydium</a>
🔗 <a href="https://dexscreener.com/solana/${tokenMint}">View on DexScreener</a>
`;

          await sendAlert(alertMessage);

          processedTokens.solana_launchpad.add(tokenMint);
          saveProcessedTokens();
        } else {
          processedTokens.solana_launchpad.add(tokenMint);
          saveProcessedTokens();
        }
      } catch (err) {
        // Continue scanning
      }
    }

    if (poolsFound > 0) {
      console.log(`✅ [Raydium] Scanned ${poolsFound} new pools`);
    }
  } catch (err) {
    console.error(`Error monitoring Raydium: ${err.message}`);
  }
}

// ==================== BSC LAUNCHPAD DETECTION ====================

// Monitor 4MEME (FourMeme) on BSC
async function monitorFourMeme() {
  try {
    console.log('\n🔍 [4MEME] Scanning for new tokens...');

    // 4MEME API for recent launches
    const response = await axios.get('https://api.fourmeme.io/latest-launches', {
      timeout: 5000,
    }).catch(() => null);

    if (!response || !response.data || !Array.isArray(response.data)) {
      return;
    }

    let tokensFound = 0;

    for (const token of response.data.slice(0, 10)) {
      try {
        const tokenAddress = token.address;

        if (processedTokens.bsc_launchpad.has(tokenAddress)) {
          continue;
        }

        console.log(`\n🚀 [4MEME] New token found: ${tokenAddress}`);
        tokensFound++;

        const holders = token.holders || 30;
        const marketCap = token.market_cap || 0;

        if (holders >= CONFIG.BSC.MIN_HOLDERS && marketCap > 1000) {
          const alertMessage = `
🔥 <b>NEW TOKEN - 4MEME 🔥</b>

<b>Token:</b> ${token.name}
<b>Address:</b> <code>${tokenAddress}</code>
<b>Launchpad:</b> 🎯 FourMeme (4MEME)
<b>Chain:</b> 🟡 Binance Smart Chain

📊 <b>Stats:</b>
• Holders: ${holders}
• Market Cap: $${(marketCap / 1000).toFixed(1)}K
• Status: ✅ Launched

🔗 <a href="https://bscscan.com/token/${tokenAddress}">View on BscScan</a>
🔗 <a href="https://dexscreener.com/bsc/${tokenAddress}">View on DexScreener</a>
`;

          await sendAlert(alertMessage);

          processedTokens.bsc_launchpad.add(tokenAddress);
          saveProcessedTokens();
        } else {
          processedTokens.bsc_launchpad.add(tokenAddress);
          saveProcessedTokens();
        }
      } catch (err) {
        // Continue scanning
      }
    }

    if (tokensFound > 0) {
      console.log(`✅ [4MEME] Scanned ${tokensFound} new tokens`);
    }
  } catch (err) {
    console.error(`Error monitoring 4MEME: ${err.message}`);
  }
}

// Monitor PancakeSwap new pairs on BSC
async function monitorPancakeSwap() {
  try {
    console.log('\n🔍 [PancakeSwap] Scanning for new pairs...');

    // PancakeSwap latest pairs
    const response = await axios.get('https://api.pancakeswap.info/api/v2/pairs', {
      timeout: 5000,
    }).catch(() => null);

    if (!response || !response.data || !response.data.pairs) {
      return;
    }

    let pairsFound = 0;

    // Check latest 15 pairs
    for (const pair of Object.values(response.data.pairs).slice(0, 15)) {
      try {
        if (!pair || !pair.token0 || !pair.token1) continue;

        const tokenAddress = pair.token0.address;

        if (processedTokens.bsc_launchpad.has(tokenAddress)) {
          continue;
        }

        console.log(`\n🚀 [PancakeSwap] New pair detected: ${tokenAddress}`);
        pairsFound++;

        const liquidity = parseFloat(pair.reserveUSD) || 0;

        if (liquidity > 5000) { // Only alert if liquidity > $5K
          const alertMessage = `
🔥 <b>NEW PAIR - PANCAKESWAP 🔥</b>

<b>Token:</b> ${pair.token0.symbol}
<b>Address:</b> <code>${tokenAddress}</code>
<b>Launchpad:</b> 🎯 PancakeSwap
<b>Chain:</b> 🟡 Binance Smart Chain

💰 <b>Pair Info:</b>
• Liquidity: $${(liquidity / 1000).toFixed(1)}K
• Status: ✅ Active
• Pair: ${pair.token0.symbol}/${pair.token1.symbol}

🔗 <a href="https://pancakeswap.finance/swap?outputCurrency=${tokenAddress}">Trade on PancakeSwap</a>
🔗 <a href="https://dexscreener.com/bsc/${tokenAddress}">View on DexScreener</a>
`;

          await sendAlert(alertMessage);

          processedTokens.bsc_launchpad.add(tokenAddress);
          saveProcessedTokens();
        } else {
          processedTokens.bsc_launchpad.add(tokenAddress);
          saveProcessedTokens();
        }
      } catch (err) {
        // Continue scanning
      }
    }

    if (pairsFound > 0) {
      console.log(`✅ [PancakeSwap] Scanned ${pairsFound} new pairs`);
    }
  } catch (err) {
    console.error(`Error monitoring PancakeSwap: ${err.message}`);
  }
}

// ==================== SHARED FUNCTIONS ====================

// Send startup message
async function sendStartupMessage() {
  try {
    const launchpads = [];
    
    if (CONFIG.LAUNCHPADS.SOLANA.PUMP_FUN.enabled) launchpads.push('🎯 Pump.fun');
    if (CONFIG.LAUNCHPADS.SOLANA.RAYDIUM.enabled) launchpads.push('🎯 Raydium');
    if (CONFIG.LAUNCHPADS.BSC.FOURMEME.enabled) launchpads.push('🎯 4MEME');
    if (CONFIG.LAUNCHPADS.BSC.PANCAKESWAP.enabled) launchpads.push('🎯 PancakeSwap');

    const message = `
🚀 <b>LAUNCHPAD MONITOR BOT STARTED</b> 🚀

<b>Monitoring Launchpads:</b>
${launchpads.join('\n')}

<b>Chains:</b>
• 🟡 Solana
• 🟡 Binance Smart Chain

<b>Scan Interval:</b> Every 10 seconds

Bot is now LIVE and hunting for new tokens!
`;

    await sendAlert(message);
  } catch (err) {
    console.error('Error sending startup message:', err);
  }
}

// Start monitoring
async function startMonitoring() {
  loadProcessedTokens();

  console.log(`\n🟢 Enhanced Launchpad Monitor Bot is now running...`);
  console.log(`📊 Monitoring Launchpads:`);
  console.log(`   ✅ Pump.fun (Solana)`);
  console.log(`   ✅ Raydium (Solana)`);
  console.log(`   ✅ 4MEME (BSC)`);
  console.log(`   ✅ PancakeSwap (BSC)\n`);

  await sendStartupMessage();

  // Solana launchpads
  if (CONFIG.LAUNCHPADS.SOLANA.PUMP_FUN.enabled) {
    setInterval(monitorPumpFun, CONFIG.SOLANA.POLL_INTERVAL);
  }

  if (CONFIG.LAUNCHPADS.SOLANA.RAYDIUM.enabled) {
    setInterval(monitorRaydium, CONFIG.SOLANA.POLL_INTERVAL);
  }

  // BSC launchpads
  if (CONFIG.LAUNCHPADS.BSC.FOURMEME.enabled) {
    setInterval(monitorFourMeme, CONFIG.BSC.SCAN_INTERVAL);
  }

  if (CONFIG.LAUNCHPADS.BSC.PANCAKESWAP.enabled) {
    setInterval(monitorPancakeSwap, CONFIG.BSC.SCAN_INTERVAL);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Bot shutting down gracefully...');
  saveProcessedTokens();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Bot shutting down gracefully...');
  saveProcessedTokens();
  process.exit(0);
});

// Start the bot
startMonitoring().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
