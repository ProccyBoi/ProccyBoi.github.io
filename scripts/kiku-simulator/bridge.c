/* Browser-only deterministic input model. Rendering and FM text validity are
 * production firmware code; peripherals, transport and track data are fixtures.
 * This is not the STM32 application or an emulator of its audio pipeline. */
#include "ui_renderer.h"
#include <stdio.h>
#include <string.h>

#define EXPORT(name) __attribute__((export_name(name)))
static ui_state_t ui;
static st7789_t lcd;
static uint16_t pixels[320U * 240U];
static uint16_t x0, y0, x1, y1;
static size_t cursor;
static unsigned track, station, home_taps;
static bool sleeping, phone_present;
static const char *notice = "Demo ready. Music and station data are illustrative.";
static const char *const titles[] = { "Afterglow", "Paper Satellites", "Coastal Lines", "Night Bus Home" };
static const char *const albums[] = { "Soft Focus", "Small Hours", "Open Windows", "Soft Focus" };
static const uint16_t frequencies[] = { 8890U, 9570U, 10170U, 10610U };
static const char *const stations[] = { "KIKU FM", "STUDIO", "PAPER FM", "AMBER FM" };

dev_status_t st7789_set_window(st7789_t *display, uint16_t left, uint16_t top,
                              uint16_t right, uint16_t bottom) {
    if (!display || left > right || top > bottom || right >= 320 || bottom >= 240) return DEV_EINVAL;
    x0 = left; y0 = top; x1 = right; y1 = bottom; cursor = 0;
    return DEV_OK;
}
dev_status_t st7789_write_pixels_rgb565(st7789_t *display, const uint16_t *src, size_t count) {
    if (!display || !src) return DEV_EINVAL;
    size_t width = x1 - x0 + 1U;
    if (cursor + count > width * (y1 - y0 + 1U)) return DEV_EINVAL;
    for (size_t i = 0; i < count; ++i) {
        size_t pos = cursor++;
        pixels[(y0 + pos / width) * 320U + x0 + pos % width] = src[i];
    }
    return DEV_OK;
}
static void draw(void) { (void)ui_renderer_draw(&lcd, &ui); }
static unsigned wrap(int value, unsigned count) {
    while (value < 0) value += (int)count;
    return (unsigned)value % count;
}
static void load_track(void) {
    snprintf(ui.track_title, sizeof(ui.track_title), "%s", titles[track]);
    snprintf(ui.track_artist, sizeof(ui.track_artist), "%s", ui.source == AUDIO_SOURCE_BLUETOOTH ? "Demo phone" : "Demo library");
    snprintf(ui.track_album, sizeof(ui.track_album), "%s", albums[track]);
    snprintf(ui.track_genre, sizeof(ui.track_genre), "Electronic");
    ui.track_number = (uint16_t)(track + 1U); ui.track_total = 4U;
    ui.track_duration_ms = 198000U + track * 17000U;
}
static void tune(uint16_t frequency) {
    fm_state_reset(&ui.fm, frequency);
    ui.fm_preset_name[0] = 0;
    for (unsigned i = 0; i < 4; ++i) {
        if (frequency != frequencies[i]) continue;
        station = i;
        ui.fm.stereo = true; ui.fm.rssi_dbuv = 37; ui.fm.snr_db = 22; ui.fm.rds_sync = true;
        ui.fm.ps_valid_mask = 0x0F; ui.fm.rt_valid_mask = 0xFFFF;
        snprintf(ui.fm.program_service, sizeof(ui.fm.program_service), "%s", stations[i]);
        snprintf(ui.fm.radio_text, sizeof(ui.fm.radio_text), "Demo station - no radio reception");
    }
}
static void home(void) {
    ui.screen = UI_SCREEN_HOME;
    ui.menu_index = ui.source == AUDIO_SOURCE_FM ? 1 : ui.source == AUDIO_SOURCE_BLUETOOTH ? 2 : 0;
}
static void next_track(int delta) {
    track = wrap((int)track + delta, 4); load_track(); ui.playing = true;
    notice = "Illustrative track changed. This demo produces no audio.";
}
static void seek(int delta) {
    station = wrap((int)station + delta, 4); tune(frequencies[station]);
    notice = "Seek simulated using four illustrative stations.";
}
static void open_selected(void) {
    switch (ui.menu_index) {
    case 0: ui.source = AUDIO_SOURCE_LOCAL; ui.screen = UI_SCREEN_NOW_PLAYING;
        ui.playing = true; load_track(); break;
    case 1: ui.source = AUDIO_SOURCE_FM; ui.screen = UI_SCREEN_FM;
        ui.fm_control_mode = UI_FM_CONTROL_TUNE; ui.playing = true; break;
    case 2: ui.source = AUDIO_SOURCE_BLUETOOTH; ui.screen = UI_SCREEN_BLUETOOTH;
        ui.bluetooth_connected = phone_present; ui.bt_avrcp_connected = phone_present;
        ui.playing = phone_present; load_track(); break;
    case 3: ui.screen = UI_SCREEN_OUTPUT; ui.menu_index = (uint8_t)ui.output; break;
    default: ui.screen = UI_SCREEN_SETTINGS; ui.menu_index = 0; break;
    }
    if (ui.source != AUDIO_SOURCE_BLUETOOTH) {
        ui.bluetooth_connected = false; ui.bt_avrcp_connected = false;
    }
}
EXPORT("sim_init") void sim_init(void) {
    memset(&ui, 0, sizeof(ui)); memset(&lcd, 0, sizeof(lcd));
    lcd.width = 320; lcd.height = 240;
    ui.theme = UI_THEME_KIKU; ui.screen = UI_SCREEN_HOME; ui.source = AUDIO_SOURCE_LOCAL;
    ui.output = AUDIO_OUTPUT_AUTO; ui.volume_percent = 48; ui.brightness_percent = 80;
    ui.battery_centi_percent = 8200; ui.battery_mv = 4020;
    ui.storage_mounted = true; ui.headphones_present = true;
    track = station = home_taps = 0; sleeping = false; phone_present = false;
    tune(frequencies[2]); load_track();
    notice = "Demo ready. Music and station data are illustrative.";
    ui_renderer_invalidate(); draw();
}
EXPORT("sim_theme") void sim_theme(unsigned value) {
    if (value >= UI_THEME_COUNT) return;
    ui.theme = (ui_theme_t)value; draw();
}
EXPORT("sim_phone") void sim_phone(unsigned connected) {
    phone_present = connected != 0;
    if (ui.source == AUDIO_SOURCE_BLUETOOTH) {
        ui.bluetooth_connected = phone_present; ui.bt_avrcp_connected = phone_present;
        ui.playing = phone_present;
    }
    notice = phone_present ? "Demo phone connected. No Bluetooth device is accessed." : "Demo phone disconnected.";
    draw();
}
/* 0 rotate, 1 encoder press, 2 encoder hold, 3 left, 4 right,
 * 5 left hold, 6 right hold. Hold buttons compress physical hold duration. */
EXPORT("sim_event") void sim_event(unsigned action, int delta) {
    notice = "Demo controls follow the firmware. No audio is generated.";
    if (action == 2) {
        sleeping = !sleeping;
        if (sleeping) { ui.screen = UI_SCREEN_SLEEP; ui.playing = false; }
        else { home(); notice = "Soft power on simulated; hardware timing is omitted."; }
        draw(); return;
    }
    if (sleeping) { notice = "Hold the encoder to wake the demo."; return; }
    if (action == 6) {
        if (ui.source == AUDIO_SOURCE_FM) seek(1);
        else if (ui.source == AUDIO_SOURCE_BLUETOOTH && !ui.bluetooth_connected)
            notice = "Pairing requested in simulation. Use Demo phone above to supply a connection event.";
        draw(); return;
    }
    if (action == 0) {
        if (delta < -100) delta = -100; if (delta > 100) delta = 100;
        if (ui.screen == UI_SCREEN_HOME) { home_taps = 0; ui.menu_index = (uint8_t)wrap(ui.menu_index + delta, 5); }
        else if (ui.screen == UI_SCREEN_SETTINGS) ui.menu_index = (uint8_t)wrap(ui.menu_index + delta, 3);
        else if (ui.screen == UI_SCREEN_OUTPUT) {
            ui.menu_index = (uint8_t)wrap(ui.menu_index + delta, 4); ui.output = (audio_output_t)ui.menu_index;
        } else if (ui.screen == UI_SCREEN_FM && ui.fm_control_mode == UI_FM_CONTROL_TUNE) {
            int frequency = (int)ui.fm.frequency_10khz + delta * 10;
            if (frequency < 8750) frequency = 8750; if (frequency > 10800) frequency = 10800;
            tune((uint16_t)frequency);
        } else if (ui.screen == UI_SCREEN_NOW_PLAYING || ui.screen == UI_SCREEN_BLUETOOTH || ui.screen == UI_SCREEN_FM) {
            int volume = ui.volume_percent + delta * 2;
            if (volume < 0) volume = 0; if (volume > 100) volume = 100;
            ui.volume_percent = (uint8_t)volume;
        }
    } else if (action == 1) {
        if (ui.screen == UI_SCREEN_HOME) { home_taps = 0; open_selected(); }
        else if (ui.screen == UI_SCREEN_NOW_PLAYING || (ui.screen == UI_SCREEN_BLUETOOTH && ui.bluetooth_connected)) ui.playing = !ui.playing;
        else if (ui.screen == UI_SCREEN_FM) ui.fm_control_mode = ui.fm_control_mode == UI_FM_CONTROL_TUNE ? UI_FM_CONTROL_VOLUME : UI_FM_CONTROL_TUNE;
        else if (ui.screen == UI_SCREEN_SETTINGS) {
            if (ui.menu_index == 0) ui.power_save_enabled = !ui.power_save_enabled;
            else if (ui.menu_index == 1) ui.screen = UI_SCREEN_DIAGNOSTICS;
            else ui.theme = (ui_theme_t)(((unsigned)ui.theme + 1U) % UI_THEME_COUNT);
        }
    } else if (action == 3) {
        if (ui.screen == UI_SCREEN_NOW_PLAYING || (ui.screen == UI_SCREEN_BLUETOOTH && ui.bluetooth_connected)) next_track(-1);
        else if (ui.screen == UI_SCREEN_FM) seek(-1);
        else if (ui.screen == UI_SCREEN_DIAGNOSTICS) { ui.screen = UI_SCREEN_SETTINGS; ui.menu_index = 1; }
        else if (ui.screen != UI_SCREEN_HOME) home();
    } else if (action == 4) {
        if (ui.screen == UI_SCREEN_NOW_PLAYING || (ui.screen == UI_SCREEN_BLUETOOTH && ui.bluetooth_connected)) next_track(1);
        else if (ui.screen == UI_SCREEN_FM) seek(1);
        else if (ui.screen == UI_SCREEN_HOME && ++home_taps >= 5) {
            home_taps = 0; ui.theme = (ui_theme_t)(((unsigned)ui.theme + 1U) % UI_THEME_COUNT);
        }
    } else if (action == 5) {
        if (ui.screen == UI_SCREEN_NOW_PLAYING || ui.screen == UI_SCREEN_FM ||
            (ui.screen == UI_SCREEN_BLUETOOTH && ui.bluetooth_connected)) home();
    }
    draw();
}
EXPORT("sim_pixels") const uint16_t *sim_pixels(void) { return pixels; }
EXPORT("sim_value") unsigned sim_value(unsigned field) {
    switch (field) {
    case 0: return ui.screen; case 1: return ui.theme; case 2: return ui.menu_index;
    case 3: return ui.volume_percent; case 4: return ui.playing; case 5: return ui.source;
    case 6: return ui.fm.frequency_10khz; case 7: return ui.fm_control_mode;
    case 8: return ui.output; case 9: return ui.bluetooth_connected; case 10: return sleeping;
    case 11: return ui.power_save_enabled; case 12: return track; case 13: return phone_present;
    default: return 0;
    }
}
EXPORT("sim_text") const char *sim_text(unsigned field) {
    static const char *const home_names[] = { "Music", "FM radio", "Bluetooth", "Output", "Settings" };
    static const char *const output_names[] = { "Auto", "Headphones", "Speaker", "Both" };
    static char description[256];
    if (field == 1) return notice;
    if (field == 2) return ui_theme_name(ui.theme);
    if (sleeping) return "Powered off. Hold the encoder to wake.";
    switch (ui.screen) {
    case UI_SCREEN_HOME: snprintf(description, sizeof(description), "Home. Selected: %s.", home_names[ui.menu_index]); break;
    case UI_SCREEN_NOW_PLAYING: snprintf(description, sizeof(description), "Music. %s: %s by Demo library. Track %u of 4. Volume %u.", ui.playing ? "Playing" : "Paused", ui.track_title, track + 1U, ui.volume_percent); break;
    case UI_SCREEN_BLUETOOTH: snprintf(description, sizeof(description), "Bluetooth. %s. %s. Volume %u.", ui.bluetooth_connected ? "Demo phone connected" : "Not connected", ui.bluetooth_connected ? ui.track_title : "Hold right to request pairing", ui.volume_percent); break;
    case UI_SCREEN_FM: snprintf(description, sizeof(description), "FM radio. %u.%u MHz. %s. Encoder changes %s. Volume %u.", ui.fm.frequency_10khz / 100U, (ui.fm.frequency_10khz % 100U) / 10U, ui.fm.program_service, ui.fm_control_mode == UI_FM_CONTROL_TUNE ? "frequency" : "volume", ui.volume_percent); break;
    case UI_SCREEN_OUTPUT: snprintf(description, sizeof(description), "Output. Selected and applied: %s.", output_names[ui.output]); break;
    case UI_SCREEN_SETTINGS: snprintf(description, sizeof(description), "Settings. Selected: %s. Power save %s. Look: %s.", ui.menu_index == 0 ? "Power save" : ui.menu_index == 1 ? "Status" : "Look", ui.power_save_enabled ? "on" : "off", ui_theme_name(ui.theme)); break;
    case UI_SCREEN_DIAGNOSTICS: return "Status. Illustrative battery 82 percent, 4.02 volts. SD mounted. Values are demonstration fixtures, not live telemetry.";
    default: return "Kiku display";
    }
    return description;
}
