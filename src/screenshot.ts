import type { Page } from "playwright";

const PRESSABLE_SELECTOR =
  '[data-pressable-container="true"]';

export async function screenshotContainer(
  page: Page,
  containerIndex: number,
  outputPath: string
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

  await container.screenshot({
    path: outputPath
  });

  console.log(`Saved: ${outputPath}`);
}