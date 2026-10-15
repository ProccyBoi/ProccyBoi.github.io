#!/usr/bin/env python3
"""Rebuild Kiku's four original demo loops. No recordings, samples or MIDI inputs.
Requires NumPy, SciPy and ffmpeg. Original compositions and generated audio: CC0.
"""
from pathlib import Path
import json, subprocess, tempfile
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

RATE = 44100
OUT = Path(__file__).resolve().parents[2] / 'assets/kiku/audio'
TRACKS = [
    ('afterglow', 'Afterglow', 94, [[50,57,61,64,69],[47,54,57,61,66],[43,50,54,57,62],[45,52,57,59,64]], [76,73,69,78,76,81,78,73]),
    ('paper-satellites', 'Paper Satellites', 108, [[48,55,58,62,67],[44,51,55,58,63],[46,53,57,60,65],[43,50,53,58,62]], [74,79,77,70,75,74,67,72]),
    ('coastal-lines', 'Coastal Lines', 100, [[53,60,64,67,72],[52,59,62,67,71],[50,57,60,64,69],[48,55,59,62,67]], [76,79,81,72,74,76,71,79]),
    ('night-bus-home', 'Night Bus Home', 82, [[45,52,55,59,64],[41,48,52,55,60],[48,55,59,62,67],[43,50,53,57,62]], [71,67,64,72,74,67,69,64]),
]

def compose(index, bpm, chords, melody):
    beat = 60 / bpm
    frames = round(32 * beat * RATE)
    track = np.zeros((frames, 2), np.float64)
    rng = np.random.default_rng(41021 + index)
    def add(sound, when, level=1, pan=0):
        indices = (np.arange(len(sound)) + round(when * RATE)) % frames
        # Equal-power panning, wrapping tails makes the bar loop continuous.
        track[indices, 0] += sound * level * np.sqrt((1-pan)/2)
        track[indices, 1] += sound * level * np.sqrt((1+pan)/2)
    def tone(note, length, voice='keys'):
        t = np.arange(round(length * RATE)) / RATE
        f = 440 * 2 ** ((note-69)/12)
        phase = 2*np.pi*f*t
        if voice == 'bass':
            sound = np.sin(phase) + .22*np.sin(2*phase) + .07*np.sin(3*phase)
            env = (1-np.exp(-t*100))*np.exp(-t*1.7)
        elif voice == 'pad':
            sound = (np.sin(phase)*.65 + np.sin(phase*1.0018)*.28 + .1*np.sin(phase*2))
            env = (1-np.exp(-t*3))*np.exp(-t*.65)
        else:
            # Bell/Rhodes-like original voice with a soft tine, not a sampled instrument.
            sound = np.sin(phase + (.7+.16*index)*np.exp(-t*5)*np.sin(phase*2))
            sound += .14*np.sin(phase*3)*np.exp(-t*6)
            env = (1-np.exp(-t*400))*np.exp(-t*(1.5 if voice=='keys' else 3.2))
        return sound * env * np.minimum(1, np.maximum(0,(length-t)/.08))
    def noise(length, high):
        n = rng.normal(0,1,round(length*RATE))
        return sosfilt(butter(2, high, btype='highpass', fs=RATE, output='sos'), n)
    for bar in range(8):
        base = bar*4*beat
        chord = chords[bar % 4]
        # Airy sustained harmony plus two lightly staggered electric-piano voicings.
        for i, note in enumerate(chord[1:]):
            add(tone(note+12, 3.5*beat, 'pad'), base, .025, (i-1.5)*.35)
        for hit, level in [(0,.082),(1.75,.045),(3.25,.05)]:
            for i, note in enumerate(chord[1:]):
                add(tone(note+12, 2*beat), base+hit*beat+i*.013, level, (i-1.5)*.23)
        for step,note,level in [(0,chord[0],.26),(1.5,chord[0]+12,.12),(2.75,chord[0],.19),(3.5,chord[0]+7,.11)]:
            add(tone(note, .8*beat,'bass'),base+step*beat,level)
        # A restrained, original eight-bar topline; holes leave room around the harmony.
        for j, step in enumerate([.75,1.25,2.5,3.25]):
            if (bar+j+index)%5 == 0: continue
            note = melody[(bar*3+j)%len(melody)]
            at = base+step*beat
            voice = tone(note,.95*beat,'bell')
            pan = np.sin((bar*4+j)*1.7)*.48
            add(voice,at,.105,pan)
            add(voice,at+beat*.75,.025,-pan)
            add(voice,at+beat*1.5,.012,pan)
        # Synthesized kick, brushed snare and high-hat. Every sample originates here.
        for step in [0,2] + ([2.75] if bar%2==1 else []):
            t = np.arange(round(.32*RATE))/RATE
            phase = 2*np.pi*(47*t+85*.022*(1-np.exp(-t/.022)))
            kick = np.sin(phase)*np.exp(-t*17)*(1-np.exp(-t*700))
            add(kick,base+step*beat,.38)
        for step in [1,3]:
            t = np.arange(round(.2*RATE))/RATE
            snare = noise(.2,1600)*np.exp(-t*30)*.4 + np.sin(2*np.pi*183*t)*np.exp(-t*35)*.3
            add(snare,base+step*beat,.19,.12)
        for step in range(8):
            if bar == 7 and step == 7: continue
            length = .14 if step%2 else .065
            t = np.arange(round(length*RATE))/RATE
            hat = noise(length,7000)*np.exp(-t*(35 if step%2 else 65))
            add(hat,base+(step*.5+(.045 if step%2 else 0))*beat,.035 if step%2 else .022,-.35)
    # Short stereo room reflections; circular delays preserve a seamless loop.
    dry = track.copy()
    for delay, level in [(.041,.10),(.073,.07),(.113,.045),(.179,.025)]:
        track += np.roll(dry[:,::-1], round(delay*RATE), axis=0)*level
    track = sosfilt(butter(2,28,btype='highpass',fs=RATE,output='sos'),track,axis=0)
    track = np.tanh(track*1.25)
    target = 10**(-18/20)
    track *= min(target/np.sqrt(np.mean(track*track)),.89/np.max(np.abs(track)))
    return (np.clip(track,-1,1)*32767).astype(np.int16), frames/RATE

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    manifest = []
    for i,(slug,title,bpm,chords,melody) in enumerate(TRACKS):
        audio,duration = compose(i,bpm,chords,melody)
        with tempfile.TemporaryDirectory() as temp:
            wav = Path(temp)/'source.wav'
            wavfile.write(wav,RATE,audio)
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-codec:a','libmp3lame','-b:a','128k','-write_xing','1','-metadata',f'title={title} — Kiku original demo','-metadata','artist=Kiku demo','-metadata','copyright=CC0-1.0; original procedural composition',str(OUT/f'{slug}.mp3')],check=True)
        manifest.append({'slug':slug,'title':title,'bpm':bpm,'duration':duration,'bars':8,'license':'CC0-1.0'})
        print(f'{title}: {duration:.3f}s, {(OUT/f"{slug}.mp3").stat().st_size:,} bytes')
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
if __name__ == '__main__': main()
