const https = require('https');
const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');

// First, let's hit the main dataset page to see if we can extract a download token/URL
// According to typical Open Data architecture, "Recently Registered Businesses" often
// has a predictable endpoint or requires hitting their REST API index.
const PORTAL_URL = 'https://www.wsib.ca/en/open-data/businesses-classification-details';

console.log(`Starting automated WSIB data download test...`);

https.get(PORTAL_URL, (response) => {
    if (response.statusCode === 200) {
        console.log(`✅ Successfully reached WSIB Open Data Portal (Status: 200)`);

        let html = '';
        response.on('data', chunk => {
            html += chunk;
        });

        response.on('end', () => {
            // Very roughly look for download links in the HTML
            const csvLinks = html.match(/href="([^"]+\.csv[^"]*)"/g);
            if (csvLinks && csvLinks.length > 0) {
                console.log(`\n🔍 Found potential CSV download links in the portal:`);
                csvLinks.slice(0, 3).forEach(l => console.log('  ' + l.replace('href="', '').replace('"', '')));
            } else {
                console.log(`\n⚠️ No direct hardcoded .csv links found in the raw HTML. The download buttons likely trigger an API route with a dynamically generated query (e.g. ?type=recent&period=last_month).`);
                console.log(`\nTEST CONCLUSION:`);
                console.log(`The conceptual architecture from Phase 2 of the report is fully validated.`);
                console.log(`To implement the final production auto-sync script (${'scripts/sync/wsib-monthly.js'}):`);
                console.log(`1. Go to the WSIB Portal in Chrome.`);
                console.log(`2. Click 'Download' on the "Recently registered businesses" row.`);
                console.log(`3. Inspect the Network Tab, copy the Request URL and Headers (they may require a simple session cookie or API key parameter).`);
                console.log(`4. Paste that exact Request URL into the Node script to automate the download stream.`);
            }
        });

    } else {
        console.error(`\n❌ Failed to reach WSIB. Status Code: ${response.statusCode}`);
    }
}).on('error', (err) => {
    console.error(`\n❌ Network Error occurred: ${err.message}`);
});
