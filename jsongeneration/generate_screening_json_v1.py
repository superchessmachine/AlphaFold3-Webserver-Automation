#!/usr/bin/env python3
"""
Interactive helper for creating AlphaFold Server JSON payloads.

The script walks the user through:
1. Entering one or more screening chains (the "always present" partners).
2. Providing a CSV file that contains the names and sequences of the targets to test.
3. Producing a JSON array where every CSV entry is paired with each screening chain.
"""

from __future__ import annotations

import csv
import json
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Tuple


RNG = random.SystemRandom()
CHUNK_SIZE = 100


@dataclass
class SequenceEntry:
    name: str
    sequence: str


def safe_input(prompt: str) -> str:
    try:
        return input(prompt)
    except EOFError:
        return ""
    except KeyboardInterrupt:
        print("\nAborted by user.")
        sys.exit(1)


def normalize_sequence(raw: str) -> str:
    """Remove all whitespace from a pasted sequence."""
    return "".join(raw.split())


def prompt_screening_chains() -> List[SequenceEntry]:
    print("Enter the screening chain sequences (press Enter on an empty line to finish).")
    chains: List[SequenceEntry] = []
    counter = 1
    while True:
        sequence = normalize_sequence(
            safe_input(f"Sequence for screening chain #{counter}: ").strip()
        )
        if not sequence:
            if not chains:
                print("You must provide at least one screening chain.")
                continue
            break
        label = safe_input(
            f"Name for this chain (default Chain{counter}): "
        ).strip() or f"Chain{counter}"
        chains.append(SequenceEntry(name=label, sequence=sequence))
        counter += 1
    return chains


def prompt_csv_details() -> tuple[Path, str, str]:
    while True:
        raw_path = safe_input("Path to CSV with targets: ").strip()
        if not raw_path:
            print("Please provide a CSV path.")
            continue
        path = Path(raw_path).expanduser()
        if path.is_file():
            break
        print(f"File '{path}' not found. Try again.")
    name_column = safe_input("Column name that holds the target names: ").strip()
    sequence_column = safe_input("Column name that holds the target sequences: ").strip()
    if not name_column or not sequence_column:
        print("Both the name and sequence column titles are required.")
        return prompt_csv_details()
    return path, name_column, sequence_column


def load_targets(csv_path: Path, name_column: str, sequence_column: str) -> List[SequenceEntry]:
    targets: List[SequenceEntry] = []
    # utf-8-sig strips a UTF-8 BOM if one is present in the CSV header.
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError("The CSV appears to be empty or missing a header row.")
        missing = [col for col in (name_column, sequence_column) if col not in reader.fieldnames]
        if missing:
            raise ValueError(
                f"Missing columns in CSV header: {', '.join(missing)}. "
                f"Available columns: {', '.join(reader.fieldnames)}"
            )
        for idx, row in enumerate(reader, start=1):
            name_raw = (row.get(name_column) or "").strip()
            sequence_raw = row.get(sequence_column) or ""
            sequence = normalize_sequence(sequence_raw)
            if not sequence:
                print(f"Skipping row {idx}: empty sequence.")
                continue
            name = name_raw or f"Entry{idx}"
            targets.append(SequenceEntry(name=name, sequence=sequence))
    if not targets:
        raise ValueError("The CSV did not contain any usable target sequences.")
    return targets


def random_seed() -> str:
    # AlphaFold expects 9-digit seeds that do not start with 0, otherwise the
    # upload validation rejects those jobs. We therefore restrict the random
    # range so the first digit is always 1-9.
    return str(RNG.randint(100_000_000, 999_999_999))


def build_payload(targets: List[SequenceEntry], chains: List[SequenceEntry]) -> list[dict]:
    payload = []
    for target in targets:
        for chain in chains:
            job_name = f"{target.name}_{chain.name}"
            payload.append(
                {
                    "name": job_name,
                    "modelSeeds": [random_seed()],
                    "sequences": [
                        {
                            "proteinChain": {
                                "sequence": target.sequence,
                                "count": 1,
                                "useStructureTemplate": True,
                            }
                        },
                        {
                            "proteinChain": {
                                "sequence": chain.sequence,
                                "count": 1,
                                "useStructureTemplate": True,
                            }
                        },
                    ],
                    "dialect": "alphafoldserver",
                    "version": 1,
                }
            )
    return payload


def chunk_payload(payload: list[dict], chunk_size: int = CHUNK_SIZE) -> Iterable[Tuple[list[dict], int, int]]:
    for start in range(0, len(payload), chunk_size):
        chunk = payload[start : start + chunk_size]
        yield chunk, start + 1, start + len(chunk)


def prompt_output_destination() -> Path | None:
    destination = safe_input(
        "Where should the JSON be saved? (Leave blank to print to stdout): "
    ).strip()
    if not destination:
        return None
    return Path(destination).expanduser()


def emit_payload(payload: list[dict], destination: Path | None) -> None:
    if not payload:
        print("No entries to write.")
        return

    if destination:
        base_dir = destination.parent or Path(".")
        base_dir.mkdir(parents=True, exist_ok=True)
        stem = destination.stem or "predictions"
        suffix = destination.suffix or ".json"
        for chunk, start_idx, end_idx in chunk_payload(payload):
            chunk_path = base_dir / f"{stem}_{start_idx}-{end_idx}{suffix}"
            chunk_path.write_text(json.dumps(chunk, indent=2), encoding="utf-8")
            print(f"Wrote entries {start_idx}-{end_idx} to {chunk_path}")
    else:
        for chunk, start_idx, end_idx in chunk_payload(payload):
            print(f"\n=== Entries {start_idx}-{end_idx} ===")
            print(json.dumps(chunk, indent=2))


def main() -> None:
    chains = prompt_screening_chains()
    csv_path, name_col, sequence_col = prompt_csv_details()
    try:
        targets = load_targets(csv_path, name_col, sequence_col)
    except ValueError as exc:
        print(f"Error while reading CSV: {exc}")
        sys.exit(1)

    payload = build_payload(targets, chains)
    destination = prompt_output_destination()
    emit_payload(payload, destination)


if __name__ == "__main__":
    main()
