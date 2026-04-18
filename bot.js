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

console.log('🛡️ V81 ONLINE: Iron-Clad Mode (Strict Filtration Active)');

async function performForensic(mint, chatId = TELEGRAM_CHAT_ID) {
    try {
        // 1. Holder & Curve Check
        const holdersRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] }, { headers: HEADERS });
        const holders = holdersRes.data.result.value;
        if (!holders || holders.length < 5) return;

        const curveSupply = (holders[0].uiAmount / 1000000000) * 100;
        
        // --- 🛑 SAKHT FILTER #1: Curve Drain Check ---
        // Agar curve 93% se upar hai, iska matlab koi buying activity nahi hai. 
        // Millions wale tokens 50 sec mein 85% se niche gir jate hain.
        if (curveSupply > 90) {
            console.log(`⏩ [${mint.substring(0,6)}] REJECTED: No Volume (Curve at ${curveSupply.toFixed(1)}%)`);
            return;
        }

        // 2. Metadata & Tool Check
        const assetRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }, { headers: HEADERS });
        const metaStr = JSON.stringify(assetRes.data.result || "").toLowerCase();
        
        // --- 🛑 SAKHT FILTER #2: Anti-Bundle/Anti-Tool ---
        const blacklistedKeywords = ["j7tracker", "sol-deployer", "v1-launcher", "mint-tool", "bundle"];
        const isSuspect = blacklistedKeywords.some(keyword => metaStr.includes(keyword));
        const hasSocials = metaStr.includes("t.me/") || metaStr.includes("x.com/") || metaStr.includes("twitter.com/");

        if (isSuspect) {
            console.log(`⏩ [${mint.substring(0,6)}] REJECTED: Bundle Tool Detected.`);
            return;
        }

        // 3. Holder Distribution
        let realTop10 = 0;
        for (let i = 1; i < holders.length && i <= 10; i++) {
            realTop10 += (holders[i].uiAmount / 1000000000) * 100;
        }

        // --- 🛑 SAKHT FILTER #3: Community Cap (Max 25%) ---
        const isDistributed = realTop10 < 25; 

        if (isDistributed && hasSocials) {
            const name = assetRes.data.result?.content?.metadata?.name || "Unknown";
            const progress = (100 - curveSupply).toFixed(1);

            console.log(`🔥 IRON-CLAD PASS: ${name} is moving fast!`);

            const report = `⚔️ **IRON-CLAD ALERT (HIGH QUALITY)** ⚔️\n\n` +
                           `🏷️ **Name:** ${name}\n` +
                           `📊 **Bonding Progress:** ${progress}% (Fast Moving) ✅\n` +
                           `📉 **Curve Left:** ${curveSupply.toFixed(1)}% ✅\n` +
                           `👥 **Real Top 10:** ${realTop10.toFixed(1)}% (Elite Distro) ✅\n\n` +
                           `🛠️ **Status:** Manual Launch & Organic Growth\n\n` +
                           `🔗 [Jupiter](https://jup.ag/swap/SOL-${mint}) | [DexScreener](https://dexscreener.com/solana/${mint})`;

            await bot.sendMessage(chatId, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
        } else {
            console.log(`⏩ [${mint.substring(0,6)}] REJECTED: Failed Distro (${realTop10.toFixed(1)}%) or No Socials.`);
        }

    } catch (e) { console.log(`Forensic Error: ${e.message}`); }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => {
        console.log('✅ Iron-Clad Radar Connected!');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });
    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        if (event.mint && !alertedMints.has(event.mint)) {
            alertedMints.add(event.mint);
            // Wait time thora kam kiya (45s) taake fast movers miss na hon
            setTimeout(() => performForensic(event.mint), 45000);
        }
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}
startRadar();
