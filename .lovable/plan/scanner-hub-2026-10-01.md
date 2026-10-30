# Scanner Hub

## Goal
Create a dedicated `/scanner` experience that is easy to reach on desktop and mobile, while keeping RFID controls completely unavailable to non-admin users.

## Changes
- Rename the current sidebar entry to **Scanner** and keep it prominent for both managers and operators.
- Add a compact mobile bottom navigation bar with a dedicated Scanner destination, integrated into the existing app shell.
- Refine the existing `/scanner` page into a full-height, dark glass dashboard with a top segmented mode selector.
- Keep **Camera (QR/Barcode)** as the default mode for every user, preserving camera scanning, asset lookup, Meemaw links, and child-to-parent routing.
- Render **RFID Locator** only when the signed-in employee role is exactly `admin`.
- In RFID mode, add an explicit **Connect to Bluetooth Scanner** action and a circular signal-strength display driven by Bluetooth RSSI data when the connected device/browser supports it.
- Guard Bluetooth initialization at the action boundary so non-admins cannot trigger it even indirectly.

## Technical details
- Reuse the current `/scanner` route and scanner implementation rather than creating a duplicate page.
- Use the existing authenticated employee role from `AuthContext` for strict admin checks.
- Use the Web Bluetooth API with capability checks and clear unsupported/disconnected states; keep NFC/tag input behavior separate from Bluetooth connection state.
- Use existing semantic theme tokens, Button controls, motion conventions, and minimum mobile touch sizes.
- Validate with TypeScript checks and focused source-level behavior checks; authenticated browser validation is unavailable for this externally managed sign-in setup.

# Borrowed Asset Tracking

## Goal
Track when a nested item temporarily travels with another kit, make that state unmistakable, and let admins resolve it without losing its original home.

## Changes
- Add nullable `original_parent_id` on assets, referencing another asset.
- Intercept nesting drops with a frosted **Move Permanently or Borrow?** choice.
- Permanent moves change the parent and clear any borrowed state; borrowed moves preserve the current parent as the original home before reparenting.
- Show an amber **Borrowed** badge beside affected items in Asset Management, nested gear lists, and call sheets.
- Add a prominent borrowed-status section at the top of the asset editor with **Return to Original Home** and **Make Permanent Here** actions.
- Invalidate asset queries after moves and resolutions so every view updates immediately.

## Technical details
- Keep the existing `home_parent_id` compatibility path intact while adopting the requested `original_parent_id` field for new actions.
- Reuse the existing asset nesting hook and dialog components; prevent cyclic nesting and preserve current drag/drop behavior after the user chooses an action.
- Apply the schema change through a Supabase migration and regenerate connected types automatically.
