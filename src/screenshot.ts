import type { Locator, Page } from "playwright";
import sharp from "sharp";

import { PRESSABLE_SELECTOR } from "./extract.js";

const IMAGE_WAIT_MS = 1000;
const SETTLE_MS = 250;
const MAX_SCREENSHOT_ATTEMPTS = 2;

const headerBottomByPage = new WeakMap<Page, number>();

/**
 * Lazy-loaded media (avatars, attached images) may still be loading right
 * after scrolling into view. Force eager loading, wait until every image in
 * the container is decoded (or the timeout passes), then let layout settle
 * only when something still had to load.
 */
async function waitForContainerReady(
  container: Locator
): Promise<void> {
  const alreadyReady = await container
    .evaluate(
      async (element, timeoutMs) => {
        const images = Array.from(
          element.querySelectorAll("img")
        );
        const allComplete = images.every(
          (image) => image.complete
        );

        for (const image of images) {
          image.loading = "eager";
        }

        await Promise.race([
          Promise.all(
            images.map(async (image) => {
              if (!image.complete) {
                await new Promise<void>((resolve) => {
                  image.addEventListener("load", () => resolve(), {
                    once: true
                  });
                  image.addEventListener("error", () => resolve(), {
                    once: true
                  });
                });
              }

              await image.decode().catch(() => undefined);
            })
          ),
          new Promise((resolve) =>
            setTimeout(resolve, timeoutMs)
          )
        ]);

        await document.fonts?.ready;
        return allComplete;
      },
      IMAGE_WAIT_MS
    )
    .catch(() => false);

  if (!alreadyReady) {
    await container.page().waitForTimeout(SETTLE_MS);
  }
}

async function stickyHeaderBottom(
  page: Page
): Promise<number> {
  const cached = headerBottomByPage.get(page);

  if (cached !== undefined) {
    return cached;
  }

  const headerBottom = await page
    .evaluate(() => {
      let bottom = 0;

      for (const node of Array.from(
        document.body.querySelectorAll<HTMLElement>("*")
      )) {
        const style = getComputedStyle(node);

        if (
          style.position !== "fixed" &&
          style.position !== "sticky"
        ) {
          continue;
        }

        const rect = node.getBoundingClientRect();

        if (
          rect.height > 0 &&
          rect.height < window.innerHeight / 3 &&
          rect.width > window.innerWidth * 0.3 &&
          rect.top <= 8
        ) {
          bottom = Math.max(bottom, rect.bottom);
        }
      }

      return bottom;
    })
    .catch(() => 0);

  headerBottomByPage.set(page, headerBottom);
  return headerBottom;
}

/**
 * Scrolls the container into view just below any sticky/fixed top bar
 * (e.g. the "Thread" header) so nothing covers it, without hiding or
 * modifying the page.
 */
async function scrollBelowHeader(
  container: Locator,
  headerBottom: number
): Promise<void> {
  await container
    .evaluate((element, cachedHeaderBottom) => {
      const rect = element.getBoundingClientRect();
      const margin = 16;

      if (
        rect.height + cachedHeaderBottom + margin >
        window.innerHeight
      ) {
        // Taller than the viewport: align just below the header.
        window.scrollBy(
          0,
          rect.top - cachedHeaderBottom - margin
        );
      } else {
        // Center within the area under the header.
        const free = window.innerHeight - cachedHeaderBottom;
        const target =
          cachedHeaderBottom + (free - rect.height) / 2;

        window.scrollBy(0, rect.top - target);
      }
    }, headerBottom)
    .catch(() => undefined);
}

const screenshotOptions = {
  animations: "disabled" as const,
  caret: "hide" as const
};

const TOP_CROP_KEEP_PX = 8;
const TOP_CROP_MAX_PX = 20;
const TOP_CROP_MIN_CONTENT_PX = 16;
const COMPOSER_SELECTOR =
  '[contenteditable="true"][role="textbox"]';
const INNER_PRESSABLE_SELECTOR =
  '[data-pressable-container="true"]';

/**
 * The focused post wrap also contains the logged-in reply composer.
 * Prefer the inner pressable card that is not that composer.
 */
export function captureCardRoot<T>(
  root: T,
  composer: T | undefined,
  inners: T[],
  contains: (parent: T, child: T) => boolean
): T {
  if (composer === undefined) {
    return root;
  }

  return (
    inners.find((inner) => !contains(inner, composer)) ??
    root
  );
}

async function resolveCaptureLocator(
  container: Locator
): Promise<Locator> {
  const innerIndex = await container.evaluate(
    (
      element,
      selectors: { composer: string; pressable: string }
    ) => {
      const composer = element.querySelector(
        selectors.composer
      );

      if (!composer) {
        return -1;
      }

      const inners = Array.from(
        element.querySelectorAll(selectors.pressable)
      );

      return inners.findIndex(
        (inner) => !inner.contains(composer)
      );
    },
    {
      composer: COMPOSER_SELECTOR,
      pressable: INNER_PRESSABLE_SELECTOR
    }
  );

  if (innerIndex < 0) {
    return container;
  }

  return container
    .locator(INNER_PRESSABLE_SELECTOR)
    .nth(innerIndex);
}

export function isBottomChrome(
  rect: { width: number; height: number; bottom: number },
  viewport: { width: number; height: number }
): boolean {
  return (
    rect.height > 0 &&
    rect.height < viewport.height / 3 &&
    rect.width > viewport.width * 0.3 &&
    rect.bottom >= viewport.height - 8
  );
}

export function composerOverlayRoot<T>(
  composer: T,
  ancestors: T[],
  isOverlay: (node: T) => boolean
): T {
  let overlay = composer;

  for (const ancestor of ancestors) {
    if (isOverlay(ancestor)) {
      overlay = ancestor;
    }
  }

  return overlay;
}

/**
 * Hide the logged-in reply composer for the whole page, including a
 * fixed/sticky bottom bar that paints over comments we are capturing.
 */
async function withPageReplyComposerHidden<T>(
  page: Page,
  work: () => Promise<T>
): Promise<T> {
  await page
    .evaluate((selector) => {
      const hide = (node: Element): void => {
        if (!(node instanceof HTMLElement)) {
          return;
        }

        if (node.dataset.xamxixiuHide !== undefined) {
          return;
        }

        node.dataset.xamxixiuHide = node.style.display;
        node.style.display = "none";
      };

      const overlayRoot = (composer: HTMLElement): HTMLElement => {
        let overlay = composer;
        let node = composer.parentElement;

        while (node && node !== document.body) {
          const style = getComputedStyle(node);

          if (
            style.position === "fixed" ||
            style.position === "sticky"
          ) {
            overlay = node;
          }

          node = node.parentElement;
        }

        return overlay;
      };

      for (const composer of Array.from(
        document.querySelectorAll(selector)
      )) {
        if (composer instanceof HTMLElement) {
          hide(overlayRoot(composer));
        }
      }

      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      };

      for (const node of Array.from(
        document.body.querySelectorAll<HTMLElement>("*")
      )) {
        const style = getComputedStyle(node);

        if (
          style.position !== "fixed" &&
          style.position !== "sticky"
        ) {
          continue;
        }

        const rect = node.getBoundingClientRect();

        if (
          rect.height <= 0 ||
          rect.height >= viewport.height / 3 ||
          rect.width <= viewport.width * 0.3 ||
          rect.bottom < viewport.height - 8
        ) {
          continue;
        }

        if (
          node.matches(selector) ||
          node.querySelector(selector)
        ) {
          hide(node);
        }
      }
    }, COMPOSER_SELECTOR)
    .catch(() => undefined);

  try {
    return await work();
  } finally {
    await page
      .evaluate(() => {
        for (const node of Array.from(
          document.querySelectorAll("[data-xamxixiu-hide]")
        )) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }

          node.style.display = node.dataset.xamxixiuHide ?? "";
          delete node.dataset.xamxixiuHide;
        }
      })
      .catch(() => undefined);
  }
}

export function screenshotClipRect(
  box: { x: number; y: number; width: number; height: number },
  cropTopPx = 0,
  cropBottomPx = 0
): { x: number; y: number; width: number; height: number } {
  const cropTop = Math.max(0, cropTopPx);
  const cropBottom = Math.max(0, cropBottomPx);
  const x = Math.floor(box.x);
  const y = Math.floor(box.y + cropTop);
  const right = Math.floor(box.x + box.width);
  const bottom = Math.floor(box.y + box.height - cropBottom);

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y)
  };
}

export function screenshotClipFitsViewport(
  viewport: { width: number; height: number } | null,
  clip: { x: number; y: number; width: number; height: number }
): boolean {
  if (!viewport) {
    return false;
  }

  return (
    clip.x >= 0 &&
    clip.y >= 0 &&
    clip.x + clip.width <= viewport.width &&
    clip.y + clip.height <= viewport.height
  );
}

/**
 * Map CSS-pixel crops onto a device-pixel screenshot (e.g. iPhone 13 @3x).
 */
export function screenshotExtractRect(
  image: { width: number; height: number },
  cssSize: { width: number; height: number },
  cropTopPx = 0,
  cropBottomPx = 0
): { left: number; top: number; width: number; height: number } {
  const scaleY =
    image.height / Math.max(1, cssSize.height);
  const top = Math.max(
    0,
    Math.round(Math.max(0, cropTopPx) * scaleY)
  );
  const bottom = Math.max(
    0,
    Math.round(Math.max(0, cropBottomPx) * scaleY)
  );
  const extractTop = Math.min(top, Math.max(0, image.height - 1));

  return {
    left: 0,
    top: extractTop,
    width: Math.max(1, image.width),
    height: Math.max(1, image.height - extractTop - bottom)
  };
}

/**
 * Threads cards include padding above the avatar/username. Measure that
 * extra space so the screenshot can start just above the real content.
 */
async function contentInsetTopPx(
  container: Locator
): Promise<number> {
  return container
    .evaluate(
      (element, options: {
        keepPx: number;
        maxPx: number;
        minContentPx: number;
      }) => {
        const box = element.getBoundingClientRect();
        let contentTop = Number.POSITIVE_INFINITY;

        const consider = (rect: DOMRect): void => {
          if (
            rect.width < options.minContentPx ||
            rect.height < options.minContentPx
          ) {
            return;
          }

          if (
            rect.bottom <= box.top ||
            rect.top >= box.bottom
          ) {
            return;
          }

          contentTop = Math.min(contentTop, rect.top);
        };

        for (const image of Array.from(
          element.querySelectorAll("img")
        )) {
          consider(image.getBoundingClientRect());
        }

        for (const node of Array.from(
          element.querySelectorAll("span, a, p, [dir='auto']")
        )) {
          if (!(node.textContent ?? "").trim()) {
            continue;
          }

          consider(node.getBoundingClientRect());
        }

        if (!Number.isFinite(contentTop)) {
          return 0;
        }

        return Math.min(
          options.maxPx,
          Math.max(
            0,
            Math.floor(contentTop - box.top - options.keepPx)
          )
        );
      },
      {
        keepPx: TOP_CROP_KEEP_PX,
        maxPx: TOP_CROP_MAX_PX,
        minContentPx: TOP_CROP_MIN_CONTENT_PX
      }
    )
    .catch(() => 0);
}

/**
 * @param resolveIndex Optional. Returns the container's *current* index
 *   (or undefined if it is gone). Threads virtualizes its list, so the
 *   index can shift while scrolling/loading; the capture follows the
 *   content instead of the stale index.
 */
export async function screenshotContainer(
  page: Page,
  containerIndex: number,
  outputPath: string,
  resolveIndex?: () => Promise<number | undefined>,
  stitchOverflow = false
): Promise<void> {
  const containers = page.locator(
    PRESSABLE_SELECTOR
  );
  const headerBottom = await stickyHeaderBottom(page);

  await withPageReplyComposerHidden(page, async () => {
    let index = containerIndex;
    let stable = false;

    for (
      let attempt = 0;
      attempt < MAX_SCREENSHOT_ATTEMPTS && !stable;
      attempt++
    ) {
      const count = await containers.count();

      if (index < 0 || index >= count) {
        throw new Error(
          `Container index ${index} is out of range. ` +
          `Found ${count} containers.`
        );
      }

      const container = containers.nth(index);

      await container.scrollIntoViewIfNeeded();
      await scrollBelowHeader(container, headerBottom);
      await waitForContainerReady(container);

      if (!resolveIndex) {
        stable = true;
        break;
      }

      const current = await resolveIndex();

      if (current === undefined) {
        throw new Error(
          "Nội dung trang đã thay đổi trong lúc chụp, hãy thử lại."
        );
      }

      stable = current === index;
      index = current;
    }

    if (!stable) {
      throw new Error(
        "Nội dung trang đã thay đổi trong lúc chụp, hãy thử lại."
      );
    }

    const container = containers.nth(index);
    const target = await resolveCaptureLocator(container);
    const cropTopPx = await contentInsetTopPx(target);

    if (cropTopPx <= 0) {
      await target.screenshot({
        path: outputPath,
        ...screenshotOptions
      });
      return;
    }

    const box = await target.boundingBox();

    if (!box) {
      throw new Error(
        `Could not measure container ${index}`
      );
    }

    const clip = screenshotClipRect(box, cropTopPx);

    if (
      stitchOverflow &&
      !screenshotClipFitsViewport(page.viewportSize(), clip)
    ) {
      const buffer = await target.screenshot({
        ...screenshotOptions
      });
      const metadata = await sharp(buffer).metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error(
          `Could not measure screenshot for container ${index}`
        );
      }

      await sharp(buffer)
        .extract(
          screenshotExtractRect(
            {
              width: metadata.width,
              height: metadata.height
            },
            {
              width: box.width,
              height: box.height
            },
            cropTopPx
          )
        )
        .png()
        .toFile(outputPath);
      return;
    }

    await page.screenshot({
      path: outputPath,
      ...screenshotOptions,
      clip
    });
  });

  console.log(`Saved: ${outputPath}`);
}
