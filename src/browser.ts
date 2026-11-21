import {
    chromium,
    devices,
    type BrowserContext,
    type Page
} from "playwright";
import {
    getBrowserDataDir,
    resolveChromiumExecutable
} from "./binaries.js";
import {
    DEFAULT_CAPTURE_VIEWPORT,
    parseCaptureViewport,
    type CaptureViewport
} from "./types.js";

export {
    DEFAULT_CAPTURE_VIEWPORT,
    parseCaptureViewport
};
export type { CaptureViewport };

const DESKTOP_VIEWPORT = {
    width: 1440,
    height: 1200
} as const;

let loginBrowserOpen = false;

export async function createContext(
    viewport: CaptureViewport = DEFAULT_CAPTURE_VIEWPORT
): Promise<BrowserContext> {
    if (loginBrowserOpen) {
        throw new Error(
            "Cửa sổ đăng nhập Threads đang mở. Hãy đăng nhập xong và đóng cửa sổ đó trước khi capture."
        );
    }

    return launchContext(parseCaptureViewport(viewport));
}

async function launchContext(
    viewport: CaptureViewport = "desktop"
): Promise<BrowserContext> {
    const executablePath = resolveChromiumExecutable();
    const mobile = devices["iPhone 13"];

    return chromium.launchPersistentContext(getBrowserDataDir(), {
        ...(executablePath ? { executablePath } : {}),
        headless: false,
        ...(viewport === "mobile"
            ? {
                userAgent: mobile.userAgent,
                viewport: mobile.viewport,
                deviceScaleFactor: mobile.deviceScaleFactor,
                isMobile: mobile.isMobile,
                hasTouch: mobile.hasTouch
            }
            : {
                viewport: DESKTOP_VIEWPORT
            })
    });
}

export function isLoginBrowserOpen(): boolean {
    return loginBrowserOpen;
}

/**
 * Opens the persistent Chromium profile on the Threads login page so the
 * user can sign in manually. Resolves when the user closes the window.
 * There is deliberately no timeout.
 */
export async function openLoginBrowser(): Promise<void> {
    if (loginBrowserOpen) {
        throw new Error(
            "Cửa sổ đăng nhập đang mở. Hãy đăng nhập rồi đóng cửa sổ đó."
        );
    }

    loginBrowserOpen = true;

    try {
        const context = await launchContext("desktop");
        const closed = new Promise<void>((resolve) => {
            context.on("close", () => resolve());
        });

        const page = context.pages()[0] ?? await context.newPage();
        await page
            .goto("https://www.threads.com/login", {
                waitUntil: "domcontentloaded"
            })
            .catch(() => undefined);

        await closed;
    } finally {
        loginBrowserOpen = false;
    }
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
