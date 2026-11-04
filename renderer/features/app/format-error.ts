const IPC_PREFIX =
  /^Error invoking remote method '[^']*':\s*/;
const ERROR_PREFIX = /^(?:[A-Za-z]*Error):\s*/;

/** Messages that are already Vietnamese-friendly pass through unchanged. */
const TRANSLATIONS: Array<
  [RegExp, (match: RegExpMatchArray) => string]
> = [
  [
    /^Could not find the reply comment$/,
    () =>
      "Không tìm thấy comment trong trang. Hãy kiểm tra lại link."
  ],
  [
    /^Could not extract the reply comment$/,
    () => "Không đọc được nội dung comment."
  ],
  [
    /^Could not extract any Threads content$/,
    () => "Không đọc được nội dung từ Threads."
  ],
  [
    /^Could not find any Threads containers$/,
    () => "Không tìm thấy bài viết nào trên trang Threads."
  ],
  [
    /^Threads URL cannot be empty$/,
    () => "Link Threads không được để trống."
  ],
  [
    /^Invalid Threads URL$/,
    () => "Link Threads không hợp lệ."
  ],
  [
    /^URL must belong to Threads$/,
    () => "Link phải thuộc Threads."
  ],
  [
    /^Invalid capture comment payload$/,
    () => "Dữ liệu thêm comment không hợp lệ."
  ],
  [
    /^imageIndex must be/,
    () => "Vị trí ảnh không hợp lệ."
  ],
  [
    /^Existing comments are invalid$/,
    () => "Danh sách comment hiện tại không hợp lệ."
  ],
  [
    /^Project could not be loaded: (.+)$/,
    (m) => `Không thể tải project: ${m[1]}`
  ],
  [
    /^Captured project could not be loaded: (.+)$/,
    (m) => `Không thể tải project vừa capture: ${m[1]}`
  ],
  [
    /^Invalid project id/,
    () => "ID project không hợp lệ."
  ],
  [
    /^Could not create project state: (.+)$/,
    (m) => `Không thể tạo trạng thái project: ${m[1]}`
  ],
  [
    /^Invalid project asset path$/,
    () => "Đường dẫn asset của project không hợp lệ."
  ],
  [
    /^Unsupported project asset type$/,
    () => "Loại asset của project không được hỗ trợ."
  ],
  [
    /^Project asset path is outside the project$/,
    () => "Đường dẫn asset nằm ngoài project."
  ],
  [
    /^Preview asset path is outside/,
    () => "Đường dẫn asset xem trước nằm ngoài thư mục cho phép."
  ],
  [
    /^Unsupported preview asset type$/,
    () => "Loại asset xem trước không được hỗ trợ."
  ],
  [
    /^Preview asset not found: topic title card$/,
    () => "Không tìm thấy ảnh tiêu đề chủ đề."
  ],
  [
    /^Preview asset not found: (.+)$/,
    (m) => `Không tìm thấy asset xem trước: ${m[1]}`
  ],
  [
    /^Invalid asset import payload$/,
    () => "Dữ liệu import asset không hợp lệ."
  ],
  [
    /^Invalid asset update payload$/,
    () => "Dữ liệu cập nhật asset không hợp lệ."
  ],
  [
    /^Invalid asset assignment payload$/,
    () => "Dữ liệu gán asset không hợp lệ."
  ],
  [
    /^Invalid timeline asset payload$/,
    () => "Dữ liệu asset timeline không hợp lệ."
  ],
  [
    /^Invalid voice payload$/,
    () => "Dữ liệu giọng đọc không hợp lệ."
  ],
  [
    /^Invalid topic intro payload$/,
    () => "Dữ liệu topic title không hợp lệ."
  ],
  [
    /^Invalid topic title$/,
    () => "Topic title không hợp lệ."
  ],
  [
    /^Invalid asset id$/,
    () => "ID asset không hợp lệ."
  ],
  [/^Invalid path$/, () => "Đường dẫn không hợp lệ."],
  [
    /^Unsupported (\w+) asset: (.+)$/,
    (m) => `Asset ${m[1]} không được hỗ trợ: ${m[2]}`
  ],
  [
    /^Asset source is not a file: (.+)$/,
    (m) => `Nguồn asset không phải là file: ${m[1]}`
  ],
  [
    /^Asset not found: (.+)$/,
    (m) => `Không tìm thấy asset: ${m[1]}`
  ],
  [
    /^Asset tags must be strings$/,
    () => "Tag của asset phải là chuỗi."
  ],
  [
    /^Asset intensity must be between 0 and 1$/,
    () => "Cường độ asset phải nằm trong khoảng 0 đến 1."
  ],
  [
    /^Asset spec must be a string$/,
    () => "Spec của asset phải là chuỗi."
  ],
  [
    /^Invalid asset catalog$/,
    () => "Danh mục asset không hợp lệ."
  ],
  [
    /^Asset path escapes the library root$/,
    () => "Đường dẫn asset nằm ngoài thư viện."
  ],
  [
    /^Unknown (meme|SFX|\w+) asset: (.+)$/,
    (m) => `Không tìm thấy asset ${m[1]}: ${m[2]}`
  ],
  [
    /^Unknown asset: (.+)$/,
    (m) => `Không tìm thấy asset: ${m[1]}`
  ],
  [
    /^Asset (.+) is not (?:a )?(.+)$/,
    (m) => `Asset ${m[1]} không phải loại ${m[2]}.`
  ],
  [
    /^Unknown voice: (.+)$/,
    (m) => `Không tìm thấy giọng đọc: ${m[1]}`
  ],
  [
    /^Project analysis is missing$/,
    () => "Project chưa có kết quả phân tích."
  ],
  [
    /^Invalid voice target: (.+)$/,
    (m) => `Mục tiêu giọng đọc không hợp lệ: ${m[1]}`
  ],
  [
    /^No analysis reaction for comment (\d+)$/,
    (m) => `Chưa có phản ứng phân tích cho comment ${m[1]}.`
  ],
  [
    /^Reactions must be an array$/,
    () => "Danh sách reaction phải là mảng."
  ],
  [
    /^Invalid reaction assignment$/,
    () => "Gán reaction không hợp lệ."
  ],
  [
    /^Video memes cannot use SFX/,
    () => "Meme video không thể dùng SFX hoặc animation."
  ],
  [
    /^(Background|Music) cannot be removed from the timeline$/,
    (m) =>
      `Không thể xóa ${m[1] === "Music" ? "nhạc nền" : "background"} khỏi timeline.`
  ],
  [
    /^Invalid comment index$/,
    () => "Vị trí comment không hợp lệ."
  ],
  [
    /^imageSlots length/,
    () => "Số ảnh không khớp với số comment."
  ],
  [
    /^imageOrder length/,
    () => "Thứ tự ảnh không khớp với số comment."
  ],
  [
    /^imageOrder must be/,
    () => "Thứ tự ảnh không hợp lệ."
  ],
  [
    /^Could not reorder comments$/,
    () => "Không thể sắp xếp lại comment."
  ],
  [
    /^Invalid comment order$/,
    () => "Thứ tự comment không hợp lệ."
  ],
  [
    /^Cannot combine empty comment scenes$/,
    () => "Không thể ghép các cảnh comment trống."
  ],
  [
    /^analysis\.json reactions are invalid$/,
    () => "Reaction trong analysis.json không hợp lệ."
  ],
  [
    /^reactions\.json is invalid$/,
    () => "File reactions.json không hợp lệ."
  ],
  [
    /^audio-failures\.json is invalid$/,
    () => "File audio-failures.json không hợp lệ."
  ],
  [
    /^DEEPSEEK_API_KEY is not configured$/,
    () => "Chưa cấu hình DeepSeek API key."
  ],
  [
    /^DeepSeek returned an empty response\.?$/,
    () => "DeepSeek trả về phản hồi rỗng."
  ],
  [
    /^DeepSeek request failed after retries\.?$/,
    () => "Yêu cầu tới DeepSeek thất bại sau nhiều lần thử."
  ],
  [
    /^Failed to parse DeepSeek response as JSON\.?$/,
    () => "Không đọc được phản hồi JSON từ DeepSeek."
  ],
  [
    /^No content\.json or thread\.json in (.+)$/,
    (m) => `Không có content.json hoặc thread.json trong ${m[1]}`
  ],
  [
    /^(.+) is not configured$/,
    (m) => `Chưa cấu hình ${m[1]}.`
  ],
  [
    /^Vbee TTS text cannot be empty$/,
    () => "Nội dung đọc Vbee không được để trống."
  ],
  [
    /^Vbee text exceeds 100000 characters: (\d+)$/,
    (m) => `Nội dung Vbee vượt quá 100000 ký tự: ${m[1]}`
  ],
  [
    /^Vbee create request failed \((\d+)\): (.+)$/,
    (m) => `Tạo yêu cầu Vbee thất bại (${m[1]}): ${m[2]}`
  ],
  [
    /^Vbee get request failed \((\d+)\): (.+)$/,
    (m) => `Lấy kết quả Vbee thất bại (${m[1]}): ${m[2]}`
  ],
  [
    /^Vbee did not return requestId/,
    () => "Vbee không trả về requestId."
  ],
  [
    /^Vbee processing failed: (.+)$/,
    (m) => `Vbee xử lý thất bại: ${m[1]}`
  ],
  [
    /^Vbee TTS request failed: (.+)$/,
    (m) => `Yêu cầu Vbee TTS thất bại: ${m[1]}`
  ],
  [
    /^Vbee TTS failed \(fallback\): (.+)$/,
    (m) => `Vbee TTS thất bại (dự phòng): ${m[1]}`
  ],
  [
    /^Vbee callback missing audio_link$/,
    () => "Callback của Vbee thiếu audio_link."
  ],
  [
    /^Failed to download audio from .+ \((\d+)\)$/,
    (m) => `Không tải được audio (mã ${m[1]}).`
  ],
  [
    /^Downloaded audio is empty$/,
    () => "File audio tải về bị rỗng."
  ],
  [
    /^Request (.+) not found in store$/,
    (m) => `Không tìm thấy yêu cầu ${m[1]}.`
  ],
  [
    /^Timeout waiting for Vbee request (.+)$/,
    (m) => `Hết thời gian chờ yêu cầu Vbee ${m[1]}.`
  ],
  [
    /^VOICE_POOL is empty$/,
    () => "Danh sách giọng đọc đang trống."
  ],
  [
    /^Invalid VBEE_WEBHOOK_PORT: (.+)$/,
    (m) => `Cổng webhook Vbee không hợp lệ: ${m[1]}`
  ],
  [
    /^Timed out waiting for Cloudflare Quick Tunnel URL/,
    () =>
      "Hết thời gian chờ Cloudflare Tunnel. Hãy kiểm tra cloudflared đã được cài chưa."
  ],
  [
    /^Could not start cloudflared \((.+?)\): (.+)$/,
    (m) => `Không thể khởi động cloudflared (${m[1]}): ${m[2]}`
  ],
  [
    /^cloudflared exited before creating a tunnel/,
    () => "cloudflared thoát trước khi tạo được tunnel."
  ],
  [
    /^Could not read a valid media duration: (.+)$/,
    (m) => `Không đọc được thời lượng media: ${m[1]}`
  ],
  [
    /^Invalid image: (.+)$/,
    (m) => `Ảnh không hợp lệ: ${m[1]}`
  ],
  [
    /^Container index (\d+) is out of range/,
    () => "Không tìm thấy khối nội dung cần chụp."
  ],
  [
    /^Could not measure container (\d+)$/,
    () => "Không đo được kích thước khối nội dung cần chụp."
  ],
  [
    /^(.+) not found: (.+)$/,
    (m) => `Không tìm thấy ${m[1]}: ${m[2]}`
  ]
];

const DEFAULT_PREFIXES: Array<[RegExp, string]> = [
  [/^Usage:/, "Cách dùng lệnh không hợp lệ."]
];

export function cleanErrorMessage(raw: string): string {
  const stripped = raw
    .replace(IPC_PREFIX, "")
    .replace(ERROR_PREFIX, "")
    .trim();

  for (const [pattern, build] of TRANSLATIONS) {
    const match = stripped.match(pattern);

    if (match) {
      return build(match);
    }
  }

  for (const [pattern, text] of DEFAULT_PREFIXES) {
    if (pattern.test(stripped)) {
      return text;
    }
  }

  return stripped || "Đã xảy ra lỗi không xác định.";
}
