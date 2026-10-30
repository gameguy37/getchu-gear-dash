# Architecture Rules

- Asset nesting uses `parent_asset_id`; temporary borrowing is marked by `is_borrowed = true`, with the prior kit in `original_parent_id` (null when the item was top-level, meaning "return to top level"); legacy kit-to-kit borrows also set `home_parent_id`. All borrow badges and return controls must check `is_borrowed || original_parent_id`, never `original_parent_id` alone.
- Scanner hardware access stays inside the shared `/scanner` experience and must be authorized from the authenticated employee role before initialization.- Access requests live on `employees` (status 'pending' → 'active'/'denied'); there is no separate profiles table, so the auth gate and approvals widget both read employees.status.
- Single-asset edits/moves/borrows go through useAssetPatch / optimisticAssetHandlers (patch the ["assets"] cache, roll back on error, invalidate on settle) so the UI never waits on the network.
