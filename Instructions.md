# Setup Instructions: Google Docs to Todoist Sync

This directory contains the code to sync assigned comments and checklists from Google Docs to Todoist. It will look for assignments to the primary account email and the designated secondary email. 

NOTE: Assignments to checklists inside a Google Doc are only supported in Workspace accounts. In those accounts the checklists can only be assigned to accounts within the domain.

## Prerequisites
1.  **Google Account**: Creating the script in your Google Drive.
2.  **Todoist Account**: To generate an API token.

## Step 1: Installation

### Option A: The "Pro" Way (CLASP)
1.  Clone this repo:
    ```bash
    git clone https://github.com/mikegustafson/googledocstodoistsynch.git
    cd googledocstodoistsynch
    ```
2.  Login to Google:
    ```bash
    clasp login
    ```
3.  Create a new Apps Script project:
    ```bash
    clasp create --title "Docs-Todoist-Sync" --type webapp
    ```
4.  Push the code:
    ```bash
    clasp push
    ```

### Option B: The "Classic" Way (Copy-Paste)
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

## Logic Rules & Operating Instructions

This section outlines the final logic governing the Google Docs ↔ Todoist Sync script.

### Core Priority: "Last Mention Wins"
Due to limitations in the Google Drive API (stale assignment data), the script uses a **Content Heuristic** to determine assignment.

1.  **The Rule**: The "Assignee" is the **last email address mentioned** in the entire comment thread (Main Comment + All Replies).
2.  **Implications**:
    *   **Assigned to You**: If the last mentioned email is yours (Primary or Secondary), the task is OPEN.
    *   **Reassigned Away**: If you reply mentioning someone else (`@bob`), the task CLOSES (it is now Bob's).
    *   **Reassigned Back**: If Bob replies mentioning you (`@me`), a NEW task is created for you.
    *   **Empty Replies**: Replies without emails (e.g., "Will do") do *not* change the assignee.

### Sync Behavior

#### 1. New Comments
*   **Assigned to You**: A Todoist task is created.
*   **Mentioned (No Assignment)**: Treated exactly like an assignment. If you are the last mention, you get a task.

#### 2. Updates & Reassignment
*   **Reassignment**: As per the "Last Mention Wins" rule above.
*   **Resolution**:
    *   **Resolve in Doc**: Closes the Todoist task.
    *   **Close in Todoist**: Does *not* automatically resolve the Doc comment (to prevent accidental closure of active discussions). **Note**: This is a safe-guard.

#### 3. Task Un-Completion
*   **Uncheck in Todoist**: Generally ignored (API limitation).
*   **Important**: If you complete a task in Todoist but realize it wasn't done, the script will *not* automatically re-open the Doc comment. You must re-open it in the Doc.
*   **Check/Uncheck**: If you resolve in Docs -> Task Closes. If you re-open in Docs -> New Task Created.

### Special Handling

#### Blank Comments
*   If a comment has no text (or only contains the email address), the Todoist task is titled **"Blank Comment"**.

#### Secondary Usage
*   The script actively monitors both your Primary Email (`TOODIST_API_TOKEN` context user) and `SECONDARY_EMAIL` context.
*   Assignments to *either* will land in your Todoist Project.

