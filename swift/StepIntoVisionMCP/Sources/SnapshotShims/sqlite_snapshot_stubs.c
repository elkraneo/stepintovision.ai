#include "sqlite_snapshot_stubs.h"

#if defined(__linux__)

SQLITE_API SQLITE_EXPERIMENTAL int sqlite3_snapshot_open(sqlite3 *db, const char *schema, sqlite3_snapshot *pSnapshot) {
    (void)db;
    (void)schema;
    (void)pSnapshot;
    return SQLITE_ERROR;
}

SQLITE_API SQLITE_EXPERIMENTAL int sqlite3_snapshot_get(sqlite3 *db, const char *schema, sqlite3_snapshot **ppSnapshot) {
    (void)db;
    (void)schema;
    (void)ppSnapshot;
    return SQLITE_ERROR;
}

SQLITE_API SQLITE_EXPERIMENTAL void sqlite3_snapshot_free(sqlite3_snapshot *pSnapshot) {
    (void)pSnapshot;
}

SQLITE_API SQLITE_EXPERIMENTAL int sqlite3_snapshot_cmp(sqlite3_snapshot *p1, sqlite3_snapshot *p2) {
    (void)p1;
    (void)p2;
    return SQLITE_ERROR;
}

#endif
