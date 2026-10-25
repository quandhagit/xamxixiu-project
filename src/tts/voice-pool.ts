import type {
  Voice
} from "./types.js";

export const VOICE_POOL: Voice[] = [
  {
    id: "ngoc-huyen",
    gender: "female",
    style: "female-calm",
    voiceCode:
      "hn_female_ngochuyen_full_48k-fhg"
  },
  {
    id: "minh-quan",
    gender: "male",
    style: "male-casual",
    voiceCode:
      "hn_male_minhquan_yt-stable"
  },
  {
    id: "thang-chuyen-nghiep",
    gender: "male",
    style: "male-energetic",
    voiceCode:
      "n_hanoi_male_thangchuyennghiep_advertise_vc"
  },
  {
    id: "tuong-vy",
    gender: "female",
    style: "female-energetic",
    voiceCode:
      "sg_female_tuongvy_call_44k-fhg"
  },
  {
    id: "mchiensachnoi",
    gender: "female",
    style: "female-calm",
    voiceCode:
      "n_hanoi_female_mchiensachnoi_book_vc"
  },
  {
    id: "lenka",
    gender: "female",
    style: "female-young",
    voiceCode:
      "hn_female_lenka_stor_48k-phg"
  },
  {
    id: "hachi",
    gender: "female",
    style: "female-calm",
    voiceCode:
      "hn_female_hachi_book_22k-vc"
  },
  {
    id: "manh-dung",
    gender: "male",
    style: "male-deep",
    voiceCode:
      "hn_male_manhdung_news_48k-fhg"
  },
  {
    id: "phu-thang",
    gender: "male",
    style: "male-deep",
    voiceCode:
      "hn_male_phuthang_stor80dt_48k-fhg"
  },
  {
    id: "chi-dat",
    gender: "male",
    style: "male-casual",
    voiceCode:
      "sg_male_chidat_ebook_48k-phg"
  }
];

export function isKnownVoiceId(
  voiceId: string
): boolean {
  return VOICE_POOL.some(
    (voice) => voice.id === voiceId
  );
}