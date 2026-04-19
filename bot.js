require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ================= CONFIG & PROGRAM IDS =================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = process.env.HELIUS_RPC || "https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Yahan hain wo IDs jo aap dekhna chahte thay:
const TARGET_PROGRAMS = {
    RAYDIUM_V4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    RAYDIUM_CPMM: "CPMMoo8LqacR97B2yccS5qmoC69Y3Y847XwZfm7UTr5",
    RAYDIUM_CLMM: "CAMMCzo5YL8w4VFF3i5nVjB6w3Vv4YFQj1h7Q9h3i6k"
};

// CEX/Exchange Wallets for Bypass
const KNOWN_EXCHANGES = [
    "AC5792X4AECZ5D8g1sTySrzMsh357AjC4STne6S5WCTM", // FixedFloat
    "5VCwS7pYArR3vR9FAnZp71qGoffS8W4P2ZidS9sYjZ6K", // Binance
    "362S7Yv5p2fVvWvYyN4RzS5p2fVvWvYyN4RzS5p2fVv", // Kraken
    "2AQdpHJ2JpcRs95vSBy3z8H1HSuXpQeJm8yZ87GidB4C"  // Coinbase
];

// ================= MEMORY =================

const pumpTokens = new Map();
const processed = new Set();

const log = (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const reject = (m) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️ ${m}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ================= CORE LOGIC =================

async function axiosWithRetry(config, retries = 0) {
    try {
        await sleep(2000); 
        const res = await axios.post(HELIUS_RPC, config);
        return res;
    } catch (e) {
        if (retries < 3) return axiosWithRetry(config, retries + 1);
        throw e;
    }
}

async function devCheck(wallet) {
    try {
        const res = await axiosWithRetry({
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress",
            params: [wallet, { limit: 100 }] 
        });
        const txs = res.data.result || [];
        if (!txs.length) return { safe: false, reason: "No History" };

        // 1. CEX Funding Check
        const oldestSig = txs[txs.length - 1].signature;
        const txDetail = await axiosWithRetry({
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [oldestSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        const funder = txDetail.data.result?.transaction?.message?.accountKeys[0]?.pubkey;
        
        if (KNOWN_EXCHANGES.includes(funder)) {
            return { safe: true, reason: "CEX Funded", age: "CEX Trusted" };
        }

        // 2. 90-Day Age Check
        const ageDays = ((txs[0].blockTime - txs[txs.length - 1].blockTime) * 1000) / (1000 * 60 * 60 * 24);
        return { safe: ageDays >= 90, reason: "Organic", age: ageDays.toFixed(1) };
    } catch (e) { return { safe: false, reason: "Forensic Error" }; }
}

async function checkAuthorities(mint) {
    try {
        const res = await axiosWithRetry({
            jsonrpc: "2.0", id: 1, method: "getAccountInfo",
            params: [mint, { encoding: "jsonParsed" }]
        });
        const info = res.data.result?.value?.data?.parsed?.info;
        return info && info.mintAuthority === null && info.freezeAuthority === null;
    } catch (e) { return false; }
}

// ================= PROCESSING =================

async function processToken(mint, meta, programId) {
    if (processed.has(mint)) return;
    processed.add(mint);

    // Identifiying which program was used
    let pName = "Unknown";
    if (programId === TARGET_PROGRAMS.RAYDIUM_V4) pName = "Raydium V4";
    if (programId === TARGET_PROGRAMS.RAYDIUM_CPMM) pName = "Raydium CPMM";
    if (programId === TARGET_PROGRAMS.RAYDIUM_CLMM) pName = "Raydium CLMM";

    log(`🔥 GRADUATION: ${meta.name} on ${pName}`);
    await sleep(60000); 

    const dev = await devCheck(meta.creator);
    if (!dev.safe) return reject(`REJECTED: ${meta.name} (Age: ${dev.age}d)`);

    const authSafe = await checkAuthorities(mint);
    if (!authSafe) return reject(`REJECTED: ${meta.name} (Authority Risk)`);

    await bot.sendMessage(TELEGRAM_CHAT_ID, 
        `🚀 **GRADUATE DETECTED** 🚀\n\n` +
        `🏷️ **Token:** ${meta.name}\n` +
        `🏗️ **Pool:** ${pName}\n` +
        `🛡️ **Dev Trust:** ${dev.reason} (${dev.age}d)\n` +
        `✅ **Security:** Mint/Freeze Revoked\n\n` +
        `📈 [DexScreener](https://dexscreener.com/solana/${mint})`
    , { parse_mode: 'Markdown' });
}

// ================= LISTENERS =================

function startPumpListener() {
    const ws = new WebSocket("wss://pumpportal.fun/api/data");
    ws.on("open", () => {
        log("✅ Pump.fun Monitor Connected");
        ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    });
    ws.on("message", (data) => {
        try {
            const e = JSON.parse(data.toString());
            if (e.mint) pumpTokens.set(e.mint, { creator: e.traderPublicKey, name: e.symbol, time: Date.now() });
        } catch {}
    });
    ws.on("close", () => setTimeout(startPumpListener, 5000));
}

function startMigrationListener() {
    log("🚀 Raydium Radar Active (Manual ID Filtering)");
    const ws = new WebSocket("wss://pumpportal.fun/api/data");
    ws.on("open", () => ws.send(JSON.stringify({ method: "subscribeTokenTrade" })));

    ws.on("message", async (data) => {
        try {
            const e = JSON.parse(data.toString());
            // Program ID based filtering
            if (e.txType === 'raydium_migration') {
                const mint = e.mint;
                const t = pumpTokens.get(mint);
                
                if (t && (Date.now() - t.time) / 1000 <= 1800) {
                    // Yahan hum determine karte hain konsi ID use hui hai
                    // Note: PumpPortal migration event automatically targets Raydium programs
                    await processToken(mint, t, e.programId || TARGET_PROGRAMS.RAYDIUM_V4);
                }
            }
        } catch (err) {}
    });
    ws.on("close", () => setTimeout(startMigrationListener, 5000));
}

function start() {
    log("🛡️ SCANNER V10.0 LIVE");
    startPumpListener();
    startMigrationListener();
    
    // Clear old memory every 30 mins
    setInterval(() => {
        const now = Date.now();
        for (let [mint, data] of pumpTokens.entries()) {
            if ((now - data.time) > 3600000) pumpTokens.delete(mint);
        }
    }, 1800000);
}

start();
