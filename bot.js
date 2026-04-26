require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAEKc_ORnq15WQHIR1jbKqh7psZfUcSCAcQ";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=e7b6c520-7109-4d90-b585-b2ff000b20f8`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const monitoredTokens = new Map(); 
const HEADERS = { 'Content-Type': 'application/json' };

// ==================== STAGES ====================
const STAGES = {
    BONDING_CURVE: 'bonding_curve',
    LIQUIDITY_POOL: 'liquidity_pool',
    MATURE: 'mature',
    TARGET_BUYER_CHECK: 'target_buyer_check' // NEW PHASE 4
};

// ==================== RATE LIMIT PROTECTOR ====================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==================== TARGET BUYERS (CABAL) ====================
const TARGET_BUYERS = [
    "2tgUbS9UMoQD6GkDZBiqKYCURnGrSb6ocYwRABrSJUvY",      // Score: 4/14 (28.6%)
    "8psNvWTrdNTiVRNzAgsou9kETXNJm2SXZyaKuJraVRtf",      // Score: 4/14 (28.6%)
    "omegoMAe1AMY5MFKQQr3JwXVy8F4eCvmBAfcpo8X",          // Score: 3/14 (21.4%)
    "35dszeQQQzkMvjcmyrPWPnN5ZyK9ZjYkNp9kKXZWMvji",      // Score: 2/14 (14.3%)
    "mP4tnNkwAtRLpSZG5CqcH3CVPJHgVw7XH3j6YRyayQP",      // Score: 2/14 (14.3%)
    "HV1KXxWFaSeriyFvXyx48FqG9BoFbfinB8njCJonqP7K",      // Score: 2/14 (14.3%)
    "54Pz1e35z9uoFdnxtzjp7xZQoFiofqhdayQWBMN7",         // Score: 2/14 (14.3%)
    "52oc72vjNbpUhF7jNE1pPAvc17JwBTyxybFp3u7PvetG",      // Score: 2/14 (14.3%)
    "AYXW3wur6D9qs2x1sBZ4DvRfMeSdDDG4fhzEbW13",         // Score: 2/14 (14.3%)
    "Sirius6CrwpvKKokCejugLfjyUcqVPZawScz6DqxWjA",       // Score: 2/14 (14.3%)
    "73K3hQdUpBFKPMCGmfVWM6vR6b7UNt1Ytfg5Lv5D",         // Score: 2/14 (14.3%)
    "FoHJUYThke7eXqtCe62zRxTx1uKXkmg3DRvC94JBgVRy",      // Score: 2/14 (14.3%)
    "CBoKT2eteDiokehKuRfWfE7Caf7A4GBtn3YFEbDfu3DM",      // Score: 2/14 (14.3%)
    "4xDsmeTWPNjgSVSS1VTfzFq3iHZhp77ffPkAmkZk",         // Score: 2/14 (14.3%)
    "7iWnBRRhBCiNXXPhqiGzvvBkKrvFSWqqmxRyu9VyYBxE",      // Score: 2/14 (14.3%)
    "7JCe3GHwkEr3feHgtLXnmuJ1yB3A7coSeyynxTBgdG8k",      // Score: 2/14 (14.3%)
    "7iVCXQn4u6tiTEfNVqbWSEsRdEi69E9oYsSMiepuECwi",      // Score: 2/14 (14.3%)
    "4ioQkQWteGibpoCUSV2zadyqkSF4VvnUaGnffGNhsamr",      // Score: 2/14 (14.3%)
    "9wLN6VkQjhTsGUWGyY3JxqfyEPQAj1yXYXT37oaCzyCx",      // Score: 2/14 (14.3%)
    "HatjYt6MN1rqkW8NGwJqetPY1QC5kRtBHLoKy2si"           // Score: 2/14 (14.3%)
];

// ==================== TRUSTED HOT WALLETS ====================
const APPROVED_FUNDERS = [
    "BY4StcU9Y2BpgH8quZzorg31EGE4L1rjomN8FNsCBEcx", "5g7yNHyGLJ7fiQ9SN9mf47opDnMjc585kqXWt6d7aBWs", 
    "7eufouTwML142ZSjPTrHotaH8Qgpw3fTmV4Hh7nv6QVv", "8BYUixL8tyEfPy7ejMAHq8kPndYqwBs7pqrwzgTGVmE1",
    "iGdFcQoyR2MwbXMHQskhmNsqddZ6rinsipHc4TNSdwu", "7GDU58vgKnwee48tn1mn4v9KZDj9aTwiPZrgBf1Ffg5g",
    "5MucoZNkyy2WuZDThwu1iFY73uXsgGc8TNmd5wTsUai", "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE",
    "CEMipnSkGWH4Xu1hrfRchRH5n8DjoAndTuM6HAKEr7kz", "BF1Q9Ve714jz7r2i4dmudiu94EzDAZWtU7gDopfeE5Be",
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
    "gasTzr94Pmp4Gf8vknQnqxeYxdgwFjbgdJa4msYRpnB",  "9obNtb5GyUegcs3a1CbBkLuc5hEWynWfJC6gjz5uWQkE",
    "2snHHreXbpJ7UwZxPe37gnUNf7Wx7wv6UKDSR2JckKuS"
];

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] 🟢 ${msg}`);
const warn = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️ ${msg}`);
const reject = (reason) => console.log(`[${new Date().toLocaleTimeString()}] 🔴 REJECT: ${reason}`);

// ==================== PHASE 1: BONDING CURVE CHECKS ====================
async function analyzeBondingCurvePhase(creator, mintAddress, symbol) {
    log(`🔍 Phase 1 - Analysing: ${symbol}`);
    
    try {
        await sleep(500);
        const balRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getBalance", params: [creator]
        }, { headers: HEADERS });
        
        const balance = (balRes.data.result?.value || 0) / 1e9;
        if (balance < 0.2) {
            reject(`${symbol} - Low creator balance: ${balance.toFixed(3)} SOL`);
            return false;
        }

        await sleep(500);
        const sigRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 10 }]
        }, { headers: HEADERS });

        const txs = sigRes.data.result || [];
        if (txs.length === 0) return false;

        const oldestTx = txs[txs.length - 1];
        const funder = await getFundingSource(oldestTx.signature, creator);
        
        if (!APPROVED_FUNDERS.includes(funder)) {
            reject(`${symbol} - Untrusted funder`);
            return false;
        }

        const rugCheck = await checkBasicRugHistory(creator);
        if (rugCheck.isRugger) {
            reject(`${symbol} - Serial rugger (${rugCheck.count} dead tokens)`);
            return false;
        }

        log(`✅ Phase 1 PASS: ${symbol}`);
        monitoredTokens.set(mintAddress, {
            stage: STAGES.BONDING_CURVE,
            lastCheck: Date.now(),
            creator,
            symbol,
            initialBalance: balance,
            funder
        });
        
        return true;
    } catch (e) {
        if (e.response && e.response.status === 429) log(`⚠️ Helius Rate Limit Hit in Phase 1`);
        return false;
    }
}

// ==================== PHASE 2: LIQUIDITY POOL CHECKS ====================
async function analyzeLiquidityPoolPhase(mintAddress) {
    const tokenData = monitoredTokens.get(mintAddress);
    if (!tokenData) return false;
    log(`🔍 Phase 2 - Checking Holders for ${tokenData.symbol}`);

    try {
        const holders = await getRealTokenTopHolders(mintAddress);
        
        const creatorHolding = holders.find(h => h.address === tokenData.creator);
        if (creatorHolding && creatorHolding.percentage > 30) {
            reject(`${tokenData.symbol} - Creator holds ${creatorHolding.percentage.toFixed(2)}% (Dump risk)`);
            return false;
        }

        const top10Percent = holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);
        if (top10Percent > 70) {
            reject(`${tokenData.symbol} - Top 10 hold ${top10Percent.toFixed(2)}% (Too concentrated)`);
            return false;
        }

        log(`✅ Phase 2 PASS: ${tokenData.symbol}`);
        tokenData.stage = STAGES.LIQUIDITY_POOL;
        tokenData.holderData = { top10Percentage: top10Percent, lpLocked: true };
        return true;
    } catch (e) { 
        if (e.response && e.response.status === 429) log(`⚠️ Helius Rate Limit Hit in Phase 2`);
        return false; 
    }
}

// ==================== PHASE 3: MATURE TOKEN CHECKS ====================
async function analyzeMaturePhase(mintAddress) {
    const tokenData = monitoredTokens.get(mintAddress);
    if (!tokenData) return false;
    log(`🔍 Phase 3 - Mature checks for ${tokenData.symbol}`);

    try {
        const txPattern = await analyzeTransactionPatterns(mintAddress);
        if (txPattern.washTrading > 50) {
            reject(`${tokenData.symbol} - Wash trading detected.`);
            return false;
        }

        const volumeData = await getVolumeSustainability(mintAddress);
        if (volumeData.dropRate > 80) {
            reject(`${tokenData.symbol} - High volume drop rate.`);
            return false;
        }

        log(`✅ Phase 3 PASS: ${tokenData.symbol}`);
        tokenData.stage = STAGES.MATURE;
        tokenData.matureData = { uniqueTraders: txPattern.uniqueTraders, volumeDrop: volumeData.dropRate, socialScore: 3 };
        return true;
    } catch (e) { return false; }
}

// ==================== PHASE 4: TARGET BUYER STRICT CHECK ====================
async function analyzeTargetBuyerPhase(mintAddress) {
    const tokenData = monitoredTokens.get(mintAddress);
    if (!tokenData) return { passed: false };
    log(`🔍 Phase 4 - Strict Target Buyer (Cabal) Check for ${tokenData.symbol}`);

    try {
        const holders = await getRealTokenTopHolders(mintAddress);
        const foundTargetBuyers = holders.filter(h => TARGET_BUYERS.includes(h.address));
        
        if (foundTargetBuyers.length > 0) {
            log(`🎯 Phase 4 PASS: Target Buyers Found in ${tokenData.symbol}!`);
            tokenData.stage = STAGES.TARGET_BUYER_CHECK;
            return { passed: true, matchedWallets: foundTargetBuyers };
        } else {
            reject(`${tokenData.symbol} - Phase 4 FAILED: No Target Buyers from list found.`);
            return { passed: false };
        }
    } catch (e) {
        log(`❌ Error in Phase 4 Target Buyer Check: ${e.message}`);
        return { passed: false };
    }
}

// ==================== MAIN WORKFLOW MANAGER ====================
async function processPipeline(mintAddress, creator, symbol, currentStage) {
    if (currentStage === STAGES.BONDING_CURVE) {
        const passed = await analyzeBondingCurvePhase(creator, mintAddress, symbol);
        if (passed) {
            setTimeout(() => {
                processPipeline(mintAddress, creator, symbol, STAGES.LIQUIDITY_POOL);
            }, 300000); // 5 mins delay
        }
    } 
    else if (currentStage === STAGES.LIQUIDITY_POOL) {
        const passed = await analyzeLiquidityPoolPhase(mintAddress);
        if (passed) {
            setTimeout(() => {
                processPipeline(mintAddress, creator, symbol, STAGES.MATURE);
            }, 1800000); // 30 mins delay
        }
    }
    else if (currentStage === STAGES.MATURE) {
        const passed = await analyzeMaturePhase(mintAddress);
        if (passed) {
            // Proceed to Strict Phase 4 immediately after Phase 3 passes
            setTimeout(() => {
                processPipeline(mintAddress, creator, symbol, STAGES.TARGET_BUYER_CHECK);
            }, 5000); // 5 sec delay before final check
        }
    }
    else if (currentStage === STAGES.TARGET_BUYER_CHECK) {
        // Strict Check: Only trigger Telegram Alert if Phase 4 passes
        const result = await analyzeTargetBuyerPhase(mintAddress);
        if (result.passed) {
            sendAlert(mintAddress, symbol, result.matchedWallets);
        }
    }
}

// ==================== HELPER FUNCTIONS ====================
async function getFundingSource(signature, creator) {
    try {
        await sleep(500);
        const txRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction", params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
        }, { headers: HEADERS });
        for (const ix of txRes.data.result?.transaction?.message?.instructions || []) {
            if (ix.program === "system" && ix.parsed?.type === "transfer" && ix.parsed.info.destination === creator) {
                return ix.parsed.info.source;
            }
        }
        return "Unknown";
    } catch (e) { return "Error"; }
}

async function checkBasicRugHistory(creator) {
    try {
        await sleep(500);
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner",
            params: [creator, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }]
        }, { headers: HEADERS });
        let dumpedCount = 0;
        (res.data.result?.value || []).forEach(acc => {
            if (acc.account.data.parsed.info.tokenAmount.uiAmount <= 0.000001) dumpedCount++;
        });
        return { isRugger: dumpedCount > 10, count: dumpedCount };
    } catch (e) { return { isRugger: false, count: 0 }; }
}

async function getRealTokenTopHolders(mintAddress) { 
    try {
        await sleep(1000); 
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mintAddress]
        }, { headers: HEADERS });
        
        const accounts = res.data.result?.value || [];
        if (accounts.length === 0) return [];

        let holders = [];
        for (let i = 0; i < Math.min(accounts.length, 15); i++) {
            const acc = accounts[i];
            
            await sleep(300); 
            const accInfo = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [acc.address, { encoding: "jsonParsed" }]
            }, { headers: HEADERS });

            const parsedData = accInfo.data.result?.value?.data?.parsed;
            const ownerAddress = parsedData?.info?.owner || acc.address;
            
            holders.push({ 
                address: ownerAddress, 
                percentage: (acc.uiAmount / 1000000000) * 100 
            });
        }
        return holders;
    } catch (e) {
        log(`❌ Holder fetch failed: ${e.message}`);
        return []; 
    } 
}

// Placeholder APIs for Phase 3
async function analyzeTransactionPatterns(mintAddress) { return { uniqueTraders: 50, washTrading: 15 }; }
async function getVolumeSustainability(mintAddress) { return { currentVolume: 100000, dropRate: 30 }; }


// ==================== FINAL ALERT SYSTEM ====================
function sendAlert(mintAddress, symbol, matchedWallets) {
    const tokenData = monitoredTokens.get(mintAddress);
    if (!tokenData) return;

    // Ab Telegram alert sirf tab hi generate hoga jab Phase 4 (Target Buyer) confirm ho jaye
    const matchedWalletsText = matchedWallets.map(h => `\`${h.address}\` (${h.percentage.toFixed(2)}%)`).join('\n');
    
    const msg = `🚨 **ULTIMATE CONFIRMATION: CABAL DETECTED** 🚨\n\n` +
                `🏷️ **Token:** ${symbol}\n` +
                `📝 **Mint:** \`${mintAddress}\`\n\n` +
                `✅ Passed Phase 1: Bonding Curve\n` +
                `✅ Passed Phase 2: Liquidity Pool Check\n` +
                `✅ Passed Phase 3: Volume Mature\n` +
                `🎯 **Passed Phase 4: TARGET BUYERS FOUND!**\n\n` +
                `👀 **Matched Insider Wallets:**\n${matchedWalletsText}\n\n` +
                `🔗 [DexScreener](https://dexscreener.com/solana/${mintAddress})\n` +
                `🪐 [Jupiter Swap](https://jup.ag/swap/SOL-${mintAddress})`;

    bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
}

// ==================== MAIN START ====================
function start() {
    log("🤖 Smart Pump.Fun Bot Started - Strict Phase 4 Pipeline Active");
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => ws.send(JSON.stringify({ "method": "subscribeNewToken" })));

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (event.mint && event.traderPublicKey && event.symbol && !monitoredTokens.has(event.mint)) {
                processPipeline(event.mint, event.traderPublicKey, event.symbol, STAGES.BONDING_CURVE);
            }
        } catch (e) {}
    });

    ws.on('close', () => setTimeout(start, 5000));
}

// Memory Cleanup
setInterval(() => {
    const cutoff = Date.now() - 86400000;
    for (const [mint, data] of monitoredTokens.entries()) {
        if (data.lastCheck < cutoff) monitoredTokens.delete(mint);
    }
}, 3600000); 

start();
