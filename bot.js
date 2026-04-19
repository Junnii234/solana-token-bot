require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ================= CONFIG & IDS =================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAEBrC13yBJYwCcpEVW__AlNlQJTww2KVk8";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = process.env.HELIUS_RPC || "https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Program IDs for Manual Tracking
const TARGET_PROGRAMS = {
    RAYDIUM_V4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    RAYDIUM_CPMM: "CPMMoo8LqacR97B2yccS5qmoC69Y3Y847XwZfm7UTr5",
    RAYDIUM_CLMM: "CAMMCzo5YL8w4VFF3i5nVjB6w3Vv4YFQj1h7Q9h3i6k"
};

// CEX / Exchange Whitelist
const KNOWN_EXCHANGES = [
    "AC5792X4AECZ5D8g1sTySrzMsh357AjC4STne6S5WCTM", // FixedFloat
    "5VCwS7pYArR3vR9FAnZp71qGoffS8W4P2ZidS9sYjZ6K", // Binance
    "362S7Yv5p2fVvWvYyN4RzS5p2fVvWvYyN4RzS5p2fVv", // Kraken
    "2AQdpHJ2JpcRs95vSBy3z8H1HSuXpQeJm8yZ87GidB4C"  // Coinbase
];

// Memory
const pumpTokens = new Map();
const processed = new Set();

const log = (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ================= CORE TOOLS =================

async function axiosWithRetry(config, retries = 0) {
    try {
        await sleep(1500); 
        const res = await axios.post(HELIUS_RPC, config);
        return res;
    } catch (e) {
        if (retries < 2) return axiosWithRetry(config, retries + 1);
        throw e;
    }
}

// Function to find the funding source wallet
async function getFunder(wallet) {
    try {
        const res = await axiosWithRetry({
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
            params: [wallet, { limit: 20 }] 
        });
        const txs = res.data.result || [];
        if (!txs.length) return null;

        const txDetail = await axiosWithRetry({
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [txs[txs.length - 1].signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        return txDetail.data.result?.transaction?.message?.accountKeys[0]?.pubkey;
    } catch { return null; }
}

async function devCheck(wallet) {
    try {
        const res = await axiosWithRetry({
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
            params: [wallet, { limit: 100 }] 
        });
        const txs = res.data.result || [];
        if (!txs.length) return { safe: false, type: "Unknown", age: 0 };

        const funder = await getFunder(wallet);
        if (KNOWN_EXCHANGES.includes(funder)) {
            return { safe: true, type: "CEX Funded", age: "Trusted" };
        }
        
        const ageDays = ((txs[0].blockTime - txs[txs.length - 1].blockTime) * 1000) / (1000 * 60 * 60 * 24);
        return { safe: ageDays >= 90, type: "Organic", age: ageDays.toFixed(1) };
    } catch { return { safe: false, type: "Error", age: 0 }; }
}

async function checkAuthorities(mint) {
    try {
        const res = await axiosWithRetry({
            jsonrpc: "2.0", id: 1, method: "getAccountInfo",
            params: [mint, { encoding: "jsonParsed" }]
        });
        const info = res.data.result?.value?.data?.parsed?.info;
        // Mint aur Freeze dono null (revoked) honay chahye
        return info && info.mintAuthority === null && info.freezeAuthority === null;
    } catch { return false; }
}

// ================= TELEGRAM COMMANDS =================

bot.onText(/\/test (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const mint = match[1].trim();
    bot.sendMessage(chatId, `🔍 Testing Mint: \`${mint}\`...`, { parse_mode: 'Markdown' });

    const auth = await checkAuthorities(mint);
    const storedData = pumpTokens.get(mint);
    
    let report = `📊 **SCAN REPORT**\n\n`;
    report += `Mint: \`${mint}\`\n`;
    report += `Authorities: ${auth ? "✅ Clean (Mint/Freeze Revoked)" : "❌ Risk (Not Revoked)"}\n`;
    
    if (storedData) {
        const dev = await devCheck(storedData.creator);
        report += `Dev Trust: ${dev.type}\n`;
        report += `Dev Age: ${dev.age} ${dev.age === 'Trusted' ? '' : 'days'}\n`;
    } else {
        report += `\n⚠️ Dev details not in memory. Bot only tracks tokens launched while it was running.`;
    }

    bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
});

// ================= MAIN LISTENERS =================

// 1. Monitor New Launches for Early CEX Alerts
function startPumpListener() {
    const ws = new WebSocket("wss://pumpportal.fun/api/data");
    ws.on("open", () => {
        log("✅ Monitoring Pump.fun Launches");
        ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    });

    ws.on("message", async (data) => {
        try {
            const e = JSON.parse(data.toString());
            if (e.mint) {
                // Store in memory for later migration check
                pumpTokens.set(e.mint, { 
                    creator: e.traderPublicKey, 
                    name: e.symbol || "UNKNOWN", 
                    time: Date.now() 
                });

                // EARLY ALERT: Check if funded by CEX
                const funder = await getFunder(e.traderPublicKey);
                if (KNOWN_EXCHANGES.includes(funder)) {
                    bot.sendMessage(TELEGRAM_CHAT_ID, 
                        `🌟 **EARLY GEM ALERT (CEX FUNDED)**\n\n` +
                        `Token: ${e.symbol}\n` +
                        `Mint: \`${e.mint}\`\n` +
                        `Source: ${funder.slice(0,6)}... (Trusted Exchange) ✅\n\n` +
                        `📈 [DexScreener](https://dexscreener.com/solana/${e.mint})`
                    , { parse_mode: 'Markdown' });
                }
            }
        } catch {}
    });

    ws.on("close", () => setTimeout(startPumpListener, 5000));
}

// 2. Monitor Migrations to Raydium (V4/CPMM/CLMM)
function startMigrationListener() {
    log("🚀 Raydium Radar V12 Active (V4/CPMM/CLMM)");
    const ws = new WebSocket("wss://pumpportal.fun/api/data");
    ws.on("open", () => ws.send(JSON.stringify({ method: "subscribeTokenTrade" })));

    ws.on("message", async (data) => {
        try {
            const e = JSON.parse(data.toString());
            if (e.txType === 'raydium_migration') {
                const mint = e.mint;
                const tokenData = pumpTokens.get(mint);

                // Wait for migration to complete and check if in 30-min window
                if (tokenData && (Date.now() - tokenData.time) / 1000 <= 1800) {
                    if (processed.has(mint)) return;
                    
                    log(`🔥 Graduation: ${tokenData.name}`);
                    await sleep(60000); // 1-minute safety wait

                    const dev = await devCheck(tokenData.creator);
                    const authSafe = await checkAuthorities(mint);

                    if (dev.safe && authSafe) {
                        processed.add(mint);
                        
                        // Determine Pool Type for the alert
                        let poolType = "Raydium";
                        if (e.programId === TARGET_PROGRAMS.RAYDIUM_CPMM) poolType = "Raydium CPMM";
                        else if (e.programId === TARGET_PROGRAMS.RAYDIUM_CLMM) poolType = "Raydium CLMM";
                        else poolType = "Raydium V4";

                        bot.sendMessage(TELEGRAM_CHAT_ID, 
                            `🚀 **SAFE GRADUATE DETECTED**\n\n` +
                            `🏷️ **Token:** ${tokenData.name}\n` +
                            `🏗️ **Pool:** ${poolType}\n` +
                            `🛡️ **Dev:** ${dev.type} (${dev.age}d)\n` +
                            `✅ **Security:** Mint & Freeze Revoked\n\n` +
                            `📈 [DexScreener](https://dexscreener.com/solana/${mint})`
                        , { parse_mode: 'Markdown' });
                    }
                }
            }
        } catch (err) {}
    });

    ws.on("close", () => setTimeout(startMigrationListener, 5000));
}

// ================= START =================

function start() {
    startPumpListener();
    startMigrationListener();

    // Memory cleanup: Delete tokens older than 1 hour
    setInterval(() => {
        const now = Date.now();
        for (let [mint, data] of pumpTokens.entries()) {
            if ((now - data.time) > 3600000) pumpTokens.delete(mint);
        }
    }, 1800000);
}

start();
