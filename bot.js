require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const TEST_TOKENS = [
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump", // Real (Teeno hone chahiye)
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump" ,
    "8WXgE4GYHaPjyf4pujqx4293FhxK5u9GkDifG3pppump"
    
    // Real (Teeno hone chahiye)
];

async function runDeepSocialCrawl() {
    console.log("🕵️‍♂️ STARTING DEEP SOCIAL CRAWL (V18)...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Mint: ${mint}`);

            const assetRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
            });

            const assetData = assetRes.data.result;
            // Poore response ko aik bari string mein convert karo
            const dump = JSON.stringify(assetData).toLowerCase();

            // --- 🔎 REGEX SEARCH (The Secret Sauce) ---
            // Yeh pattern har tarah ki links ko pakar lega, chahe woh kahin bhi chhupi hon
            const tgPattern = /t\.me\/[a-zA-Z0-9_]{3,}/g;
            const twitterPattern = /(twitter\.com|x\.com)\/[a-zA-Z0-9_]{3,}/g;
            const webPattern = /https?:\/\/(?!pump\.fun|ipfs\.io|arweave\.net)[a-zA-Z0-9.-]+\.[a-z]{2,}/g;

            const foundTG = dump.match(tgPattern);
            const foundTwitter = dump.match(twitterPattern);
            const foundWeb = dump.match(webPattern);

            console.log(`   ├ Telegram: ${foundTG ? `✅ (${foundTG[0]})` : "❌"}`);
            console.log(`   ├ Twitter: ${foundTwitter ? `✅ (${foundTwitter[0]})` : "❌"}`);
            console.log(`   ├ Website: ${foundWeb ? `✅ (${foundWeb[0]})` : "❌"}`);

            if (foundTG || foundTwitter || foundWeb) {
                console.log(`   🌟 VERDICT: ✅ PASS (Deep Socials Found)\n`);
            } else {
                console.log(`   ❌ VERDICT: FAIL\n`);
            }

        } catch (e) {
            console.log(`   ❌ Error: Metadata Scan Failed.\n`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

runDeepSocialCrawl();
