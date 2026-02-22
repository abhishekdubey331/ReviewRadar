import gplay from 'google-play-scraper';
import appStore from 'app-store-scraper';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function normalizeReviewDate(review) {
    const raw = review?.date ?? review?.updated ?? review?.updatedAt ?? review?.created ?? review?.createdAt;
    const parsed = raw ? new Date(raw) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function toCsvRows(reviewsData, platformName) {
    const csvRows = ['review_id,platform,user_name,content,score,app_version,device,os_version,review_created_at'];

    for (const review of reviewsData) {
        const id = review.id;
        const platform = platformName;
        const user_name = `"${(review.userName || 'Anonymous').replace(/"/g, '""')}"`;
        const content = `"${(review.text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        const score = review.score;
        const version = review.version || 'Unknown';
        const device = 'Unknown';
        const osVersion = 'Unknown';
        const createdAt = normalizeReviewDate(review);

        csvRows.push(`${id},${platform},${user_name},${content},${score},${version},${device},${osVersion},${createdAt}`);
    }

    return csvRows;
}

export async function scrapeReviews() {
    const appLink = process.env.APP_LINK;
    if (!appLink) {
        throw new Error('APP_LINK environment variable is not set. Please check your .env file.');
    }

    console.log(`Scraping top recent reviews for App Link: ${appLink}`);

    let reviewsData = [];
    let platformName = '';

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

        reviewsData = results.data.map((review) => ({
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
        if (!match || !match[1]) throw new Error('Could not extract numeric ID from App Store URL.');
        const appId = match[1];

        console.log(`Detected Apple App Store URL. App ID: ${appId}`);
        const results = await appStore.reviews({
            appId,
            sort: appStore.sort.RECENT,
            page: 1
        });

        reviewsData = results.map((review) => ({
            id: review.id,
            userName: review.userName,
            text: review.text,
            score: review.score,
            version: review.version,
            date: review.date ?? review.updated ?? review.updatedAt ?? review.createdAt
        }));
    } else {
        throw new Error("Unsupported APP_LINK format. Must contain 'play.google.com' or 'apps.apple.com'.");
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
