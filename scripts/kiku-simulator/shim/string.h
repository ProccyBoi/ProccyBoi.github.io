#pragma once
#include <stddef.h>
void *memcpy(void *dest, const void *src, size_t count);
void *memset(void *dest, int value, size_t count);
size_t strlen(const char *text);
char *strncpy(char *dest, const char *src, size_t count);
