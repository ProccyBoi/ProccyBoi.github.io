/* V2-specific populated inspector; root/v3 keep their accepted enclosure viewer. */
import {mountKikuSimulator} from '/v3/assets/v2-kiku-simulator.js';

const simulator = document.querySelector('[data-kiku-simulator]');
async function startSimulator() {
  const result = await mountKikuSimulator(simulator);
  if (result && !result.error) simulator.querySelector('.kiku-sim-fallback')?.remove();
}
if (simulator) {
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); startSimulator(); }
    }, {rootMargin:'350px'});
    observer.observe(simulator);
  } else startSimulator();
}

const sources = {
  sd: ['microSD','WAV / MP3 files','FatFs + decoder','WAV parser / minimp3','Decode → resample → buffer','The SDMMC peripheral reads a FAT filesystem. WAV and MP3 decoding feed a stereo FIFO; local playback is prefetched before display work. Supported WAV input is 16-bit mono or stereo at 8–96 kHz, converted to the 48 kHz output domain.'],
  fm: ['FM broadcast','Tuning / seek / RDS','SI4705 → codec ADC','Analogue L/R → I²S1 return','Capture → buffer → output','The SI4705 supplies analogue left and right audio to the TLV320AIC3104. The codec digitises it and returns PCM to the STM32 over I²S1. RDS station names and RadioText travel through the control path independently of the music.'],
  bt: ['Your phone','A2DP audio source','BM83 receiver','Dedicated I²S2 PCM input','24-bit → 16-bit → buffer','The BM83 is an A2DP sink: a phone sends audio to Kiku. UART carries commands and metadata; I²S2 carries the samples. The STM32 buffers and converts the incoming audio for the local outputs. This board has no Bluetooth-headphone transmit path.']
};
const fields = ['input','input-note','front','front-note','engine','description'];
document.querySelectorAll('[data-source]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-source]').forEach(other => other.setAttribute('aria-pressed',String(other === button)));
  sources[button.dataset.source].forEach((value,index) => { document.querySelector(`[data-signal-${fields[index]}]`).textContent = value; });
}));
