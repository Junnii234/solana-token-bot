require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ==================== CONFIG ====================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";

// ⚠️ Better: put full URL in .env
const HELIUS_RPC = process.env.HELIUS_RPC || "https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

const alertedMints = new Set();
const graduatedMints = new Set();

const HEADERS = { "Content-Type": "application/json" };

// ==================== LOG HELPERS ====================

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const error = (msg) => console.error(`[${new Date().toLocaleTimeString()}] ❌ ${msg}`);
const reject = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️ REJECT: ${msg}`);

// ==================== WALLET ANALYSIS ====================

async function checkWarmWallet(creator) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getSignaturesForAddress",
            params: [creator, { limit: 200 }]
        }, { headers: HEADERS });

        const txs = res.data.result || [];

        if (!txs.length) {
            reject("No wallet history");
            return { warm: false };
        }

        const newest = txs[0];
        const oldest = txs[txs.length - 1];

        const ageDays =
            ((newest.blockTime - oldest.blockTime) * 1000) /
            (1000 * 60 * 60 * 24);

        if (ageDays < 90) {
            reject(`Wallet too new: ${ageDays.toFixed(1)}d`);
            return { warm: false };
        }

        const balRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [creator]
        }, { headers: HEADERS });

        const sol = (balRes.data.result.value || 0) / 1e9;

        if (sol < 2) {
            reject(`Low balance: ${sol.toFixed(2)} SOL`);
            return { warm: false };
        }

        log(`✅ Warm wallet confirmed`);

        return {
            warm: true,
            age: ageDays.toFixed(1),
            balance: sol.toFixed(2),
            txCount: txs.length
        };

    } catch (e) {
        error(`Wallet check error: ${e.message}`);
        return { warm: false };
    }
}

// ==================== GRADUATION CHECK ====================

async function checkGraduation(mint) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getSignaturesForAddress",
            params: [mint, { limit: 10 }]
        }, { headers: HEADERS });

        const txs = res.data.result || [];
        if (!txs.length) return false;

        for (const tx of txs) {
            const sig = tx.signature;

            const txData = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0",
                id: 1,
                method: "getTransaction",
                params: [sig, { maxSupportedTransactionVersion: 0 }]
            }, { headers: HEADERS });

            const logs = txData.data?.result?.meta?.logMessages || [];
            const text = logs.join(" ").toLowerCase();

            if (
                text.includes("migrate") ||
                text.includes("liquidity") ||
                text.includes("raydium") ||
                text.includes("createpool") ||
                text.includes("graduated")
            ) {
                return true;
            }
        }

        return false;

    } catch (e) {
        error(`Graduation error: ${e.message}`);
        return false;
    }
}

// ==================== TELEGRAM ALERT ====================

async function sendAlert(mint, name, metrics) {
    const msg =
        `🌟 *NEW VERIFIED TOKEN*\n\n` +
        `🏷️ Name: ${name}\n` +
        `📌 Mint: \`${mint}\`\n\n` +
        `🧠 Wallet Age: ${metrics.age} days\n` +
        `💰 Balance: ${metrics.balance} SOL\n` +
        `📊 TXs: ${metrics.txCount}\n\n` +
        `🔗 https://pump.fun/${mint}\n` +
        `📈 https://dexscreener.com/solana/${mint}`;

    await bot.sendMessage(TELEGRAM_CHAT_ID, msg, {
        parse_mode: "Markdown",
        disable_web_page_preview: true
    });

    log(`📤 Alert sent: ${name}`);
}

// ==================== MAIN MONITOR ====================

function startBot() {
    log("🚀 Connecting to Pump.fun WebSocket...");

    const ws = new WebSocket("wss://pumpportal.fun/api/data");

    ws.on("open", () => {
        log("✅ Connected");
        ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    });

    ws.on("message", async (data) => {
        try {
            const event = JSON.parse(data.toString());

            const mint = event.mint;
            const creator = event.traderPublicKey;
            const name = event.symbol || "UNKNOWN";

            if (!mint || alertedMints.has(mint)) return;
            alertedMints.add(mint);

            log(`\n🎯 New Token: ${name}`);
            log(`Mint: ${mint}`);

            // 1️⃣ Wallet check
            const wallet = await checkWarmWallet(creator);
            if (!wallet.warm) return;

            // 2️⃣ Send early alert
            await sendAlert(mint, name, wallet);

            // 3️⃣ Graduation check (delayed)
            setTimeout(async () => {
                const isGrad = await checkGraduation(mint);

                if (isGrad && !graduatedMints.has(mint)) {
                    graduatedMints.add(mint);

                    log(`🚀 GRADUATED: ${name}`);

                    await bot.sendMessage(
                        TELEGRAM_CHAT_ID,
                        `🚀 *GRADUATED TOKEN*\n\n🏷️ ${name}\n📌 ${mint}\n\n🔥 Now live on DEX\nhttps://dexscreener.com/solana/${mint}`,
                        { parse_mode: "Markdown" }
                    );
                }
            }, 15000);

        } catch (e) {
            error(`Message error: ${e.message}`);
        }
    });

    ws.on("close", () => {
        error("WebSocket closed. Reconnecting...");
        setTimeout(startBot, 5000);
    });

    ws.on("error", (err) => {
        error(`WS error: ${err.message}`);
    });
}

// ==================== START ====================

console.clear();
log("🔥 Pump.fun Hybrid Bot Starting...");
startBot();
