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

## Step 2: Enable Services
The script needs the **Advanced Drive Service** and **Google Tasks API**.
1.  In the Apps Script editor, look at the left sidebar.
2.  Click the **+** button next to **Services**.
3.  Select **Drive API**.
4.  Click **Add**. (Important: The script is updated for **Drive API v3**).
5.  Click the **+** button again.
6.  Select **Google Tasks API**.
7.  Click **Add**.


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
5.  *(Optional)* **Property**: `SECONDARY_EMAIL` | **Value**: [Your Secondary Email]
6.  Click **Save**.


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
1.  **Docs -> Todoist**: Finds comments and checklist items assigned to you.
    *   *Note:* The script detects assignments to both your main account and the optional `SECONDARY_EMAIL`.
    *   *Note:* If a comment is blank (no text), the task will be titled "Blank Comment".
2.  **Todoist -> Docs (Completion)**: Completing a Todoist task resolves the corresponding Google Doc comment or checklist item.
3.  **Docs -> Todoist (Resolution)**: Resolving a Google Doc comment or checklist item closes the Todoist task.
4.  **Efficiency**: The script only checks files and tasks modified in the **last 24 hours**. Older resolved items are ignored to keep the script fast.

