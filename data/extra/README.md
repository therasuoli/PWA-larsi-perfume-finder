# Owner-managed perfume imports

Place JSON files here as arrays of perfume objects. This import directory is the only source used by the GitHub catalogue rebuild workflow. No remote datasets or web APIs are scraped.

Each perfume record should include at least a stable `id`, `name`, and `brand`. Optional fields supported by the app include `nameFa`, `description`, `long_description`, `short_description_fa`, `family`, `family2`, `conc`, `top`, `heart`, `base`, `notes`, `character`, `seasons`, `times`, `perfumers`, `year`, `image`, `image_url`, and `images`.

To rebuild and sync manually, run the GitHub Actions workflow **Build and sync owner perfume catalogue** after adding a JSON file. The workflow does not delete existing database rows; it upserts imported IDs.
