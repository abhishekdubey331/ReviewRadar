import gplay from 'google-play-scraper';
import appStore from 'app-store-scraper';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function scrapeReviews() {
    const appLink = process.env.APP_LINK;
    if (!appLink) {
        console.error("❌ Error: APP_LINK environment variable is not set. Please check your .env file.");
        process.exit(1);
    }

    console.log(`Scraping top recent reviews for App Link: ${appLink}`);

    let reviewsData = [];
    let platformName = '';

    try {
        if (appLink.includes('play.google.com')) {
            platformName = 'play_store';
            const parsedUrl = new URL(appLink);
            const appId = parsedUrl.searchParams.get('id');

            if (!appId) throw new Error("Could not extract 'id' from Play Store URL.");

            console.log(`Detected Google Play Store URL. App ID: ${appId}`);
            const results = await gplay.reviews({
                appId,
                sort: gplay.sort.NEWEST,
                num: 50000
            });
            reviewsData = results.data.map(review => ({
                id: review.id,
                userName: review.userName,
                text: review.text,
                score: review.score,
                version: review.version,
                date: review.date
            }));
        } else if (appLink.includes('apps.apple.com')) {
            platformName = 'app_store';
            const match = appLink.match(/\/id(\d+)/);
            if (!match || !match[1]) throw new Error("Could not extract numeric ID from App Store URL.");
            const appId = match[1];

            console.log(`Detected Apple App Store URL. App ID: ${appId}`);
            // Note: app-store-scraper paginates differently. We will pull highest amount feasible per page.
            const results = await appStore.reviews({
                appId,
                sort: appStore.sort.RECENT,
                page: 1, // first page only for demo, limits to ~50-500 depending on pagination behavior
            });
            reviewsData = results.map(review => ({
                id: review.id,
                userName: review.userName,
                text: review.text,
                score: review.score,
                version: review.version,
                date: review.url ? new Date().toISOString() : new Date().toISOString() // fallback if no date
            }));
        } else {
            throw new Error("Unsupported APP_LINK format. Must contain 'play.google.com' or 'apps.apple.com'.");
        }

        console.log(`Successfully scraped ${reviewsData.length} reviews.`);

        // Convert to the CSV format expected by our app
        const csvRows = ['review_id,platform,user_name,content,score,app_version,device,os_version,review_created_at'];

        for (const review of reviewsData) {
            const id = review.id;
            const platform = platformName;
            const user_name = `"${(review.userName || 'Anonymous').replace(/"/g, '""')}"`;

            // Redact raw newlines and quotes to not break CSV
            const content = `"${(review.text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;

            const score = review.score;
            const version = review.version || 'Unknown';
            const device = 'Unknown';
            const osVersion = 'Unknown';
            const createdAt = new Date(review.date).toISOString();

            csvRows.push(`${id},${platform},${user_name},${content},${score},${version},${device},${osVersion},${createdAt}`);
        }

        const outDir = path.join(__dirname, '../sample_data');
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }

        const filePath = path.join(outDir, 'scraped_reviews.csv');
        fs.writeFileSync(filePath, csvRows.join('\n'));
        console.log(`\n✅ Saved scraped reviews to ${filePath}`);
    } catch (error) {
        console.error("Failed to scrape reviews:", error);
    }
}

scrapeReviews();
