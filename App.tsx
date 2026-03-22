
import React, { useState, useCallback, useRef } from 'react';
import { 
  Music, 
  Flame, 
  Mic2, 
  Copy, 
  Image as ImageIcon, 
  Play, 
  RefreshCw, 
  AlertCircle, 
  Share2, 
  Download, 
  Smile, 
  Zap, 
  Clock, 
  Terminal,
  Ghost,
  Key
} from 'lucide-react';
import { AppState, GenerationStatus, SongStructure, TrackMood, TrackStyle, LanguageMix } from './types';
import { generateLyrics, generateCoverArtPrompt, generateSpeech } from './geminiService';

const STYLE_CONFIGS: Record<TrackStyle, string> = {
  'Classic Trap': "Khmer trap / Cambodian hip-hop, aggressive modern rap, hard 808s and crisp hats, confident delivery with hype ad-libs, dark minimal synth melody, catchy hook, club banger tempo.",
  'Modern Drill': "Khmer Drill, sliding 808s, fast-paced hi-hats, aggressive and rhythmic delivery, dark cinematic strings, gritty street energy.",
  'Old School': "90s Khmer Hip-Hop, boom bap drums, soulful samples, storytelling lyrics, relaxed but confident flow, classic scratch effects.",
  'Club Banger': "High energy Khmer club rap, bouncy bassline, catchy synth leads, party vibes, hype ad-libs, fast tempo, designed for the dancefloor.",
  'Romantic R&B': "Modern R&B and Hip-Hop fusion, romantic Cambodian pop style, smooth male vocals, melodic rap, polished production, soulful piano intro"
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    prompt: '',
    mood: 'Aggressive',
    style: 'Classic Trap',
    languageMix: 'Khmer Only',
    isLongTrack: false,
    selectedSfx: [],
    status: GenerationStatus.IDLE,
    songData: null,
    coverImageUrl: null,
    lastImagePrompt: '',
    error: null,
  });

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const AVAILABLE_SFX = ['Gunshots', 'Sirens', 'Cash Register'];

  const toggleSfx = (sfx: string) => {
    setState(prev => ({
      ...prev,
      selectedSfx: prev.selectedSfx.includes(sfx) 
        ? prev.selectedSfx.filter(s => s !== sfx)
        : [...prev.selectedSfx, sfx]
    }));
  };

  const playSfxPreview = (sfx: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    
    if (sfx === 'Gunshots') {
      const bufferSize = ctx.sampleRate * 0.5;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
    } else if (sfx === 'Sirens') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.5);
      osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 1.0);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.9);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.0);
    } else if (sfx === 'Cash Register') {
      const playDing = (freq: number, startTime: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.5, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.3);
      };
      playDing(1200, ctx.currentTime);
      playDing(1600, ctx.currentTime + 0.1);
    }
  };

  const handleOpenKeySelector = async () => {
    try {
      if (typeof (window as any).aistudio?.openSelectKey === 'function') {
        await (window as any).aistudio.openSelectKey();
        // Assuming success as per guidelines race condition rule
        setState(prev => ({ ...prev, error: null, status: GenerationStatus.IDLE }));
      }
    } catch (err) {
      console.error("Failed to open key selector", err);
    }
  };

  const handleGenerate = async () => {
    if (!state.prompt.trim()) return;

    setState(prev => ({ ...prev, status: GenerationStatus.LOADING, error: null }));
    
    try {
      const data = await generateLyrics(state.prompt, STYLE_CONFIGS[state.style], state.mood, state.isLongTrack, state.selectedSfx, state.languageMix);
      setState(prev => ({ ...prev, songData: data }));
      
      const lyricsSnippet = data.sections.map(s => s.text).join(' ').substring(0, 500);
      const promptResult = await generateCoverArtPrompt(data.title, data.theme, state.mood, lyricsSnippet);
      setState(prev => ({ 
        ...prev, 
        status: GenerationStatus.SUCCESS, 
        coverImageUrl: null,
        lastImagePrompt: promptResult
      }));
    } catch (err: any) {
      console.error(err);
      const isQuota = err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED');
      setState(prev => ({ 
        ...prev, 
        status: GenerationStatus.ERROR, 
        error: isQuota 
          ? "Quota Exceeded (429). You've reached the API rate limit. Please wait a moment or use a paid API key for higher limits."
          : "System error. Check your vibe and try again." 
      }));
    }
  };

  const handleGenerateImage = async () => {
    if (!state.songData) return;
    try {
      const lyricsSnippet = state.songData.sections.map(s => s.text).join(' ').substring(0, 500);
      const promptResult = await generateCoverArtPrompt(state.songData.title, state.songData.theme, state.mood, lyricsSnippet);
      setState(prev => ({ 
        ...prev, 
        lastImagePrompt: promptResult
      }));
    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes('429')) {
        alert("Prompt generation quota exceeded. Try again in a minute.");
      } else {
        alert("Failed to refresh cover art prompt.");
      }
    }
  };

  const playTTS = async (text: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      setIsPlaying(true);
      const audioData = await generateSpeech(text);
      
      const buffer = await decodeAudioData(audioData, audioContextRef.current);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
    } catch (err) {
      console.error(err);
      setIsPlaying(false);
    }
  };

  async function decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const numChannels = 1;
    const sampleRate = 24000;
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }

  const handleDownloadMaster = () => {
    if (!state.songData) return;

    const lyricsText = state.songData.sections.map(s => {
      const adlibs = s.adlibs ? `\n(Ad-libs: ${s.adlibs})` : '';
      return `[${s.type}]\n${s.text}${adlibs}`;
    }).join('\n\n');

    const mvText = state.songData.mvStoryboard && state.songData.mvStoryboard.length > 0 
      ? `\n\nVideo MV Text Prompts Storyboard (25 Scenes)\n-----------------------\n${state.songData.mvStoryboard.map((s, i) => `Scene ${i + 1}:\nVibe: ${s.vibe}\nScene: ${s.scene}\nCharacter: ${s.character}\nDetails: ${s.details}\nLyrics: ${s.text}`).join('\n\n')}` 
      : '';

    const content = `${state.songData.title} - Suno AI Lyrics Format

Song: ${state.songData.title}
Artists: AI Master
Produced by: Khmer Suno Lyric Pro
Written by: Gemini AI
Mood: ${state.mood}
Style: ${state.style}
Language Mix: ${state.languageMix}
Sound Style Prompt: ${STYLE_CONFIGS[state.style]}
BPM: ${state.songData.bpm}

Suno AI Formatted Lyrics
-----------------------
${lyricsText}${mvText}

Generated with Khmer Suno Lyric Pro
    `;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.songData.title.replace(/\s+/g, '_')}_Master.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Lyrics copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-800 bg-black/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-600/30">
              <Mic2 className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tighter uppercase italic">
                KHMER SUNO <span className="text-red-500">LYRIC PRO</span>
              </h1>
              <p className="text-[9px] text-neutral-500 uppercase tracking-widest font-black">Phnom Penh Master Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
             <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Master Studio Live</span>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto px-4 py-8 w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-neutral-900/40 rounded-3xl p-6 border border-neutral-800 shadow-2xl backdrop-blur-sm">
            <h2 className="text-sm font-black text-neutral-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-red-500" />
              1. Input Parameter
            </h2>
            <textarea
              value={state.prompt}
              onChange={(e) => setState(prev => ({ ...prev, prompt: e.target.value }))}
              placeholder="Hustle in Phnom Penh, life on the edge..."
              className="w-full h-32 bg-neutral-950/50 rounded-2xl p-4 text-neutral-100 placeholder-neutral-700 focus:ring-1 focus:ring-red-600 border border-neutral-800 outline-none transition-all resize-none mb-6 text-sm"
            />
            
            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3">Vocal Mood / Delivery</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => setState(prev => ({ ...prev, mood: 'Aggressive' }))}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-[10px] font-bold transition-all ${
                      state.mood === 'Aggressive' 
                        ? 'bg-red-600/20 border-red-600 text-red-500 shadow-lg shadow-red-600/10' 
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" /> AGGRESSIVE
                  </button>
                  <button 
                    onClick={() => setState(prev => ({ ...prev, mood: 'Funny/Rude' }))}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-[10px] font-bold transition-all ${
                      state.mood === 'Funny/Rude' 
                        ? 'bg-yellow-600/20 border-yellow-600 text-yellow-500 shadow-lg shadow-yellow-600/10' 
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                    }`}
                  >
                    <Smile className="w-3.5 h-3.5" /> FUNNY / RUDE
                  </button>
                  <button 
                    onClick={() => setState(prev => ({ ...prev, mood: 'Melodic' }))}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-[10px] font-bold transition-all ${
                      state.mood === 'Melodic' 
                        ? 'bg-blue-600/20 border-blue-600 text-blue-500 shadow-lg shadow-blue-600/10' 
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                    }`}
                  >
                    <Music className="w-3.5 h-3.5" /> MELODIC
                  </button>
                  <button 
                    onClick={() => setState(prev => ({ ...prev, mood: 'Dark/Gritty' }))}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-[10px] font-bold transition-all ${
                      state.mood === 'Dark/Gritty' 
                        ? 'bg-purple-600/20 border-purple-600 text-purple-500 shadow-lg shadow-purple-600/10' 
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                    }`}
                  >
                    <Ghost className="w-3.5 h-3.5" /> DARK / GRITTY
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-neutral-950/50 rounded-2xl border border-neutral-800">
                <div className="flex items-center gap-3">
                   <Clock className="w-4 h-4 text-neutral-500" />
                   <div>
                     <p className="text-xs font-bold">5-Min Full Length</p>
                     <p className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">Extended Section Mix</p>
                   </div>
                </div>
                <input 
                  type="checkbox" 
                  checked={state.isLongTrack}
                  onChange={(e) => setState(prev => ({ ...prev, isLongTrack: e.target.checked }))}
                  className="w-5 h-5 accent-red-600 rounded bg-neutral-900 border-neutral-800"
                />
              </div>

              <div>
                <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3">Production Style</h3>
                <div className="grid grid-cols-2 gap-2">
                  {(['Classic Trap', 'Modern Drill', 'Old School', 'Club Banger', 'Romantic R&B'] as TrackStyle[]).map((s) => (
                    <button 
                      key={s}
                      onClick={() => setState(prev => ({ ...prev, style: s }))}
                      className={`py-2.5 rounded-xl border text-[10px] font-bold transition-all ${
                        state.style === s 
                          ? 'bg-neutral-100 border-neutral-100 text-black shadow-lg' 
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                      }`}
                    >
                      {s.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3">Language Mix</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['Khmer Only', 'Khmer + English', 'Khmer + Thai', 'Khmer + Chinese', 'Khmer + French', 'Khmer + Spanish', 'Khmer + Korean', 'Khmer + Japanese'] as LanguageMix[]).map((l) => (
                    <button 
                      key={l}
                      onClick={() => setState(prev => ({ ...prev, languageMix: l }))}
                      className={`py-2.5 rounded-xl border text-[10px] font-bold transition-all ${
                        state.languageMix === l 
                          ? 'bg-neutral-100 border-neutral-100 text-black shadow-lg' 
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                      }`}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-3">Sound Effects (SFX)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {AVAILABLE_SFX.map(sfx => (
                    <div key={sfx} className="flex items-center gap-1">
                      <button
                        onClick={() => toggleSfx(sfx)}
                        className={`flex-1 py-2.5 rounded-xl border text-[10px] font-bold transition-all ${
                          state.selectedSfx.includes(sfx)
                            ? 'bg-red-600/20 border-red-600 text-red-500 shadow-lg shadow-red-600/10'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-600'
                        }`}
                      >
                        {sfx.toUpperCase()}
                      </button>
                      <button 
                        onClick={() => playSfxPreview(sfx)}
                        className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-400 hover:text-white hover:border-neutral-600 transition-all flex-shrink-0"
                        title={`Preview ${sfx}`}
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={state.status === GenerationStatus.LOADING}
              className={`w-full mt-8 py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all ${
                state.status === GenerationStatus.LOADING 
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700' 
                  : 'bg-red-600 hover:bg-red-700 text-white shadow-[0_0_20px_rgba(220,38,38,0.2)] active:scale-95'
              }`}
            >
              {state.status === GenerationStatus.LOADING ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
              {state.status === GenerationStatus.LOADING ? 'MASTERING SESSION...' : 'COOK THE BANGER'}
            </button>
          </div>

          {state.songData && (
            <div className="bg-neutral-900/40 rounded-3xl p-6 border border-neutral-800 shadow-2xl overflow-hidden group">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Khmer Trap Music Cover with title</h3>
                <button onClick={handleGenerateImage} className="text-neutral-500 hover:text-white transition-colors" title="Regenerate Prompt">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              
              <div className="bg-neutral-950 rounded-2xl p-5 border border-neutral-800 shadow-inner relative group-hover:border-neutral-700 transition-colors">
                {state.lastImagePrompt ? (
                  <div className="text-sm text-neutral-300 font-mono leading-relaxed max-h-64 overflow-y-auto scrollbar-hide italic">
                    {state.lastImagePrompt}
                  </div>
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <ImageIcon className="w-8 h-8 text-neutral-800 mx-auto" />
                    <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Generating prompt...</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <button 
                  onClick={() => copyToClipboard(state.lastImagePrompt)}
                  className="flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 p-3 rounded-xl text-[10px] font-black tracking-widest transition-colors border border-neutral-800 uppercase"
                >
                  <Copy className="w-3.5 h-3.5" /> COPY PROMPT
                </button>
                <button className="flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 p-3 rounded-xl text-[10px] font-black tracking-widest transition-colors border border-neutral-800 uppercase">
                  <Share2 className="w-3.5 h-3.5" /> SHARE
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-8">
          {!state.songData && state.status !== GenerationStatus.LOADING && (
            <div className="h-full min-h-[600px] border border-neutral-900 rounded-[40px] flex flex-col items-center justify-center text-neutral-700 p-8 text-center bg-gradient-to-b from-neutral-900/10 to-transparent">
              <div className="w-24 h-24 bg-neutral-900/50 rounded-full flex items-center justify-center mb-8 border border-neutral-800 shadow-2xl relative">
                <Music className="w-10 h-10 text-neutral-800" />
                <div className="absolute inset-0 rounded-full border border-red-600/10 animate-ping" />
              </div>
              <h3 className="text-3xl font-black text-neutral-400 mb-4 tracking-tighter uppercase">Drop Your Vision</h3>
              <p className="max-w-md text-sm text-neutral-600 leading-relaxed font-medium">
                Aggressive beats. Rude lyrics. Mastered aesthetics. Craft the future of Cambodian Hip-Hop right here.
              </p>
            </div>
          )}

          {state.status === GenerationStatus.LOADING && (
            <div className="h-full min-h-[600px] bg-neutral-950/20 rounded-[40px] flex flex-col items-center justify-center animate-pulse border border-neutral-900 space-y-8 relative overflow-hidden">
               <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-600/5 via-transparent to-transparent" />
               <div className="relative">
                 <div className="w-32 h-32 border-2 border-red-600/30 border-t-red-600 rounded-full animate-spin"></div>
                 <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center border border-neutral-800 shadow-inner">
                     <Flame className="w-10 h-10 text-red-600 animate-bounce" />
                   </div>
                 </div>
               </div>
               <div className="text-center relative z-10">
                 <p className="text-2xl font-black text-neutral-300 tracking-tighter uppercase mb-2 italic">Generating Fire...</p>
                 <p className="text-[10px] text-neutral-600 font-black tracking-[0.4em] uppercase">808s • Ad-libs • Lyrics • Art Engine</p>
               </div>
            </div>
          )}

          {state.songData && state.status !== GenerationStatus.LOADING && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-8 duration-700 pb-32">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-neutral-900 pb-12">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded tracking-widest uppercase border ${
                      state.mood === 'Funny/Rude' ? 'bg-yellow-600/10 border-yellow-600/50 text-yellow-500' : 'bg-red-600 text-white border-red-600'
                    }`}>
                      {state.mood}
                    </span>
                    <span className="text-[9px] font-black border border-neutral-800 text-neutral-500 px-2 py-0.5 rounded tracking-widest uppercase">
                      {state.languageMix}
                    </span>
                    <span className="text-[9px] font-black border border-neutral-800 text-neutral-500 px-2 py-0.5 rounded tracking-widest uppercase">
                      {state.isLongTrack ? '5:00 EXTENDED' : '3:00 STANDARD'}
                    </span>
                  </div>
                  <h2 className="text-5xl md:text-8xl font-bold tracking-tighter khmer-font khmer-text-rendering text-white drop-shadow-2xl selection:bg-red-600/50">
                    {state.songData.title}
                  </h2>
                  <div className="flex items-center gap-6 pt-4">
                    <span className="text-sm font-black text-red-500 flex items-center gap-2">
                      <Zap className="w-4 h-4 fill-current" />
                      {state.songData.bpm} BPM
                    </span>
                    <div className="h-4 w-px bg-neutral-800" />
                    <span className="text-sm font-black text-neutral-500 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {state.isLongTrack ? '5:00' : '3:00'} MIN EST.
                    </span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => copyToClipboard(state.songData?.sections.map(s => `[${s.type}]\n${s.text}\n${s.adlibs || ''}`).join('\n\n') || '')}
                    className="p-5 bg-neutral-900 hover:bg-neutral-800 rounded-[24px] transition-all hover:scale-105 active:scale-95 shadow-xl border border-neutral-800 group"
                    title="Copy Text"
                  >
                    <Copy className="w-7 h-7 text-neutral-400 group-hover:text-white" />
                  </button>
                </div>
              </div>

              <div className="space-y-16">
                {state.songData.sections.map((section, idx) => (
                  <div key={idx} className="group relative">
                    <div className={`absolute -left-8 top-0 bottom-0 w-2 transition-all duration-700 rounded-full opacity-30 group-hover:opacity-100 ${
                      section.energyLevel === 'peak' ? 'bg-red-600 blur-[3px]' : 
                      section.energyLevel === 'high' ? 'bg-orange-500' :
                      section.energyLevel === 'medium' ? 'bg-yellow-500' : 'bg-neutral-800'
                    }`} />
                    
                    <div className="flex items-center justify-between mb-6">
                       <div className="flex items-center gap-6">
                        <span className={`text-[10px] font-black uppercase tracking-[0.3em] px-4 py-1.5 rounded-full border transition-all ${
                          section.type === 'Hook' 
                            ? 'bg-orange-600/10 border-orange-500 text-orange-400 shadow-[0_0_20px_rgba(234,88,12,0.1)]' 
                            : 'bg-neutral-950 border-neutral-800 text-neutral-500'
                        }`}>
                          {section.type}
                        </span>
                        <div className="flex items-center gap-3">
                          <Zap className={`w-3.5 h-3.5 ${section.energyLevel === 'peak' ? 'text-red-500 animate-pulse' : 'text-neutral-700'}`} />
                          <span className={`text-[10px] font-black uppercase tracking-widest ${
                             section.energyLevel === 'peak' ? 'text-red-500' : 'text-neutral-600'
                          }`}>
                            {section.energyLevel} Energy
                          </span>
                        </div>
                       </div>
                       <button 
                         disabled={isPlaying}
                         onClick={() => playTTS(section.text)}
                         className="flex items-center gap-3 bg-neutral-900/30 hover:bg-neutral-800 p-2.5 px-5 rounded-full text-[10px] font-black text-neutral-500 hover:text-white transition-all border border-neutral-900 disabled:opacity-30 group/btn"
                       >
                         <Play className="w-3.5 h-3.5 fill-current group-hover/btn:scale-110 transition-transform" /> VOCAL PREVIEW
                       </button>
                    </div>

                    <div className="khmer-font khmer-text-rendering text-3xl md:text-5xl leading-[1.4] whitespace-pre-wrap font-bold tracking-tight text-neutral-200 group-hover:text-white transition-colors duration-500 selection:bg-red-600/50">
                      {section.text}
                    </div>
                    
                    {section.adlibs && (
                      <div className="mt-6 flex flex-wrap gap-3">
                        {section.adlibs.split(',').map((adlib, i) => (
                           <span key={i} className="px-4 py-1.5 bg-neutral-950 border border-neutral-900 text-red-600 text-[11px] font-black italic rounded-xl transform -rotate-1 hover:rotate-0 hover:scale-110 transition-all cursor-default shadow-lg uppercase tracking-wider khmer-text-rendering">
                             {adlib.trim()}
                           </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {state.songData.mvStoryboard && state.songData.mvStoryboard.length > 0 && (
                <div className="mt-16 bg-neutral-900/40 rounded-3xl p-6 md:p-10 border border-neutral-800 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 rounded-full blur-[100px] pointer-events-none" />
                  <h3 className="text-sm font-black text-neutral-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-3">
                    <ImageIcon className="w-5 h-5 text-red-500" />
                    Video MV Text Prompts Storyboard (25 Scenes)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                    {state.songData.mvStoryboard.map((scene, idx) => (
                      <div key={idx} className="bg-neutral-950/80 border border-neutral-800 p-5 rounded-2xl flex flex-col gap-3 group hover:border-red-600/50 hover:bg-neutral-900 transition-all shadow-lg hover:shadow-red-900/10">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-red-600/50 bg-red-600/10 px-2 py-1 rounded-md">SCENE {String(idx + 1).padStart(2, '0')}</span>
                        </div>
                        <div className="flex flex-col gap-1.5 mt-1">
                          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest"><span className="text-neutral-600">VIBE:</span> {scene.vibe}</p>
                          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest"><span className="text-neutral-600">SCENE:</span> {scene.scene}</p>
                          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest"><span className="text-neutral-600">CHR:</span> {scene.character}</p>
                          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest"><span className="text-neutral-600">DTL:</span> {scene.details}</p>
                        </div>
                        <p className="text-sm text-neutral-200 khmer-font khmer-text-rendering font-bold group-hover:text-white transition-colors leading-relaxed mt-2 border-t border-neutral-800 pt-3">{scene.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {state.error && (
            <div className="bg-red-950/30 border border-red-900/50 p-8 rounded-[32px] flex flex-col items-center gap-4 text-red-500 shadow-2xl backdrop-blur-md text-center">
              <div className="flex items-center gap-6">
                <div className="p-4 bg-red-900/40 rounded-2xl shadow-inner">
                  <AlertCircle className="w-8 h-8 flex-shrink-0" />
                </div>
                <div className="text-left">
                  <p className="font-black uppercase tracking-widest text-[10px] mb-1 text-red-400">System Link Error</p>
                  <p className="text-lg font-bold tracking-tight leading-snug">{state.error}</p>
                </div>
              </div>
              
              {state.error.includes('429') && (
                <button 
                  onClick={handleOpenKeySelector}
                  className="mt-4 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-lg"
                >
                  <Key className="w-4 h-4" /> SELECT PAID API KEY
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      {state.songData && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[95%] max-w-4xl bg-[#0a0a0a]/95 border border-neutral-800 backdrop-blur-3xl rounded-[32px] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)] p-3 md:p-5 flex items-center justify-between z-50 animate-in fade-in slide-in-from-bottom-12 duration-1000 border-t-neutral-700/50">
          <div className="flex items-center gap-5">
             <div className="w-16 h-16 bg-neutral-900 rounded-2xl flex items-center justify-center flex-shrink-0 border border-neutral-800 shadow-2xl group cursor-pointer relative" onClick={handleGenerateImage}>
                <ImageIcon className="text-neutral-500 w-7 h-7 group-hover:scale-110 transition-transform" />
             </div>
             <div className="hidden sm:block">
               <h4 className="text-lg font-bold khmer-font khmer-text-rendering truncate max-w-[280px] text-white leading-tight">{state.songData.title}</h4>
               <div className="flex items-center gap-3">
                 <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
                    <p className="text-[10px] text-red-500 uppercase font-black tracking-widest">{state.mood} MODE</p>
                 </div>
                 <div className="w-1 h-1 bg-neutral-800 rounded-full" />
                 <p className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">{state.languageMix}</p>
                 <div className="w-1 h-1 bg-neutral-800 rounded-full" />
                 <p className="text-[10px] text-neutral-500 uppercase font-black tracking-widest">{state.isLongTrack ? '5:00 EXT' : '3:00 STD'}</p>
               </div>
             </div>
          </div>
          <div className="flex items-center gap-3 md:gap-5">
             <button 
               onClick={handleGenerate}
               className="bg-neutral-900 hover:bg-neutral-800 p-5 rounded-[20px] transition-all active:scale-90 border border-neutral-800 group"
               title="Regenerate Track"
             >
               <RefreshCw className={`w-6 h-6 text-neutral-500 group-hover:text-red-500 ${state.status === GenerationStatus.LOADING ? 'animate-spin' : ''}`} />
             </button>
             <button 
               onClick={handleDownloadMaster}
               className="bg-red-600 hover:bg-red-700 text-white px-10 py-5 rounded-[20px] font-black text-xs uppercase tracking-[0.2em] flex items-center gap-4 shadow-2xl shadow-red-600/30 transition-all active:scale-95 group overflow-hidden relative"
             >
               <span className="relative z-10">DOWNLOAD MASTER</span>
               <Download className="w-5 h-5 relative z-10 group-hover:translate-y-1 transition-transform" />
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
