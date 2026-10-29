# Xàm Xí Xíu

Ứng dụng desktop Windows tự động tạo video ngắn từ bài đăng Threads:

`INPUT → CAPTURE → ANALYZE → VOICE → TIMELINE`

## Yêu cầu

- Windows 10/11
- Node.js 20 trở lên
- Yarn Classic 1.x
- FFmpeg trên PATH, hoặc chạy `yarn fetch:binaries` để tải ffmpeg/ffprobe/Chromium vào `vendor/` (bản cài Windows đã nhúng sẵn)
- Tài khoản và API key DeepSeek
- Tài khoản Vbee TTS
- Cloudflared chỉ khi không dùng binary đi kèm app (`vendor/cloudflared.exe` hoặc bản cài)

Kiểm tra môi trường:

```powershell
node --version
yarn --version
```

## Cài đặt

Mở PowerShell tại thư mục project:

```powershell
cd "D:\congviec\Content Creator\Xàm Xí Xíu\xamxixiu-project"
yarn install
yarn fetch:binaries
```

`yarn fetch:binaries` tải Cloudflared, FFmpeg (ffmpeg + ffprobe) và Playwright Chromium vào `vendor/`. Bản đóng gói Windows nhúng sẵn các file này nên người dùng không cần cài Playwright hay FFmpeg. Khi chạy `yarn dev`, app cũng dùng binary trong `vendor/` nếu có; nếu chưa fetch thì vẫn tìm `ffmpeg`/`ffprobe` trên PATH và Chromium do Playwright tải.

## Cấu hình `.env`

Tạo file `.env` từ file mẫu:

```powershell
Copy-Item .env.example .env
```

Điền các giá trị sau:

```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

VBEE_ACCESS_TOKEN=your_vbee_access_token
VBEE_APP_ID=your_vbee_app_id
VBEE_WEBHOOK_URL=https://your-public-domain/webhooks/vbee
VBEE_WEBHOOK_PORT=3001
```

Không commit `.env` vì file này chứa secret.

Trong app desktop, bấm **Settings** trên header để điền DeepSeek API key, model, Vbee access token, app id và webhook port. Giá trị đã lưu nằm trong thư mục dữ liệu của app và được ưu tiên hơn `.env`.

App tự chạy `cloudflared` đi kèm và tự tạo URL webhook. Không cần cài Cloudflared hay điền `VBEE_WEBHOOK_URL` khi dùng giao diện. `CLOUDFLARED_PATH` chỉ cần khi muốn dùng một binary khác.

## Chạy app local

### 1. Chạy desktop app và Vbee Quick Tunnel

App dùng `vendor/cloudflared.exe` nếu file đó có sẵn (tải bằng `yarn fetch:cloudflared`). Nếu không, app tìm `cloudflared` trên `PATH`. Sau đó chạy:

```powershell
yarn dev
```

Electron sẽ tự động:

- Chạy webhook tại `http://localhost:3001/webhooks/vbee`
- Mở Cloudflare Quick Tunnel
- Tự lấy URL `https://...trycloudflare.com`
- Dùng URL đó cho các request Vbee

Lệnh này cũng chạy:

- Next.js renderer tại `http://localhost:3000`
- Electron desktop app

## Quy trình sử dụng

1. Nhập URL bài đăng Threads.
2. Bấm **Capture** để lấy bài viết, comment và screenshot.
3. Chỉnh sửa nội dung tại bước **Capture**, sau đó bấm **Save** nếu cần.
   - App tự cuộn trang để chụp tối đa `CAPTURE_COMMENT_TARGET` comment (mặc
     định 20).
   - Chữ viết tắt (`ko`, `đc`, `vs`...) được viết rõ sẵn trong ô nội dung
     (đó là chữ Vbee sẽ đọc); đối chiếu với screenshot bên trái. Sửa bảng
     viết tắt tại **Settings > Từ viết tắt**: thêm, sửa, xóa từ, tìm kiếm,
     thử nhanh kết quả và khôi phục danh sách mặc định. Danh sách lưu theo
     máy (`speech-abbreviations.json` trong thư mục dữ liệu của app) và chỉ
     áp dụng cho lần capture sau; danh sách khởi đầu nằm ở
     `src/comments/speech-abbreviations.ts`.
   - Bấm **AI chọn comment** để DeepSeek giữ khoảng `CURATE_KEEP_MIN`-
     `CURATE_KEEP_MAX` comment (mặc định 8-12) và **sắp xếp lại thứ tự**
     cho video mượt. Reply luôn đi liền sau comment cha; comment bị loại
     được dồn xuống cuối. Comment bị loại hiện lý do và lọc được bằng
     **Được dùng / Bị loại**; đổi checkbox **Exclude khỏi Analyze** để chỉnh
     tay, hoặc kéo thả để đổi lại thứ tự. Quyết định giữ/loại của bạn không
     bị AI ghi đè khi chạy lại. Chỉnh các giới hạn ở
     `src/comments/comment-constants.ts`.
4. Bấm **Next** để sang **Analyze**. DeepSeek sẽ phân tích tone, chủ đề, emotion và chọn voice.
5. Bấm **Next** để tạo audio bằng Vbee.
6. Nếu voice lỗi, các comment khác vẫn tiếp tục chạy. Item lỗi sẽ có nút **Retry**.
7. Bấm **Next** tại **Voice** để match meme/SFX rồi tạo timeline. Chọn lại
   meme, video, SFX, background và music ngay trên các track; timeline tự
   tính lại thời lượng sau mỗi lần đổi.
8. Dùng preview 9:16 và playhead trên track để kiểm tra trước khi xuất.
9. Ở bước **Timeline**, bấm **Xuất video** để render MP4 hoặc **Generate CapCut**
   để tạo project chỉnh sửa trong CapCut.

Project được lưu trong thư mục `projects/`. Thư mục này là dữ liệu runtime và được Git ignore.

## Local asset library

Media đầy đủ không nằm trong Git. Khi chạy `yarn dev`, app đọc thư viện từ thư mục `assets/` trong project và index file đã có. Bản cài Windows dùng:

```text
%APPDATA%\xamxixiu-project\assets
```

Lần chạy đầu của bản cài, app seed các file `_sample`. User tự import, sửa metadata/`spec`, preview và xóa ở trang **Library**, chia theo tab Meme ảnh, Meme video, SFX, Music và Background.

- Format hỗ trợ: meme ảnh/video (`png`, `jpg`, `webp`, `gif`, `mp4`, `mov`, `webm`), SFX/music (`mp3`, `wav`, `m4a`), background (`mp4`, `mov`, `webm`).
- Mỗi category trong Git chỉ giữ một media mẫu `_sample.*`.
- Meme video mẫu nằm ở `assets/memes/video/_sample/` kèm `reaction.mp4` và `spec.md`.
- Chỉ template `assets/memes/_template/spec.md` và spec của video sample được track. Spec của user-imported memes ở máy local.
- Xóa asset đang được project dùng sẽ bị chặn và app liệt kê project tham chiếu.
- CLI dùng `assets/` trong repo trừ khi set `XAMXIXIU_ASSET_ROOT`.

Trang **Library** quản lý thư viện meme, SFX, music và background.

Trong bước **Timeline** của project gán lại asset trên track:

- Click clip meme / video / SFX / background / music để chọn asset khác.
- Timeline rebuild theo duration file mới và rule timing hiện có.
- **Rematch** để chạy lại matching tự động rồi tạo lại timeline.

Installer Windows chỉ bundle sample, không đóng gói thư viện user.

## Meme video và asset spec

Mỗi meme video nên nằm trong một folder riêng dưới một category của
`assets/memes/`, cùng với file `spec.md`:

```text
assets/memes/
└── cringe/
    └── bro-thought-it-worked/
        ├── reaction.mp4
        └── spec.md
```

`spec.md` cần mô tả thời điểm nên dùng, sắc thái/cường độ, kiểu câu thoại phù
hợp, trường hợp không nên dùng, SFX đề xuất và animation đề xuất. Mỗi asset
phải khác nhau — không dùng chung câu “short visual punchline”. Có thể copy
`assets/memes/_template/spec.md` để bắt đầu. SFX cũng nên có spec/tag trong
Library.

Khi chạy `analyze`, AI nhận catalog gọn (`use` / `when` / `avoid`) chứ không
nhận nguyên `spec.md`. File `_sample` không được chọn. AI chọn `memeAssetId`
và `sfxAssetId` cụ thể. Với nội dung reaction-friendly, mục tiêu khoảng 65%
số comment dùng meme video; phần còn lại có thể là meme ảnh đi kèm SFX hoặc
transition chỉ-SFX. Meme video không cần SFX. Meme ảnh không được dùng nếu
không có SFX đi kèm. Nội dung nghiêm túc vẫn được phép có ít hoặc không có
reaction.

## Các lệnh CLI hữu ích

```powershell
yarn capture "https://www.threads.net/..."
yarn curate "projects/<project-id>"
yarn analyze "projects/<project-id>"
yarn generate-audio "projects/<project-id>"
yarn generate-audio "projects/<project-id>" comment-0
yarn scan-assets
yarn match-reactions "projects/<project-id>"
yarn create-timeline "projects/<project-id>"
```

## Build production

Build renderer và Electron:

```powershell
yarn build
```

Đóng gói bản Windows:

```powershell
yarn package:win
```

Installer nằm trong `dist/` (`Xam Xi Xiu Setup *.exe`). Lệnh này tự chạy `yarn fetch:binaries` nên lần đầu sẽ tải Chromium (~200 MB) và FFmpeg. Bản cài ghi project, profile browser và thư viện asset vào `%APPDATA%\xamxixiu-project\`, không ghi vào `Program Files`.

## Xuất video và Generate CapCut

Trong bước **Timeline**, mục **Xuất video** có hai nút:

- **Xuất video**: render file MP4 9:16 bằng FFmpeg từ timeline hiện tại.
- **Generate CapCut**: tạo project CapCut editable để chỉnh tiếp.

App dùng `capcut-cli` để tự tạo project rỗng và ghi timeline vào đó. CLI lấy
template từ project mới nhất do chính CapCut tạo ra, nên giữ đúng
version/schema của CapCut đang cài trên máy.

Cài CLI global:

```powershell
npm install --global capcut-cli@latest
capcut version "<đường-dẫn-project>"
```

Topic title dùng Vbee TTS với voice `ngoc-huyen`, không cần cài Python hoặc
thư viện TTS riêng nào khác.

Trong bước `TIMELINE`, bấm **Generate CapCut** để tạo project CapCut. App ghi vào thư
mục drafts trong **Settings**. Mặc định là:

```text
%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft
```

App sẽ:

- Chạy `capcut init` để tạo project mới và đăng ký project vào CapCut.
- Compile background, ảnh topic/comment, meme, voice, SFX và music.
- Căn ảnh comment ở scale 85%, vị trí dọc khoảng 1/3 màn hình (Y≈640) và giữ ảnh trên màn
  hình trong suốt thời gian meme/SFX đang chạy.
- Tắt tiếng track background.
- Đặt meme full width giữa khung hình và fade-in trong 0.5 giây.
- Meme và SFX có thời lượng xuất hiện tối thiểu 1 giây.
- Chuyển sang comment tiếp theo sau khi SFX/meme dài nhất của comment hiện tại
  kết thúc; SFX được giữ đủ thời lượng thật của file.
- Ghi vào active timeline của app-authored project.
- Chạy `capcut diagnose` và `capcut lint` sau khi compile.
- Giữ các track editable trong CapCut.

CapCut cần được đóng trước khi generate. CLI có safety guard và sẽ từ chối ghi
nếu `CapCut.exe` đang mở. Việc chọn base project thủ công chỉ còn dành cho
lệnh CLI tương thích cũ; flow trong app luôn tự tạo project mới.

Chạy thủ công:

```powershell
yarn create-capcut-project `
  "projects/<project-id>" `
  "%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft\1007"
```

## Xử lý lỗi thường gặp

### Không nhận được Vbee webhook

- Kiểm tra `yarn vbee-webhook` đang chạy.
- Kiểm tra `VBEE_WEBHOOK_PORT` là `3001`.
- Kiểm tra Cloudflared đang forward đến đúng port. App dùng binary đi kèm; nếu muốn bản khác thì set `CLOUDFLARED_PATH`.
- Kiểm tra `VBEE_WEBHOOK_URL` có đuôi `/webhooks/vbee`.

### DeepSeek không chạy

- Kiểm tra `DEEPSEEK_API_KEY`.
- Kiểm tra `DEEPSEEK_BASE_URL` và `DEEPSEEK_MODEL`.
- Xem log trong terminal đang chạy Electron.

### Threads không capture được

- Kiểm tra URL thuộc `threads.net` hoặc `threads.com`.
- Đảm bảo Chromium của Playwright đã được cài.
- Nếu Threads yêu cầu đăng nhập, kiểm tra dữ liệu browser local trong `.browser-data/`.

### Port đã được sử dụng

- Renderer mặc định dùng port `3000`.
- Webhook nên dùng port `3001`.
- Đóng process cũ hoặc thay đổi port tương ứng trước khi chạy lại.
