# Setup Instructions: Google Docs to Todoist Sync

This directory contains the code to sync assigned comments from Google Docs to Todoist.

## Prerequisites
1.  **Google Account**: Creating the script in your Google Drive.
2.  **Todoist Account**: To generate an API token.

## Step 1: Create the Script
1.  Go to [script.google.com](https://script.google.com/home).
2.  Click **"New Project"**.
3.  Name the project "Docs to Todoist Sync".
4.  Copy the content of `Code.gs` (provided in this folder) and paste it into the editor, replacing any existing code.

## Step 2: Enable Drive API Service
The script needs the **Advanced Drive Service** to read comments.
1.  In the Apps Script editor, look at the left sidebar.
2.  Click the **+** button next to **Services**.
3.  Select **Drive API**.
4.  Click **Add**. (Important: The script is updated for **Drive API v3**).

## Step 3: Get Todoist API Token
1.  Open Todoist in your browser.
2.  Go to **Settings** > **Integrations**.
3.  Select the **Developer** tab.
4.  Copy the **API token**.

## Step 4: Configure Script Properties
1.  In the Apps Script editor, click the **Project Settings** (gear icon) on the left.
2.  Scroll down to **Script Properties**.
3.  Click **Edit script properties** > **Add script property**.
4.  **Property**: `TODOIST_API_TOKEN` | **Value**: [Your Token]
5.  Click **Save**.

*Optional Configuration:*
In `Code.gs` lines 12-14, you can edit:
*   `SEARCH_HOURS`: How far back to scan for modified files.
*   `SECONDARY_EMAIL`: Add a second email to monitor (e.g., `mikegustafson@gmail.com`).

## Step 5: Test the Script
1.  Open `Code.gs`.
2.  Select the `syncDocsToTodoist` function from the toolbar.
3.  Click **Run**.
4.  You will be asked to grant permissions. Review and allow them.
5.  Check the **Execution Log**.

## Step 6: Automate (Triggers)
1.  Click the **Triggers** icon (clock) on the left sidebar.
2.  Click **+ Add Trigger**.
3.  **Function to run**: `syncDocsToTodoist`.
4.  **Select event source**: `Time-driven` -> `Minutes timer` -> `Every 5 minutes`.
5.  Click **Save**.

## Logic Overview
1.  **Docs -> Todoist**: Finds comments assigned to you.
    *   *Note:* Even if the API hides the assignee field (common for external @gmail accounts), the script will detect if you are **mentioned** in the comment and create the task.
2.  **Todoist -> Docs (Completion)**: Completing a Todoist task resolves the Google Doc comment.
3.  **Docs -> Todoist (Resolution)**: Resolving a Google Doc comment closes the Todoist task (for tasks created after Dec 8, 2025).

