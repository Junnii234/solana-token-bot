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

const STAGES = {
    BONDING_CURVE: 'bonding_curve',
    LIQUIDITY_POOL: 'liquidity_pool',
    MATURE: 'mature',
    TARGET_BUYER_CHECK: 'target_buyer_check'
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==================== TARGET BUYERS (CABAL) ====================
const TARGET_BUYERS = [
    "2tgUbS9UMoQD6GkDZBiqKYCURnGrSb6ocYwRABrSJUvY", "8psNvWTrdNTiVRNzAgsou9kETXNJm2SXZyaKuJraVRtf",
    "omegoMAe1AMY5MFKQQr3JwXVy8F4eCvmBAfcpo8X", "35dszeQQQzkMvjcmyrPWPnN5ZyK9ZjYkNp9kKXZWMvji",
    "mP4tnNkwAtRLpSZG5CqcH3CVPJHgVw7XH3j6YRyayQP", "HV1KXxWFaSeriyFvXyx48FqG9BoFbfinB8njCJonqP7K",
    "54Pz1e35z9uoFdnxtzjp7xZQoFiofqhdayQWBMN7", "52oc72vjNbpUhF7jNE1pPAvc17JwBTyxybFp3u7PvetG",
    "AYXW3wur6D9qs2x1sBZ4DvRfMeSdDDG4fhzEbW13", "Sirius6CrwpvKKokCejugLfjyUcqVPZawScz6DqxWjA",
    "73K3hQdUpBFKPMCGmfVWM6vR6b7UNt1Ytfg5Lv5D", "FoHJUYThke7eXqtCe62zRxTx1uKXkmg3DRvC94JBgVRy",
    "CBoKT2eteDiokehKuRfWfE7Caf7A4GBtn3YFEbDfu3DM", "4xDsmeTWPNjgSVSS1VTfzFq3iHZhp77ffPkAmkZk",
    "7iWnBRRhBCiNXXPhqiGzvvBkKrvFSWqqmxRyu9VyYBxE", "7JCe3GHwkEr3feHgtLXnmuJ1yB3A7coSeyynxTBgdG8k",
    "7iVCXQn4u6tiTEfNVqbWSEsRdEi69E9oYsSMiepuECwi", "4ioQkQWteGibpoCUSV2zadyqkSF4VvnUaGnffGNhsamr",
    "9wLN6VkQjhTsGUWGyY3JxqfyEPQAj1yXYXT37oaCzyCx", 
    "DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm",
    "HatjYt6MN1rqkW8NGwJqetPY1QC5kRtBHLoKy2si"
];

// Trusted funders list (Aapki original list)
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
    "gasTzr94Pmp4Gf8vknQnqxeYxdgwFjbgdJa4msYRpnB", "9obNtb5GyUegcs3a1CbBkLuc5hEWynWfJC6gjz5uWQkE",
    "2snHHreXbpJ7UwZxPe37gnUNf7Wx7wv6UKDSR2JckKuS"
];

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] 🟢 ${msg}`);
const reject = (reason) => console.log(`[${new Date().toLocaleTimeString()}] 🔴 REJECT: ${reason}`);

// ==================== PHASE 1: BONDING CURVE ====================
async function analyzeBondingCurvePhase(creator, mintAddress, symbol) {
    try {
        const balRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getBalance", params: [creator]
        }, { headers: HEADERS });
        
        const balance = (balRes.data.result?.value || 0) / 1e9;
        if (balance < 0.1) return false; // Minimum balance check

        const sigRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 5 }]
        }, { headers: HEADERS });

        const txs = sigRes.data.result || [];
        if (txs.length === 0) return false;

        const oldestTx = txs[txs.length - 1];
        const funder = await getFundingSource(oldestTx.signature, creator);
        
        if (!APPROVED_FUNDERS.includes(funder)) return false;

        monitoredTokens.set(mintAddress, {
            stage: STAGES.BONDING_CURVE,
            lastCheck: Date.now(),
            creator,
            symbol,
            funder
        });
        return true;
    } catch (e) { return false; }
}

// ==================== PIPELINE EXECUTION ====================
async function processPipeline(mintAddress, creator, symbol) {
    // Stage 1: Basic Checks
    const p1 = await analyzeBondingCurvePhase(creator, mintAddress, symbol);
    if (!p1) return;

    log(`✅ P1 Pass: ${symbol}. Scanning Holders...`);

    // Stage 2 & 3: Fast Holder Analysis (Real-time)
    const holders = await getRealTokenTopHolders(mintAddress);
    if (holders.length === 0) return;

    // Phase 2 Logic: Concentration check (Bonding curve ko nikaal kar)
    const filteredHolders = holders.filter(h => h.percentage < 90); 
    const top10Concentration = filteredHolders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);

    if (top10Concentration > 50) {
        reject(`${symbol} - Top holders hold ${top10Concentration.toFixed(2)}%. Risky.`);
        return;
    }

    // Phase 4 Logic: Target Buyer Strict Check
    const matched = filteredHolders.filter(h => TARGET_BUYERS.includes(h.address));

    if (matched.length > 0) {
        log(`🎯 TARGET BUYER FOUND IN ${symbol}!`);
        sendAlert(mintAddress, symbol, matched);
    } else {
        log(`❌ No target buyers in ${symbol}`);
    }
}

// ==================== HELPERS ====================
async function getRealTokenTopHolders(mintAddress) { 
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mintAddress]
        }, { headers: HEADERS });
        
        const accounts = res.data.result?.value || [];
        return accounts.map(acc => ({
            address: acc.address,
            percentage: (acc.uiAmount / 1000000000) * 100
        }));
    } catch (e) { return []; } 
}

async function getFundingSource(signature, creator) {
    try {
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

function sendAlert(mintAddress, symbol, matchedWallets) {
    const matchedText = matchedWallets.map(h => `\`${h.address}\` (${h.percentage.toFixed(2)}%)`).join('\n');
    
    const msg = `🚨 **TARGET BUYER DETECTED (CABAL)** 🚨\n\n` +
                `🏷️ **Token:** ${symbol}\n` +
                `📝 **Mint:** \`${mintAddress}\`\n\n` +
                `🎯 **Matched Wallets:**\n${matchedText}\n\n` +
                `🔗 [DexScreener](https://dexscreener.com/solana/${mintAddress}) | [Birdeye](https://birdeye.so/token/${mintAddress}?chain=solana)`;

    bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
}

function start() {
    log("🤖 Bot Active - Fast Scan Mode (No Delays)");
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => ws.send(JSON.stringify({ "method": "subscribeNewToken" })));

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (event.mint && event.traderPublicKey && !monitoredTokens.has(event.mint)) {
                processPipeline(event.mint, event.traderPublicKey, event.symbol);
            }
        } catch (e) {}
    });

    ws.on('close', () => setTimeout(start, 5000));
}

start();
