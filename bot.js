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

const pumpTokens = new Map();
const processed = new Set();

const log = (m) => console.log(`[${new Date().toLocaleTimeString()}] 🟢 ${m}`);
const warn = (m) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️ ${m}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ================= THE ENGINE (SAME FOR BOT & TEST) =================

async function axiosWithRetry(config, retries = 0) {
    try {
        await sleep(1500); 
        return await axios.post(HELIUS_RPC, config);
    } catch (e) {
        if (retries < 3) return axiosWithRetry(config, retries + 1);
        throw e;
    }
}

async function performFullForensic(mint) {
    try {
        // 1. Fetch Creator & Pair Age (Blockchain First Scan)
        const sigRes = await axiosWithRetry({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint, { limit: 1, oldestFirst: true }] });
        const firstSig = sigRes.data.result[0];
        if (!firstSig) return { error: "No history found" };

        const txDetail = await axiosWithRetry({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [firstSig.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] });
        const creator = txDetail.data.result?.transaction?.message?.accountKeys[0]?.pubkey;
        const pairAgeDays = ((Math.floor(Date.now() / 1000) - firstSig.blockTime) / 86400).toFixed(1);

        // 2. Check Authorities (Mint & Freeze)
        const accInfo = await axiosWithRetry({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [mint, { encoding: "jsonParsed" }] });
        const info = accInfo.data.result?.value?.data?.parsed?.info;
        const authSafe = info && info.mintAuthority === null && info.freezeAuthority === null;

        // 3. Dev Age & Funding Source
        const devNew = await axiosWithRetry({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 1 }] });
        const devOld = await axiosWithRetry({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 1, oldestFirst: true }] });
        
        const devAgeDays = ((devNew.data.result[0].blockTime - devOld.data.result[0].blockTime) / 86400).toFixed(1);
        
        const funderTx = await axiosWithRetry({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [devOld.data.result[0].signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] });
        const funder = funderTx.data.result?.transaction?.message?.accountKeys[0]?.pubkey;
        const isCEX = KNOWN_EXCHANGES.includes(funder);

        return {
            mint,
            creator,
            pairAgeDays,
            devAgeDays,
            authSafe,
            isCEX,
            pass: (parseFloat(devAgeDays) >= 90 || isCEX) && authSafe
        };
    } catch (e) {
        return { error: e.message };
    }
}

// ================= INTERFACE =================

// 1. Manual Test
bot.onText(/\/test (.+)/, async (msg, match) => {
    const mint = match[1].trim();
    log(`MANUAL TEST INITIATED: ${mint}`);
    bot.sendMessage(msg.chat.id, `🔍 Testing with Main Bot Logic...`);

    const res = await performFullForensic(mint);
    if (res.error) return bot.sendMessage(msg.chat.id, `❌ Error: ${res.error}`);

    let report = `📊 **BOT LOGIC TEST RESULT**\n\n`;
    report += `Mint: \`${res.mint}\`\n`;
    report += `Auth: ${res.authSafe ? "✅ Clean" : "❌ Risk"}\n`;
    report += `Pair Age: ${res.pairAgeDays} days\n`;
    report += `Dev Age: ${res.devAgeDays} days\n`;
    report += `Funding: ${res.isCEX ? "✅ CEX" : "⚠️ Organic"}\n\n`;
    report += `**Verdict:** ${res.pass ? "🚀 WILL ALERT" : "🚫 WILL REJECT"}`;

    bot.sendMessage(msg.chat.id, report, { parse_mode: 'Markdown' });
});

// 2. Migration Listener (Main Bot Work)
function startMigrationListener() {
    const ws = new WebSocket("wss://pumpportal.fun/api/data");
    ws.on("open", () => {
        log("Raydium Migration Listener LIVE");
        ws.send(JSON.stringify({ method: "subscribeTokenTrade" }));
    });

    ws.on("message", async (data) => {
        const e = JSON.parse(data.toString());
        if (e.txType === 'raydium_migration') {
            const mint = e.mint;
            if (processed.has(mint)) return;
            processed.add(mint);

            log(`⚡ NEW GRADUATE: ${mint}. Running Forensic...`);
            await sleep(45000); // Wait for indexing

            const res = await performFullForensic(mint);
            
            if (res.pass) {
                bot.sendMessage(TELEGRAM_CHAT_ID, `🚀 **SAFE GRADUATE DETECTED**\n\nMint: \`${res.mint}\`\nDev Age: ${res.devAgeDays}d\nPair Age: ${res.pairAgeDays}d\nAuth: ✅ Clean\n\n[DexScreener](https://dexscreener.com/solana/${res.mint})`, { parse_mode: 'Markdown' });
                log(`✅ ALERT SENT: ${res.mint}`);
            } else {
                warn(`REJECTED: ${res.mint} (Age: ${res.devAgeDays}d, Auth: ${res.authSafe})`);
            }
        }
    });
    ws.on("close", () => setTimeout(startMigrationListener, 5000));
}

startMigrationListener();
log("Scanner V18 Started - Dual-Logic Sync Active");
