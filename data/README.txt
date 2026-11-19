# Split Perfume Database

The original JSON database was split into smaller JSON array files for GitHub upload.

- Total records: 3381
- Chunk size: 500 records (last chunk is smaller)
- Files: `perfumes-01.json` through `perfumes-07.json`
- `manifest.json` lists each chunk and its record count.

For the web app, update the database loader to fetch all chunks listed in `manifest.json` and combine them into one array. Do not fetch the original merged file.
