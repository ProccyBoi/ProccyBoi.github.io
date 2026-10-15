/* Small freestanding subset used by the unmodified display renderer. */
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

void *memcpy(void *dest, const void *src, size_t count) {
    unsigned char *d = dest; const unsigned char *s = src;
    for (size_t i = 0; i < count; ++i) d[i] = s[i];
    return dest;
}
void *memset(void *dest, int value, size_t count) {
    unsigned char *d = dest;
    for (size_t i = 0; i < count; ++i) d[i] = (unsigned char)value;
    return dest;
}
size_t strlen(const char *text) { size_t n = 0; while (text[n]) ++n; return n; }
char *strncpy(char *dest, const char *src, size_t count) {
    size_t i = 0; for (; i < count && src[i]; ++i) dest[i] = src[i];
    for (; i < count; ++i) dest[i] = 0;
    return dest;
}
static void put(char *out, size_t size, size_t *used, char c) {
    if (*used + 1 < size) out[*used] = c;
    ++*used;
}
int snprintf(char *out, size_t size, const char *fmt, ...) {
    va_list ap; va_start(ap, fmt); size_t n = 0;
    while (*fmt) {
        if (*fmt != '%') { put(out, size, &n, *fmt++); continue; }
        ++fmt;
        char pad = ' '; unsigned width = 0;
        if (*fmt == '0') { pad = '0'; ++fmt; }
        while (*fmt >= '0' && *fmt <= '9') width = width * 10U + (unsigned)(*fmt++ - '0');
        int wide = *fmt == 'l'; if (wide) ++fmt;
        char type = *fmt++;
        if (type == 's') {
            const char *s = va_arg(ap, const char *); if (!s) s = "";
            while (*s) put(out, size, &n, *s++);
        } else if (type == 'c') { put(out, size, &n, (char)va_arg(ap, int)); }
        else if (type == '%') { put(out, size, &n, '%'); }
        else if (type == 'u' || type == 'X' || type == 'x' || type == 'd') {
            unsigned long value;
            if (type == 'd') {
                long signed_value = wide ? va_arg(ap, long) : va_arg(ap, int);
                if (signed_value < 0) { put(out, size, &n, '-'); value = (unsigned long)(-(signed_value + 1)) + 1U; }
                else value = (unsigned long)signed_value;
            } else value = wide ? va_arg(ap, unsigned long) : va_arg(ap, unsigned);
            unsigned base = (type == 'X' || type == 'x') ? 16U : 10U;
            const char *digits = type == 'x' ? "0123456789abcdef" : "0123456789ABCDEF";
            char buffer[24]; unsigned used = 0;
            do { buffer[used++] = digits[value % base]; value /= base; } while (value);
            for (unsigned i = used; i < width; ++i) put(out, size, &n, pad);
            while (used) put(out, size, &n, buffer[--used]);
        }
    }
    if (size) out[n < size ? n : size - 1] = 0;
    va_end(ap); return (int)n;
}
