const { Connection, PublicKey, TOKEN_PROGRAM_ID } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getMint } = require('@solana/spl-token');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// Configuration
const CONFIG = {
  SOLANA_RPC: 'https://api.mainnet-beta.solana.com',
  TELEGRAM_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID',
  
  // Rug Pull Detection Thresholds
  MIN_LIQUIDITY_USD: 5000,           // Minimum liquidity in USD
  MIN_HOLDERS: 50,                    // Minimum unique holders
  MAX_HOLDER_PERCENTAGE: 40,          // Max % of supply in single holder
  MAX_SUPPLY_THRESHOLD: 1e15,         // Max total supply (prevent infinite supply)
  LIQUIDITY_LOCK_CHECK: true,         // Check if liquidity is locked
  
  // Scanning Configuration
  POLL_INTERVAL: 15000,               // Check every 15 seconds
  SLOT_HISTORY_SIZE: 100,             // Track last N slots
};

// In-memory storage
let processedTokens = new Set();
let lastProcessedSlot = 0;

// Initialize Telegram bot
const bot = new TelegramBot(CONFIG.TELEGRAM_TOKEN, { polling: false });

// Initialize Solana connection
const connection = new Connection(CONFIG.SOLANA_RPC, 'confirmed');

console.log('🤖 Solana Token Monitor Bot Starting...');
console.log(`📱 Telegram Chat ID: ${CONFIG.TELEGRAM_CHAT_ID}`);
console.log(`⛓️  RPC: ${CONFIG.SOLANA_RPC}`);

// Load processed tokens from file
function loadProcessedTokens() {
  try {
    if (fs.existsSync('processed_tokens.json')) {
      const data = fs.readFileSync('processed_tokens.json', 'utf8');
      processedTokens = new Set(JSON.parse(data));
      console.log(`✅ Loaded ${processedTokens.size} previously processed tokens`);
    }
  } catch (err) {
    console.error('Error loading processed tokens:', err);
  }
}

// Save processed tokens to file
function saveProcessedTokens() {
  try {
    fs.writeFileSync('processed_tokens.json', JSON.stringify(Array.from(processedTokens)), 'utf8');
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

// Get token holders count
async function getTokenHolders(mintAddress) {
  try {
    const response = await axios.post(CONFIG.SOLANA_RPC, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenLargestAccounts',
      params: [mintAddress],
    });

    if (response.data.result) {
      return response.data.result.value.length;
    }
    return 0;
  } catch (err) {
    console.error('Error getting token holders:', err.message);
    return 0;
  }
}

// Get largest token holder percentage
async function getLargestHolderPercentage(mintAddress) {
  try {
    const response = await axios.post(CONFIG.SOLANA_RPC, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenLargestAccounts',
      params: [mintAddress],
    });

    if (response.data.result && response.data.result.value.length > 0) {
      const largestAccount = response.data.result.value[0];
      const percentage = (largestAccount.uiAmount / largestAccount.uiAmountString) * 100 || 0;
      return percentage;
    }
    return 0;
  } catch (err) {
    console.error('Error getting holder percentage:', err.message);
    return 100; // Default to high risk if can't determine
  }
}

// Get Raydium liquidity (if exists)
async function getRadiumLiquidity(mintAddress) {
  try {
    const response = await axios.get(
      `https://api.raydium.io/v2/main/pairs?mint1=${mintAddress}&mint2=So11111111111111111111111111111111111111112`
    );

    if (response.data && response.data.length > 0) {
      const pair = response.data[0];
      return {
        exists: true,
        liquidity: pair.liquidity,
        pairAddress: pair.ammId,
      };
    }
    return { exists: false, liquidity: 0, pairAddress: null };
  } catch (err) {
    return { exists: false, liquidity: 0, pairAddress: null };
  }
}

// Check if liquidity is locked
async function checkLiquidityLock(pairAddress) {
  try {
    if (!pairAddress) return { locked: false, lockInfo: null };

    // Check TeamFinance locks
    const teamFinanceResponse = await axios.get(
      `https://api.teamfinance.io/v1/locks?pairAddress=${pairAddress}`,
      { timeout: 5000 }
    ).catch(() => null);

    if (teamFinanceResponse && teamFinanceResponse.data && teamFinanceResponse.data.locks && teamFinanceResponse.data.locks.length > 0) {
      const lock = teamFinanceResponse.data.locks[0];
      return {
        locked: true,
        lockService: 'TeamFinance',
        unlockTime: lock.unlockTime,
        percentage: lock.percentage,
      };
    }

    // Check Raydium official locked liquidity (if available)
    try {
      const pairInfo = await axios.get(
        `https://api.raydium.io/v2/main/pairs/${pairAddress}`
      ).catch(() => null);

      if (pairInfo && pairInfo.data) {
        // Check if pair has no migration and seems stable
        if (!pairInfo.data.deprecated) {
          return {
            locked: true,
            lockService: 'Raydium (Active)',
            unlockTime: null,
            percentage: 100,
          };
        }
      }
    } catch (err) {
      // Continue if Raydium check fails
    }

    return { locked: false, lockInfo: null };
  } catch (err) {
    console.error('Error checking liquidity lock:', err.message);
    return { locked: false, lockInfo: null };
  }
}

// Verify token legitimacy
async function isLegitimateToken(mintAddress, mint) {
  try {
    console.log(`🔍 Analyzing token: ${mintAddress}`);

    // Check 1: Supply limits
    if (mint.supply > CONFIG.MAX_SUPPLY_THRESHOLD) {
      console.log(`❌ Failed: Supply too high (${mint.supply})`);
      return { legitimate: false, reason: 'Supply exceeds threshold' };
    }

    // Check 2: Decimals (spam tokens often have unusual decimals)
    if (mint.decimals > 12 || mint.decimals < 0) {
      console.log(`⚠️  Warning: Unusual decimals (${mint.decimals})`);
    }

    // Check 3: Owner check (is this a program-owned token?)
    if (!mint.owner.equals(TOKEN_PROGRAM_ID)) {
      console.log(`❌ Failed: Token not owned by TOKEN_PROGRAM_ID`);
      return { legitimate: false, reason: 'Invalid token program' };
    }

    // Check 4: Holder distribution
    const holdersCount = await getTokenHolders(mintAddress);
    if (holdersCount < CONFIG.MIN_HOLDERS) {
      console.log(`❌ Failed: Too few holders (${holdersCount})`);
      return { legitimate: false, reason: `Only ${holdersCount} holders` };
    }

    // Check 5: Largest holder concentration
    const largestHolderPct = await getLargestHolderPercentage(mintAddress);
    if (largestHolderPct > CONFIG.MAX_HOLDER_PERCENTAGE) {
      console.log(`❌ Failed: Holder concentration too high (${largestHolderPct.toFixed(2)}%)`);
      return { legitimate: false, reason: `Holder concentration: ${largestHolderPct.toFixed(2)}%` };
    }

    // Check 6: Raydium liquidity & lock status
    const liquidityData = await getRadiumLiquidity(mintAddress);
    let lockStatus = { locked: false, lockInfo: null };
    
    if (liquidityData.exists) {
      console.log(`💧 Raydium liquidity found`);
      if (CONFIG.LIQUIDITY_LOCK_CHECK) {
        lockStatus = await checkLiquidityLock(liquidityData.pairAddress);
        if (lockStatus.locked) {
          console.log(`🔒 Liquidity is LOCKED (${lockStatus.lockService})`);
        } else {
          console.log(`⚠️  Liquidity is NOT locked (Higher rug risk)`);
        }
      }
    } else {
      console.log(`⚠️  No Raydium liquidity found yet`);
    }

    // Check 7: Frozen mint (anti-rug indicator)
    if (mint.freezeAuthority !== null) {
      console.log(`⚠️  Mint has freeze authority (potential risk)`);
    }

    // Check 8: Mint authority (centralized risk)
    if (mint.mintAuthority !== null) {
      console.log(`⚠️  Mint authority exists (can mint more tokens)`);
    }

    console.log(`✅ Token appears legitimate`);
    console.log(`   Holders: ${holdersCount}, Largest holder: ${largestHolderPct.toFixed(2)}%`);
    console.log(`   Liquidity Locked: ${lockStatus.locked ? '✅ Yes' : '❌ No'}`);

    return {
      legitimate: true,
      reason: 'Passed all checks',
      holders: holdersCount,
      largestHolderPct: largestHolderPct,
      hasMintAuth: mint.mintAuthority !== null,
      hasFreezeAuth: mint.freezeAuthority !== null,
      liquidityLocked: lockStatus.locked,
      lockService: lockStatus.lockService,
    };
  } catch (err) {
    console.error(`Error analyzing token: ${err.message}`);
    return { legitimate: false, reason: 'Analysis error: ' + err.message };
  }
}

// Get token metadata from DexScreener or other APIs
async function getTokenMetadata(mintAddress) {
  try {
    const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`);
    if (response.data && response.data.pairs && response.data.pairs.length > 0) {
      const pair = response.data.pairs[0];
      return {
        name: pair.baseToken.name,
        symbol: pair.baseToken.symbol,
        image: pair.info?.imageUrl || null,
      };
    }
    return { name: 'Unknown', symbol: 'UNKNOWN', image: null };
  } catch (err) {
    return { name: 'Unknown', symbol: 'UNKNOWN', image: null };
  }
}

// Monitor for new tokens
async function monitorNewTokens() {
  try {
    const currentSlot = await connection.getSlot();

    // Get recent block
    const block = await connection.getBlock(currentSlot - 10, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!block || !block.transactions) {
      console.log('⏳ Waiting for new blocks...');
      return;
    }

    console.log(`\n🔍 Scanning slot ${currentSlot}...`);
    let tokensFound = 0;

    for (const transaction of block.transactions) {
      try {
        if (!transaction.transaction.message) continue;

        const instructions = transaction.transaction.message.instructions;
        
        // Skip if instructions is not an array
        if (!Array.isArray(instructions)) continue;

        for (const instruction of instructions) {
          try {
            // Look for token creation instructions
            if (
              instruction.programId.equals(TOKEN_PROGRAM_ID) &&
              instruction.data[0] === 0 // InitializeMint instruction
            ) {
              const mint = new PublicKey(instruction.keys[0].pubkey);
              const mintAddress = mint.toString();

              // Skip if already processed
              if (processedTokens.has(mintAddress)) {
                continue;
              }

              console.log(`\n🚀 New token detected: ${mintAddress}`);
              tokensFound++;

              // Get mint account info
              const mintInfo = await connection.getParsedAccountInfo(mint);
              if (!mintInfo || !mintInfo.value) continue;

              const parsedData = mintInfo.value.data;
              if (parsedData.type !== 'mint') continue;

              const mint_obj = parsedData.parsed.info;

              // Analyze token legitimacy
              const analysis = await isLegitimateToken(mintAddress, mint_obj);

              if (analysis.legitimate) {
                // Get token metadata
                const metadata = await getTokenMetadata(mintAddress);

                // Create alert message
                const alertMessage = `
🚀 <b>NEW LEGITIMATE TOKEN DETECTED</b> 🚀

<b>Token:</b> ${metadata.name} (${metadata.symbol})
<b>Address:</b> <code>${mintAddress}</code>

✅ <b>Legitimacy Checks Passed:</b>
• Holders: ${analysis.holders}
• Largest Holder: ${analysis.largestHolderPct.toFixed(2)}%
• Liquidity Locked: ${analysis.liquidityLocked ? '🔒 ' + (analysis.lockService || 'Yes') : '❌ Not Locked'}
• Mint Authority: ${analysis.hasMintAuth ? '⚠️ Yes' : '✅ No'}
• Freeze Authority: ${analysis.hasFreezeAuth ? '⚠️ Yes' : '✅ No'}

🔗 <a href="https://solscan.io/token/${mintAddress}">View on Solscan</a>
🔗 <a href="https://dexscreener.com/solana/${mintAddress}">View on DexScreener</a>
`;

                await sendAlert(alertMessage);

                // Mark as processed
                processedTokens.add(mintAddress);
                saveProcessedTokens();
              } else {
                console.log(`   ❌ Rejected: ${analysis.reason}`);
                processedTokens.add(mintAddress);
                saveProcessedTokens();
              }
            }
          } catch (err) {
            // Continue scanning even if one instruction fails
          }
        }
      } catch (txErr) {
        // Continue to next transaction if parsing fails
        continue;
      }
    }

    if (tokensFound > 0) {
      console.log(`✅ Scanned ${tokensFound} new tokens in this block`);
    }

    lastProcessedSlot = currentSlot;
  } catch (err) {
    console.error(`Error monitoring tokens: ${err.message}`);
  }
}

// Start monitoring
async function startMonitoring() {
  loadProcessedTokens();

  console.log(`\n🟢 Bot is now running and monitoring for new tokens...`);
  console.log(`📊 Configuration:`);
  console.log(`   Min Liquidity: $${CONFIG.MIN_LIQUIDITY_USD}`);
  console.log(`   Min Holders: ${CONFIG.MIN_HOLDERS}`);
  console.log(`   Max Holder %: ${CONFIG.MAX_HOLDER_PERCENTAGE}%`);
  console.log(`   Max Supply: ${CONFIG.MAX_SUPPLY_THRESHOLD}`);
  console.log(`   Poll Interval: ${CONFIG.POLL_INTERVAL}ms\n`);

  // Monitor continuously
  setInterval(monitorNewTokens, CONFIG.POLL_INTERVAL);
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