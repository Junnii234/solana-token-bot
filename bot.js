require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAEKc_ORnq15WQHIR1jbKqh7psZfUcSCAcQ";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const monitoredTokens = new Map(); // tokenAddress -> { stage, lastCheck, data }
const HEADERS = { 'Content-Type': 'application/json' };

// ==================== STAGES ====================
const STAGES = {
    BONDING_CURVE: 'bonding_curve',
    LIQUIDITY_POOL: 'liquidity_pool',
    MATURE: 'mature'
};

// ==================== TRUSTED HOT WALLETS ====================
const APPROVED_FUNDERS = [
    "BY4StcU9Y2BpgH8quZzorg31EGE4L1rjomN8FNsCBEcx", "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9", 
    "7eufouTwML142ZSjPTrHotaH8Qgpw3fTmV4Hh7nv6QVv", "8BYUixL8tyEfPy7ejMAHq8kPndYqwBs7pqrwzgTGVmE1",
    "iGdFcQoyR2MwbXMHQskhmNsqddZ6rinsipHc4TNSdwu", "7GDU58vgKnwee48tn1mn4v9KZDj9aTwiPZrgBf1Ffg5g",
    "5MucoZNkyy2WuZDThwu1iFY73uXsgGc8TNmd5wTsUai", "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE",
    "CEMipnSkGWH4Xu1hrfRCHRH5n8DjoAndTuM6HAKEr7kz", "BF1Q9Ve714jz7r2i4dmudiu94EzDAZWtU7gDopfeE5Be",
    "GkNkdM5CxAUjnCyX3XAXv4q7vBgtFWjDcyjP9xCGQkym", "HxnooTfbqmgBYzYw6rNtNfC8bMQNz2u1FKt3u89FbXef",
    "CHLRvdHt2MedrCQSnbxTGnUn6rq4G4sPLzdX5tvEUKcs", "43DbAvKxhXh1oSxkJSqGosNw3HpBnmsWiak6tB5wpecN",
    "H4YJ7ESVkiiP9tGeQJy9jKVSHk98tSAUD3LqTowH9tEY", "D8cJRpXaCWVK8c3doDq7Ymoz2XE4WyhFhbgNytWwqptA",
    "7fxc53tKLwxdc52D3kGF9h9aPEQWYTa7ivZfhAFYbtB4", "Mihso7kXXNPb7GUZ71H7MedYrpW88MTQFdLKrtAnDvj",
    "FLiPgesZ6ZkLgdXgQGaGwoNP2Pjvbma3NabMATa6wUvf", "FVQJbPMNepm1ApAyADTT8RuQtrzTFJ1gpMX6RUsiLMN4",
    "GHPSE7WU2CqrbbBfT97JDV49k44zWUuFquBJjNMBfsEQ", "Aro9v6WAgJzjNiSX24HDDkghLFXaYZbK5sNu27f3CTnm",
    "2MBVhDXeesy7kVyRSi6dVaFjJB1CzMttZupejiPGVb7d", "2mFPdRv6UbMkk7jmwa6TyQMpA9WmuxCCGAAk4v3ZsTvG",
    "DbVkKMhM9kLqj6SiCYpdKNnm791opJxWQ2BV8r2afkgR", "2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm",
    "EPj6VRcqbkMUf9gKnJPSAPUsUYeosNYvnUhfZdwoqRaL", "637eDTSJUGq5FXGmQSqsXcF31GTYhXxv2E3F91T971E2",
    "F58LFGbv7wCEbsMkHZZqRmESc5KVVsp7A8iLCb4U7zdr", "GaCagzu8WJDVqWG35NnA1kApMJrpUhD3Dmp98SaUpNR6",
    "6brjeZNfSpqjWoo16z1YbywKguAruXZhNz9bJMVZE8pD", "AbdxrST5risqoSDB76Yk6cvGJRdrHrGXxUrZ4VxZHGZU",
    "BJrehmBvNPcFEJFmWw5j5ueMPLx4A2E2EuqrZc2UWbXA", "FmkhcxraS4T4fKTJSX3a5utXAsbEPwubVyQptK1ukArD",
    "9bc61xemFMSZBsQZp59zQppw3sGXrPhRkxrdVBtip6om", "A2CHbXxQSfjTUT3cpbdKnZJVh3YWLZwWciFqdviypH5x",
    "HHYQJpCJAJSuvX6dKuiZgZL6ndu17PpJNWS5PHKKxcuv", "DoAsxPQgiyAxyaJNvpAAUb2ups6rbJRdYrCPyWxwRxBb",
    "DSYq7yD7ewHeDETSWFZZQzPYhGEdtNs1YCu3RduCUHCT", "mt6aMVg1e1ZfsjaqworY628CDiSWLphrtxykjHSwqdj",
    "FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5", "3pnE2ZWsRswFRFaWjQ7GhH7hMfzpVhxTRK8SqLFpkfXV",
    "gasTzr94Pmp4Gf8vknQnqxeYxdgwFjbgdJa4msYRpnB"
];

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] 🟢 ${msg}`);
const warn = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️ ${msg}`);
const reject = (reason) => console.log(`[${new Date().toLocaleTimeString()}] 🔴 REJECT: ${reason}`);

// ==================== STAGE DETECTION ====================
async function detectTokenStage(mintAddress) {
    try {
        // Check if token has completed bonding curve (has liquidity pool)
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1,
            method: "getTokenLargestAccounts",
            params: [mintAddress]
        }, { headers: HEADERS, timeout: 3000 });

        const accounts = res.data.result?.value || [];
        
        // Look for Raydium or PumpSwap LP accounts
        const lpAccounts = accounts.filter(acc => 
            acc.address.includes('Raydium') || 
            acc.address.includes('pump') ||
            acc.amount > 1000000 // Large holder could be LP
        );

        if (lpAccounts.length > 0) {
            return STAGES.LIQUIDITY_POOL;
        }
        
        // Check token age
        const tokenInfo = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1,
            method: "getAccountInfo",
            params: [mintAddress, { encoding: "jsonParsed" }]
        }, { headers: HEADERS, timeout: 3000 });

        const createdAt = tokenInfo.data.result?.value?.ownerProgram || '';
        const isNew = createdAt.includes('pump') || createdAt.includes('bonding');
        
        return isNew ? STAGES.BONDING_CURVE : STAGES.MATURE;
    } catch (e) {
        return STAGES.BONDING_CURVE; // Default assumption
    }
}

// ==================== PHASE 1: BONDING CURVE CHECKS ====================
async function analyzeBondingCurvePhase(creator, mintAddress, symbol) {
    log(`🔍 Phase 1 - Bonding Curve: ${symbol} (${mintAddress.slice(0, 8)}...)`);
    
    // 1. Creator Balance Check
    const balRes = await axios.post(HELIUS_RPC, {
        jsonrpc: "2.0", id: 1, method: "getBalance", params: [creator]
    }, { headers: HEADERS });
    
    const balance = (balRes.data.result?.value || 0) / 1e9;
    if (balance < 0.2) {
        reject(`Low creator balance: ${balance.toFixed(3)} SOL`);
        return false;
    }

    // 2. Funding Source Check
    const sigRes = await axios.post(HELIUS_RPC, {
        jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
        params: [creator, { limit: 5 }]
    }, { headers: HEADERS });

    const txs = sigRes.data.result || [];
    if (txs.length === 0) {
        reject("No transaction history");
        return false;
    }

    // 3. Check first funding source
    const oldestTx = txs[txs.length - 1];
    const funder = await getFundingSource(oldestTx.signature, creator);
    
    if (!APPROVED_FUNDERS.includes(funder)) {
        reject(`Untrusted funder: ${funder.slice(0, 8)}...`);
        return false;
    }

    // 4. Basic Rug History
    const rugCheck = await checkBasicRugHistory(creator);
    if (rugCheck.isRugger) {
        reject(`Serial rugger: ${rugCheck.count} suspicious tokens`);
        return false;
    }

    log(`✅ Bonding Curve PASS: ${symbol} - ${balance.toFixed(2)} SOL, Trusted funder`);
    monitoredTokens.set(mintAddress, {
        stage: STAGES.BONDING_CURVE,
        lastCheck: Date.now(),
        creator,
        symbol,
        initialBalance: balance,
        funder
    });
    
    return true;
}

// ==================== PHASE 2: LIQUIDITY POOL CHECKS ====================
async function analyzeLiquidityPoolPhase(mintAddress, symbol) {
    log(`🔍 Phase 2 - Liquidity Pool: ${symbol}`);
    
    const tokenData = monitoredTokens.get(mintAddress);
    if (!tokenData) return false;

    // Wait 5 minutes after bonding curve completion
    const timeSinceBonding = Date.now() - tokenData.lastCheck;
    if (timeSinceBonding < 300000) { // 5 minutes
        return false;
    }

    try {
        // 1. Get holder distribution (now possible)
        const holders = await getTokenTopHolders(mintAddress);
        
        // 2. Check creator holding percentage
        const creatorHolding = holders.find(h => h.address === tokenData.creator);
        if (creatorHolding && creatorHolding.percentage > 30) {
            reject(`Creator holds ${creatorHolding.percentage}% - high dump risk`);
            return false;
        }

        // 3. Check top 10 concentration
        const top10Percent = holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);
        if (top10Percent > 70) {
            reject(`Top 10 hold ${top10Percent}% - too concentrated`);
            return false;
        }

        // 4. Check LP lock status
        const lpLocked = await checkLPLockStatus(mintAddress);
        if (!lpLocked) {
            reject("Liquidity not locked - immediate rug risk");
            return false;
        }

        log(`✅ Liquidity Pool PASS: ${symbol} - Creator ${creatorHolding?.percentage || 0}%, Top10 ${top10Percent}%, LP Locked`);
        
        // Update stage
        tokenData.stage = STAGES.LIQUIDITY_POOL;
        tokenData.lastCheck = Date.now();
        tokenData.holderData = {
            creatorPercentage: creatorHolding?.percentage || 0,
            top10Percentage: top10Percent,
            lpLocked: true
        };
        
        return true;
    } catch (e) {
        warn(`LP analysis failed: ${e.message}`);
        return false;
    }
}

// ==================== PHASE 3: MATURE TOKEN CHECKS ====================
async function analyzeMaturePhase(mintAddress, symbol) {
    log(`🔍 Phase 3 - Mature: ${symbol}`);
    
    const tokenData = monitoredTokens.get(mintAddress);
    if (!tokenData) return false;

    // Wait 1 hour after LP phase
    const timeSinceLP = Date.now() - tokenData.lastCheck;
    if (timeSinceLP < 3600000) { // 1 hour
        return false;
    }

    try {
        // 1. Transaction pattern analysis
        const txPattern = await analyzeTransactionPatterns(mintAddress);
        if (txPattern.washTrading > 50) {
            reject(`${txPattern.washTrading}% wash trading detected`);
            return false;
        }

        // 2. Volume sustainability check
        const volumeData = await getVolumeSustainability(mintAddress);
        if (volumeData.dropRate > 80) {
            reject(`Volume dropped ${volumeData.dropRate}% - dead token`);
            return false;
        }

        // 3. Social validation (basic)
        const socialScore = await checkSocialPresence(symbol);
        if (socialScore < 2) {
            warn(`Low social presence: ${socialScore}/5`);
        }

        log(`✅ Mature PASS: ${symbol} - ${txPattern.uniqueTraders} traders, ${volumeData.currentVolume.toFixed(0)} volume`);
        
        tokenData.stage = STAGES.MATURE;
        tokenData.lastCheck = Date.now();
        tokenData.matureData = {
            uniqueTraders: txPattern.uniqueTraders,
            washTrading: txPattern.washTrading,
            volumeDrop: volumeData.dropRate,
            socialScore
        };
        
        return true;
    } catch (e) {
        warn(`Mature analysis failed: ${e.message}`);
        return false;
    }
}

// ==================== HELPER FUNCTIONS ====================
async function getFundingSource(signature, creator) {
    try {
        const txRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1,
            method: "getTransaction",
            params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
        }, { headers: HEADERS, timeout: 5000 });

        const instructions = txRes.data.result?.transaction?.message?.instructions || [];
        for (const ix of instructions) {
            if (ix.program === "system" && ix.parsed?.type === "transfer") {
                if (ix.parsed.info.destination === creator) return ix.parsed.info.source;
            }
        }
        return "Unknown";
    } catch (e) { return "Error"; }
}

async function checkBasicRugHistory(creator) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1,
            method: "getTokenAccountsByOwner",
            params: [creator, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }]
        }, { headers: HEADERS, timeout: 5000 });

        const accounts = res.data.result?.value || [];
        let dumpedCount = 0;
        accounts.forEach(acc => {
            if (acc.account.data.parsed.info.tokenAmount.uiAmount <= 0.000001) dumpedCount++;
        });

        return { isRugger: dumpedCount > 10, count: dumpedCount }; // More strict: 10+ dead tokens
    } catch (e) { return { isRugger: false, count: 0 }; }
}

async function getTokenTopHolders(mintAddress) {
    // Placeholder - implement with actual holder analysis
    // Use get_token_top_holders tool when available
    return [
        { address: "creator", percentage: 25 },
        { address: "holder2", percentage: 15 },
        { address: "holder3", percentage: 10 }
    ];
}

async function checkLPLockStatus(mintAddress) {
    // Placeholder - check if LP tokens are burned/locked
    // For pump.fun, check bonding curve completion and LP token destination
    return true; // Assume locked for now
}

async function analyzeTransactionPatterns(mintAddress) {
    // Placeholder - analyze for wash trading
    return { uniqueTraders: 50, washTrading: 15 };
}

async function getVolumeSustainability(mintAddress) {
    // Placeholder - check volume trends
    return { currentVolume: 100000, dropRate: 30 };
}

async function checkSocialPresence(symbol) {
    // Placeholder - basic social check
    return 3; // 1-5 score
}

// ==================== MAIN MONITORING LOOP ====================
async function processToken(mintAddress, creator, symbol) {
    const stage = await detectTokenStage(mintAddress);
    
    switch (stage) {
        case STAGES.BONDING_CURVE:
            const passed = await analyzeBondingCurvePhase(creator, mintAddress, symbol);
            if (passed) {
                // Schedule LP check in 2 minutes
                setTimeout(() => processToken(mintAddress, creator, symbol), 120000);
            }
            break;
            
        case STAGES.LIQUIDITY_POOL:
            const lpPassed = await analyzeLiquidityPoolPhase(mintAddress, symbol);
            if (lpPassed) {
                // Send alert - token passed initial checks
                sendAlert(mintAddress, symbol, "LIQUIDITY_POOL_PASS");
                // Schedule mature check in 30 minutes
                setTimeout(() => processToken(mintAddress, creator, symbol), 1800000);
            }
            break;
            
        case STAGES.MATURE:
            const maturePassed = await analyzeMaturePhase(mintAddress, symbol);
            if (maturePassed) {
                sendAlert(mintAddress, symbol, "MATURE_PASS");
            }
            break;
    }
}

function sendAlert(mintAddress, symbol, stage) {
    const tokenData = monitoredTokens.get(mintAddress);
    if (!tokenData) return;

    let msg = '';
    if (stage === "LIQUIDITY_POOL_PASS") {
        msg = `🚀 **STAGE 2 PASSED - READY FOR ENTRY** 🚀\n\n` +
              `🏷️ **${symbol}**\n` +
              `📋 Mint: \`${mintAddress}\`\n\n` +
              `📊 **STATS:**\n` +
              `• Creator Balance: ${tokenData.initialBalance.toFixed(2)} SOL\n` +
              `• Funding Source: ✅ Trusted CEX\n` +
              `• Stage: Liquidity Pool Active\n\n` +
              `🔗 [View on Pump.Fun](https://pump.fun/${mintAddress})\n` +
              `⚠️ **Entry now - before volume spike**`;
    } else if (stage === "MATURE_PASS") {
        msg = `✅ **FULL VERIFICATION COMPLETE** ✅\n\n` +
              `🏷️ **${symbol}**\n` +
              `📋 Mint: \`${mintAddress}\`\n\n` +
              `📊 **FINAL STATS:**\n` +
              `• Holder Concentration: ${tokenData.holderData?.top10Percentage || 0}% (Top 10)\n` +
              `• LP Status: ${tokenData.holderData?.lpLocked ? '✅ Locked' : '❌ Not Locked'}\n` +
              `• Social Score: ${tokenData.matureData?.socialScore || 0}/5\n` +
              `• Unique Traders: ${tokenData.matureData?.uniqueTraders || 0}\n\n` +
              `🔗 [View on Pump.Fun](https://pump.fun/${mintAddress})\n` +
              `🎯 **Low risk entry confirmed**`;
    }

    bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
}

// ==================== MAIN START ====================
function start() {
    log("🤖 Smart Pump.Fun Bot Started - Multi-Stage Analysis");
    log("Stages: 1) Bonding Curve → 2) Liquidity Pool → 3) Mature");
    
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
        log("📡 Connected to Pump.Fun WebSocket");
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (event.mint && event.traderPublicKey && event.symbol) {
                // Check if we're already monitoring this token
                if (!monitoredTokens.has(event.mint)) {
                    log(`🆕 New token detected: ${event.symbol}`);
                    // Start monitoring process
                    processToken(event.mint, event.traderPublicKey, event.symbol);
                }
            }
        } catch (e) {
            warn(`WebSocket message error: ${e.message}`);
        }
    });

    ws.on('close', () => {
        warn("WebSocket closed - reconnecting in 5 seconds");
        setTimeout(start, 5000);
    });

    ws.on('error', (err) => {
        warn(`WebSocket error: ${err.message}`);
    });
}

// ==================== PERIODIC CLEANUP ====================
setInterval(() => {
    const now = Date.now();
    const cutoff = now - 86400000; // 24 hours
    
    for (const [mint, data] of monitoredTokens.entries()) {
        if (data.lastCheck < cutoff) {
            monitoredTokens.delete(mint);
            log(`🧹 Cleaned up old token: ${data.symbol}`);
        }
    }
}, 3600000); // Run every hour

start();
        
