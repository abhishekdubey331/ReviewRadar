import gplay from 'google-play-scraper';
import appStore from 'app-store-scraper';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { detectStoreProvider, extractStoreAppId, mapScrapedReview, toCsvRows } from './scrape_helpers.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function scrapeReviews() {
    const appLink = process.env.APP_LINK;
    if (!appLink) {
        throw new Error('APP_LINK environment variable is not set. Please check your .env file.');
    }

    console.log(`Scraping top recent reviews for App Link: ${appLink}`);

    let reviewsData = [];
    const platformName = detectStoreProvider(appLink);
    const appId = extractStoreAppId(appLink, platformName);

    if (platformName === 'play_store') {
        console.log(`Detected Google Play Store URL. App ID: ${appId}`);
        const results = await gplay.reviews({
            appId,
            sort: gplay.sort.NEWEST,
            num: 50000
        });
        reviewsData = results.data.map(mapScrapedReview);
    } else if (platformName === 'app_store') {
        console.log(`Detected Apple App Store URL. App ID: ${appId}`);
        const results = await appStore.reviews({
            appId,
            sort: appStore.sort.RECENT,
            page: 1
        });
        reviewsData = results.map(mapScrapedReview);
    }

    console.log(`Successfully scraped ${reviewsData.length} reviews.`);

    const csvRows = toCsvRows(reviewsData, platformName);
    const outDir = path.join(__dirname, '../sample_data');

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const filePath = path.join(outDir, 'scraped_reviews.csv');
    fs.writeFileSync(filePath, csvRows.join('\n'));
    console.log(`Saved scraped reviews to ${filePath}`);
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
    scrapeReviews().catch((error) => {
        console.error('Failed to scrape reviews:', error);
        process.exitCode = 1;
    });
}
