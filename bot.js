require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

const TEST_TOKENS = [
    "7voyyzYZVgZSmpzVqVZekmyZMtz1u7Cn29b84bVpump", // Expected: PASS
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump", // Expected: PASS
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump", // Expected: PASS
    "GRMRCsJJEEYXChrSDGaAsuK3W8YooF2R69GcdCXDpump", // Expected: FAIL
    "kLqMvUm1p4pRbxU4r8kWCTVAuWMJLtcTJqGb4b5pump", // Expected: FAIL
    "DiNCVMS3GRSxrWSC4REh7VZeppQ3DEkx8UjJt4u94nHR", // Expected: FAIL
    "3vvDYGkavdt1FNoUw1r5YxDTA6SrWRbHtUV72Ltkpump"  // Expected: FAIL
];

async function runTest() {
    console.log("🛠️ STARTING V7 ULTRA-FORENSIC TEST...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Token: ${mint}`);

            // 1. Get Metadata & Real Creator via DAS (Socials logic update)
            const assetRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: "f", method: "getAsset", params: { id: mint }
            });

            const asset = assetRes.data.result;
            const creator = asset.authorities?.[0]?.address || asset.creators?.[0]?.address || "Unknown";
            
            // Socials Check from multiple places in Helius response
            const meta = asset.content?.metadata || {};
            const links = asset.content?.links || {};
            const hasSocials = links.twitter || links.telegram || meta.description?.includes("http") || JSON.stringify(meta).includes("twitter");

            console.log(`   ├ Creator: ${creator}`);
            console.log(`   ├ Socials: ${hasSocials ? "✅" : "❌"}`);

            // 2. NEW FORENSIC: Check First 5 Signatures ONLY (To find Funding)
            const sigsRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0", id: "s", method: "getSignaturesForAddress", params: [creator, { limit: 10 }]
            });
            const sigs = sigsRes.data.result || [];
            
            // Professional Logic: If first few TXs are fresh, it's a good dev
            let status = "❌ FAIL";
            if (hasSocials && sigs.length <= 25) { // Adjusted limit for real dev activity
                status = "🌟 PASS (ELITE)";
            } else if (hasSocials && sigs.length > 25) {
                status = "❌ FAIL (Old/Ganda Wallet)";
            }

            console.log(`   └ Result: ${status} | TX Count: ${sigs.length}\n`);

        } catch (e) {
            console.log(`   ❌ Error: ${e.message}\n`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

runTest();
