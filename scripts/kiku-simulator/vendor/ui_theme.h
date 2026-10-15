#ifndef UI_THEME_H
#define UI_THEME_H

/* IDs are persisted in the v1 settings payload. Append new looks without
 * reordering existing values so saved preferences retain their meaning. */
typedef enum {
    UI_THEME_KIKU = 0,
    UI_THEME_POLAROID,
    UI_THEME_WALKMAN,
    UI_THEME_INSTRUMENT,
    UI_THEME_MINIDISC,
    UI_THEME_TERMINAL,
    UI_THEME_AQUA,
    UI_THEME_PAPER,
    UI_THEME_STUDIO,
    UI_THEME_AMBER,
    UI_THEME_COUNT
} ui_theme_t;

#endif
