const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ================= CONFIG =================
const TELEGRAM_TOKEN = "8758743414:AAEBrC13yBJYwCcpEVW__AlNlQJTww2KVk8";
const TELEGRAM_CHAT_ID = "8006731872";

// NO MORE HELIUS - Use GeckoTerminal + Public Solana RPC
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const GECKO_API = "https://api.geckoterminal.com/api/v2/networks/solana";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const KNOWN_EXCHANGES = [
    "AC5792X4AECZ5D8g1sTySrzMsh357AjC4STne6S5WCTM", 
    "5VCwS7pYArR3vR9FAnZp71qGoffS8W4P2ZidS9sYjZ6K", 
    "362S7Yv5p2fVvWvYyN4RzS5p2fVvWvYyN4RzS5p2fVv", 
    "2AQdpHJ2JpcRs95vSBy3z8H1HSuXpQeJm8yZ87GidB4C"
];

const processed = new Set();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function rpcCall(method, params) {
    try {
        const response = await axios.post(SOLANA_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: method,
            params: params
        }, { timeout: 10000 });
        
        return response.data.result;
    } catch (e) {
        console.error(`[RPC ERROR] ${method}:`, e.message);
        return null;
    }
}

// ================= GECKO TERMINAL API CALLS =================

async function getTokenAgeFromGecko(mint) {
    try {
        const url = `${GECKO_API}/tokens/${mint}`;
        const res = await axios.get(url, { timeout: 5000 });
        const token = res.data.data?.attributes;
        
        if (!token) return null;
        
        // Parse creation timestamp
        const createdAt = token.created_at; // ISO format
        const createdTime = Math.floor(new Date(createdAt).getTime() / 1000);
        const now = Math.floor(Date.now() / 1000);
        
        return {
            created_at: createdAt,
            ageSeconds: now - createdTime,
            ageDays: ((now - createdTime) / 86400).toFixed(1)
        };
    } catch (e) {
        console.error(`[GECKO ERROR] Token lookup failed:`, e.message);
        return null;
    }
}

// ================= CORE FORENSIC ENGINE (V22) =================

async function performFullForensic(mint) {
    try {
        const now = Math.floor(Date.now() / 1000);
        console.log(`[V22] Starting forensic for: ${mint}`);

        // 1. Get token age from GeckoTerminal (more reliable)
        const geckoData = await getTokenAgeFromGecko(mint);
        if (!geckoData) {
            // Fallback to RPC if Gecko fails
            console.log(`[V22] Gecko failed, trying RPC...`);
            
            const pairSigs = await rpcCall("getSignaturesForAddress", [mint, { limit: 5, oldestFirst: true }]);
            if (!pairSigs || pairSigs.length === 0) {
                return { error: "Token not found (Gecko + RPC failed)" };
            }
            
            const validSigs = pairSigs.filter(tx => tx.blockTime !== null && tx.blockTime !== undefined);
            if (validSigs.length === 0) {
                return { error: "No valid blockTime from RPC" };
            }
            
            const pairAgeDays = ((now - validSigs[0].blockTime) / 86400).toFixed(1);
            var tokenAgeDays = pairAgeDays;
        } else {
            var tokenAgeDays = geckoData.ageDays;
        }

        // 2. Get creator from first transaction
        const pairSigs = await rpcCall("getSignaturesForAddress", [mint, { limit: 5, oldestFirst: true }]);
        if (!pairSigs || pairSigs.length === 0) {
            return { error: "Mint signatures not found" };
        }
        
        const validPairSigs = pairSigs.filter(tx => tx.blockTime !== null);
        if (validPairSigs.length === 0) {
            return { error: "No valid blockTime for mint" };
        }

        const firstTx = await rpcCall("getTransaction", [
            validPairSigs[0].signature, 
            { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }
        ]);
        
        if (!firstTx) {
            return { error: "Could not fetch transaction details" };
        }

        const creator = firstTx?.transaction?.message?.accountKeys[0]?.pubkey;
        if (!creator) {
            return { error: "Could not extract creator" };
        }

        // 3. Check Authorities
        const accInfo = await rpcCall("getAccountInfo", [mint, { encoding: "jsonParsed" }]);
        if (!accInfo) {
            return { error: "Could not fetch account info" };
        }

        const info = accInfo?.value?.data?.parsed?.info;
        const authSafe = info && info.mintAuthority === null && info.freezeAuthority === null;

        // 4. Dev Account Age (from creator's signatures)
        const devSigs = await rpcCall("getSignaturesForAddress", [creator, { limit: 10, oldestFirst: true }]);
        if (!devSigs || devSigs.length === 0) {
            return { error: "Creator account not found" };
        }

        const validDevSigs = devSigs.filter(tx => tx.blockTime !== null);
        if (validDevSigs.length === 0) {
            return { error: "Creator has no valid transactions" };
        }

        const devFirstActionTime = validDevSigs[0].blockTime;
        const devFirstActionAge = ((now - devFirstActionTime) / 86400).toFixed(1);

        // Get latest dev action for activity span
        const devNewestSigs = await rpcCall("getSignaturesForAddress", [creator, { limit: 1 }]);
        const devLatestTime = devNewestSigs?.[0]?.blockTime || now;
        const devActivitySpan = ((devLatestTime - devFirstActionTime) / 86400).toFixed(1);

        // 5. Funding source check
        const firstDevTx = await rpcCall("getTransaction", [
            validDevSigs[0].signature,
            { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }
        ]);

        const funder = firstDevTx?.transaction?.message?.accountKeys[0]?.pubkey;
        const isCEX = funder && KNOWN_EXCHANGES.includes(funder);

        // ========== V22 IMPROVED PASS LOGIC ==========
        // PASS if:
        // 1. Auth is clean (mandatory)
        // 2. AND one of:
        //    a) Dev is 90+ days old
        //    b) CEX funded
        //    c) Dev has 30+ days activity
        //    d) Token is fresh but dev is established (NEW: prevents brand-new rug pulls)
        // ================================================

        const devIsEstablished = parseFloat(devFirstActionAge) >= 90;
        const devHasGoodHistory = parseFloat(devActivitySpan) >= 30;
        const tokenIsFresh = parseFloat(tokenAgeDays) <= 7; // Less than 1 week old

        // Only pass fresh tokens if dev is established OR CEX funded
        const pass = authSafe && (
            devIsEstablished || 
            isCEX || 
            (devHasGoodHistory && !tokenIsFresh)
        );

        return { 
            mint, 
            creator, 
            pairAgeDays: tokenAgeDays,
            devActivitySpan,
            devFirstActionAge,
            devHasGoodHistory,
            devIsEstablished,
            authSafe, 
            isCEX,
            tokenIsFresh,
            geckoSuccess: !!geckoData,
            pass 
        };
    } catch (e) {
        console.error(`[ERROR] Forensic failed:`, e.message);
        return { error: `Forensic Failed: ${e.message}` };
    }
}

// ================= TELEGRAM HANDLERS =================

bot.onText(/\/test (.+)/, async (msg, match) => {
    const mint = match[1].trim();
    console.log(`\n========== TEST START ==========`);
    bot.sendMessage(msg.chat.id, `🔎 **Deep Scanning:** \`${mint}\`...`, { parse_mode: 'Markdown' });
    
    const res = await performFullForensic(mint);
    if (res.error) {
        return bot.sendMessage(msg.chat.id, `❌ **Error:** ${res.error}`);
    }

    let report = `📊 **FORENSIC REPORT (V22)**\n\n`;
    report += `**Mint:** \`${res.mint}\`\n`;
    report += `**Creator:** \`${res.creator?.substring(0, 8)}...\`\n`;
    report += `**Data Source:** ${res.geckoSuccess ? "GeckoTerminal ✅" : "RPC Fallback ⚠️"}\n\n`;
    
    report += `**✅ AUTHENTICATION**\n`;
    report += `Auth: ${res.authSafe ? "✅ Clean" : "❌ Risky"}\n\n`;
    
    report += `**📅 AGE METRICS**\n`;
    report += `Token Age: ${res.pairAgeDays} days\n`;
    report += `Dev First Action: ${res.devFirstActionAge} days ago\n`;
    report += `Dev Activity Span: ${res.devActivitySpan} days\n\n`;
    
    report += `**💰 FUNDING**\n`;
    report += `Source: ${res.isCEX ? "✅ CEX" : "⚠️ Organic"}\n\n`;
    
    report += `**📈 CRITERIA**\n`;
    report += `Auth Safe: ${res.authSafe ? "✓" : "✗"}\n`;
    report += `Dev Established (90d): ${res.devIsEstablished ? "✓" : "✗"}\n`;
    report += `CEX Funded: ${res.isCEX ? "✓" : "✗"}\n`;
    report += `Dev Active (30d+): ${res.devHasGoodHistory ? "✓" : "✗"}\n`;
    report += `Fresh Token: ${res.tokenIsFresh ? "🆕 (needs Est. Dev)" : "✅ Mature"}\n\n`;
    
    report += `**Verdict:** ${res.pass ? "🚀 **PASS**" : "🚫 **FAIL**"}`;

    bot.sendMessage(msg.chat.id, report, { parse_mode: 'Markdown' });
    console.log(`========== TEST END ==========\n`);
});

// ================= AUTO LISTENER =================

function startMigrationListener() {
    const ws = new WebSocket("wss://pumpportal.fun/api/data");
    
    ws.on("open", () => {
        console.log("🛡️ V22 Radar Online - GeckoTerminal + RPC");
        ws.send(JSON.stringify({ method: "subscribeTokenTrade" }));
    });

    ws.on("message", async (data) => {
        try {
            const e = JSON.parse(data.toString());
            if (e.txType === 'raydium_migration') {
                if (processed.has(e.mint)) return;
                processed.add(e.mint);

                console.log(`[MIGRATION] Detected: ${e.mint}`);
                await sleep(45000);
                
                const res = await performFullForensic(e.mint);
                if (!res.error && res.pass) {
                    const reason = res.isCEX ? "CEX Funded" : res.devIsEstablished ? "Established Dev (90d+)" : "Active Dev (30d+)";
                    
                    bot.sendMessage(TELEGRAM_CHAT_ID, 
                        `🚀 **SAFE GRADUATE - V22**\n\n` +
                        `**Mint:** \`${res.mint}\`\n` +
                        `**Token Age:** ${res.pairAgeDays}d\n` +
                        `**Dev Age:** ${res.devFirstActionAge}d\n` +
                        `**Auth:** ✅ Clean\n` +
                        `**Reason:** ${reason}\n\n` +
                        `📈 [DexScreener](https://dexscreener.com/solana/${res.mint})`
                    , { parse_mode: 'Markdown' });
                }
            }
        } catch (err) {
            console.error(`[WS ERROR]`, err.message);
        }
    });

    ws.on("close", () => {
        console.log("⚠️ WebSocket closed, reconnecting...");
        setTimeout(startMigrationListener, 5000);
    });

    ws.on("error", (err) => {
        console.error(`[WS ERROR]`, err.message);
    });
}

startMigrationListener();
console.log("BOT RUNNING - V22 - GeckoTerminal Integration");
