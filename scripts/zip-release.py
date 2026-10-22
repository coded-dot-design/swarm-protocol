#!/usr/bin/env python3
"""Create a sorted ZIP with fixed archive metadata using the Python stdlib."""
from pathlib import Path
import sys
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

source = Path(sys.argv[1]).resolve()
destination = Path(sys.argv[2]).resolve()
assert source.is_dir(), "Release directory does not exist"
assert source not in destination.parents, "Archive must be outside the release directory"
files = sorted(path for path in source.rglob("*") if path.is_file())
with ZipFile(destination, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        assert not path.is_symlink(), "Release files must not be symlinks"
        name = (Path(source.name) / path.relative_to(source)).as_posix()
        info = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        info.compress_type = ZIP_DEFLATED
        archive.writestr(info, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
with ZipFile(destination) as archive:
    assert archive.testzip() is None, "ZIP CRC verification failed"
    assert len(archive.namelist()) == len(set(archive.namelist())) == len(files)
    for path in files:
        name = (Path(source.name) / path.relative_to(source)).as_posix()
        assert archive.read(name) == path.read_bytes(), f"Archive content mismatch: {name}"
print(f"Verified {len(files)} files in {destination.name}")
