
export interface LyricSection {
  type: 'Intro' | 'Verse' | 'Hook' | 'Bridge' | 'Outro';
  text: string;
  adlibs?: string;
  energyLevel: 'low' | 'medium' | 'high' | 'peak';
}

export interface StoryboardScene {
  vibe: string;
  scene: string;
  character: string;
  details: string;
  text: string;
}

export interface SongStructure {
  title: string;
  theme: string;
  bpm: number;
  sections: LyricSection[];
  mvStoryboard: StoryboardScene[];
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export type TrackMood = 'Aggressive' | 'Funny/Rude' | 'Melodic' | 'Dark/Gritty';
export type TrackStyle = 'Classic Trap' | 'Modern Drill' | 'Old School' | 'Club Banger' | 'Romantic R&B';
export type LanguageMix = 'Khmer Only' | 'Khmer + English' | 'Khmer + Thai' | 'Khmer + Chinese' | 'Khmer + French' | 'Khmer + Spanish' | 'Khmer + Korean' | 'Khmer + Japanese';

export interface AppState {
  prompt: string;
  mood: TrackMood;
  style: TrackStyle;
  languageMix: LanguageMix;
  isLongTrack: boolean;
  selectedSfx: string[];
  status: GenerationStatus;
  songData: SongStructure | null;
  coverImageUrl: string | null;
  lastImagePrompt: string;
  error: string | null;
}
