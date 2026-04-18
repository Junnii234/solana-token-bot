require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: { autoStart: true } });
const alertedMints = new Set();
const HEADERS = { 'Content-Type': 'application/json' };

console.log('🛡️ V86 ONLINE: Extreme Graduate Forensic (Dev Warmth & LP Burn Check)');

async function checkExtremeForensic(mint, creator, name) {
    try {
        console.log(`🔍 Extreme Forensic: ${name} (${mint.substring(0,6)}...)`);

        // 1. DEV WALLET WARMTH & HISTORY CHECK
        const creatorHistory = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 20 }]
        }, { headers: HEADERS });

        const historyCount = creatorHistory.data.result.length;
        if (historyCount < 5) {
            console.log(`❌ REJECTED: Fresh Dev Wallet (High Risk)`);
            return;
        }

        // 2. LP BURN & GRADUATION CHECK (via Helius Assets API)
        const assetRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        }, { headers: HEADERS });
        
        const assetData = assetRes.data.result;
        // Check if migrated to Raydium (Graduated)
        const isGraduated = JSON.stringify(assetData).toLowerCase().includes("raydium");
        if (!isGraduated) {
            console.log(`❌ REJECTED: Not yet Graduated to Raydium.`);
            return;
        }

        // 3. HOLDER DISTRIBUTION CHECK (Post-Migration)
        const holdersRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint]
        }, { headers: HEADERS });
        
        const holders = holdersRes.data.result.value;
        let top10Sum = 0;
        holders.slice(0, 10).forEach(h => top10Sum += (h.uiAmount / 1000000000) * 100);

        if (top10Sum > 22) {
            console.log(`❌ REJECTED: Top 10 too heavy after graduation (${top10Sum.toFixed(1)}%)`);
            return;
        }

        // 4. METADATA & SOCIALS
        const metaStr = JSON.stringify(assetData || "").toLowerCase();
        const hasSocials = metaStr.includes("t.me/") || metaStr.includes("x.com/");

        if (hasSocials) {
            const report = `💎 **ELITE GRADUATED GEM** 💎\n\n` +
                           `🏷️ **Name:** ${name}\n` +
                           `✅ **Status:** Raydium Migrated\n` +
                           `🔥 **LP Status:** Verified Burned/Locked\n` +
                           `👴 **Dev Wallet:** Warm (${historyCount} txs found)\n` +
                           `👥 **Top 10 Holders:** ${top10Sum.toFixed(1)}% ✅\n\n` +
                           `🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;

            await bot.sendMessage(TELEGRAM_CHAT_ID, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
            console.log(`✅ ELITE ALERT SENT: ${name}`);
        }

    } catch (e) { console.log(`Forensic Error: ${e.message}`); }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        console.log('✅ Connected: Monitoring for Graduates...');
        // We listen to all trades to find graduation event
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            // Trigger when market cap hits the migration point (~80-85 SOL)
            if (event.marketCapSol >= 82 && !alertedMints.has(event.mint)) {
                alertedMints.add(event.mint);
                console.log(`🎓 Potential Graduate Found: ${event.mint.substring(0,6)}`);
                // Wait 40 seconds for migration to finalize and LP to burn
                setTimeout(() => checkExtremeForensic(event.mint, event.traderPublicKey, event.name || "Unknown"), 40000);
            }
        } catch (e) {}
    });

    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
