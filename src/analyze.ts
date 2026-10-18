import fs from "node:fs/promises";
import path from "node:path";
import {
  deepseek,
  deepseekModel
} from "./ai/deepseek.js";
import type {
  ThreadAnalysis,
  ReactionEmotion,
  ReactionAnimation,
  ThreadData
} from "./types.js";
import {
  VOICE_POOL
} from "./tts/voice-pool.js";
import { scanAssets } from "./assets/scanner.js";

const EMOTIONS: ReactionEmotion[] = [
  "happy",
  "laughing",
  "sad",
  "angry",
  "shocked",
  "surprised",
  "confused",
  "shy",
  "cringe",
  "scared",
  "agree",
  "neutral"
];

const ANIMATIONS: ReactionAnimation[] = [
  "fade-in",
  "zoom-1",
  "rock-vertically",
  "slide-down",
  "slide-up",
  "slide-right",
  "slide-left",
  "rotate",
  "flame-risen",
  "rotation-opening",
  "retro-fadein-2",
  "retro-fadein",
  "screen-wipe",
  "rgb-scanlines",
  "zoom-2",
  "zoom-out",
  "zoom-in",
  "shake-3",
  "crt-bands",
  "vibrating-panels",
  "swing-top-right",
  "anime-frame",
  "rock-horizontally",
  "gray-mask",
  "shake-1",
  "spin-up-2",
  "whirl",
  "mini-zoom",
  "spin-up-1",
  "swing-bottom",
  "swing-right",
  "swing-bottom-left",
  "flip",
  "shake-2",
  "blinds",
  "swing-bottom-right",
  "puzzle",
  "swing-top-left",
  "shake-down",
  "swing",
  "wiper",
  "roll-right",
  "spin-left",
  "none"
];

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

For approximately 10 comments:
- When the content is reaction-friendly, target roughly 65% of total reaction
  overlay duration as video meme content.
- The remaining roughly 35% may use an image meme paired with an SFX, or an
  SFX-only transition.
- These are editing targets, not hard rules. Do not force a meme or SFX when
  it does not fit the content.
- SFX should be used more selectively.
- Approximately 4–7 comments may have SFX.
- Video memes do not need SFX or animation. When selecting a video meme, set
  sfxCategory to null and animation to "none".
- Image memes MUST always be paired with an SFX.

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
→ sfxCategory = null
→ animation = none

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
- reactions can be completely empty
- memeCategory should usually be null
- sfxCategory should usually be null
- animation should be "none"

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
- sfxCategory
- animation
- duration

Video meme reactions do not use SFX or animation. Image memes require SFX and
may use animation.

Examples:

Funny comment:
    video meme + no SFX

Very funny comment:
    video meme + no SFX + no animation

Awkward moment:
    image meme + record-scratch

Strong punchline:
    image meme + impact/boom

Serious comment:
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

Only use categories from this list.

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

==================================================
ANIMATION
==================================================

Available animations:

- fade-in
- zoom-in
- zoom-out
- shake-1
- shake-2
- slide-down
- slide-up
- slide-right
- slide-left
- rotate
- flip
- none

Use:

zoom-in:
    Meme appears small and grows into place.

shake-1:
    Shock, panic, intense reaction, absurdity.

slide-right:
    Meme enters from the side.

fade-in:
    Subtle appearance.

none:
    No meme.

If memeCategory is null:
    animation MUST be "none".

==================================================
DURATION
==================================================

Reaction duration should normally be:

0.25 – 1.0 seconds

Use shorter durations for:
- quick jokes
- small reactions
- punchlines

Use longer durations for:
- stronger reactions
- awkward moments
- important visual jokes

==================================================
REACTION DENSITY
==================================================

For HUMOROUS / SARCASTIC / ENTERTAINMENT content:

Target roughly 65% of total reaction overlay duration as video memes.
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

Avoid long sequences of comments without visual treatment
when the content is clearly humorous.

For NON-HUMOROUS content:

There is NO minimum meme requirement.

For serious, historical, educational, sad, emotional, or
storytelling-focused content, do NOT force meme reactions.

It is completely valid to return:

reactions: []

or only a small number of appropriate reactions.

The subject matter and tone always take priority over
meme density.

For NON-HUMOROUS content:

There is NO minimum meme requirement.

It is completely valid to return:

reactions: []

or only a small number of appropriate reactions.

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
sfxCategory = slap
animation = zoom-in

Comment:
"That's actually a really good point."

Possible:
emotion = agree
memeCategory = agree
sfxCategory = ding
animation = fade-in

Comment:
"Then he suddenly disappeared."

Possible:
emotion = shocked
memeCategory = shocked
sfxCategory = record-scratch
animation = shake-1

==================================================
DO NOT OVERUSE SFX
==================================================

Memes are the primary visual reaction layer.

SFX are secondary.

Do NOT attach an SFX to every meme.

A video with:

10 meme reactions
4 SFX

is perfectly valid.

A video with:

10 meme reactions
10 SFX

is usually too much.

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
      "sfxCategory": "boom | ding | fail | impact | record-scratch | sad | slap | suspicious | wow | null",
      "animation": "fade-in | zoom-in | zoom-out | shake-1 | shake-2 | slide-down | slide-up | slide-right | slide-left | rotate | flip | none",
      "duration": 0.25
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

3. If memes are appropriate, target roughly 65% video memes and use image
   memes only with SFX. Video memes must have no SFX and animation "none".

4. SFX should be more selective than memes, except that image memes require it.

5. Video memes use sfxCategory null and animation "none"; image memes and SFX
   must appear together.

6. If memeCategory is null:
   animation MUST be "none".

7. Only use the allowed categories listed above.

8. duration must be between 0.25 and 1.0.

9. commentIndex must refer to an actual comment.

10. Use Parent comment metadata to understand reply context. A reply should
    be interpreted together with its parent, but still gets its own reaction
    event when a separate reaction is appropriate.

11. voiceId and topicVoiceId must be copied exactly from the configured voice pool.

12. Return JSON only.
`;

async function main(): Promise<void> {
  const projectDir = process.argv[2];

  if (!projectDir) {
    throw new Error(
      "Usage: yarn analyze <project-directory>"
    );
  }

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
  const topicMemeIds = assets
    .filter(
      (asset) =>
        asset.type === "meme" &&
        asset.category === "topic"
    )
    .map((asset) => asset.id);
  const memeAssetOptions = assets
    .filter((asset) => asset.type === "meme")
    .map((asset) => ({
      id: asset.id,
      category: asset.category,
      mediaKind: asset.mediaKind,
      spec: asset.spec ?? ""
    }));
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
- Read the spec of each AVAILABLE MEME ASSET before choosing it.
- For a meme reaction, select exactly one memeAssetId from AVAILABLE MEME ASSETS.
- Choose the asset whose spec best matches the specific comment and intended
  editing effect; do not choose only from the emotion or category label.
- A video asset has mediaKind "video". Prefer video assets for approximately
  65% of total reaction overlay duration when the content is reaction-friendly.
- Video assets do not need SFX or animation. If memeAssetId is a video, set
  sfxCategory to null and animation to "none".
- An image asset has mediaKind "image" and MUST have a non-null sfxCategory.
- If no meme is appropriate, set memeAssetId and memeCategory to null and
  animation to "none".
- If no listed asset fits, use an SFX-only reaction or no reaction rather than
  inventing an asset ID.

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
      "sfxCategory": null,
      "animation": "none",
      "duration": 0.4
    }
  ],
  "musicType": "funny | dramatic | chill | sad | neutral"
}

Rules for duration:
- Usually between 0.25 and 0.8 seconds.
- Strong reactions can use up to 1.0 second.
- Keep reactions short because this is a short-form video.

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

        return await deepseek.chat.completions.create({
          model: deepseekModel,
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

  const topicTitle = analysis.topicTitle?.trim();
  if (topicTitle) {
    analysis.topicTitle =
      topicTitle.length > 80
        ? `${topicTitle.slice(0, 77).trimEnd()}...`
        : topicTitle;
  }

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

await main();