# 📝 Google Docs $\leftrightarrow$ Todoist Sync

> **Stop letting Google Doc comments die in your email inbox.**

  

"You have a new mention in..." emails are where productivity goes to die. This script creates a seamless, two-way bridge between **Google Docs assignments** and **Todoist**, so you can actually do the work instead of managing the notifications.

-----

## ✨ Features

  * **🕵️‍♀️ The Hunter-Gatherer:** Automatically finds comments and checklist items assigned to you across *all* your Google Docs.
  * **🧠 Smart Threading:** Uses a "Last Mention Wins" heuristic. Use natural conversation (`@bob`, `@me`) to reassign tasks in comment threads—the script follows the conversation, not just the API metadata.
  * **✅ Uncheck to Re-Open:** Unchecking a task in a Google Doc checklist automatically re-creates the task in Todoist if it was previously closed.
  * **👯 Double Identity:** Supports your main Google account + an optional `SECONDARY_EMAIL` (perfect for handling those "personal email" vs "work email" mix-ups).
  * **⚡ Two-Way Sync:**
      * **Todoist $\rightarrow$ Docs:** Check off the task in Todoist? 🪄 The comment resolves in the Doc.
      * **Docs $\rightarrow$ Todoist:** Resolve the comment in the Doc? 🪄 The task closes in Todoist.
  * **👻 Ghost Buster:** Handles blank comments gracefully (titles them "Blank Comment" instead of crashing).
  * **🏎️ Speed Demon:** Only scans files and tasks modified in the **last 24 hours**. We don't waste quotas scanning documents from 2019.

-----

## 🧠 Logic & Capabilities

### 1. "Last Mention Wins" (Comment Threading)
The script ignores potentially stale Google API metadata and instead reads the conversation history.
*   **Reassign**: Reply to a comment with `@someone_else` -> The Todoist task closes for you.
*   **Claim**: Reply with `@me` (or your email) -> A new Todoist task is created for you.
*   **Discussion**: Replies without mentions do not change ownership.

### 2. Checklist Synchronization
*   **Check**: Resolving an item in Docs closes it in Todoist.
*   **Uncheck**: Unchecking an item in Docs **re-creates** the task in Todoist (even if you finished it weeks ago).
*   **Todoist Completion**: Completing in Todoist resolves the item in Docs.

### 3. Blank & Context-Aware Tasks
*   Comments with no text are titled **"Blank Comment"**.
*   Tasks include a direct link to the specific comment/checklist item in the description.

-----

## 🛠️ Prerequisites

Before you dive in, you'll need three things:

1.  A **Google Account** (obviously).
2.  A **Todoist Account** (Premium not required, but API access is).
3.  A **Todoist API Token** (Get it from [Todoist Settings \> Integrations](https://todoist.com/prefs/integrations)).

-----

## 🚀 Installation

### Option A: The "Pro" Way (CLASP)

If you're cool and use the command line:

1.  Clone this repo:
    ```bash
    git clone https://github.com/your-username/your-repo-name.git
    cd your-repo-name
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

1.  Go to [script.google.com](https://script.google.com/home/start) and create a **New Project**.
2.  Copy the contents of `Code.gs` from this repo into the editor.
3.  Save the project.

-----

## ⚙️ Configuration (Important\!)

We don't hardcode secrets here. We use **Script Properties**.

1.  In the Apps Script Editor, click the **Gear Icon ⚙️** (Project Settings).
2.  Scroll to the very bottom to **Script Properties**.
3.  Click **Edit Script Properties** and add the following:

| Property | Value | Description |
| :--- | :--- | :--- |
| `TODOIST_API_TOKEN` | `your_token_here` | Your secret API token from Todoist. |
| `SECONDARY_EMAIL` | `alt@example.com` | (Optional) A second email address to scan for mentions. |

-----

## ⏰ Set the Trigger

This script doesn't run by magic (yet). You need to tell Google when to run it.

1.  In the Apps Script Editor, click the **Alarm Clock ⏰** icon (Triggers) on the left.
2.  Click **+ Add Trigger** (bottom right).
3.  Configure it like this:
      * **Function to run:** `main` (or whatever your primary function is named).
      * **Event source:** `Time-driven`.
      * **Type of time based trigger:** `Hour timer` (recommended) or `Minutes timer`.
      * **Select hour interval:** `Every hour` (or `Every 15 minutes` if you're impatient).

-----

## ✋ Troubleshooting & FAQ

**Q: It's not picking up a comment from last week\!**
**A:** Correct. To keep the script fast and efficient, it only looks at files modified in the **last 24 hours**. If you want to sync an old doc, just open it and make a small edit to "wake it up."

**Q: I resolved a task in Todoist but the comment is still there?**
**A:** The sync runs on the time interval you set (e.g., every hour). It is not instant. Go get a coffee ☕.

-----

## 🤝 Contributing

Found a bug? Want to add support for something?

1.  Fork it.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

-----

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
