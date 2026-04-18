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

console.log('💎 V82 ONLINE: PumpSwap (Raydium) Hunter Mode Active.');

async function checkRaydiumGem(mint, chatId = TELEGRAM_CHAT_ID) {
    try {
        // 1. Holder Check - Ab Bonding Curve (80%) nahi hona chahiye kyunke token migrate ho chuka hai
        const holdersRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] 
        }, { headers: HEADERS });
        
        const holders = holdersRes.data.result.value;
        if (!holders || holders.length < 10) return;

        // Raydium par jane ke baad holder distribution bohat sakht honi chahiye
        let top10Sum = 0;
        holders.slice(0, 10).forEach(h => top10Sum += (h.uiAmount / 1000000000) * 100);

        // 🛑 SAKHT FILTER: Top 10 holders should have less than 20% total (Organic Community)
        if (top10Sum > 20) {
            console.log(`⏩ [${mint.substring(0,6)}] Reject: Too centralized on Raydium (${top10Sum.toFixed(1)}%)`);
            return;
        }

        // 2. Metadata & Socials Check
        const assetRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }, { headers: HEADERS });
        const asset = assetRes.data.result;
        const metaStr = JSON.stringify(asset || "").toLowerCase();
        const hasSocials = metaStr.includes("t.me/") || metaStr.includes("x.com/") || metaStr.includes("twitter.com/");

        if (!hasSocials) {
            console.log(`⏩ [${mint.substring(0,6)}] Reject: No Socials on graduation.`);
            return;
        }

        const name = asset?.content?.metadata?.name || "Unknown";
        console.log(`✅ PUMPSWAP GEM DETECTED: ${name}`);

        const report = `🎓 **PUMPSWAP GRADUATION ALERT** 🎓\n\n` +
                       `🏷️ **Name:** ${name}\n` +
                       `✅ **Status:** Successfully Migrated to Raydium\n` +
                       `👥 **Top 10 Holders:** ${top10Sum.toFixed(1)}% (Safe Distro)\n` +
                       `🌐 **Socials:** Verified\n\n` +
                       `🚀 *This token has survived Pump.fun and is now on the open market!*\n\n` +
                       `🔗 [DexScreener](https://dexscreener.com/solana/${mint})\n` +
                       `🛒 [Swap on Raydium](https://raydium.io/swap/?inputMint=sol&outputMint=${mint})`;

        await bot.sendMessage(chatId, report, { parse_mode: 'Markdown', disable_web_page_preview: true });

    } catch (e) { console.log(`Migration Scan Error: ${e.message}`); }
}

function startRadar() {
    // Ab hum sirf graduation events ko listen karenge
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        console.log('✅ Connected: Hunting for Raydium Migrations...');
        // Subscribe to event where bonding curve is completed
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
    });

    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        
        // PumpPortal "mint" ke bajaye "txType" bhejta hai jab token graduate hota hai
        // Hum check karenge ke kya token migration complete hui hai
        if (event.txType === 'subscribeTokenTrade' && event.marketCapSol >= 80) { 
            if (!alertedMints.has(event.mint)) {
                alertedMints.add(event.mint);
                console.log(`🎓 Token Graduate Hua: ${event.mint.substring(0,8)}... Checking Raydium safety.`);
                // 30 second wait karein taake liquidity properly add ho jaye
                setTimeout(() => checkRaydiumGem(event.mint), 30000);
            }
        }
    });

    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
