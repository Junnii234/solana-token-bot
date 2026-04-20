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

// High Quality Assets (USDC, USDT)
const STABLE_MINTS = [
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    "Es9vMFrzaDC6VupbhS8qM33iS6f2jV5zaUEJz3OtZ1m"  // USDT
];

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
        let stableFound = false;
        let qualityAssets = 0;
        let dumpedTokensCount = 0;

        for (const acc of accounts) {
            const info = acc.account.data.parsed.info;
            const amount = info.tokenAmount.uiAmount;
            const mint = info.mint;

            if (amount <= 0.000001) {
                dumpedTokensCount++; // Counting empty/rugged token accounts
            } else {
                qualityAssets++;
                if (STABLE_MINTS.includes(mint) && amount >= 5) {
                    stableFound = true;
                }
            }
        }

        // CRITICAL FILTER: 
        // Agar 3 se zyada dumped ya zero-value tokens hain, toh ignore (Serial Rugger).
        const isRugger = dumpedTokensCount > 3;

        return { stableFound, qualityAssets, dumpedTokensCount, isRugger };
    } catch (e) {
        return { stableFound: false, qualityAssets: 0, dumpedTokensCount: 0, isRugger: true };
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
        if (!health.stableFound) {
            reject(`No Stables: Professional devs hold USDC/USDT.`);
            return { warm: false };
        }

        // 2. Balance Check (2+ SOL)
        const balRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getBalance", params: [creator]
        }, { headers: HEADERS });
        const solBalance = (balRes.data.result.value || 0) / 1e9;

        if (solBalance < 2) {
            reject(`Low Balance: ${solBalance.toFixed(2)} SOL`);
            return { warm: false };
        }

        // 3. Age Check (10+ Days)
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

        log(`   ✅ MOON DEV: ${ageDays.toFixed(1)}d | ${solBalance.toFixed(2)} SOL | Assets: ${health.qualityAssets}`);
        return { 
            warm: true, 
            age: ageDays.toFixed(1), 
            balance: solBalance.toFixed(2), 
            assets: health.qualityAssets,
            dumped: health.dumpedTokensCount 
        };

    } catch (e) {
        return { warm: false };
    }
}

// ==================== MONITORING ====================

function start() {
    log("📡 WebSocket starting - Anti-Rug Filter Enabled...");
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
                    const msg = `💎 **PREMIUM MOON ALERT** 💎\n\n` +
                                `🏷️ **Token:** ${event.symbol}\n` +
                                `📋 **Mint:** \`${event.mint}\`\n\n` +
                                `📊 **DEV METRICS:**\n` +
                                `• Age: ${wallet.age} Days\n` +
                                `• Balance: ${wallet.balance} SOL\n` +
                                `• Stables: Detected ✅\n` +
                                `• Portfolio: Clean (Low Rug History)\n\n` +
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
