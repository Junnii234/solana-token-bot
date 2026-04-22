require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAEKc_ORnq15WQHIR1jbKqh7psZfUcSCAcQ";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const alertedMints = new Set();
const HEADERS = { 'Content-Type': 'application/json' };

// ==================== TRUSTED HOT WALLETS ====================
const APPROVED_FUNDERS = [
    "BY4StcU9Y2BpgH8quZzorg31EGE4L1rjomN8FNsCBEcx", "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9", 
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
    "gasTzr94Pmp4Gf8vknQnqxeYxdgwFjbgdJa4msYRpnB"
];

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] 🟢 ${msg}`);
const reject = (reason) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️ REJECT: ${reason}`);

// ==================== CHECK PORTFOLIO ====================
async function checkPortfolioHealth(creator) {
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

        return { isRugger: dumpedCount > 5, count: dumpedCount };
    } catch (e) { return { isRugger: false, count: 0 }; }
}

// ==================== FIND FUNDER ====================
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

// ==================== DETECTION CORE ====================
async function analyzeDev(creator) {
    try {
        log(`🔍 Checking Dev: ${creator.slice(0, 8)}...`);

        // 1. Balance Check (0.2 SOL Minimum)
        const balRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getBalance", params: [creator]
        }, { headers: HEADERS });
        const balance = (balRes.data.result.value || 0) / 1e9;

        if (balance < 0.2) {
            reject(`Low Balance: ${balance.toFixed(3)} SOL`);
            return null;
        }

        // 2. Rug History Check
        const health = await checkPortfolioHealth(creator);
        if (health.isRugger) {
            reject(`Serial Rugger: ${health.count} empty tokens found.`);
            return null;
        }

        // 3. Funding Source (CEX Filter)
        const sigRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 100 }]
        }, { headers: HEADERS });

        const txs = sigRes.data.result || [];
        if (txs.length === 0) return null;

        const oldestTx = txs[txs.length - 1];
        const funder = await getFundingSource(oldestTx.signature, creator);

        if (!APPROVED_FUNDERS.includes(funder)) {
            reject(`Untrusted Funder: ${funder.slice(0, 8)}...`);
            return null;
        }

        const age = ((Math.floor(Date.now() / 1000) - oldestTx.blockTime) / 86400).toFixed(1);

        log(`✅ MATCH: Balance ${balance} | Age ${age}d | Funder: Trusted`);
        return { balance, age, funder: "Trusted Hot Wallet" };

    } catch (e) { return null; }
}

// ==================== MAIN START ====================
function start() {
    log("📡 Bot Started - Filter: 0.2 SOL + Trusted CEX Funding");
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => ws.send(JSON.stringify({ "method": "subscribeNewToken" })));

    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        if (event.mint && !alertedMints.has(event.mint)) {
            alertedMints.add(event.mint);
            
            const devData = await analyzeDev(event.traderPublicKey);
            if (devData) {
                const msg = `💎 **CEX-FUNDED DEV ALERT** 💎\n\n` +
                            `🏷️ **Symbol:** ${event.symbol}\n` +
                            `📋 **Mint:** \`${event.mint}\`\n\n` +
                            `📊 **STATS:**\n` +
                            `• Balance: ${devData.balance.toFixed(2)} SOL\n` +
                            `• Wallet Age: ${devData.age} Days\n` +
                            `• Funding: ✅ ${devData.funder}\n\n` +
                            `🔗 [View on Pump.Fun](https://pump.fun/${event.mint})`;

                bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
            }
        }
    });

    ws.on('close', () => setTimeout(start, 5000));
}

start();
