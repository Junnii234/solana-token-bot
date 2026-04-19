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
        await sleep(1200);
        return await axios.post(HELIUS_RPC, config);
    } catch (e) {
        if (retries < 2) return axiosWithRetry(config, retries + 1);
        throw e;
    }
}

// ================= DEBUG FORENSIC ENGINE =================

async function performFullForensic(mint) {
    try {
        const now = Math.floor(Date.now() / 1000);
        console.log(`[DEBUG] Starting forensic for mint: ${mint}`);

        // 1. Get Pair Age & Signature (Oldest First)
        console.log(`[DEBUG] Fetching pair signatures...`);
        const pairSigs = await axiosWithRetry({ 
            jsonrpc: "2.0", 
            id: 1, 
            method: "getSignaturesForAddress", 
            params: [mint, { limit: 10, oldestFirst: true }] // Increased limit
        });
        
        console.log(`[DEBUG] Pair signatures result:`, JSON.stringify(pairSigs.data.result, null, 2));
        const firstPairTx = pairSigs.data.result[0];
        if (!firstPairTx) return { error: "Mint not found on-chain" };
        
        console.log(`[DEBUG] First pair TX:`, firstPairTx);
        const pairAgeDays = Math.max(0, (now - firstPairTx.blockTime) / 86400).toFixed(1);
        console.log(`[DEBUG] Pair age: ${pairAgeDays} days (blockTime: ${firstPairTx.blockTime}, now: ${now})`);

        // 2. Extract Creator from the first transaction
        console.log(`[DEBUG] Fetching transaction details: ${firstPairTx.signature}`);
        const txDetail = await axiosWithRetry({ 
            jsonrpc: "2.0", 
            id: 1, 
            method: "getTransaction", 
            params: [firstPairTx.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] 
        });
        
        console.log(`[DEBUG] TX Detail:`, JSON.stringify(txDetail.data.result, null, 2));
        const creator = txDetail.data.result?.transaction?.message?.accountKeys[0]?.pubkey;
        console.log(`[DEBUG] Creator extracted: ${creator}`);

        // 3. Check Authorities (Mint & Freeze)
        console.log(`[DEBUG] Fetching account info for mint...`);
        const accInfo = await axiosWithRetry({ 
            jsonrpc: "2.0", 
            id: 1, 
            method: "getAccountInfo", 
            params: [mint, { encoding: "jsonParsed" }] 
        });
        
        console.log(`[DEBUG] Account info:`, JSON.stringify(accInfo.data.result, null, 2));
        const info = accInfo.data.result?.value?.data?.parsed?.info;
        const authSafe = info && info.mintAuthority === null && info.freezeAuthority === null;
        console.log(`[DEBUG] Auth safe: ${authSafe}`);

        // 4. Dev Age Logic - FIXED
        console.log(`[DEBUG] Fetching dev signatures (newest)...`);
        const devNewSigs = await axiosWithRetry({ 
            jsonrpc: "2.0", 
            id: 1, 
            method: "getSignaturesForAddress", 
            params: [creator, { limit: 10 }] // Increased limit
        });
        
        console.log(`[DEBUG] Dev newest sigs:`, JSON.stringify(devNewSigs.data.result, null, 2));

        console.log(`[DEBUG] Fetching dev signatures (oldest)...`);
        const devOldSigs = await axiosWithRetry({ 
            jsonrpc: "2.0", 
            id: 1, 
            method: "getSignaturesForAddress", 
            params: [creator, { limit: 10, oldestFirst: true }] // Increased limit
        });
        
        console.log(`[DEBUG] Dev oldest sigs:`, JSON.stringify(devOldSigs.data.result, null, 2));
        
        const devNewestTime = devNewSigs.data.result[0]?.blockTime || now;
        const devOldestTime = devOldSigs.data.result[0]?.blockTime || devNewestTime;
        
        console.log(`[DEBUG] Dev newest time: ${devNewestTime}, oldest time: ${devOldestTime}`);
        
        const devActivitySpan = Math.max(0, (devNewestTime - devOldestTime) / 86400).toFixed(1);
        const devFirstActionAge = Math.max(0, (now - devOldestTime) / 86400).toFixed(1);

        console.log(`[DEBUG] Dev activity span: ${devActivitySpan}, first action age: ${devFirstActionAge}`);

        // 5. Funding Source
        console.log(`[DEBUG] Fetching first dev transaction...`);
        const firstDevTx = await axiosWithRetry({ 
            jsonrpc: "2.0", 
            id: 1, 
            method: "getTransaction", 
            params: [devOldSigs.data.result[0].signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] 
        });
        
        console.log(`[DEBUG] First dev TX:`, JSON.stringify(firstDevTx.data.result, null, 2));
        const funder = firstDevTx.data.result?.transaction?.message?.accountKeys[0]?.pubkey;
        const isCEX = KNOWN_EXCHANGES.includes(funder);
        
        console.log(`[DEBUG] Funder: ${funder}, isCEX: ${isCEX}`);

        // Pass/Fail Logic
        const devHasGoodHistory = parseFloat(devActivitySpan) >= 30;
        const devIsEstablished = parseFloat(devFirstActionAge) >= 90;
        
        const pass = authSafe && (devIsEstablished || isCEX || devHasGoodHistory);

        console.log(`[DEBUG] Final verdict - pass: ${pass}`);

        return { 
            mint, 
            creator, 
            pairAgeDays, 
            devActivitySpan,
            devFirstActionAge,
            devHasGoodHistory,
            authSafe, 
            isCEX, 
            pass 
        };
    } catch (e) {
        console.error(`[ERROR] Forensic failed:`, e);
        return { error: `Forensic Failed: ${e.message}` };
    }
}

// ================= TELEGRAM HANDLERS =================

bot.onText(/\/test (.+)/, async (msg, match) => {
    const mint = match[1].trim();
    console.log(`\n========== TEST COMMAND STARTED ==========`);
    console.log(`User: ${msg.from.username}, Mint: ${mint}`);
    
    bot.sendMessage(msg.chat.id, `🔎 **Deep Scanning:** \`${mint}\`...\n⏳ Debug logs in console`, { parse_mode: 'Markdown' });
    
    const res = await performFullForensic(mint);
    if (res.error) return bot.sendMessage(msg.chat.id, `❌ **Error:** ${res.error}`);

    let report = `📊 **FORENSIC REPORT (V21-DEBUG)**\n\n`;
    report += `**Mint:** \`${res.mint}\`\n`;
    report += `**Creator:** \`${res.creator?.substring(0, 8)}...\`\n\n`;
    report += `**✅ AUTHENTICATION**\n`;
    report += `Auth Status: ${res.authSafe ? "✅ Clean (M/F Revoked)" : "❌ Risk (Not Revoked)"}\n\n`;
    report += `**📅 AGE METRICS**\n`;
    report += `Pair Age: ${res.pairAgeDays} days (blockTime exists: ${res.pairAgeDays != "0.0"})\n`;
    report += `Dev First Action: ${res.devFirstActionAge} days ago\n`;
    report += `Dev Activity Span: ${res.devActivitySpan} days\n\n`;
    report += `**💰 FUNDING**\n`;
    report += `Funding: ${res.isCEX ? "✅ CEX Funded" : "⚠️ Organic"}\n\n`;
    report += `**📈 PASS/FAIL LOGIC**\n`;
    report += `Auth Safe: ${res.authSafe ? "✓" : "✗"}\n`;
    report += `Dev Established (90d): ${res.devFirstActionAge >= 90 ? "✓" : "✗"}\n`;
    report += `CEX Funded: ${res.isCEX ? "✓" : "✗"}\n`;
    report += `Dev Active (30d span): ${res.devHasGoodHistory ? "✓" : "✗"}\n\n`;
    report += `**Verdict:** ${res.pass ? "🚀 **PASS (Alerting)**" : "🚫 **FAIL (Filtering)**"}`;

    bot.sendMessage(msg.chat.id, report, { parse_mode: 'Markdown' });
    
    console.log(`========== TEST COMMAND COMPLETE ==========\n`);
});

// ================= AUTO LISTENER =================

function startMigrationListener() {
    const ws = new WebSocket("wss://pumpportal.fun/api/data");
    ws.on("open", () => {
        console.log("🛡️ V21 Radar Online (DEBUG MODE)");
        ws.send(JSON.stringify({ method: "subscribeTokenTrade" }));
    });

    ws.on("message", async (data) => {
        const e = JSON.parse(data.toString());
        if (e.txType === 'raydium_migration') {
            if (processed.has(e.mint)) return;
            processed.add(e.mint);

            console.log(`[MIGRATION] Detected: ${e.mint}`);
            await sleep(45000);
            
            const res = await performFullForensic(e.mint);
            if (res.pass) {
                bot.sendMessage(TELEGRAM_CHAT_ID, 
                    `🚀 **SAFE GRADUATE DETECTED (V21)**\n\n` +
                    `**Mint:** \`${res.mint}\`\n` +
                    `**Dev Age:** ${res.devFirstActionAge}d\n` +
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
console.log("BOT RUNNING - V21-DEBUG - CONSOLE LOGGING ENABLED");
