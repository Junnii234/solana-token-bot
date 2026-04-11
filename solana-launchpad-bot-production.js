const { Connection, PublicKey, TOKEN_PROGRAM_ID } = require('@solana/web3.js');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

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
};

// In-memory storage
let processedTokens = {
  pump_fun: new Set(),
  raydium: new Set(),
  native: new Set(),
};

// Initialize Telegram bot
const bot = new TelegramBot(CONFIG.TELEGRAM_TOKEN, { polling: false });

// Initialize Solana connection
const solanaConnection = new Connection(CONFIG.SOLANA.RPC, 'confirmed');

console.log('🤖 Production Launchpad Monitor Bot Starting...');
console.log(`📱 Telegram Chat ID: ${CONFIG.TELEGRAM_CHAT_ID}`);
console.log(`⛓️  Solana RPC: ${CONFIG.SOLANA.RPC}`);

// Load processed tokens from file
function loadProcessedTokens() {
  try {
    if (fs.existsSync('processed_tokens.json')) {
      const data = fs.readFileSync('processed_tokens.json', 'utf8');
      const parsed = JSON.parse(data);
      processedTokens.pump_fun = new Set(parsed.pump_fun || []);
      processedTokens.raydium = new Set(parsed.raydium || []);
      processedTokens.native = new Set(parsed.native || []);
      console.log(`✅ Loaded ${processedTokens.pump_fun.size + processedTokens.raydium.size + processedTokens.native.size} tokens from disk`);
    }
  } catch (err) {
    console.error('Error loading processed tokens:', err.message);
  }
}

// Save processed tokens to file
function saveProcessedTokens() {
  try {
    fs.writeFileSync('processed_tokens.json', JSON.stringify({
      pump_fun: Array.from(processedTokens.pump_fun),
      raydium: Array.from(processedTokens.raydium),
      native: Array.from(processedTokens.native),
    }), 'utf8');
  } catch (err) {
    console.error('Error saving processed tokens:', err.message);
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
    console.error('Error sending Telegram message:', err.message);
  }
}

// ==================== PUMP.FUN MONITORING ====================

async function monitorPumpFun() {
  try {
    console.log('\n🔍 [Pump.fun] Scanning...');
    
    // Pump.fun API for recent tokens
    const response = await axios.get('https://frontend-api.pump.fun/tokens/recent', {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    }).catch(() => null);

    if (!response || !response.data || !Array.isArray(response.data)) {
      console.log('⚠️  Pump.fun API unavailable');
      return;
    }

    let tokensFound = 0;

    for (const token of response.data.slice(0, 5)) {
      try {
        const tokenAddress = token.mint;

        if (processedTokens.pump_fun.has(tokenAddress)) {
          continue;
        }

        console.log(`🚀 [Pump.fun] New token: ${token.symbol}`);
        tokensFound++;

        const holders = token.holder_count || 50;
        const marketCap = parseFloat(token.market_cap) || 0;

        // Alert if has activity
        if (holders >= CONFIG.SOLANA.MIN_HOLDERS) {
          const alertMessage = `
🔥 <b>PUMP.FUN - NEW TOKEN</b> 🔥

<b>🎯 ${token.name}</b>
<b>Symbol:</b> ${token.symbol}
<b>Mint:</b> <code>${tokenAddress}</code>

📊 <b>Stats:</b>
• Holders: ${holders}
• Market Cap: $${marketCap > 1000 ? (marketCap / 1000).toFixed(1) + 'K' : marketCap.toFixed(2)}

🔗 <a href="https://pump.fun/${tokenAddress}">🚀 Trade on Pump.fun</a>
🔗 <a href="https://dexscreener.com/solana/${tokenAddress}">📊 DexScreener</a>
`;

          await sendAlert(alertMessage);
        }

        processedTokens.pump_fun.add(tokenAddress);
        saveProcessedTokens();
      } catch (err) {
        // Continue scanning
      }
    }

    if (tokensFound > 0) {
      console.log(`✅ [Pump.fun] Found ${tokensFound} new tokens`);
    }
  } catch (err) {
    console.error(`[Pump.fun] Error: ${err.message}`);
  }
}

// ==================== RAYDIUM MONITORING ====================

async function monitorRaydium() {
  try {
    console.log('\n🔍 [Raydium] Scanning...');

    const response = await axios.get('https://api.raydium.io/v2/main/pools', {
      timeout: 8000,
    }).catch(() => null);

    if (!response || !response.data || !Array.isArray(response.data)) {
      console.log('⚠️  Raydium API unavailable');
      return;
    }

    let poolsFound = 0;

    // Check latest 10 pools
    for (const pool of response.data.slice(0, 10)) {
      try {
        const tokenMint = pool.baseMint;

        if (processedTokens.raydium.has(tokenMint)) {
          continue;
        }

        console.log(`🚀 [Raydium] New pool: ${pool.baseSymbol}`);
        poolsFound++;

        const liquidity = parseFloat(pool.liquidity) || 0;

        if (liquidity > 5000) {
          const alertMessage = `
🔥 <b>RAYDIUM - NEW POOL</b> 🔥

<b>🎯 ${pool.baseSymbol}</b>
<b>Mint:</b> <code>${tokenMint}</code>

💰 <b>Pool Info:</b>
• Liquidity: $${(liquidity / 1000).toFixed(1)}K
• Pair: ${pool.baseSymbol}/${pool.quoteSymbol}

🔗 <a href="https://dexscreener.com/solana/${tokenMint}">🚀 Trade</a>
`;

          await sendAlert(alertMessage);
        }

        processedTokens.raydium.add(tokenMint);
        saveProcessedTokens();
      } catch (err) {
        // Continue scanning
      }
    }

    if (poolsFound > 0) {
      console.log(`✅ [Raydium] Found ${poolsFound} new pools`);
    }
  } catch (err) {
    console.error(`[Raydium] Error: ${err.message}`);
  }
}

// ==================== NATIVE TOKEN MONITORING ====================

async function monitorNativeTokens() {
  try {
    const currentSlot = await solanaConnection.getSlot();

    const block = await solanaConnection.getBlock(currentSlot - 10, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!block || !block.transactions) {
      return;
    }

    console.log(`\n🔍 [Native] Scanning slot ${currentSlot}...`);
    let tokensFound = 0;

    for (const transaction of block.transactions) {
      try {
        if (!transaction.transaction.message) continue;

        const instructions = transaction.transaction.message.instructions;
        
        if (!Array.isArray(instructions)) continue;

        for (const instruction of instructions) {
          try {
            if (
              instruction.programId.equals(TOKEN_PROGRAM_ID) &&
              instruction.data[0] === 0
            ) {
              const mint = new PublicKey(instruction.keys[0].pubkey);
              const mintAddress = mint.toString();

              if (processedTokens.native.has(mintAddress)) {
                continue;
              }

              console.log(`🚀 [Native] New mint: ${mintAddress}`);
              tokensFound++;

              const mintInfo = await solanaConnection.getParsedAccountInfo(mint);
              if (!mintInfo || !mintInfo.value) continue;

              const parsedData = mintInfo.value.data;
              if (parsedData.type !== 'mint') continue;

              const alertMessage = `
✨ <b>NATIVE TOKEN CREATED</b> ✨

<b>Mint:</b> <code>${mintAddress}</code>

🔗 <a href="https://solscan.io/token/${mintAddress}">View on Solscan</a>
`;

              await sendAlert(alertMessage);

              processedTokens.native.add(mintAddress);
              saveProcessedTokens();
            }
          } catch (err) {
            // Continue
          }
        }
      } catch (txErr) {
        continue;
      }
    }

    if (tokensFound > 0) {
      console.log(`✅ [Native] Found ${tokensFound} new tokens`);
    }
  } catch (err) {
    console.error(`[Native] Error: ${err.message}`);
  }
}

// ==================== STARTUP ====================

async function sendStartupMessage() {
  try {
    const message = `
🚀 <b>BOT ONLINE</b> 🚀

✅ Pump.fun Monitoring
✅ Raydium Monitoring  
✅ Native Tokens Monitoring

Scanning every 10 seconds...
`;

    await sendAlert(message);
  } catch (err) {
    console.error('Startup message error:', err);
  }
}

// Start monitoring
async function startMonitoring() {
  loadProcessedTokens();

  console.log(`\n🟢 Bot is now running...`);
  console.log(`📊 Monitoring:`);
  console.log(`   ✅ Pump.fun`);
  console.log(`   ✅ Raydium`);
  console.log(`   ✅ Native Tokens\n`);

  await sendStartupMessage();

  // Start scanning all launchpads
  setInterval(monitorPumpFun, CONFIG.SOLANA.POLL_INTERVAL);
  setInterval(monitorRaydium, CONFIG.SOLANA.POLL_INTERVAL + 2000);
  setInterval(monitorNativeTokens, CONFIG.SOLANA.POLL_INTERVAL + 4000);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  saveProcessedTokens();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down...');
  saveProcessedTokens();
  process.exit(0);
});

// Start
startMonitoring().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});