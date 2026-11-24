# Information priorities

A static card-sort page for think-aloud research. Participants sort 20 pieces of information about a pipeline run into four groups, then read a short code and their answers back on the call.

Files: `index.html`, `styles.css`, `app.js`, `apps-script/Code.gs`.

## 1. Try it locally (no backend)

Open `index.html` in a browser. To test the final screen without a backend, add a flag:

- `index.html?mock=ok` shows the saved state
- `index.html?mock=fail` shows the failed-save state with Copy results

Without a flag and without an endpoint, the save fails (by design), so you will see the failure state.

## 2. Set up the Google Sheet and Apps Script

1. Create a Google Sheet. Open Extensions > Apps Script.
2. Paste in `apps-script/Code.gs`.
3. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone.
4. Authorize when prompted, then copy the web app URL.
5. Paste it into `CONFIG.ENDPOINT` at the top of `app.js`.
6. Any later change to `Code.gs` needs Deploy > Manage deployments > Edit > New version.

The script creates a "Responses" sheet with one row per participant: timing, device, tray order, final group per piece (e.g. `primary #1 (2 moves)`), plus JSON columns for the full piece list and event log. A repeat submission with the same code replaces that row. Posts without a valid 6-character code are ignored.

No secrets live in the page. The endpoint URL is public by nature, so the code check is the only guard. Do not store anything sensitive in the sheet.

## 3. Publish on GitHub Pages

Push these files to a repo. Settings > Pages > deploy from the branch root. The page includes `noindex`, but the URL is still reachable by anyone who has it.

## 4. Strella setup

- Add the page link in a Website block, opened in a new tab. Use a Task element so the participant talking resets the session timeout.
- Screen recording on. Default share: Entire screen or Window. Screen share verification on. Generous session timeout.
- Test through a share link; the preview skips screen sharing.
- Moderator prompt before: "As you arrange the cards, please say out loud what you're placing and why." (This is for the moderator guide only, not the page.)
- Moderator prompt after: "Please read me the code on the final screen and tell me what you put in each group."

## 5. Before launch

- Replace the `[CONFIRM…]` text for Pipeline ID (definition) in `FIELDS` in `app.js`.
- The sample data has two inconsistencies to resolve: Start 22:05:56 to Finish 22:06:30 is 34s but Pipeline run says 33s, and the run is tag-triggered while Branch says `main`.
- If you change piece ids in `app.js`, update `FIELD_IDS` in `Code.gs` so the columns match.
- The moderator cannot see the screen, so the code and the read-aloud list on the final screen are the backup if a save fails.

## 6. Manual test checklist

- Drag a piece from the tray to each group and back.
- Select a piece with the keyboard (Tab, Enter), choose "Add to this group", press Escape to cancel.
- Put 3 pieces in Primary, then try a 4th: it returns to where it was and the message appears.
- Hover, focus and tap the ⓘ: the definition and example show.
- Reset clears everything and reshuffles nothing (same tray order for the session).
- Continue stays disabled until the tray is empty, and reads "N left".
- Final screen: code, list by group, and `?mock=fail` shows Copy results.
- A row appears in the sheet; resubmitting the same code replaces it.
- Check at phone width and with a screen reader label pass.

## 7. Known limits

- Drag and drop does not work on most touch screens, which is why select-then-add exists.
- Tray order is shuffled once per page load, so a reload gives a new order.
- Tooltips on the right-hand tray column flip to open leftward to stay on screen.
