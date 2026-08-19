#!/usr/bin/env bash
set -euo pipefail

version="${1:?FFmpeg version is required}"
destination="${2:?installation destination is required}"
archive="$RUNNER_TEMP/ffmpeg-$version.tar.xz"
source_directory="$RUNNER_TEMP/ffmpeg-$version"

case "$version" in
  6.1.6) expected_sha256="d4fcb164028dd3beee5d92c0ac72e46aac6973c75ea12dc14de07bf8f407370a" ;;
  7.1.5) expected_sha256="de668509caf9e35e3cd162473441fdb29538c6d96ed080292b3cf9e6fc5d558f" ;;
  8.1.2) expected_sha256="464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c" ;;
  9.0.1) expected_sha256="cf38e0e28c7e5605942c4a77755349b0145804a397af37eb1fb4c77cb237f635" ;;
  *) echo "Unsupported compatibility-test version: $version" >&2; exit 2 ;;
esac

sudo apt-get update
sudo apt-get install -y build-essential nasm pkg-config xz-utils libx264-dev
curl --fail --location --proto '=https' --tlsv1.2 \
  "https://ffmpeg.org/releases/ffmpeg-$version.tar.xz" \
  --output "$archive"
echo "$expected_sha256  $archive" | sha256sum --check --strict
tar -xf "$archive" -C "$RUNNER_TEMP"
cd "$source_directory"
./configure \
  --prefix="$destination" \
  --disable-doc \
  --disable-debug \
  --enable-gpl \
  --enable-libx264
make -j2
make install
"$destination/bin/ffmpeg" -version
