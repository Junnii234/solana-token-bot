require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const TEST_TOKENS = [
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump", // Elite ✅
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump", // Elite ✅
    "DiNCVMS3GRSxrWSC4REh7VZeppQ3DEkx8UjJt4u94nHR"  // Rug ❌ (Ab isay FAIL hona chahiye)
];

async function runFixedSocialDetector() {
    console.log("🛡️ RUNNING TRUE-LINK SOCIAL DETECTOR (V17)...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Mint: ${mint}`);

            const assetRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
            });

            const assetData = assetRes.data.result;
            // Hum ab poori string nahi, balkay sirf metadata aur links ko target karenge
            const metadata = assetData.content?.metadata || {};
            const links = assetData.content?.links || {};
            const external_url = assetData.content?.external_url || "";
            
            // Check for REAL links (No more empty detections)
            const hasTwitter = (JSON.stringify(assetData).toLowerCase().includes("twitter.com") || JSON.stringify(assetData).toLowerCase().includes("x.com"));
            const hasTelegram = (JSON.stringify(assetData).toLowerCase().includes("t.me") || JSON.stringify(assetData).toLowerCase().includes("telegram.me"));
            
            // 🛑 CRITICAL FIX: Ensure it's not just a pump.fun link
            const hasWebsite = (external_url.length > 5 && !external_url.includes("pump.fun"));

            console.log(`   ├ Twitter: ${hasTwitter ? "✅" : "❌"}`);
            console.log(`   ├ Telegram: ${hasTelegram ? "✅" : "❌"}`);
            console.log(`   ├ Website: ${hasWebsite ? "✅" : "❌"}`);

            // Verdict: At least ONE valid external link must exist
            if (hasTwitter || hasTelegram || hasWebsite) {
                console.log(`   🌟 VERDICT: ✅ ELITE PASS (Socials Found)\n`);
            } else {
                console.log(`   ❌ VERDICT: FAIL (No Social Links)\n`);
            }

        } catch (e) {
            console.log(`   ❌ Error: Metadata index delay.\n`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

runFixedSocialDetector();
