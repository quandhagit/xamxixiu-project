"use client";

import { AppChrome } from "../../features/app/AppChrome";
import { AssetLibraryManager } from "../../features/assets/AssetLibraryManager";

export default function LibraryPage(): React.ReactElement {
  return (
    <AppChrome active="library">
      <div className="min-h-0 flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8">
            <p className="text-sm text-fuchsia-300">Library</p>
            <h2 className="mt-2 text-3xl font-semibold">
              Asset library
            </h2>
            <p className="mt-2 text-zinc-400">
              Import, sửa metadata và xóa meme, SFX, music, background.
              Gán asset cho từng project ở bước Assets trong Workflow.
            </p>
          </div>
          <AssetLibraryManager />
        </div>
      </div>
    </AppChrome>
  );
}
