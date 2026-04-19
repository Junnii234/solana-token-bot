const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ================= CONFIG =================
const TELEGRAM_TOKEN = "8758743414:AAEBrC13yBJYwCcpEVW__AlNlQJTww2KVk8";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const KNOWN_EXCHANGES = [
    "AC5792X4AECZ5D8g1sTySrzMsh357AjC4STne6S5WCTM", 
    "5VCwS7pYArR3vR9FAnZp71qGoffS8W4P2ZidS9sYjZ6K", 
    "362S7Yv5p2fVvWvYyN4RzS5p2fVvWvYyN4RzS5p2fVv", 
    "2AQdpHJ2JpcRs95vSBy3z8H1HSuXpQeJm8yZ87GidB4C"
];

const processed = new Set();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function axiosWithRetry(config, retries = 0) {
    try {
        await sleep(1200); // RPC rate limit safety
        return await axios.post(HELIUS_RPC, config);
    } catch (e) {
        if (retries < 2) return axiosWithRetry(config, retries + 1);
        throw e;
    }
}

// ================= CORE FORENSIC ENGINE (STRICT LOGIC) =================

async function performFullForensic(mint) {
    try {
        const now = Math.floor(Date.now() / 1000);

        // 1. Get Pair Age & Signature (Oldest First)
        const pairSigs = await axiosWithRetry({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint, { limit: 1, oldestFirst: true }] });
        const firstPairTx = pairSigs.data.result[0];
        if (!firstPairTx) return { error: "Mint not found on-chain" };
        
        const pairAgeDays = Math.max(0, (now - firstPairTx.blockTime) / 86400).toFixed(1);

        // 2. Extract Creator from the first transaction
        const txDetail = await axiosWithRetry({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [firstPairTx.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] });
        const creator = txDetail.data.result?.transaction?.message?.accountKeys[0]?.pubkey;

        // 3. Check Authorities (Mint & Freeze)
        const accInfo = await axiosWithRetry({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [mint, { encoding: "jsonParsed" }] });
        const info = accInfo.data.result?.value?.data?.parsed?.info;
        const authSafe = info && info.mintAuthority === null && info.freezeAuthority === null;

        // 4. Dev Age Logic (Newest vs Oldest Signature)
        const devNewSigs = await axiosWithRetry({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 1 }] });
        const devOldSigs = await axiosWithRetry({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 1, oldestFirst: true }] });
        
        const newestTime = devNewSigs.data.result[0]?.blockTime || now;
        const oldestTime = devOldSigs.data.result[0]?.blockTime || newestTime;
        const devAgeDays = Math.max(0, (newestTime - oldestTime) / 86400).toFixed(1);

        // 5. Funding Source (Check if first TX was from CEX)
        const firstDevTx = await axiosWithRetry({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [devOldSigs.data.result[0].signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] });
        const funder = firstDevTx.data.result?.transaction?.message?.accountKeys[0]?.pubkey;
        const isCEX = KNOWN_EXCHANGES.includes(funder);

        // FINAL CRITERIA CHECK
        const pass = (parseFloat(devAgeDays) >= 90 || isCEX) && authSafe;

        return { mint, creator, pairAgeDays, devAgeDays, authSafe, isCEX, pass };
    } catch (e) {
        return { error: `Forensic Failed: ${e.message}` };
    }
}

// ================= TELEGRAM HANDLERS =================

bot.onText(/\/test (.+)/, async (msg, match) => {
    const mint = match[1].trim();
    bot.sendMessage(msg.chat.id, `🔎 **Deep Scanning:** \`${mint}\`...`, { parse_mode: 'Markdown' });
    
    const res = await performFullForensic(mint);
    if (res.error) return bot.sendMessage(msg.chat.id, `❌ **Error:** ${res.error}`);

    let report = `📊 **FORENSIC REPORT (V20)**\n\n`;
    report += `**Mint:** \`${res.mint}\`\n`;
    report += `**Auth:** ${res.authSafe ? "✅ Clean (M/F Revoked)" : "❌ Risk (Not Revoked)"}\n`;
    report += `**Pair Age:** ${res.pairAgeDays} days\n`;
    report += `**Dev Age:** ${res.devAgeDays} days\n`;
    report += `**Funding:** ${res.isCEX ? "✅ CEX Funded" : "⚠️ Organic"}\n\n`;
    report += `**Verdict:** ${res.pass ? "🚀 **PASS (Alerting)**" : "🚫 **FAIL (Filtering)**"}`;

    bot.sendMessage(msg.chat.id, report, { parse_mode: 'Markdown' });
});

// ================= AUTO LISTENER =================

function startMigrationListener() {
    const ws = new WebSocket("wss://pumpportal.fun/api/data");
    ws.on("open", () => {
        console.log("🛡️ V20 Radar Online");
        ws.send(JSON.stringify({ method: "subscribeTokenTrade" }));
    });

    ws.on("message", async (data) => {
        const e = JSON.parse(data.toString());
        if (e.txType === 'raydium_migration') {
            if (processed.has(e.mint)) return;
            processed.add(e.mint);

            console.log(`[MIGRATION] Detected: ${e.mint}`);
            await sleep(45000); // Indexing wait
            
            const res = await performFullForensic(e.mint);
            if (res.pass) {
                bot.sendMessage(TELEGRAM_CHAT_ID, 
                    `🚀 **SAFE GRADUATE DETECTED**\n\n` +
                    `**Mint:** \`${res.mint}\`\n` +
                    `**Dev Age:** ${res.devAgeDays}d\n` +
                    `**Pair Age:** ${res.pairAgeDays}d\n` +
                    `**Auth:** ✅ Clean\n\n` +
                    `📈 [DexScreener](https://dexscreener.com/solana/${res.mint})`
                , { parse_mode: 'Markdown' });
            }
        }
    });

    ws.on("close", () => setTimeout(startMigrationListener, 5000));
}

startMigrationListener();
console.log("BOT RUNNING - V20 - TOKEN ID UPDATED");
