import type { Page } from "playwright";

const PRESSABLE_SELECTOR =
  '[data-pressable-container="true"]';

export async function screenshotContainer(
  page: Page,
  containerIndex: number,
  outputPath: string,
  cropBottomPx = 0
): Promise<void> {
  const containers = page.locator(
    PRESSABLE_SELECTOR
  );

  const count = await containers.count();

  if (containerIndex < 0 || containerIndex >= count) {
    throw new Error(
      `Container index ${containerIndex} is out of range. ` +
      `Found ${count} containers.`
    );
  }

  const container = containers.nth(
    containerIndex
  );

  await container.scrollIntoViewIfNeeded();

  if (cropBottomPx <= 0) {
    await container.screenshot({
      path: outputPath
    });
  } else {
    const box =
      await container.boundingBox();

    if (!box) {
      throw new Error(
        `Could not measure container ${containerIndex}`
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