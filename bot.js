// ==================== IMPORTS ====================
import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import WebSocket from 'ws';

dotenv.config();

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID || !HELIUS_API_KEY) {
    console.error("❌ Missing ENV variables");
    process.exit(1);
}

const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const monitoredTokens = new Map();
const walletClusters = new Map();

const HEADERS = { 'Content-Type': 'application/json' };

// ==================== UTILS ====================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] 🟢 ${msg}`);
const warn = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️ ${msg}`);
const rejectLog = (msg) => console.log(`[${new Date().toLocaleTimeString()}] 🔴 ${msg}`);

// ==================== FULL TARGET BUYERS ====================
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


// ==================== RPC ====================
async function heliusRequest(method, params) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method,
            params
        }, { headers: HEADERS });

        return res.data.result;
    } catch (e) {
        if (e.response?.status === 429) {
            warn("Rate limit retry...");
            await sleep(1000);
            return heliusRequest(method, params);
        }
        return null;
    }
}

// ==================== CLUSTER ====================
function addToCluster(funder, wallet) {
    if (!walletClusters.has(funder)) {
        walletClusters.set(funder, new Set());
    }
    walletClusters.get(funder).add(wallet);
}

function getClusterScore(funder) {
    const cluster = walletClusters.get(funder);
    return cluster ? Math.min(cluster.size * 5, 30) : 0;
}

// ==================== DEV HISTORY ====================
async function analyzeDevHistory(creator) {
    const res = await heliusRequest("getTokenAccountsByOwner", [
        creator,
        { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        { encoding: "jsonParsed" }
    ]);

    let total = 0, dead = 0;

    for (const acc of res?.value || []) {
        total++;
        const amt = acc.account.data.parsed.info.tokenAmount.uiAmount;
        if (amt <= 0.000001) dead++;
    }

    return {
        totalTokens: total,
        deadTokens: dead,
        successRate: total ? ((total - dead) / total) * 100 : 0
    };
}

// ==================== HOLDERS ====================
async function getTopHolders(mint) {
    const res = await heliusRequest("getTokenLargestAccounts", [mint]);
    if (!res?.value) return [];

    return res.value.slice(0, 10).map(a => ({
        address: a.address,
        percentage: a.uiAmount
    }));
}

// ==================== PHASE 1 ====================
async function phase1(creator, mint, symbol) {
    const bal = await heliusRequest("getBalance", [creator]);
    const balance = (bal?.value || 0) / 1e9;

    if (balance < 0.2) return false;

    const dev = await analyzeDevHistory(creator);

    monitoredTokens.set(mint, { creator, symbol, dev });

    log(`✅ Phase1 ${symbol}`);
    return true;
}

// ==================== PHASE 4 ====================
async function phase4(mint) {
    const token = monitoredTokens.get(mint);
    if (!token) return;

    const holders = await getTopHolders(mint);

    const matched = holders.filter(h => TARGET_BUYERS.includes(h.address));

    let clusterScore = 0;
    for (const h of holders) {
        const f = h.address.slice(0, 6);
        addToCluster(f, h.address);
        clusterScore += getClusterScore(f);
    }

    let score = clusterScore + matched.length * 20;

    if (token.dev.successRate > 50) score += 20;
    if (token.dev.deadTokens > 10) score -= 20;

    if (score < 40) {
        rejectLog(`${token.symbol} weak`);
        return;
    }

    sendAlert(mint, token.symbol, score, matched);
}

// ==================== ALERT ====================
function sendAlert(mint, symbol, score, wallets) {
    const list = wallets.map(w => `\`${w.address}\``).join("\n");

    bot.sendMessage(TELEGRAM_CHAT_ID, `
🚨 INSIDER ALERT 🚨

Token: ${symbol}
Mint: ${mint}

Score: ${score}

Wallets:
${list}

https://dexscreener.com/solana/${mint}
`, { parse_mode: 'Markdown' });
}

// ==================== PIPELINE ====================
async function process(mint, creator, symbol) {
    const ok = await phase1(creator, mint, symbol);
    if (!ok) return;

    setTimeout(() => phase4(mint), 30000);
}

// ==================== START ====================
function start() {
    log("🚀 BOT LIVE");

    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const e = JSON.parse(data.toString());

            if (e.mint && e.traderPublicKey && e.symbol) {
                if (!monitoredTokens.has(e.mint)) {
                    process(e.mint, e.traderPublicKey, e.symbol);
                }
            }
        } catch {}
    });

    ws.on('close', () => setTimeout(start, 5000));
}

start();
