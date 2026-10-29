import type { Locator, Page } from "playwright";

const PRESSABLE_SELECTOR =
  '[data-pressable-container="true"]';

const IMAGE_WAIT_MS = 8000;
const SETTLE_MS = 250;

/**
 * Lazy-loaded media (avatars, attached images) may still be loading right
 * after scrolling into view. Force eager loading, wait until every image in
 * the container is decoded (or the timeout passes), then let layout settle.
 */
async function waitForContainerReady(
  container: Locator
): Promise<void> {
  await container
    .evaluate(
      async (element, timeoutMs) => {
        const images = Array.from(
          element.querySelectorAll("img")
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
      },
      IMAGE_WAIT_MS
    )
    .catch(() => undefined);

  await container.page().waitForTimeout(SETTLE_MS);
}

/**
 * Scrolls the container into view just below any sticky/fixed top bar
 * (e.g. the "Thread" header) so nothing covers it, without hiding or
 * modifying the page.
 */
async function scrollBelowHeader(
  container: Locator
): Promise<void> {
  await container
    .evaluate((element) => {
      let headerBottom = 0;

      for (const node of Array.from(
        document.body.querySelectorAll<HTMLElement>("*")
      )) {
        if (
          node.contains(element) ||
          element.contains(node)
        ) {
          continue;
        }

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
          headerBottom = Math.max(
            headerBottom,
            rect.bottom
          );
        }
      }

      const rect = element.getBoundingClientRect();
      const margin = 16;

      if (
        rect.height + headerBottom + margin >
        window.innerHeight
      ) {
        // Taller than the viewport: align just below the header.
        window.scrollBy(
          0,
          rect.top - headerBottom - margin
        );
      } else {
        // Center within the area under the header.
        const free = window.innerHeight - headerBottom;
        const target =
          headerBottom + (free - rect.height) / 2;

        window.scrollBy(0, rect.top - target);
      }
    })
    .catch(() => undefined);
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
  cropBottomPx = 0,
  resolveIndex?: () => Promise<number | undefined>
): Promise<void> {
  const containers = page.locator(
    PRESSABLE_SELECTOR
  );

  let index = containerIndex;
  let stable = false;

  for (let attempt = 0; attempt < 4 && !stable; attempt++) {
    const count = await containers.count();

    if (index < 0 || index >= count) {
      throw new Error(
        `Container index ${index} is out of range. ` +
        `Found ${count} containers.`
      );
    }

    const container = containers.nth(index);

    await container.scrollIntoViewIfNeeded();
    await scrollBelowHeader(container);
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

  if (cropBottomPx <= 0) {
    await container.screenshot({
      path: outputPath
    });
  } else {
    const box =
      await container.boundingBox();

    if (!box) {
      throw new Error(
        `Could not measure container ${index}`
      );
    }

    await page.screenshot({
      path: outputPath,
      clip: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: Math.max(
          1,
          box.height - cropBottomPx
        )
      }
    });
  }

  console.log(`Saved: ${outputPath}`);
}
