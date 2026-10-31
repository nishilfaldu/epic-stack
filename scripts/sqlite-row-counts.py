#!/usr/bin/env python3
import sqlite3
import sys


def counts(path: str) -> dict[str, int]:
    connection = sqlite3.connect(path)
    tables = [
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]
    return {
        table: connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        for table in tables
    }


def main() -> None:
    if len(sys.argv) not in (2, 3):
        print("usage: sqlite-row-counts.py <db> [<expected.tsv>]", file=sys.stderr)
        sys.exit(2)
    got = counts(sys.argv[1])
    if len(sys.argv) == 2:
        for table, count in got.items():
            print(f"{table}\t{count}")
        return
    expected: dict[str, int] = {}
    for line in open(sys.argv[2]):
        line = line.strip()
        if not line:
            continue
        table, count = line.split("\t")
        expected[table] = int(count)
    if got == expected:
        print(f"{len(got)} tables match")
        return
    print("row count mismatch")
    for table in sorted(set(got) | set(expected)):
        if got.get(table) != expected.get(table):
            print(f"{table}\texpected {expected.get(table)} got {got.get(table)}")
    sys.exit(1)


if __name__ == "__main__":
    main()
