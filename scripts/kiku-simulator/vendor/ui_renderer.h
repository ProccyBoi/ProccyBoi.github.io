#pragma once

#include "st7789.h"
#include "ui_state.h"

#ifdef __cplusplus
extern "C" {
#endif

dev_status_t ui_renderer_draw(st7789_t *lcd, const ui_state_t *ui);
void ui_renderer_invalidate(void);
const char *ui_theme_name(ui_theme_t theme);

#ifdef __cplusplus
}
#endif
