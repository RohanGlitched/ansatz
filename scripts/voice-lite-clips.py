"""Synthetic narration for the two lite-mode Voice Transcribe runs: a text-to-speech voice (edge-tts, as the demo video's
narration in ../video/v3/script.py) says the string's length over a clip that is already published, and ffmpeg lays it in
as the clip's only sound. The voices are SYNTHETIC: no person spoke them. The clips then run through the lite class-link
path with no typed text (scripts/run.ts --lite pendulum --listen), so the length can only come from the transcript.
usage: python scripts/voice-lite-clips.py   -> .probe/voice-lite/<id>.mp4 (inputs), data/voice-lite/<id>.wav (the voice)
"""
import asyncio, pathlib, subprocess, sys
sys.stdout.reconfigure(encoding="utf-8")
import edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / ".probe" / "voice-lite"
WAVS = ROOT / "data" / "voice-lite"
OUT.mkdir(parents=True, exist_ok=True)
WAVS.mkdir(parents=True, exist_ok=True)

# id, source clip (already published), voice, text, where the voice starts (s)
CLIPS = [
    ("voice-lite-aachen-50cm-hindi", "public/showcase/aachen-pendulum-50cm.mp4", "hi-IN-SwaraNeural", "धागा लगभग पचास सेंटीमीटर लंबा है", 0.8),
    ("voice-lite-pendulum-40cm-english", "public/showcase/pendulum-40cm.mp4", "en-US-AndrewMultilingualNeural", "The string is about forty centimetres long.", 0.5),
]


async def say(text, voice, out):
    for attempt in range(6):  # edge-tts drops connections now and then (as in ../video/v3/script.py)
        try:
            await edge_tts.Communicate(text, voice).save(str(out))
            return
        except Exception:
            if attempt == 5:
                raise
            await asyncio.sleep(2 + attempt * 2)


async def main():
    for cid, src, voice, text, at in CLIPS:
        mp3 = OUT / f"{cid}.mp3"
        await say(text, voice, mp3)
        wav = WAVS / f"{cid}.wav"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(mp3), "-ac", "1", "-ar", "16000", str(wav)], check=True)
        ms = int(at * 1000)
        subprocess.run([
            "ffmpeg", "-y", "-v", "error", "-i", str(ROOT / src), "-i", str(wav),
            "-filter_complex", f"[1:a]adelay={ms}:all=1,apad[a]", "-map", "0:v:0", "-map", "[a]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "96k", "-shortest",
            "-metadata", f"comment=Synthetic narration (text-to-speech voice {voice}); no person spoke it",
            str(OUT / f"{cid}.mp4"),
        ], check=True)
        print(cid, voice, text)


asyncio.run(main())
