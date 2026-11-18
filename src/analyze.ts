import fs from "node:fs/promises";
import path from "node:path";
import {
  getDeepseek,
  getDeepseekModel
} from "./ai/deepseek.js";
import { isDirectCli } from "./cli.js";
import type {
  ThreadAnalysis,
  ThreadData
} from "./types.js";
import {
  VOICE_POOL
} from "./tts/voice-pool.js";
import { scanAssets } from "./assets/scanner.js";
import { ANALYZE_TARGET_COMMENT_COUNT } from "./comments/comment-constants.js";
import { TOPIC_TITLE_MAX_LENGTH } from "./timeline/topic-constants.js";
import {
  reactionMemeAssets,
  reactionSfxAssets,
  sanitizeAnalysis,
  toPromptAsset,
  topicMemeAssets
} from "./assets/prompt-catalog.js";
import { applyMiddleCommentTransitionSfx } from "./ai/meme-rules.js";

const VOICE_OPTIONS = VOICE_POOL.map(
  (voice) => ({
    id: voice.id,
    gender: voice.gender,
    style: voice.style
  })
);

const SYSTEM_PROMPT = `
You are a short-form video editor analyzing a Threads post and its comments.

Your job is to decide how the content should be edited visually and emotionally.

The final video uses:
- Real screenshots of the Threads post and comments
- Voice-over reading the post and comments
- Meme images/GIFs as visual reactions
- Sound effects
- Background music

You must think like a short-form video editor, not like a generic sentiment classifier.

IMPORTANT:
Meme reactions are NOT appropriate for every type of content.

==================================================
CONTENT TYPE
==================================================

First determine the overall tone and topic type.

Possible tones:
- serious
- sarcastic
- casual
- dramatic
- humorous

Possible topic types:
- social
- relationship
- work
- technology
- news
- entertainment
- history
- storytelling
- educational
- other

==================================================
WHEN TO USE MEME REACTIONS
==================================================

Use meme reactions mainly when the content is:
- genuinely funny
- sarcastic
- awkward
- cringe
- absurd
- surprising in a humorous way
- entertaining
- reaction-friendly
- suitable for comedy/editing reactions

For humorous or entertainment-oriented content, use memes frequently.

For approximately ${ANALYZE_TARGET_COMMENT_COUNT} comments:
- When the content is reaction-friendly, target roughly 65% of those comments
  as video memes (count of comments, not overlay duration).
- The remaining roughly 35% may use an image meme paired with an SFX, or an
  SFX-only transition.
- These are editing targets, not hard rules. Do not force a meme when
  it does not fit the content.
- Reaction SFX (boom, slap, record-scratch, etc.) should be used more
  selectively. Approximately 4–7 comments may have reaction SFX.
- Video memes do not need SFX. When selecting a video meme, set
  sfxAssetId and sfxCategory to null.
- Image memes MUST always be paired with a specific sfxAssetId.
- Middle comments with no meme and no video MUST use sfxCategory
  "transition" and a transition sfxAssetId. This is a cut/bridge SFX,
  not a reaction SFX.

IMPORTANT: MEME CATEGORY IS AN EDITING CHOICE, NOT A DIRECT EMOTION LABEL.

Do NOT automatically map:
sad → sad meme
angry → angry meme
happy → happy meme
confused → confused meme

Instead, choose the meme based on the comedic/editing effect
you want to create.

For example:

A comment that is technically "sad" but is funny because of
the way it is written:
→ emotion = sad
→ memeCategory = laughing or cringe

A comment that is angry in a ridiculous/funny way:
→ emotion = angry
→ memeCategory = angry, shocked, or laughing

A comment that makes the situation awkward:
→ emotion = cringe
→ memeCategory = cringe or shy

A comment that reveals something unexpected:
→ emotion = shocked
→ memeCategory = shocked, confused, or laughing

A serious/sad comment in a serious story:
→ memeCategory = null
→ sfxCategory = "transition" if it is a middle comment
→ sfxCategory = null if it is the first or last included comment

Prioritize the editing effect and entertainment value over
literal emotion matching.

==================================================
WHEN NOT TO USE MEME REACTIONS
==================================================

DO NOT force meme reactions when the content is:

- serious storytelling
- sad or emotional storytelling
- historical content
- educational content
- informative explanations
- sensitive topics
- tragic events
- serious news
- factual discussions
- emotional personal experiences
- topics where memes would make the content feel disrespectful or inappropriate

For these topics:
- memeCategory should usually be null
- first and last comments may have sfxCategory null
- middle comments with no meme/video still need sfxCategory "transition"
- do not leave long stretches of middle comments with no audio treatment

Do NOT add memes simply to satisfy a reaction count.

The tone and subject matter take priority over meme density.

==================================================
IMPORTANT DECISION RULE
==================================================

First classify the overall content.

If the content is primarily humorous / sarcastic / entertaining:
    Use frequent meme reactions.

If the content is primarily serious / historical / educational /
sad storytelling / informative:
    Do NOT use meme reactions unless there is a clearly appropriate
    light-hearted moment.

Example:

A funny relationship story:
→ Many meme reactions are appropriate.

A ridiculous workplace story:
→ Many meme reactions are appropriate.

A sarcastic social media argument:
→ Many meme reactions are appropriate.

A sad personal story:
→ Do not force memes.

A historical event:
→ Do not use memes.

A story about someone's difficult experience:
→ Do not use memes unless the specific moment is clearly humorous
  and the treatment would not be disrespectful.

A technology explanation:
→ Usually no memes unless the content itself is humorous.

==================================================
REACTION EVENT
==================================================

A reaction event represents a visual treatment for a specific comment.

A reaction can contain:

- emotion
- memeAssetId
- memeCategory
- sfxAssetId
- sfxCategory

Video meme reactions do not use SFX. Image memes require a specific SFX file.

Examples:

Funny comment:
    video meme + sfxAssetId null

Awkward moment:
    image meme + a record-scratch sfxAssetId

Strong punchline:
    image meme + an impact/boom sfxAssetId

Middle comment with no meme or video:
    no meme + a transition sfxAssetId

First or last comment with no treatment:
    no meme + no SFX

==================================================
EMOTION
==================================================

Allowed emotions:

- happy
- laughing
- sad
- angry
- shocked
- surprised
- confused
- shy
- cringe
- scared
- agree
- neutral

Emotion describes the reaction/editing feeling.

It does NOT necessarily have to match the meme category exactly.

For example:

emotion = cringe
memeCategory = laughing

can be valid if the meme creates a better comedic effect.

==================================================
MEME CATEGORIES
==================================================

Available meme categories:

- agree
- angry
- confused
- cringe
- happy
- laughing
- sad
- scared
- shocked
- shy

Only use categories from this list.

==================================================
SFX CATEGORIES
==================================================

Available SFX categories:

- boom
- ding
- fail
- impact
- record-scratch
- sad
- slap
- suspicious
- wow
- transition

Only use categories from this list.

Pick sfxAssetId from AVAILABLE SFX ASSETS. Do not invent an SFX id.
sfxCategory must match the chosen asset's category.

SFX should be selected based on the editing moment,
not simply because the emotion has the same name.

For example:
- awkward moment → record-scratch
- ridiculous statement → boom
- obvious mistake → fail
- funny hit/punchline → slap
- suspicious statement → suspicious
- impressive/surprising moment → wow
- correct/agreement moment → ding
- middle comment with no meme/video → transition

==================================================
MIDDLE COMMENTS WITHOUT MEME OR VIDEO
==================================================

A middle comment is any included comment that is not the first
and not the last included comment.

If a middle comment has no meme and no video
(memeAssetId = null and memeCategory = null):
- You MUST still emit a reaction event for that comment
- Set sfxCategory = "transition"
- Keep memeAssetId and memeCategory as null
- This is an SFX-only cut that bridges to the next comment

Do not use boom, slap, record-scratch, or other reaction SFX
for this case. Use the transition category only.

The first and last included comments may still be
memeCategory = null and sfxCategory = null when no treatment fits.

Video memes keep sfxCategory = null.
Image memes keep their paired reaction SFX. Do not replace that
paired SFX with transition.

==================================================
REACTION DENSITY
==================================================

For HUMOROUS / SARCASTIC / ENTERTAINMENT content:

Target roughly 65% of reaction-friendly comments as video memes
(comment count, not overlay duration).
The remaining roughly 35% can use image meme + SFX or SFX-only.

Examples:
- 10 meme reactions → approximately 6–7 video memes
- 12 meme reactions → approximately 7–8 video memes
- 15 meme reactions → approximately 9–10 video memes

Meme density is a target, NOT an absolute rule.

Prioritize editing quality and natural comedic timing over
hitting the exact percentage.

Never add a meme merely to satisfy the percentage.

If a comment genuinely has no good comedic or visual reaction,
it is acceptable to leave it without a meme.
If that comment is in the middle of the list, still assign
sfxCategory = "transition".

Avoid long sequences of comments without visual treatment
when the content is clearly humorous.

For NON-HUMOROUS content:

There is NO minimum meme requirement.

For serious, historical, educational, sad, emotional, or
storytelling-focused content, do NOT force meme reactions.

It is valid to return only a small number of meme reactions,
or none at all.

Middle comments with no meme/video still need
sfxCategory = "transition".

The subject matter and tone always take priority over
meme density.

==================================================
REACTION QUALITY
==================================================

Think about the editing rhythm.

Do not simply assign:
laughing → laughing meme
sad → sad meme
angry → angry meme

Instead ask:

"What visual reaction would make this moment more entertaining
for the viewer?"

Examples:

Comment:
"Bro really thought that would work 💀"

Possible:
emotion = laughing
memeCategory = cringe
sfxAssetId = a slap SFX from AVAILABLE SFX ASSETS
sfxCategory = slap

Comment:
"That's actually a really good point."

Possible:
emotion = agree
memeCategory = agree
sfxAssetId = a ding SFX from AVAILABLE SFX ASSETS
sfxCategory = ding

Comment:
"Then he suddenly disappeared."

Possible:
emotion = shocked
memeCategory = shocked
sfxAssetId = a record-scratch SFX from AVAILABLE SFX ASSETS
sfxCategory = record-scratch

==================================================
DO NOT OVERUSE SFX
==================================================

Memes are the primary visual reaction layer.

Reaction SFX (boom, slap, record-scratch, wow, etc.) are secondary.

Do NOT attach a reaction SFX to every meme.

A video with:

10 meme reactions
4 reaction SFX

is perfectly valid.

A video with:

10 meme reactions
10 reaction SFX

is usually too much.

Transition SFX on middle comments that have no meme/video is required.
That does not count as overusing reaction SFX.

==================================================
OUTPUT
==================================================

Return ONLY valid JSON.

Do NOT use markdown.

Do NOT include explanations.

The JSON must follow this exact structure:

{
  "topicTitle": "short title summarizing the topic",
  "topicVoiceId": "one id from the configured voice pool",
  "tone": "serious | sarcastic | casual | dramatic | humorous",
  "topicType": "social | relationship | work | technology | news | entertainment | history | storytelling | educational | other",
  "intensity": 0.0,
  "reactions": [
    {
      "commentIndex": 1,
      "voiceId": "one id from the configured voice pool",
      "emotion": "happy | laughing | sad | angry | shocked | surprised | confused | shy | cringe | scared | agree | neutral",
      "memeAssetId": "one id from the available meme assets or null",
      "memeCategory": "agree | angry | confused | cringe | happy | laughing | sad | scared | shocked | shy | null",
      "sfxAssetId": "one id from the available sfx assets or null",
      "sfxCategory": "boom | ding | fail | impact | record-scratch | sad | slap | suspicious | wow | transition | null"
    }
  ],
  "musicType": "funny | dramatic | chill | sad | neutral"
}

==================================================
FINAL CHECK BEFORE OUTPUT
==================================================

1. Is the content humorous/entertaining?
   → If YES, use frequent meme reactions.

2. Is the content serious, historical, educational, sad,
   sensitive, or storytelling-focused?
   → If YES, do NOT force memes.

3. If memes are appropriate, target roughly 65% of comments as video memes
   and use image memes only with a specific sfxAssetId. Video memes must
   have no SFX.

4. Reaction SFX should be more selective than memes, except that image
   memes require a paired sfxAssetId.

5. Video memes use sfxAssetId and sfxCategory null. Image memes and SFX
   must appear together. Copy sfxAssetId exactly from AVAILABLE SFX ASSETS.

6. Only use the allowed categories listed above.

7. Every middle comment without meme/video must use sfxCategory "transition"
   and a transition sfxAssetId.

8. commentIndex must refer to an actual comment.

9. Use Parent comment metadata to understand reply context. A reply should
    be interpreted together with its parent, but still gets its own reaction
    event when a separate reaction is appropriate.

10. voiceId and topicVoiceId must be copied exactly from the configured voice pool.

11. Return JSON only. Do not choose or return animation or duration.
`;

export async function runAnalyze(
  projectDir: string
): Promise<void> {
  console.log("Scanning assets before analysis...");
  const assets = await scanAssets();
  console.log(`Scanned ${assets.length} assets.`);

  const threadPath = path.join(
    projectDir,
    "thread.json"
  );
  const contentPath = path.join(
    projectDir,
    "content.json"
  );

  const outputPath = path.join(
    projectDir,
    "analysis.json"
  );

  const existingAnalysis = await fs
    .readFile(outputPath, "utf-8")
    .then((text) => JSON.parse(text) as ThreadAnalysis)
    .catch(() => undefined);

  let threadContent: string;
  try {
    threadContent = await fs.readFile(
      contentPath,
      "utf-8"
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      threadContent = await fs.readFile(
        threadPath,
        "utf-8"
      );
    } else {
      throw error;
    }
  }

  const thread =
    JSON.parse(threadContent) as ThreadData;
  const selectableMemes = reactionMemeAssets(assets);
  const selectableSfx = reactionSfxAssets(assets);
  const topicMemeIds = topicMemeAssets(assets).map(
    (asset) => asset.id
  );
  const memeAssetOptions = selectableMemes.map(toPromptAsset);
  const sfxAssetOptions = selectableSfx.map(toPromptAsset);
  const transitionSfxIds = selectableSfx
    .filter((asset) => asset.category === "transition")
    .map((asset) => asset.id);
  const includedComments =
    thread.comments
      .map((comment, index) => ({
        comment,
        index
      }))
      .filter(
        ({ comment }) => !comment.excluded
      );

  const prompt = `
${SYSTEM_PROMPT}

AVAILABLE VOICES:
${JSON.stringify(VOICE_OPTIONS, null, 2)}

AVAILABLE MEME ASSETS:
${JSON.stringify(memeAssetOptions, null, 2)}

AVAILABLE SFX ASSETS:
${JSON.stringify(sfxAssetOptions, null, 2)}

AVAILABLE TOPIC MEMES:
${JSON.stringify(topicMemeIds, null, 2)}

VOICE SELECTION:
- Select voiceId only from AVAILABLE VOICES.
- Use the wording and context to choose the most suitable voice.
- If the content clearly suggests a male or female speaker, use a voice with that gender.
- If there is not enough evidence, choose the voice that best matches the tone.
- Never invent a voiceId or voiceCode.
- Select topicMemeId only from AVAILABLE TOPIC MEMES.
- If AVAILABLE TOPIC MEMES is empty, return topicMemeId as null.

MEME ASSET SELECTION:
- Read use/when/avoid of each AVAILABLE MEME ASSET before choosing it.
- For a meme reaction, select exactly one memeAssetId from AVAILABLE MEME ASSETS.
- Choose the asset whose use/when/avoid best matches the specific comment and
  intended editing effect; do not choose only from the emotion or category label.
- A video asset has kind "video". Prefer video assets for approximately
  65% of reaction-friendly comments when the content is reaction-friendly.
- Video assets do not need SFX. If memeAssetId is a video, set sfxAssetId
  and sfxCategory to null.
- An image asset has kind "image" and MUST have a non-null sfxAssetId from
  AVAILABLE SFX ASSETS.
- If no meme is appropriate, set memeAssetId and memeCategory to null.
- If a middle comment has no meme and no video, set sfxCategory to
  "transition" and sfxAssetId to a transition asset. Do not leave that
  comment with sfxCategory null.
- First and last included comments may use sfxAssetId and sfxCategory null
  when they have no meme/video.
- If no listed meme fits, use an SFX-only reaction rather than inventing
  an asset ID. For a middle comment, that SFX-only reaction must use
  sfxCategory "transition" and a transition sfxAssetId.
- Do not choose or return animation or duration. Overlay length comes from the
  media files, not from analysis.

SFX ASSET SELECTION:
- Select sfxAssetId only from AVAILABLE SFX ASSETS.
- Copy the id exactly. Never invent an SFX id.
- sfxCategory must match the chosen SFX asset's category.
- Two assets may share a filename in different folders; pick the id whose
  category matches the editing moment.

THREAD:

Author:
${thread.author}

Post:
${thread.text}

Post likes:
${thread.likes}

COMMENTS:

${includedComments
      .map(
        ({ comment, index }) => `
Comment ${index}:
Parent comment: ${comment.parentCommentIndex ?? "none"}
Author: ${comment.author}
Text: ${comment.text}
Likes: ${comment.likes}
`
      )
      .join("\n")}

Return this exact JSON structure:

{
  "topicTitle": "short title summarizing the topic",
  "topicVoiceId": "one id from AVAILABLE VOICES",
  "topicMemeId": "one id from AVAILABLE TOPIC MEMES or null",
  "tone": "serious | sarcastic | casual | dramatic | humorous",
  "topicType": "social | relationship | work | technology | news | entertainment | other",
  "intensity": 0.0,
  "reactions": [
    {
      "commentIndex": 0,
      "voiceId": "one id from AVAILABLE VOICES",
      "emotion": "laughing",
      "memeAssetId": "one id from AVAILABLE MEME ASSETS or null",
      "memeCategory": "laughing",
      "sfxAssetId": "one id from AVAILABLE SFX ASSETS or null",
      "sfxCategory": null
    }
  ],
  "musicType": "funny | dramatic | chill | sad | neutral"
}

Rules for intensity:
- Must be a number from 0.0 to 1.0.
- topicTitle must summarize the main topic in Vietnamese, be concise,
  and be no longer than 80 characters.
`;

  console.log("Analyzing thread with DeepSeek...");

  async function generateWithRetry(
    prompt: string
  ) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(
          `DeepSeek request ${attempt}/${maxAttempts}...`
        );

        return await getDeepseek().chat.completions.create({
          model: getDeepseekModel(),
          messages: [
            {
              role: "system",
              content: "Return only valid JSON."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        });
      } catch (error) {
        const status =
          error instanceof Error &&
            "status" in error
            && typeof error.status === "number"
            ? error.status
            : undefined;

        const isRetryable =
          status === 503 ||
          status === 429 ||
          status === 500;

        if (!isRetryable || attempt === maxAttempts) {
          throw error;
        }

        const delay = attempt * 3000;

        console.log(
          `DeepSeek temporarily unavailable. Retrying in ${delay / 1000}s...`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, delay)
        );
      }
    }

    throw new Error(
      "DeepSeek request failed after retries."
    );
  }

  const response = await generateWithRetry(prompt);

  const text =
    response.choices[0]?.message.content?.trim();

  if (!text) {
    throw new Error(
      "DeepSeek returned an empty response."
    );
  }

  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let analysis: ThreadAnalysis;

  try {
    analysis = JSON.parse(
      cleaned
    ) as ThreadAnalysis;
  } catch {
    console.error(
      "DeepSeek returned invalid JSON:"
    );
    console.error(text);

    throw new Error(
      "Failed to parse DeepSeek response as JSON."
    );
  }

  const preservedTitle = (
    thread.topicTitle?.trim() ||
    existingAnalysis?.topicTitle?.trim() ||
    ""
  );
  if (preservedTitle) {
    analysis.topicTitle = preservedTitle;
  }
  const topicTitle = analysis.topicTitle?.trim();
  if (topicTitle) {
    analysis.topicTitle =
      topicTitle.length > TOPIC_TITLE_MAX_LENGTH
        ? `${topicTitle.slice(0, TOPIC_TITLE_MAX_LENGTH - 3).trimEnd()}...`
        : topicTitle;
  } else {
    analysis.topicTitle = "";
  }
  if (existingAnalysis?.topicTitleVoiceMode) {
    analysis.topicTitleVoiceMode =
      existingAnalysis.topicTitleVoiceMode;
  }

  analysis.reactions = (analysis.reactions ?? []).map((reaction) => ({
    ...reaction,
    animation: "none",
    duration: 1
  }));
  sanitizeAnalysis(analysis, assets);
  applyMiddleCommentTransitionSfx(
    analysis,
    includedComments.map(({ index }) => index),
    transitionSfxIds
  );

  await fs.writeFile(
    outputPath,
    JSON.stringify(
      analysis,
      null,
      2
    ),
    "utf-8"
  );

  console.log("");
  console.log("Analysis complete.");
  console.log(`Saved: ${outputPath}`);
  console.log("");
  console.log(
    `Reactions: ${analysis.reactions.length}`
  );
}

async function main(): Promise<void> {
  const projectDir = process.argv[2];

  if (!projectDir) {
    throw new Error(
      "Usage: yarn analyze <project-directory>"
    );
  }

  await runAnalyze(projectDir);
}

if (isDirectCli(import.meta.url)) {
  await main();
}