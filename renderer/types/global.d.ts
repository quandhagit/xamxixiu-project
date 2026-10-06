import type {
  DesktopApi
} from "../../src/electron/ipc-types";

declare global {
  interface Window {
    xamxixiu: DesktopApi;
  }
}

export {};
