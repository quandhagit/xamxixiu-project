import {
    chromium,
    type BrowserContext,
    type Page
} from "playwright";

export async function createContext(): Promise<BrowserContext> {
    return chromium.launchPersistentContext("./.browser-data", {
        headless: false,
        viewport: {
            width: 1440,
            height: 1200
        }
    });
}

export async function openThreads(
    context: BrowserContext,
    url: string
): Promise<Page> {
    const page = context.pages()[0] ?? await context.newPage();

    await page.goto(url, {
        waitUntil: "domcontentloaded"
    });

    return page;
}