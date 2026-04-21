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
// Yahan aap un Hot Wallets ke addresses add karein jinhe aap pass karna chahte hain
const APPROVED_FUNDERS = [
    "BY4StcU9Y2BpgH8quZzorg31EGE4L1rjomN8FNsCBEcx", // Example HTX Hot Wallet
    "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9", 
    "8BYUixL8tyEfPy7ejMAHq8kPndYqwBs7pqrwzgTGVmE1",
    "7GDU58vgKnwee48tn1mn4v9KZDj9aTwiPZrgBf1Ffg5g",
    "5MucoZNkyy2WuZDThwu1iFY73uXsgGc8TNmd5wTsUai",
    "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE",
    "CEMipnSkGWH4Xu1hrfRchRH5n8DjoAndTuM6HAKEr7kz",
    "BF1Q9Ve714jz7r2i4dmudiu94EzDAZWtU7gDopfeE5Be",
    "GkNkdM5CxAUjnCyX3XAXv4q7vBgtFWjDcyjP9xCGQkym",
    "HxnooTfbqmgBYzYw6rNtNfC8bMQNz2u1FKt3u89FbXef",
    "CHLRvdHt2MedrCQSnbxTGnUn6rq4G4sPLzdX5tvEUKcs",
    "43DbAvKxhXh1oSxkJSqGosNw3HpBnmsWiak6tB5wpecN",
    "H4YJ7ESVkiiP9tGeQJy9jKVSHk98tSAUD3LqTowH9tEY",
    "D8cJRpXaCWVK8c3doDq7Ymoz2XE4WyhFhbgNytWwqptA",
    "7fxc53tKLwxdc52D3kGF9h9aPEQWYTa7ivZfhAFYbtB4",
    "Mihso7kXXNPb7GUZ71H7MedYrpW88MTQFdLKrtAnDvj",
    "FLiPgesZ6ZkLgdXgQGaGwoNP2Pjvbma3NabMATa6wUvf",
    "FVQJbPMNepm1ApAyADTT8RuQtrzTFJ1gpMX6RUsiLMN4",
    "GHPSE7WU2CqrbbBfT97JDV49k44zWUuFquBJjNMBfsEQ",
    "Aro9v6WAgJzjNiSX24HDDkghLFXaYZbK5sNu27f3CTnm",
    "2MBVhDXeesy7kVyRSi6dVaFjJB1CzMttZupejiPGVb7d",
    "2mFPdRv6UbMkk7jmwa6TyQMpA9WmuxCCGAAk4v3ZsTvG",
    "DbVkKMhM9kLqj6SiCYpdKNnm791opJxWQ2BV8r2afkgR",
    "2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm",
    "EPj6VRcqbkMUf9gKnJPSAPUsUYeosNYvnUhfZdwoqRaL",
    "637eDTSJUGq5FXGmQSqsXcF31GTYhXxv2E3F91T971E2",
    "F58LFGbv7wCEbsMkHZZqRmESc5KVVsp7A8iLCb4U7zdr",
    "GaCagzu8WJDVqWG35NnA1kApMJrpUhD3Dmp98SaUpNR6",
    "6brjeZNfSpqjWoo16z1YbywKguAruXZhNz9bJMVZE8pD",
    "AbdxrST5risqoSDB76Yk6cvGJRdrHrGXxUrZ4VxZHGZU",
    "BJrehmBvNPcFEJFmWw5j5ueMPLx4A2E2EuqrZc2UWbXA",
    "FmkhcxraS4T4fKTJSX3a5utXAsbEPwubVyQptK1ukArD",
    "9bc61xemFMSZBsQZp59zQppw3sGXrPhRkxrdVBtip6om",
    "A2CHbXxQSfjTUT3cpbdKnZJVh3YWLZwWciFqdviypH5x",
    "HHYQJpCJAJSuvX6dKuiZgZL6ndu17PpJNWS5PHKKxcuv",
    "DoAsxPQgiyAxyaJNvpAAUb2ups6rbJRdYrCPyWxwRxBb",
    "DSYq7yD7ewHeDETSWFZZQzPYhGEdtNs1YCu3RduCUHCT",
    "mt6aMVg1e1ZfsjaqworY628CDiSWLphrtxykjHSwqdj",
    "FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5",
    "3pnE2ZWsRswFRFaWjQ7GhH7hMfzpVhxTRK8SqLFpkfXV",
    "gasTzr94Pmp4Gf8vknQnqxeYxdgwFjbgdJa4msYRpnB"

    
    
    // Example Binance Hot Wallet
    // "YAHAN_APNA_ADDRESS_DAALEIN"
];

/* FILHAL KE LIYE COMMENTED OUT
const STABLE_MINTS = [
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    "Es9vMFrzaDC6VupbhS8qM33iS6f2jV5zaUEJz3OtZ1m"  // USDT
];
*/

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] 🟢 ${msg}`);
const reject = (reason) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️ REJECT: ${reason}`);

// ==================== PORTFOLIO HEALTH CHECK ====================

async function checkPortfolioHealth(creator) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1,
            method: "getTokenAccountsByOwner",
            params: [creator, { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, { encoding: "jsonParsed" }]
        }, { headers: HEADERS, timeout: 8000 });

        const accounts = res.data.result?.value || [];
        let qualityAssets = 0;
        let dumpedTokensCount = 0;

        for (const acc of accounts) {
            const info = acc.account.data.parsed.info;
            const amount = info.tokenAmount.uiAmount;

            // Sirf kachra/rugged tokens count kar rahe hain
            if (amount <= 0.000001) {
                dumpedTokensCount++; 
            } else {
                qualityAssets++;
            }
        }

        // CRITICAL FILTER: Agar 3 se zyada dumped/zero-value tokens hain, toh Serial Rugger hai.
        const isRugger = dumpedTokensCount > 3;
        
        return { qualityAssets, dumpedTokensCount, isRugger };
    } catch (e) {
        return { qualityAssets: 0, dumpedTokensCount: 0, isRugger: true };
    }
}

// ==================== FUNDING SOURCE CHECK ====================

async function getFundingSource(signature, creator) {
    try {
        const txRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1,
            method: "getTransaction",
            params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
        }, { headers: HEADERS, timeout: 8000 });

        const instructions = txRes.data.result?.transaction?.message?.instructions || [];
        
        for (const ix of instructions) {
            if (ix.program === "system" && ix.parsed?.type === "transfer") {
                const info = ix.parsed.info;
                if (info.destination === creator) {
                    return info.source;
                }
            }
        }
        return "Unknown";
    } catch (e) {
        return "Error";
    }
}

// ==================== CORE DETECTION LOGIC ====================

async function checkWarmWallet(creator) {
    try {
        log(`   🔍 Scanning Wallet: ${creator.slice(0, 10)}...`);
        const now = Math.floor(Date.now() / 1000);

        // 1. Portfolio & Rug History Check
        const health = await checkPortfolioHealth(creator);
        
        if (health.isRugger) {
            reject(`Rug Pattern: Found ${health.dumpedTokensCount} dumped tokens.`);
            return { warm: false };
        }

        /* HIGH QUALITY ASSET FILTER - COMMENTED OUT AS REQUESTED
        if (!health.stableFound) {
            reject(`No Stables: Professional devs hold USDC/USDT.`);
            return { warm: false };
        }
        */

        // 2. Balance Check (2+ SOL)
        const balRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getBalance", params: [creator]
        }, { headers: HEADERS });
        const solBalance = (balRes.data.result.value || 0) / 1e9;

        if (solBalance < 2) {
            reject(`Low Balance: ${solBalance.toFixed(2)} SOL`);
            return { warm: false };
        }

        // 3. Age & Funder Check
        const sigRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1,
            method: "getSignaturesForAddress",
            params: [creator, { limit: 500 }]
        }, { headers: HEADERS });

        const txs = sigRes.data.result || [];
        if (txs.length < 100) {
            reject(`Low Activity: Only ${txs.length} txs.`);
            return { warm: false };
        }

        const oldestTx = txs[txs.length - 1]; 
        const ageDays = (now - oldestTx.blockTime) / 86400;

        if (ageDays < 10) {
            reject(`Wallet too new: ${ageDays.toFixed(1)} days.`);
            return { warm: false };
        }

        // Funder Check Logic
        const funderAddress = await getFundingSource(oldestTx.signature, creator);
        let funderNote = `Funder: ${funderAddress.slice(0,6)}...`;
        
        if (APPROVED_FUNDERS.length > 0) {
            if (!APPROVED_FUNDERS.includes(funderAddress)) {
                reject(`Untrusted Funder: ${funderAddress} (Not in Hot Wallet list)`);
                return { warm: false };
            }
            funderNote = `🏦 Funded by: Trusted Hot Wallet`;
        }

        log(`   ✅ MOON DEV: ${ageDays.toFixed(1)}d | ${solBalance.toFixed(2)} SOL | ${funderNote}`);
        return { 
            warm: true, 
            age: ageDays.toFixed(1), 
            balance: solBalance.toFixed(2), 
            assets: health.qualityAssets,
            funderInfo: funderNote
        };

    } catch (e) {
        return { warm: false };
    }
}

// ==================== MONITORING ====================

function start() {
    log("📡 WebSocket starting - CEX Funder & Anti-Rug Filter Enabled (Stables Disabled)...");
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (event.mint && !alertedMints.has(event.mint)) {
                alertedMints.add(event.mint);
                
                const wallet = await checkWarmWallet(event.traderPublicKey);
                
                if (wallet.warm) {
                    const msg = `💎 **PREMIUM CEX-FUNDED DEV** 💎\n\n` +
                                `🏷️ **Token:** ${event.symbol}\n` +
                                `📋 **Mint:** \`${event.mint}\`\n\n` +
                                `📊 **DEV METRICS:**\n` +
                                `• Age: ${wallet.age} Days\n` +
                                `• Balance: ${wallet.balance} SOL\n` +
                                `• Portfolio: Clean (Low Rug History)\n` +
                                `• ${wallet.funderInfo}\n\n` +
                                `🔗 [Pump.Fun](https://pump.fun/${event.mint})`;

                    bot.sendMessage(TELEGRAM_CHAT_ID, msg, { 
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true 
                    });
                }
            }
        } catch (e) {
            console.error("Msg Error:", e.message);
        }
    });

    ws.on('close', () => setTimeout(start, 5000));
}

start();
